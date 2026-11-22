---
name: infrastructure-design
description: Diseña despliegue portable-first desde local/self-hosted/VPS hasta cloud futuro.
---
# Infrastructure Design

## Estrategia por etapa

### Etapa temprana
Preferir Docker Compose, reverse proxy estándar, TLS automático, backups automatizados, secretos fuera de Git, health checks y logs estructurados. Compatible con servidor propio o VPS/Hostinger cuando recursos lo permitan.

### Escalamiento
Separar DB/storage/cache cuando exista necesidad. Incorporar métricas, alertas y automatización de despliegue. Evitar Kubernetes antes de que complejidad/escala/equipo lo justifiquen.

### Cloud futuro
Migrar componentes de forma incremental. Un servicio propietario requiere ADR con beneficio, costo, lock-in y estrategia de salida.

## Outputs
Topología por ambiente, CI/CD, DNS/TLS, secretos, persistencia, backups/RTO/RPO, observabilidad, capacity budget y runbook básico.

