# Contratos — componente OCR legado (fuera del MVP desplegable)

Este directorio conserva el taller anterior `ContractWorkbench.tsx` y su cliente `api.ts`, pero **no está montado en la navegación actual**. Sus endpoints `POST /contracts/{id}/versions/signed` y `/contracts/{id}/ingest/*` no están implementados por el backend Stellar incluido en `deploy/dyx-demo/compose.yml`; el BFF OCR tampoco se despliega en esa pila.

Para el MVP de la hackatón, el código que sí consume la API .NET actual está en `frontend/src/features/stellar`. El listado paginado, las versiones PDF, las firmas, el Dashboard y la auditoría se muestran desde las páginas administrativas conectadas a ese flujo.

No reactivar el taller OCR legado ni las funciones `frontend/src/features/documents/api.ts` hasta implementar sus endpoints y probar la integración de autenticación, red, almacenamiento y contratos.
