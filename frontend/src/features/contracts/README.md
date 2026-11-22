# Contracts feature

Conecta el mockup existente con el dashboard y las APIs autenticadas de contratos. Incluye alta, carga de versión, motivo de corrección, revisión por SHA-256, firma declarativa, histórico, comparación, firmantes, verificación y descarga autorizada.

Las solicitudes HTTP se mantienen en `api.ts` y usan el cliente común `services/api/client.ts`. Las descargas reciben una URL prefirmada de corta duración después de que la API valida JWT y registra auditoría.

