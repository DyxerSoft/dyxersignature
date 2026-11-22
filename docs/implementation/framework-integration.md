# Integración del framework multiagente

El repositorio contiene el framework de DyxerSoft/dyxersoft-multiagente-template, rama feat/multiagent-scoring-resume-harness.

## Contenido integrado

- Perfiles de análisis, bootstrap, arquitectura, desarrollo, seguridad, QA y validación en .codex/agents/.
- Configuración de agentes en .codex/config.toml.
- Orquestadores, skills de implementación/infraestructura/seguridad/pruebas y rúbricas congeladas.
- CLI durable de requirement-loop, scoring, rework y resume en scripts/.
- Plantillas de aceptación, contratos, invariantes y evidencia de seguridad en docs/implementacion/requerimientos/_template/.
- Contrato de producto en specs/features/MVP-001.md, manifiesto del proyecto y handoff del organizador.

## Uso en este proyecto

El requerimiento MVP-001 conserva su estado en docs/implementacion/requerimientos/MVP-001/loop-state.yaml. Cada fase añade evidencia al mismo requerimiento y actualiza su handoff. Las rúbricas permanecen versionadas y no deben cambiarse durante una evaluación activa. Los cambios de arquitectura vuelven al gate de revisión de arquitectura.

Desde la raíz del repositorio, inicializar y consultar el arnés:

    python -m pip install -r requirements-dev.txt
    python scripts/ejecutar_requirement_loop.py --requirement MVP-001 init
    python scripts/ejecutar_requirement_loop.py --requirement MVP-001 status
    python scripts/validar_requirement_loop.py --requirement MVP-001

Los recibos de delegación y evaluaciones se deben conservar junto a cada entrega. No se deben fabricar resultados de roles, scoring ni evidencia ausente.
