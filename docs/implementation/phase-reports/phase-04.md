# Fase 4 — Integración frontend

## Entrega

Se conectó el mockup React existente con el cliente API autenticado, el dashboard persistido y el flujo de contratos. La interfaz permite crear y seleccionar contratos, cargar un PDF como versión nueva, informar motivo de corrección, confirmar el hash revisado, registrar firmantes, esperar el procesamiento asíncrono de Stellar, comparar versiones, consultar firmantes, verificar el PDF y la transacción, y obtener una descarga S3 prefirmada tras autorización y auditoría.

La vista conserva las tarjetas y el estilo global del mockup. Los datos del dashboard y del histórico vienen de PostgreSQL. La guía describe Compose local, variables de entorno, endpoints y recorrido de demo.

## Commit

`12dbefb7f8ac218720647f85b427d713dec2ab02` — `feat(frontend): connect demo workbench to contract APIs`.

## Archivos modificados

- Frontend: `frontend/src/app/App.tsx`, `features/contracts/{ContractWorkbench.tsx,api.ts,types.ts}`, `features/dashboard/Dashboard.tsx`, cliente HTTP y estilos.
- API de documentos: `DocumentsController.cs` devuelve la URL temporal después de guardar auditoría; verifica Stellar solo cuando el anclaje está confirmado.
- Descarga: `S3DocumentStorage.cs` emite `Content-Disposition: attachment`, tipo PDF y `Cache-Control: no-store` en la URL prefirmada.
- Guías y requisitos: `README.md`, `docs/implementation/demo-guide.md`, guías de módulos y de arquitectura.

## Pruebas y resultados

- `npm run build` local: TypeScript y Vite build correctos; 21 módulos transformados.
- Frontend CI `45036964906`: `npm ci`, TypeScript/Vite build e imagen Docker correctos.
- Backend CI `45036965023`: restore, build, pruebas .NET e imagen Docker correctos.
- YAML y Compose parsean localmente. No hay Docker Engine ni .NET SDK en este equipo, por lo que no se ejecutó el recorrido PDF desde navegador local.

## Bloqueos y límites

- No se ejecutó manualmente el flujo completo de PDF en navegador con SeaweedFS y una cuenta de Stellar configurada. El testnet smoke anterior prueba el adaptador, no el envío end-to-end desde el frontend.
- La sesión local usa un endpoint de token de demostración disponible únicamente en `Development`; no sustituye un proveedor de identidad de producción.
- El MVP autoriza la descarga a cualquier usuario autenticado y no implementa ACL por organización/contrato.
- La firma es un evento declarado y auditado, no una firma criptográfica cualificada ni verificación de identidad.

## Siguiente fase

Ejecutar la carga reproducible con 100 usuarios y medir contratos/segundo, p95 y errores con Compose efímero; hacer una muestra secuencial y acotada de transacciones reales de Stellar Testnet. Publicar resultados y gates sin suponer capacidad externa.

