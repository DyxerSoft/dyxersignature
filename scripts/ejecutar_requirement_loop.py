"""Organizer CLI for durable state. Codex dispatches the agent sessions."""

import argparse
import json
from pathlib import Path
import re
import sys

import yaml

from requirement_loop import (
    ACTIVE, BLOCKERS, CYCLES, HARD_LIMITS, LIMITS, READY, REDIRECT, REWORK, REVIEWER, ROLES,
    bind, detect_drift, migrate, pause, reject_result, require, reserve, resume,
    return_to, submit,
)
from requirement_loop_storage import (
    LoopError, canonical_path, checked_bytes, digest, locked, read_yaml, requirement_specs,
    snapshot, write_yaml,
)

ROOT = Path(__file__).resolve().parents[1]
RUBRIC_FILE = "config/requirement-rubrics-v1.yaml"
REQUIREMENTS = Path("docs/implementacion/requerimientos")
RESULT_SIZE_LIMIT = 256 * 1024


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requirement", help="ID explícito; por defecto usa workflow.current_feature")
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("init", "status"):
        commands.add_parser(command)
    reservation = commands.add_parser("reserve")
    reservation.add_argument("--source", action="append", default=[])
    receipt = commands.add_parser("bind")
    receipt.add_argument("dispatch_id")
    receipt.add_argument("role", choices=ROLES)
    receipt.add_argument("session")
    submission = commands.add_parser("submit")
    submission.add_argument("session")
    submission.add_argument("result", type=Path)
    checkpoint = commands.add_parser("pause")
    checkpoint.add_argument("dispatch_id")
    checkpoint.add_argument("cause", choices=("quota", "authentication", "provider_failure", "uncertain_dispatch"))
    checkpoint.add_argument("--retry-at")
    recovery = commands.add_parser("resume")
    recovery.add_argument("--capacity", choices=("available", "quota", "reconciled"), default="available")
    recovery.add_argument("--retire-session", help="Recibo de la sesión reconciliada que ya no producirá resultados")
    return parser.parse_args()


def read_rubrics(root):
    rubrics = read_yaml(canonical_path(root, root / RUBRIC_FILE))
    require(isinstance(rubrics, dict) and rubrics.keys() == set(ROLES), "Conjunto de rúbricas inválido")
    for role, prefix in zip(ROLES, "ADSQE"):
        rubric = rubrics[role]
        require(rubric["rubric_id"] == role and type(rubric["rubric_version"]) is int and rubric["rubric_version"] == 1, "Versión de rúbrica incompatible")
        expected = {f"{prefix}{index:02}" for index in range(1, 11)}
        require(rubric["criteria"].keys() == expected, f"Rúbrica incompleta: {role}")
    return rubrics


def validate(state, requirement, rubrics):
    require(isinstance(state, dict) and state.get("requirement") == requirement, "Identidad de requerimiento incompatible")
    require(state["state"] in {"PENDING", *ACTIVE, *BLOCKERS, *READY, *REDIRECT}, "Estado incompatible")
    for role, key in CYCLES.items():
        count = state["cycles"].get(key, 0)
        require(
            type(count) is int and count >= 0
            and (role not in LIMITS or count <= state["limits"][LIMITS[role]]),
            f"Ciclo inválido: {key}",
        )
    for name, maximum in HARD_LIMITS.items():
        limit = state["limits"].get(name)
        require(type(limit) is int and 0 <= limit <= maximum, f"Límite inválido: {name}")
    iteration = state["iteration"]
    require(type(iteration) is int and 0 <= iteration <= state["limits"]["total_iterations"], "Iteración inválida")
    if "schema_version" not in state:
        return
    require(type(state["schema_version"]) is int and state["schema_version"] == 1, "Esquema incompatible")
    require(state["integrity"] == digest({key: value for key, value in state.items() if key != "integrity"}), "Integridad de estado inválida")
    require(state["rubric_digest"] == digest(rubrics), "Cambió la rúbrica congelada")
    require(state["generation"] == len(state["history"]), "Generación incompatible")
    previous = None
    for sequence, record in enumerate(state["history"], 1):
        require(
            record["previous"] == previous
            and record["sequence"] == sequence
            and record["hash"] == digest({key: value for key, value in record.items() if key != "hash"}),
            "Historial roto",
        )
        previous = record["hash"]
    dispatch, checkpoint = state["dispatch"], state["checkpoint"]
    pending = state["evaluation_pending"]
    if pending:
        require(
            pending["subject"] in state["deliveries"] and type(pending["retry"]) is int
            and pending["retry"] >= 0 and state["next_agent"] == REVIEWER[pending["subject"]],
            "Evaluación pendiente incompatible",
        )
    if dispatch:
        require(
            dispatch["requirement_id"] == requirement and dispatch["role"] == state["next_agent"]
            and type(dispatch["attempt"]) is int and dispatch["attempt"] > 0
            and dispatch["rubric_version"] == 1 and dispatch["subject"] == dispatch["rubric_id"]
            and any(record.get("dispatch") == dispatch for record in state["history"]),
            "Despacho incompatible",
        )
        if pending:
            delivery = state["deliveries"][pending["subject"]]
            require(
                dispatch["kind"] == "evaluation" and dispatch["subject"] == pending["subject"]
                and dispatch["attempt"] == pending["retry"] + 1
                and dispatch["revision"] == delivery["revision"] and dispatch["task_id"] == delivery["task_id"],
                "Cursor de evaluación incompatible",
            )
        else:
            revision_inputs = dispatch["files"]
            if "product_baseline" in dispatch:
                require(dispatch["product_baseline"] == state["product_baseline"], "Línea base del despacho incompatible")
                revision_inputs = {"files": dispatch["files"], "product_baseline": state["product_baseline"]}
            require(
                dispatch["kind"] == "delivery" and dispatch["subject"] == dispatch["role"]
                and dispatch["attempt"] == state["cycles"][CYCLES[dispatch["role"]]]
                and dispatch["revision"] == {"delivery": dispatch["task_id"], "inputs": digest(revision_inputs)},
                "Cursor de entrega incompatible",
            )
    if checkpoint:
        require(
            dispatch and checkpoint["requirement"] == requirement and checkpoint["version"] == 1
            and checkpoint["last_event"] == state["generation"] and checkpoint["phase"] == state["state"]
            and checkpoint["confirmed_artifacts"] == dispatch["files"]
            and checkpoint["pending_result"] == "unconfirmed"
            and checkpoint["next_action"] == "reconcile_dispatch"
            and checkpoint.get("stale_role") in (None, *ROLES)
            and all(checkpoint[key] == dispatch[key] for key in (
                "role", "attempt", "dispatch_id", "revision", "rubric_id", "rubric_version",
            )),
            "Checkpoint incompatible",
        )


def project(root, state, requirement):
    # Only the requirement still selected by the manifest can update global handoff.
    lock = root / ".requirement-handoff.lock"
    require(lock.resolve() == lock, "Ruta de exclusión de handoff no canónica")
    with locked(lock):
        manifest = read_yaml(canonical_path(root, root / "project-manifest.yaml"))
        if manifest["workflow"].get("current_feature") != requirement:
            return
        checkpoint = state["checkpoint"]
        status = "paused" if checkpoint else "blocked" if state["state"] in BLOCKERS else "ready"
        handoff = {"handoff": {
            "status": status,
            "from_skill": "requirement-loop-orchestrator",
            "feature": requirement,
            "feature_status": state["state"].lower().replace("_", "-"),
            "decision": state["state"],
            "next_skill": "requirement-loop-orchestrator" if state["next_agent"] else None,
            "next_agent": state["next_agent"],
            "state_file": (REQUIREMENTS / requirement / "loop-state.yaml").as_posix(),
            "blocking_questions": [],
            "generation": state["generation"],
            "iteration": state["iteration"],
            "dispatch_id": state["dispatch"]["dispatch_id"] if state["dispatch"] else None,
            "checkpoint_cause": checkpoint["cause"] if checkpoint else None,
        }}
        path = root / "handoff.yaml"
        require(path.resolve() == path, "Ruta de handoff no canónica")
        try:
            previous = read_yaml(path)
        except (FileNotFoundError, yaml.YAMLError, LoopError):
            previous = None
        if previous != handoff:
            write_yaml(path, handoff)


def get_state_path(root, requirement):
    directory = root / REQUIREMENTS / requirement
    path = directory / "loop-state.yaml"
    require(
        directory.resolve() == directory and path.resolve() == path
        and (directory / ".loop-state.lock").resolve() == directory / ".loop-state.lock",
        "Ruta de estado no canónica",
    )
    return path


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Campo JSON repetido")
        result[key] = value
    return result


def read_result(root, path):
    path = canonical_path(root, path if path.is_absolute() else root / path)
    content = checked_bytes(path, RESULT_SIZE_LIMIT, root)
    return json.loads(content.decode("utf-8-sig"), object_pairs_hook=unique_object)


def main(root=ROOT):
    args = arguments()
    manifest = read_yaml(canonical_path(root, root / "project-manifest.yaml"))
    policy = manifest.get("quality_gates", {})
    requirement = args.requirement or manifest["workflow"].get("current_feature")
    require(isinstance(requirement, str) and re.fullmatch(r"[A-Z]+-[0-9]+", requirement), "ID de requerimiento inválido")
    rubrics = read_rubrics(root)
    path = get_state_path(root, requirement)
    specs = requirement_specs(root, requirement) if args.command in {"init", "reserve"} else []
    if not path.exists():
        require(args.command == "init", "Inicializa el requerimiento antes de ejecutar el loop")
        template_path = canonical_path(root, root / REQUIREMENTS / "_template" / "loop-state.yaml")
        template = read_yaml(template_path)
        path.parent.mkdir(exist_ok=True)
    with locked(path.parent / ".loop-state.lock"):
        if path.exists():
            state = read_yaml(path)
        else:
            require(args.command == "init", "Falta estado del requerimiento")
            state = template | {"requirement": requirement}
        validate(state, requirement, rubrics)
        generation = state.get("generation")
        if generation is None:
            if args.command == "status":
                print(json.dumps(state, ensure_ascii=False, default=str))
                return 0
            require(args.command == "init", "Usa init para migrar el estado legado")
            migrate(state, rubrics)
            if specs and state["next_agent"] == ROLES[0]:
                state["sources"][ROLES[0]] = snapshot(root, [specs[0].relative_to(root).as_posix()])
        command = args.command
        result = state
        failure = False
        stale = detect_drift(root, state, policy) if command != "pause" else False
        checkpoint = state["checkpoint"]
        stale_checkpoint = checkpoint and checkpoint.get("stale_role")
        if stale_checkpoint and command == "resume":
            result = checkpoint
            if args.capacity == "reconciled":
                resume(state, args.capacity, args.retire_session)
                return_to(state, stale_checkpoint, REWORK[ROLES.index(stale_checkpoint)], "revisión obsoleta reconciliada")
                result = {"status": "stale", "state": state["state"], "next_agent": state["next_agent"]}
        elif stale and command not in {"status", "init"}:
            result = {"status": "stale", "state": state["state"], "next_agent": state["next_agent"]}
            failure = True
        elif command == "reserve":
            sources = args.source
            if specs and state["next_agent"] == ROLES[0] and not state["dispatch"]:
                sources.append(specs[0].relative_to(root).as_posix())
            result = reserve(root, state, sources)
        elif command == "bind":
            bind(state, args.dispatch_id, args.role, args.session)
            result = state["dispatch"]
        elif command == "submit":
            try:
                payload = read_result(root, args.result)
            except (OSError, ValueError, RecursionError):
                status = reject_result(state, args.session, "Archivo de resultado ilegible o malformado")
            else:
                status = submit(root, state, rubrics, args.session, payload, policy)
            result = {
                "status": status,
                "state": state["state"],
            }
            failure = result["status"] != "accepted"
        elif command == "pause":
            pause(state, args.dispatch_id, args.cause, args.retry_at)
            result = state["checkpoint"]
        elif command == "resume":
            result = resume(state, args.capacity, args.retire_session)
        if state["generation"] != generation:
            state["integrity"] = digest({key: value for key, value in state.items() if key != "integrity"})
            validate(state, requirement, rubrics)
            write_yaml(path, state)
        if command != "status" or stale:
            project(root, state, requirement)
        print(json.dumps(result, ensure_ascii=False))
        return int(failure)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (LoopError, OSError, KeyError, TypeError, ValueError, yaml.YAMLError) as error:
        print(f"Loop detenido: {error}", file=sys.stderr)
        raise SystemExit(1) from error

