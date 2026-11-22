from pathlib import Path
import re
import shutil
import sys

from requirement_loop_storage import (
    LoopError, canonical_path, locked, read_yaml, requirement_specs, write_yaml,
)

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "docs/implementacion/requerimientos/_template"


def initialize(req_id, title):
    if not re.fullmatch(r"[A-Z]+-[0-9]+", req_id):
        raise LoopError("ID inválido. Ejemplo: US-001, EN-001, FEAT-012")
    lock = canonical_path(ROOT, ROOT / ".requirement-handoff.lock")
    with locked(lock):
        specs = requirement_specs(ROOT, req_id)
        manifest_path = canonical_path(ROOT, ROOT / "project-manifest.yaml")
        handoff_path = canonical_path(ROOT, ROOT / "handoff.yaml")
        manifest = read_yaml(manifest_path)
        canonical_path(ROOT, TEMPLATE)
        target = canonical_path(ROOT, TEMPLATE.parent / req_id)
        if target.exists():
            raise LoopError(f"Ya existe {target.relative_to(ROOT)}")
        for path in TEMPLATE.rglob("*"):
            canonical_path(ROOT, path)
            if not (path.is_dir() or path.is_file()):
                raise LoopError("Entrada no regular en la plantilla")
        shutil.copytree(TEMPLATE, target)
        for path in target.rglob("*"):
            if path.is_file() and path.suffix in {".yaml", ".yml", ".md"}:
                content = path.read_text(encoding="utf-8").replace("CHANGE_ME", req_id)
                path.write_text(content, encoding="utf-8")

        if not specs:
            spec = ROOT / "specs/features" / f"{req_id.lower()}.md"
            with spec.open("x", encoding="utf-8") as stream:
                stream.write(f"# {req_id} — {title}\n\n## Objetivo\nTBD\n\n## Contexto\nTBD\n")

        workflow = manifest.setdefault("workflow", {})
        workflow["current_feature"] = req_id
        workflow["current_skill"] = "requirement-loop-orchestrator"
        if workflow.get("current_stage") in {"discovery", "planning", "ready-for-development"}:
            workflow["current_stage"] = "in-development"
        handoff = {"handoff": {
            "status": "ready", "from_skill": "requirement-loop-orchestrator",
            "feature": req_id, "feature_status": "pending-analysis",
            "decision": "start-requirement-loop", "next_skill": "feature-analysis",
            "next_agent": "analysis_agent",
            "state_file": f"docs/implementacion/requerimientos/{req_id}/loop-state.yaml",
            "blocking_questions": [], "notes": "Nuevo requerimiento inicializado.",
        }}
        write_yaml(manifest_path, manifest)
        write_yaml(handoff_path, handoff)
    print(f"Creado {req_id}: {title}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit('Uso: python scripts/nuevo_requerimiento.py US-001 "Título opcional"')
    requirement = sys.argv[1].strip().upper()
    try:
        initialize(requirement, sys.argv[2].strip() if len(sys.argv) > 2 else requirement)
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error

