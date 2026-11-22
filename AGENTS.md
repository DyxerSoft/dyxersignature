# Dyxersoft — Orquestación multiagente

## Fuentes de verdad
Todos los agentes leen `project-manifest.yaml`, `handoff.yaml` y ADR aplicables. Durante bootstrap también leen `docs/00-gobernanza/bootstrap-state.yaml`.

## Pipeline A — Bootstrap del proyecto
Se ejecuta al crear el proyecto o cuando un architecture evolution trigger obliga a revisar la baseline.

1. `project_bootstrap_agent`
2. `architecture_review_agent`
3. `planificacion-sistema` solo después de `BOOTSTRAP_READY`.

### Máquina de estados bootstrap
- `PENDING`, `BOOTSTRAP_REWORK` -> `project_bootstrap_agent`.
- `BOOTSTRAP_REVIEW_REQUIRED` -> `architecture_review_agent`.
- `BOOTSTRAP_READY` -> `planificacion-sistema`.
- `BOOTSTRAP_BLOCKED`, `HUMAN_ARCHITECTURE_REVIEW_REQUIRED` -> detener y reportar.

### Independencia bootstrap
- Bootstrap propone y documenta; no implementa código productivo.
- Architecture Review revisa; no reemplaza silenciosamente decisiones ni implementa.
- Solo Architecture Review puede marcar `BOOTSTRAP_READY`.

## Pipeline B — Desarrollo por requerimiento
Fuente de verdad: `docs/implementacion/requerimientos/<ID>/loop-state.yaml`.

1. `analysis_agent`
2. `developer_agent`
3. `security_agent`
4. `adversarial_test_agent`
5. `validation_agent`

El agente principal actúa como organizador. Lee `skills/orquestacion/requirement-loop-orchestrator.md`, reserva cada despacho mediante `scripts/ejecutar_requirement_loop.py` e invoca al agente indicado mediante la delegación nativa de Codex. El CLI persiste y valida las decisiones. El organizador vincula el recibo de sesión antes de enviar su resultado y es el único escritor de `loop-state.yaml` y `handoff.yaml` en modo gestionado.

Validation califica las entregas de Analysis, Developer, Security y QA. El organizador califica la entrega de Validation con evidencia independiente. Cada evaluación aplica los diez criterios de su rúbrica congelada en `config/requirement-rubrics-v1.yaml`. Validation emite el único veredicto válido de `COMPLETED`. El organizador lo materializa cuando las cinco evaluaciones vigentes obtienen 10/10 y todos los gates aplicables se cumplen.

Developer conserva las escrituras de producto. Security revisa y QA puede editar sus pruebas y fixtures. Los cinco agentes devuelven resultados al organizador mediante su sesión. Una pausa por cuota conserva el intento y los resultados confirmados.

## Selección tecnológica
Ningún agente selecciona stack por costumbre. Bootstrap usa `config/technology-radar.yaml`, perfiles, drivers y scorecards. Developer consume la selección ya aceptada en `project-manifest.yaml`.

Una tecnología no soportada requiere ADR y skill/perfil explícito. Componentes auxiliares requieren driver.

## Límites de convergencia
- bootstrap: 3 ciclos;
- architecture review: 2;
- análisis: 3;
- desarrollo: 5;
- seguridad: 3;
- pruebas: 5;
- requirement loop total: 12.

Al exceder límites: `HUMAN_ARCHITECTURE_REVIEW_REQUIRED` o `HUMAN_REVIEW_REQUIRED` según pipeline.

