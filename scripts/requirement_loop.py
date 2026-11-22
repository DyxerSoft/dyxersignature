"""Managed requirement transitions. Callers serialize mutations through the organizer."""

from datetime import datetime, timezone
import re
import uuid

from requirement_loop_storage import (
    EvidenceBudget, LoopError, changed, digest, product_baseline, product_inventory,
    product_modes, require_clean_index, snapshot, snapshot_product, verify_reference,
)


ROLES = (
    "analysis_agent", "developer_agent", "security_agent", "adversarial_test_agent",
    "validation_agent",
)
ORGANIZER = "organizer"
REVIEWER = {role: ROLES[-1] for role in ROLES[:-1]} | {ROLES[-1]: ORGANIZER}
CYCLES = dict(zip(ROLES, ("analysis", "development", "security", "testing", "validation")))
LIMITS = dict(zip(ROLES[:-1], ("analysis_cycles", "development_cycles", "security_cycles", "test_cycles")))
HARD_LIMITS = dict(zip((*LIMITS.values(), "total_iterations"), (3, 5, 3, 5, 12)))
ACTIVE = ("ANALYZING", "IMPLEMENTING", "SECURITY_REVIEWING", "TESTING", "VALIDATING")
READY = ("ANALYSIS_READY", "IMPLEMENTATION_READY", "SECURITY_EVIDENCE_READY", "TEST_EVIDENCE_READY", "COMPLETED")
REWORK = ("ANALYSIS_REWORK", "CODE_REWORK", "SECURITY_REWORK", "TEST_REWORK", "VALIDATING")
REDIRECT = dict(zip(REWORK, ROLES)) | {"SECURITY_FINDINGS_REWORK": ROLES[1]}
GATES = {
    "dod", "traceability", "invariants", "no_known_flaky", "critical_high_closed", "severe_defects_closed"
}
BLOCKERS = {"BLOCKED", "INFRA_REWORK", "SECURITY_REVIEW_BLOCKED", "HUMAN_REVIEW_REQUIRED"}
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|"
    r"(?:ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b|"
    r"(?i:bearer\s+[A-Za-z0-9._~+/=-]{12,}|://[^\s:/]+:[^\s@/]+@|"
    r"(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)[\s\"']*[:=]\s*[\"']?[^\s\"']{8,})"
)
AUDIT_LIMIT = 128
CONFLICT_LIMIT = 32


def require(valid, message):
    if not valid:
        raise LoopError(message)


def identifier(value, label):
    require(isinstance(value, str) and ID.fullmatch(value), f"{label} inválido")
    require(not SECRET.search(value), "Texto sensible detectado")
    return value


def present(value):
    return isinstance(value, str) and bool(value.strip())


def check_text(value):
    if isinstance(value, str):
        require(not SECRET.search(value), "Texto sensible detectado")
    elif isinstance(value, list):
        for item in value:
            check_text(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            check_text(key)
            check_text(item)


def now():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return uuid.uuid4().hex


def emit(state, event, **details):
    state["generation"] += 1
    history = state["history"]
    record = {
        "sequence": state["generation"], "previous": history[-1]["hash"] if history else None,
        "time": now(), "event": event, **details,
    }
    history.append(record | {"hash": digest(record)})


def migrate(state, rubrics):
    limits = state["limits"]
    for name, maximum in HARD_LIMITS.items():
        require(type(limits.get(name)) is int and 0 <= limits[name] <= maximum, f"Límite incompatible: {name}")
    legacy_history = state.pop("history")
    legacy = state["state"]
    state.update(
        schema_version=1, generation=0, rubric_digest=digest(rubrics),
        history=[], legacy_history=legacy_history, legacy_state=legacy,
        approvals={}, deliveries={}, checkpoint=None, dispatch=None, evaluation_pending=None,
        events={}, sessions={}, used_sessions=[], sources={}, security_initial=dict(state["security"]),
        bounded_audit=0, bounded_conflicts=0,
    )
    for key in CYCLES.values():
        state["cycles"].setdefault(key, 0)
    if legacy not in BLOCKERS | {"COMPLETED"}:
        schedule(state, ROLES[0], "PENDING" if legacy == "PENDING" else "ANALYSIS_REWORK")
    else:
        state["next_agent"] = None
    emit(state, "initialized", legacy_state=legacy)


def schedule(state, role, phase):
    state.update(state=phase, next_agent=role, dispatch=None, evaluation_pending=None, checkpoint=None)


def return_to(state, role, phase, reason):
    for dependent in ROLES[ROLES.index(role):]:
        state["approvals"].pop(dependent, None)
        state["deliveries"].pop(dependent, None)
        state["sources"].pop(dependent, None)
    if ROLES.index(role) <= ROLES.index(ROLES[2]):
        state["security"] = state["security_initial"] | {"gate": "pending"}
    schedule(state, role, phase)
    emit(state, "rework", role=role, phase=phase, reason=reason)


def stale_role(root, state, policy=None):
    dispatch = state["dispatch"]
    for role in ROLES:
        delivery = state["deliveries"].get(role)
        approval = state["approvals"].get(role)
        if (
            role == ROLES[2] and delivery and delivery.get("gate") == "not_applicable"
            and policy is not None and not exception_allowed(
                state, policy, delivery.get("exception"), delivery.get("reviewed_revision"),
            )
        ):
            return role
        if role == ROLES[1] and delivery and "product_baseline" in delivery:
            actual = product_inventory(root, delivery["product_baseline"], state["requirement"])
            if actual != delivery["product_sources"] or product_modes(root, actual) != delivery.get("product_modes"):
                return role
        if changed(root, state["sources"].get(role, {})):
            return role
        if (delivery and changed(root, delivery["files"])) or (approval and changed(root, approval["files"])):
            return role
    if dispatch and changed(root, dispatch["files"]):
        return dispatch["subject"]
    return None


def detect_drift(root, state, policy=None):
    role = stale_role(root, state, policy)
    if role is None:
        return False
    checkpoint = state["checkpoint"]
    if checkpoint:
        previous = checkpoint.get("stale_role")
        if previous is None or ROLES.index(role) < ROLES.index(previous):
            checkpoint["stale_role"] = role
            emit(state, "stale_while_paused", role=role, dispatch_id=checkpoint["dispatch_id"])
            refresh_checkpoint(state)
        return True
    return_to(state, role, REWORK[ROLES.index(role)], "revisión obsoleta")
    return True


def reserve(root, state, sources):
    require_clean_index(root)
    require(not state["checkpoint"], "Invoca resume antes de reservar")
    if state["dispatch"]:
        require(not sources, "Un despacho reservado conserva sus insumos")
        return state["dispatch"]
    actor = state["next_agent"]
    require(actor is not None, "El estado no permite un nuevo despacho")
    pending = state["evaluation_pending"]
    subject = pending["subject"] if pending else actor
    kind = "evaluation" if pending else "delivery"
    count_total = not pending or pending["retry"] > 0
    limits = state["limits"]
    exceeded = None
    if count_total and state["iteration"] >= limits["total_iterations"]:
        exceeded = "total_iterations"
    elif not pending and actor in LIMITS and state["cycles"][CYCLES[actor]] >= limits[LIMITS[actor]]:
        exceeded = LIMITS[actor]
    if exceeded:
        schedule(state, None, "HUMAN_REVIEW_REQUIRED")
        emit(state, "limit", limit=exceeded, role=actor, subject=subject, kind=kind)
        return None
    require(not pending or not sources, "La evaluación hereda los insumos de la entrega")
    if sources:
        state["sources"].setdefault(actor, {}).update(snapshot(root, sources))
    files = {}
    for recorded_sources in state["sources"].values():
        files.update(recorded_sources)
    for role in ROLES[:ROLES.index(subject) + bool(pending)]:
        for record in (state["deliveries"].get(role), state["approvals"].get(role)):
            if record:
                files.update(record["files"])
    if pending:
        delivery = state["deliveries"][subject]
        revision = delivery["revision"]
        task_id = delivery["task_id"]
        attempt = pending["retry"] + 1
    else:
        task_id = new_id()
        attempt = state["cycles"][CYCLES[actor]] + 1
        revision = {"delivery": task_id, "inputs": digest(files)}
    dispatch = {
        "requirement_id": state["requirement"], "task_id": task_id, "dispatch_id": new_id(),
        "role": actor, "subject": subject, "kind": kind, "attempt": attempt, "revision": revision,
        "files": files, "rubric_id": subject, "rubric_version": 1,
    }
    if not pending and actor == ROLES[1]:
        baseline = state.get("product_baseline") or product_baseline(root)
        state["product_baseline"] = baseline
        dispatch["product_baseline"] = baseline
        revision["inputs"] = digest({"files": files, "product_baseline": baseline})
    state["iteration"] += count_total
    if actor != ORGANIZER:
        state["cycles"][CYCLES[actor]] += 1
    if not pending:
        state["state"] = ACTIVE[ROLES.index(actor)]
    state["dispatch"] = dispatch
    emit(state, "reserved", dispatch=dispatch)
    return dispatch


def bind(state, dispatch_id, role, session):
    identifier(session, "Sesión")
    require(session != ORGANIZER, "Sesión reservada para el organizador")
    dispatch = state["dispatch"]
    require(dispatch and not state["checkpoint"] and dispatch["dispatch_id"] == dispatch_id, "Despacho no vigente")
    require(dispatch["role"] == role and role in ROLES, "Rol ajeno al despacho")
    current = state["sessions"].get(dispatch_id)
    if current == session:
        return
    require(current is None and session not in state["used_sessions"], "Sesión o despacho vinculado previamente")
    state["sessions"][dispatch_id] = session
    state["used_sessions"].append(session)
    emit(state, "bound", dispatch_id=dispatch_id, role=role, session=session)


def collect_evidence(root, references, budget):
    require(isinstance(references, list) and references, "Evidencia vacía")
    files = {}
    for ref in references:
        verify_reference(root, ref, budget)
        files[ref["path"]] = ref["sha256"]
    return files


def evaluate(root, state, dispatch, payload, rubric):
    evaluation = payload.get("evaluation")
    require(isinstance(evaluation, dict), "Falta evaluación")
    required = {
        "evaluation_id", "requirement_id", "task_id", "dispatch_id", "role", "reviewer",
        "revision", "attempt", "rubric_id", "rubric_version", "criteria",
    }
    require(required <= evaluation.keys() <= required | {"score"}, "Campos de evaluación inválidos")
    evaluation_id = identifier(evaluation["evaluation_id"], "ID de evaluación")
    require(not any(
        item.get("evaluation", {}).get("evaluation_id") == evaluation_id
        for item in state["history"]
    ), "ID de evaluación repetido")
    subject = dispatch["subject"]
    expected = {key: dispatch[key] for key in (
        "requirement_id", "task_id", "dispatch_id", "revision", "attempt", "rubric_id", "rubric_version",
    )}
    expected |= {"role": subject, "reviewer": dispatch["role"]}
    require(all(type(evaluation[key]) is type(value) and evaluation[key] == value for key, value in expected.items()), "Autor, rúbrica, intento, metadatos o revisión incorrectos")
    criteria = evaluation["criteria"]
    canonical = rubric["criteria"]
    require(isinstance(criteria, list) and len(criteria) == len(canonical), "Se requieren diez criterios")
    seen = set()
    score = 0
    files = {}
    budget = EvidenceBudget(check_text)
    for item in criteria:
        require(isinstance(item, dict) and {"criterion_id", "passed", "evidence"} <= item.keys() <= {
            "criterion_id", "passed", "evidence", "action",
        }, "Campos de criterio inválidos")
        criterion = item["criterion_id"]
        require(isinstance(criterion, str) and criterion in canonical and criterion not in seen, "Criterio repetido o desconocido")
        seen.add(criterion)
        require(type(item["passed"]) is bool, "passed debe ser booleano estricto")
        evidence = item["evidence"]
        require(isinstance(evidence, dict) and {"references", "justification"} <= evidence.keys() <= {
            "references", "justification", "expected_locator", "exception",
        } and present(evidence["justification"]), "Falta justificación de evidencia")
        if "expected_locator" in evidence:
            require(present(evidence["expected_locator"]) and not item["passed"], "Localizador esperado inválido")
        if "exception" in evidence:
            verify_reference(root, evidence["exception"], budget)
            exception = evidence["exception"]
            files[exception["path"]] = exception["sha256"]
        if not item["passed"]:
            require(present(item.get("action")), "Falta acción correctiva")
        files.update(collect_evidence(root, evidence["references"], budget))
        score += item["passed"]
    if "score" in evaluation:
        require(type(evaluation["score"]) is int and evaluation["score"] == score, "El total declarado no coincide")
    return evaluation | {"score": score}, files


def exception_allowed(state, policy, reference, revision):
    authorizations = policy.get("security_exceptions", {})
    authorization = authorizations.get(state["requirement"]) if isinstance(authorizations, dict) else None
    return (
        state["security_initial"].get("required", True) is False
        and state["security"].get("required", True) is False
        and policy.get("security_review_required", True) is False
        and reference is not None
        and isinstance(authorization, dict)
        and authorization.get("authorization") == reference
        and (
            authorization == {"mode": "permanent", "authorization": reference}
            or revision is not None and authorization == {
                "mode": "revision", "authorization": reference, "revision": revision,
            }
        )
    )


def deliver(root, state, dispatch, payload, policy):
    role = dispatch["role"]
    index = ROLES.index(role)
    outcome = payload.get("outcome")
    require(isinstance(outcome, str) and outcome in {
        READY[index], *REDIRECT, *BLOCKERS, "TEST_INFRA_BLOCKED", "ANALYSIS_GAP_FOUND",
    } - {"HUMAN_REVIEW_REQUIRED"}, "Resultado de entrega no permitido")
    require(outcome != "COMPLETED" or role == ROLES[-1], "Solo Validation emite COMPLETED")
    require(outcome != "SECURITY_FINDINGS_REWORK" or role == ROLES[2], "Gate adverso reservado a Security")
    artifacts = payload.get("artifacts")
    budget = EvidenceBudget(check_text)
    files = collect_evidence(root, artifacts, budget)
    result = {"outcome": outcome, "artifacts": artifacts}
    if role == ROLES[1] and (outcome == READY[index] or "product_sources" in payload):
        sources = payload.get("product_sources")
        require(isinstance(sources, list) and all(isinstance(name, str) for name in sources), "Inventario de producto inválido")
        baseline = dispatch["product_baseline"]
        actual = product_inventory(root, baseline, state["requirement"])
        require(sorted(sources) == actual, "El inventario declarado no coincide con el diff Git")
        files.update(snapshot_product(root, actual))
        result.update(product_sources=actual, product_baseline=baseline, product_modes=product_modes(root, actual))
    if role == ROLES[2] and outcome in {READY[index], "SECURITY_FINDINGS_REWORK"}:
        gate = payload.get("gate")
        require(gate in ("pass", "not_applicable") if outcome == READY[index] else gate == "fail", "Resultado de seguridad contradictorio")
        result["gate"] = gate
        if gate == "not_applicable":
            exception = payload.get("exception")
            revision = dispatch["revision"]
            require(exception_allowed(state, policy, exception, revision), "Excepción de seguridad no autorizada por la política vigente")
            verify_reference(root, exception, budget)
            files[exception["path"]] = exception["sha256"]
            result["exception"] = exception
            result["reviewed_revision"] = revision
    if role == ROLES[-1] and outcome == "COMPLETED":
        gates = payload.get("gates")
        require(isinstance(gates, dict) and gates.keys() == GATES and all(type(value) is bool for value in gates.values()), "Gates de aceptación inválidos")
        result["gates"] = gates
    delivery = {
        **result, "dispatch_id": dispatch["dispatch_id"], "task_id": dispatch["task_id"],
        "attempt": dispatch["attempt"], "files": files,
        "revision": {
            "delivery": digest(result | {"files": files, "task_id": dispatch["task_id"], "attempt": dispatch["attempt"]}),
            "inputs": dispatch["revision"]["inputs"],
        },
    }
    state["deliveries"][role] = delivery
    state.update(dispatch=None, next_agent=REVIEWER[role], evaluation_pending={"subject": role, "retry": 0})
    emit(state, "delivered", role=role, delivery=delivery)


def advance(state, subject, rework):
    index = ROLES.index(subject)
    delivery = state["deliveries"][subject]
    evaluation = state["approvals"][subject]["evaluation"]
    outcome = delivery["outcome"]
    phase = rework
    if delivery.get("gate") == "fail":
        phase = "SECURITY_FINDINGS_REWORK"
    if phase is None and evaluation["score"] < 10:
        phase = REWORK[index]
    if phase is None:
        phase = {"ANALYSIS_GAP_FOUND": "ANALYSIS_REWORK", "TEST_INFRA_BLOCKED": "INFRA_REWORK"}.get(outcome, outcome)
    if phase in REDIRECT:
        return_to(state, REDIRECT[phase], phase, evaluation["evaluation_id"])
    elif phase in BLOCKERS:
        schedule(state, None, phase)
    elif index < len(ROLES) - 1:
        if subject == ROLES[2]:
            state["security"]["gate"] = delivery["gate"]
            if "exception" in delivery:
                state["security"]["exception"] = delivery["exception"]
        schedule(state, ROLES[index + 1], phase)
    else:
        gates_ready = state["security"]["gate"] in {"pass", "not_applicable"} and all(delivery["gates"].values())
        scores_ready = all(
            role in state["approvals"]
            and state["approvals"][role]["evaluation"]["score"] == 10
            and state["approvals"][role]["evaluation"]["revision"] == state["deliveries"][role]["revision"]
            for role in ROLES
        )
        if gates_ready and scores_ready:
            schedule(state, None, "COMPLETED")
            emit(state, "completed", verdict_dispatch=delivery["dispatch_id"], evaluation_id=evaluation["evaluation_id"])
        else:
            return_to(state, subject, "VALIDATING", "gates o notas pendientes")


def actor_matches(state, session):
    dispatch = state["dispatch"]
    return dispatch and (
        (dispatch["role"] == ORGANIZER and session == ORGANIZER)
        or (session != ORGANIZER and state["sessions"].get(dispatch["dispatch_id"]) == session)
    )


def bounded_event(state, event, **details):
    counter, limit = ("bounded_conflicts", CONFLICT_LIMIT) if event == "conflict" else ("bounded_audit", AUDIT_LIMIT)
    used = state.get(counter, 0)
    if used >= limit:
        return False
    state[counter] = used + 1
    emit(state, event, **details)
    refresh_checkpoint(state)
    return True


def reject_result(state, session, reason, event_id=None, dispatch_id=None):
    dispatch = state["dispatch"]
    if not actor_matches(state, session):
        return "rejected"
    logged = bounded_event(
        state, "rejected", event_id=event_id, dispatch_id=dispatch_id or dispatch["dispatch_id"],
        reason=reason,
    )
    if not state["checkpoint"] and dispatch_id in (None, dispatch["dispatch_id"]):
        if not logged:
            emit(state, "result_retry", dispatch_id=dispatch["dispatch_id"], kind=dispatch["kind"])
        state["dispatch"] = None
        if dispatch["kind"] == "evaluation":
            state["evaluation_pending"]["retry"] += 1
    return "rejected"


def submit(root, state, rubrics, session, payload, policy=None):
    identifier(session, "Sesión")
    try:
        require(isinstance(payload, dict), "Resultado no es un objeto")
        check_text(payload)
        event_id = identifier(payload.get("event_id"), "ID de evento")
        dispatch_id = identifier(payload.get("dispatch_id"), "ID de despacho")
        fingerprint = digest(payload)
    except (LoopError, ValueError, RecursionError):
        return reject_result(state, session, "Estructura o texto del resultado inválido")
    key = digest([session, event_id])
    dispatch = state["dispatch"]
    active = actor_matches(state, session)
    old = state["events"].get(key)
    if old:
        if old["hash"] == fingerprint:
            return old["result"]
        if fingerprint not in old["conflicts"] and bounded_event(
            state, "conflict", event_id=event_id, fingerprint=fingerprint,
        ):
            old["conflicts"].append(fingerprint)
        return "conflict"
    if not active or state["checkpoint"]:
        return "rejected"
    if dispatch["subject"] == ROLES[-1]:
        require_clean_index(root)
    try:
        require(dispatch["dispatch_id"] == dispatch_id, "Despacho ajeno o no vigente")
        if dispatch["kind"] == "evaluation":
            evaluation, files = evaluate(root, state, dispatch, payload, rubrics[dispatch["subject"]])
            rework = payload.get("rework")
            require(rework is None or isinstance(rework, str) and rework in REDIRECT.keys() | {"INFRA_REWORK"}, "Destino de rework inválido")
            require(rework is None or evaluation["score"] < 10 or rework == "INFRA_REWORK", "Rework dirigido requiere criterio fallido")
            subject = dispatch["subject"]
            state["approvals"][subject] = {"evaluation": evaluation, "files": files}
            emit(state, "evaluated", evaluation=evaluation)
            advance(state, subject, rework)
        else:
            deliver(root, state, dispatch, payload, policy or {})
    except (LoopError, OSError, ValueError, RecursionError) as error:
        before = state["generation"]
        result = reject_result(
            state, session, str(error) if isinstance(error, LoopError) else "No se pudo verificar el resultado",
            event_id, dispatch_id,
        )
        if state["generation"] == before:
            return result
    else:
        emit(state, "confirmed", event_id=event_id, dispatch_id=dispatch_id)
        result = "accepted"
    state["events"][key] = {"hash": fingerprint, "result": result, "conflicts": []}
    refresh_checkpoint(state)
    return result


def refresh_checkpoint(state):
    if state["checkpoint"]:
        state["checkpoint"]["last_event"] = state["generation"]


def pause(state, dispatch_id, cause, retry_at):
    dispatch = state["dispatch"]
    require(dispatch and dispatch["dispatch_id"] == dispatch_id, "Despacho no vigente")
    previous = state["checkpoint"]
    if previous:
        if previous["cause"] == cause:
            return
        require(
            previous["cause"] == "quota" and cause == "uncertain_dispatch",
            "Causa de pausa incompatible",
        )
    if retry_at:
        require(datetime.fromisoformat(retry_at).tzinfo is not None, "retry_at requiere zona horaria")
    emit(
        state, "paused", dispatch_id=dispatch_id, cause=cause,
        previous_cause=previous["cause"] if previous else None,
    )
    state["checkpoint"] = {
        "version": 1, "requirement": state["requirement"], "cause": cause,
        "last_event": state["generation"], "phase": state["state"], "next_action": "reconcile_dispatch",
        "role": dispatch["role"], "attempt": dispatch["attempt"], "dispatch_id": dispatch_id,
        "revision": dispatch["revision"], "rubric_id": dispatch["rubric_id"], "rubric_version": 1,
        "confirmed_artifacts": dispatch["files"], "pending_result": "unconfirmed",
        "paused_at": now(), "retry_at": retry_at,
    }
    if previous and "stale_role" in previous:
        state["checkpoint"]["stale_role"] = previous["stale_role"]


def resume(state, capacity, retire_session=None):
    checkpoint = state["checkpoint"]
    if retire_session:
        require(
            checkpoint and checkpoint["cause"] == "uncertain_dispatch" and capacity == "reconciled",
            "Retirar una sesión requiere reconciliar un despacho incierto",
        )
        dispatch_id = checkpoint["dispatch_id"]
        require(
            state["sessions"].get(dispatch_id) == retire_session,
            "La sesión a retirar no coincide con la sesión vinculada",
        )
        del state["sessions"][dispatch_id]
        emit(state, "session_retired", dispatch_id=dispatch_id, session=retire_session)
    if checkpoint and (capacity == "quota" or checkpoint["cause"] != "quota" and capacity != "reconciled"):
        return checkpoint
    if checkpoint:
        state["checkpoint"] = None
        emit(state, "resumed", dispatch_id=checkpoint["dispatch_id"], cause=checkpoint["cause"])
    return state["dispatch"]

