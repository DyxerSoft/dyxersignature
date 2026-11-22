from pathlib import Path
import re
import sys
import yaml
from ejecutar_requirement_loop import get_state_path, read_rubrics, validate
from requirement_loop import stale_role
from requirement_loop_storage import canonical_path, read_yaml

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    try:
        return read_yaml(canonical_path(ROOT, path))
    except (OSError, TypeError, ValueError, yaml.YAMLError) as error:
        raise SystemExit(f"Validación multiagente fallida: {error}") from error


manifest = load(ROOT / "project-manifest.yaml")
feature = manifest.get("workflow", {}).get("current_feature")
errors = []

if not feature:
    if manifest.get("workflow", {}).get("current_stage") in {"bootstrap", "planning", "discovery"}:
        print("Requirement loop aún no iniciado; válido para etapa actual.")
        sys.exit(0)
    errors.append("workflow.current_feature no está definido")
elif not isinstance(feature, str) or not re.fullmatch(r"[A-Z]+-[0-9]+", feature):
    errors.append("workflow.current_feature no es un ID válido")
else:
    state_path = get_state_path(ROOT, feature)
    if not state_path.exists():
        errors.append(f"Falta {state_path.relative_to(ROOT)}")
    else:
        state = load(state_path)
        valid_states = {
            "PENDING", "ANALYZING", "ANALYSIS_READY", "IMPLEMENTING",
            "IMPLEMENTATION_READY", "SECURITY_REVIEWING", "SECURITY_EVIDENCE_READY",
            "SECURITY_FINDINGS_REWORK", "SECURITY_REVIEW_BLOCKED", "TESTING",
            "TEST_EVIDENCE_READY", "VALIDATING", "ANALYSIS_REWORK", "CODE_REWORK",
            "SECURITY_REWORK", "TEST_REWORK", "INFRA_REWORK", "BLOCKED",
            "HUMAN_REVIEW_REQUIRED", "COMPLETED"
        }
        if state.get("requirement") != feature:
            errors.append("loop-state.requirement no coincide con current_feature")
        if state.get("state") not in valid_states:
            errors.append(f"Estado inválido: {state.get('state')}")
        limits, cycles = state.get("limits", {}), state.get("cycles", {})
        checks = [
            ("analysis", "analysis_cycles"), ("development", "development_cycles"),
            ("security", "security_cycles"), ("testing", "test_cycles")
        ]
        for cycle, limit in checks:
            if cycles.get(cycle, 0) > limits.get(limit, 999):
                errors.append(f"Se excedió límite de {cycle}")
        if state.get("iteration", 0) > limits.get("total_iterations", 999):
            errors.append("Se excedió límite total de iteraciones")
        if "schema_version" in state:
            try:
                validate(state, feature, read_rubrics(ROOT))
                checkpoint = state["checkpoint"] or {}
                stale = checkpoint.get("stale_role") or stale_role(ROOT, state, manifest.get("quality_gates", {}))
                if stale:
                    errors.append(f"Revisión obsoleta para {stale}")
            except (KeyError, TypeError, ValueError, OSError, yaml.YAMLError) as error:
                errors.append(str(error))

expected = {
    "analysis": "analysis_agent", "development": "developer_agent",
    "security": "security_agent", "testing": "adversarial_test_agent",
    "validation": "validation_agent"
}
for key, value in expected.items():
    if manifest.get("workflow", {}).get("agents", {}).get(key) != value:
        errors.append(f"workflow.agents.{key} debe ser {value}")

if errors:
    print("Validación multiagente fallida.")
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print("Loop multiagente válido.")
print(f"Feature: {feature}")
print(f"Estado: {state['state']}")
print(f"Siguiente agente: {state.get('next_agent')}")

