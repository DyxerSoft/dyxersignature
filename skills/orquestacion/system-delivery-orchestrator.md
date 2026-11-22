---
name: system-delivery-orchestrator
description: Orquesta bootstrap, definición de producto, arquitectura detallada, diseño, datos, infraestructura, seguridad, pruebas y entrega.
---
# System Delivery Orchestrator

Lee `project-manifest.yaml`, `handoff.yaml` y `bootstrap-state.yaml`.

## Gate de entrada
Si `quality_gates.bootstrap_completed != true` o `quality_gates.architecture_review_passed != true`, no ejecutar planificación detallada. Delegar según bootstrap-state.

## Secuencia
bootstrap -> architecture review -> planificación -> frontend/design (si aplica) -> backend/API (si aplica) -> datos -> infraestructura -> seguridad -> pruebas -> delivery -> requirement loop.

No permite que skills posteriores redefinan silenciosamente ADR aceptados. Un cambio material vuelve a Architecture Review.

