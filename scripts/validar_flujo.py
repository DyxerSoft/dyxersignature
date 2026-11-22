from pathlib import Path
import sys

try:
    import yaml
except ImportError:
    print("Instala PyYAML: pip install pyyaml")
    raise

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "project-manifest.yaml"
manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
errors = []
missing = []

required_files = [
    "README.md", "AGENTS.md", "SECURITY.md", "handoff.yaml",
    ".codex/config.toml",
    ".codex/agents/project-bootstrap-agent.toml", ".codex/agents/architecture-review-agent.toml",
    ".codex/agents/analysis-agent.toml", ".codex/agents/developer-agent.toml",
    ".codex/agents/security-agent.toml", ".codex/agents/adversarial-test-agent.toml",
    ".codex/agents/validation-agent.toml",
    "skills/orquestacion/requirement-loop-orchestrator.md",
    "skills/implementacion/feature-analysis.md",
    "skills/seguridad/feature-security-review.md",
]
for rel in required_files:
    if not (ROOT / rel).exists():
        missing.append(rel)

project = manifest.get("project", {})
tech = manifest.get("technology", {})
deployment = manifest.get("deployment", {})
architecture = manifest.get("architecture", {})
workflow = manifest.get("workflow", {})
bootstrap_active = workflow.get("current_stage") == "bootstrap" or manifest.get("meta", {}).get("bootstrap_status") in {"pending", "in-progress"}

if not bootstrap_active:
    if not project.get("name") or project.get("name") == "CHANGE_ME":
        errors.append("project.name debe configurarse")
    if not project.get("slug") or project.get("slug") == "change-me":
        errors.append("project.slug debe configurarse")

frontend = tech.get("frontend", {}).get("framework")
backend = tech.get("backend", {}).get("platform")
valid_frontend = {"react", "nextjs", "angular", "none"}
valid_backend = {"dotnet", "python", "none"}
if bootstrap_active:
    valid_frontend.add("undecided")
    valid_backend.add("undecided")
if frontend not in valid_frontend:
    errors.append(f"Frontend no soportado por plantilla: {frontend}")
if backend not in valid_backend:
    errors.append(f"Backend no soportado por plantilla: {backend}")
if frontend == "none" and manifest.get("repositories", {}).get("frontend", {}).get("enabled"):
    errors.append("repositories.frontend.enabled debe ser false cuando frontend.framework=none")
if backend == "none" and manifest.get("repositories", {}).get("backend", {}).get("enabled"):
    errors.append("repositories.backend.enabled debe ser false cuando backend.platform=none")

valid_targets = {"local", "self-hosted", "vps", "hostinger", "cloud"}
if bootstrap_active:
    valid_targets.add("undecided")
if deployment.get("current_target") not in valid_targets:
    errors.append(f"deployment.current_target inválido: {deployment.get('current_target')}")
if deployment.get("cloud_provider") != "none" and deployment.get("current_target") != "cloud":
    errors.append("cloud_provider debe ser none salvo que current_target=cloud; documenta híbrido mediante ADR y ajusta validador si aplica")

if not bootstrap_active and architecture.get("tenancy") != "none" and project.get("type") not in {"saas", "web-application", "api", "other"}:
    errors.append("Tenancy activo en un tipo de proyecto inusual; revisar project.type/architecture.tenancy")

for key, item in manifest.get("artifacts", {}).items():
    rel = item.get("path")
    if not rel:
        errors.append(f"artifact {key} no tiene path")
        continue
    if item.get("status") in {"draft", "approved", "defined"} and not (ROOT / rel).exists():
        missing.append(rel)

if manifest.get("project", {}).get("status") == "ready-for-development":
    false_gates = [k for k, v in manifest.get("quality_gates", {}).items() if isinstance(v, bool) and not v]
    if false_gates:
        errors.append("ready-for-development con gates pendientes: " + ", ".join(false_gates))

if missing or errors:
    print("Validación fallida.")
    if missing:
        print("Archivos faltantes:")
        for rel in sorted(set(missing)):
            print(f"- {rel}")
    if errors:
        print("Errores:")
        for e in errors:
            print(f"- {e}")
    sys.exit(1)

print("Estructura Dyxersoft válida.")
print(f"Proyecto: {project['name']}")
print(f"Frontend: {frontend}")
print(f"Backend: {backend}")
print(f"Deployment: {deployment.get('current_target')}")
print(f"Tenancy: {architecture.get('tenancy')}")

