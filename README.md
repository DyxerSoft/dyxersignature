# DyxerSignature

**Gestión, firma y verificación de contratos con evidencia trazable en blockchain Stellar.**

DyxerSignature es una plataforma web de **Dyxersoft** para administrar el ciclo de vida de documentos y contratos: creación, carga, revisión, registro de aceptación, control de versiones, trazabilidad y comprobación de integridad. Está orientada a organizaciones que necesitan demostrar **qué documento fue aprobado, por quién, en qué versión y si su contenido fue modificado** después.

**Portal del proyecto:** [signature.dyxersoft.com](https://signature.dyxersoft.com) (dominio destinado al despliegue y presentación del MVP; su disponibilidad depende de la publicación del entorno).

> **Estado:** MVP para la hackatón Stellar, en desarrollo e integración. Las funcionalidades descritas representan el alcance del MVP; las integraciones avanzadas y los objetivos de rendimiento se identifican por separado. El anclaje blockchain se realiza en **Stellar Testnet**, no en Mainnet.

## El problema

Un contrato puede pasar por múltiples correcciones, intercambios y firmas. Sin una trazabilidad centralizada, resulta difícil responder preguntas esenciales:

- ¿Cuál es la versión vigente y qué ocurrió con las versiones anteriores?
- ¿Quién revisó y aceptó un documento, y cuándo?
- ¿Cómo comprobar que el PDF no cambió desde su registro?
- ¿Cómo reconstruir el historial de una corrección o una firma durante una auditoría?
- ¿Cómo evitar que los archivos, las evidencias y los estados queden dispersos en correos y aplicaciones?

## La solución

DyxerSignature concentra el proceso en una aplicación administrativa y combina **persistencia transaccional**, **almacenamiento privado de documentos**, **auditoría** y **evidencia criptográfica verificable en Stellar**.

Un documento se conserva fuera de la blockchain. La aplicación calcula su **hash SHA-256** y registra esa huella en una transacción de Stellar Testnet, asociada internamente a la versión y sus evidencias. Así es posible comprobar la integridad del archivo **sin publicar el contrato ni los datos personales en la red**.

## Funcionalidades del MVP

| Módulo | Qué permite hacer |
| --- | --- |
| **Dashboard** | Consultar indicadores operativos de contratos, documentos, firmas y estados a partir de datos persistidos. |
| **Contratos** | Crear, listar y consultar contratos y su ciclo de vida, con referencia de negocio y estado. |
| **Documentos** | Cargar PDF, conservar archivos en un bucket privado y autorizar descargas mediante enlaces temporales. |
| **Versiones y correcciones** | Crear versiones sucesivas, registrar el motivo de corrección, conservar el historial y diferenciar la versión vigente de las reemplazadas. |
| **Revisión** | Confirmar la revisión del documento y comprobar que su SHA-256 corresponde al archivo almacenado. |
| **Firmas y evidencias** | Registrar la declaración de firma/aceptación del firmante y asociar evidencia y eventos auditables al contrato. |
| **Blockchain Stellar** | Encolar el anclaje, enviar el hash mediante transacción asíncrona a Stellar Testnet y conservar el identificador de transacción y ledger. |
| **Verificación** | Recalcular el SHA-256 del archivo y contrastarlo con la evidencia de una transacción Stellar confirmada. |
| **Auditoría y trazabilidad** | Consultar los eventos relevantes, los firmantes, los cambios de versión y el estado de procesamiento. |

### Versionado e historial

Un mismo contrato puede contener **V1, V2, V3...**. Las correcciones crean una nueva versión; **no sobrescriben el PDF anterior**. Se conserva la relación entre versiones, sus huellas criptográficas y sus eventos, lo que permite consultar el historial completo y comparar metadatos y hashes.

La comparación del MVP no es un detector visual de diferencias página por página. La eliminación lógica y las reglas de retención permiten preservar la trazabilidad sin utilizar el borrado físico como mecanismo habitual de corrección.

### Flujo básico

```text
1. Crear contrato
       ↓
2. Cargar PDF y crear versión documental
       ↓
3. Almacenar PDF privado + calcular SHA-256
       ↓
4. Revisar y confirmar integridad del documento
       ↓
5. Registrar firmante, aceptación y evidencia
       ↓
6. Guardar evento y mensaje en Transactional Outbox
       ↓
7. Enviar anclaje asíncrono a Stellar Testnet
       ↓
8. Registrar transacción, confirmación y versión vigente
       ↓
9. Verificar integridad y consultar historial / descargar PDF
```

Las transacciones a Stellar se procesan **fuera de la solicitud HTTP**. El contrato conserva su estado mientras el sistema gestiona confirmaciones o reintentos.

## Arquitectura técnica

DyxerSignature utiliza una **arquitectura de monolito modular**: un backend desplegable con módulos de dominio separados, sin añadir la complejidad operativa de microservicios para el MVP.

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Interfaz web | **React 19, TypeScript y Vite** | Dashboard, gestión de documentos, contratos, firmas y seguimiento de procesos. |
| API de negocio | **ASP.NET Core / .NET 10** | Endpoints REST, validaciones, autenticación y coordinación de procesos. |
| Datos | **PostgreSQL + Entity Framework Core** | Contratos, versiones, estados, firmas, auditoría y Outbox transaccional. |
| Almacenamiento de archivos | **SeaweedFS con API S3 compatible** | PDFs privados, persistencia de versiones y enlaces de descarga prefirmados. |
| Integridad | **SHA-256** | Huella determinista del contenido exacto del documento. |
| Blockchain | **Stellar Testnet** | Anclaje y verificación independiente de hashes a través de transacciones. |
| Procesamiento asíncrono | **Transactional Outbox + worker** | Envío fiable, idempotencia y reintentos de operaciones blockchain. |
| Despliegue | **Docker y Docker Compose** | Empaquetado y ejecución de frontend, API, base de datos y almacenamiento. |
| Observabilidad / API | **Logs estructurados y Swagger/OpenAPI** | Diagnóstico y documentación interactiva de endpoints. |

### Organización del repositorio

```text
dyxersignature/
├── frontend/                   # Aplicación web React
├── backend/
│   ├── src/DyxerSignature.Api/  # API ASP.NET Core y módulos de negocio
│   ├── blockchain/             # Integración y pruebas blockchain
│   └── tools/                  # Herramientas de verificación
├── docs/                       # Arquitectura, requisitos y guías
├── .github/workflows/          # Automatización de validaciones y despliegue
├── .env.example                # Plantilla de configuración sin secretos
└── docker-compose.yml         # Servicios del entorno de demostración
```

### Diseño de seguridad y confiabilidad

- **Documentos privados:** el PDF permanece en el almacenamiento S3 compatible; las descargas requieren autorización y utilizan URLs de duración limitada.
- **Privacidad en blockchain:** Stellar almacena evidencia criptográfica, no PDFs, nombres, correos ni datos de identidad.
- **Auditoría:** los eventos relevantes se registran para reconstruir acciones y cambios.
- **Consistencia:** la evidencia y el mensaje Outbox se guardan como parte de la operación transaccional; el worker procesa el anclaje y sus reintentos.
- **Versiones preservadas:** una corrección no destruye los archivos y hashes anteriores.
- **Autenticación:** API con JWT; el token de desarrollo es exclusivamente para la demostración local, no para producción.
- **Secretos:** contraseñas, claves de almacenamiento, clave JWT y semilla de Stellar deben gestionarse fuera del control de versiones.

## API principal del MVP

La API REST ofrece documentación interactiva en `/swagger`. Las rutas funcionales contempladas para la demostración incluyen:

| Acción | Método y ruta |
| --- | --- |
| Indicadores | `GET /api/v1/dashboard` |
| Crear y listar contratos | `POST /api/v1/contracts` · `GET /api/v1/contracts` |
| Detalle e historial | `GET /api/v1/contracts/{id}` |
| Cargar documento o corrección | `POST /api/v1/contracts/{id}/versions` |
| Confirmar revisión | `POST /api/v1/contracts/{id}/versions/{versionId}/review` |
| Registrar firma y encolar anclaje | `POST /api/v1/contracts/{id}/versions/{versionId}/sign` |
| Comparar versiones | `GET /api/v1/contracts/{id}/documents/compare` |
| Verificar archivo y blockchain | `GET /api/v1/contracts/{id}/versions/{versionId}/verify` |
| Obtener descarga autorizada | `GET /api/v1/documents/{versionId}/download` |
| Consultar firmantes | `GET /api/v1/contracts/{id}/signatures` |
| Consultar auditoría | `GET /api/v1/contracts/{id}/audit` |
| Salud del servicio | `GET /api/v1/health` |

Los endpoints y el comportamiento final deben confirmarse contra la versión desplegada y la especificación OpenAPI correspondiente.

## Ejecución de la versión del MVP

La integración para la hackatón se desarrolla en la rama **`feat/stellar-hackathon-mvp`**. Mientras no se incorpore a `main`, la implementación de `main` puede corresponder al prototipo técnico anterior. Para reproducir el stack descrito aquí, usar la rama de Stellar:

```bash
git clone https://github.com/DyxerSoft/dyxersignature.git
cd dyxersignature
git checkout feat/stellar-hackathon-mvp

cp .env.example .env
# Sustituir los valores de demostración de .env por credenciales locales seguras.
# Añadir claves Stellar Testnet para confirmar anclajes reales.

docker compose up --build
```

Una vez iniciados los servicios en el entorno local:

- **Aplicación web:** http://localhost:3000
- **API y Swagger:** http://localhost:8080/swagger
- **Health check:** http://localhost:8080/api/v1/health

En el perfil `Development` existe un endpoint de token para demostración. **No debe habilitarse en un despliegue público.** Sin cuenta Stellar Testnet configurada, los anclajes no pueden confirmarse en la red aunque las solicitudes de negocio se registren y puedan quedar pendientes de reintento.

## Objetivo de escalabilidad

El MVP está orientado a **una prueba de 100 usuarios virtuales concurrentes** y a evaluar una meta de **7–10 flujos de contratos por segundo** en la API. Es un **objetivo de prueba, no una capacidad garantizada de producción**.

La medición de throughput del flujo de negocio incluye creación, carga, revisión y aceptación con encolado durable; **no equivale a 7–10 confirmaciones blockchain por segundo**. La capacidad real depende del entorno desplegado, de los recursos y de la red Stellar. El procesamiento desacoplado evita mantener la petición de usuario abierta hasta la confirmación en blockchain.

## Alcance y próximos pasos

**En el MVP:** operaciones básicas de contratos y documentos, historial/versionado, firma declarativa, auditoría, almacenamiento privado, hashes y verificación con Stellar Testnet.

**Integraciones previstas para etapas posteriores:** validación de identidad robusta, OTP, aceptación con evidencia ampliada (IP/dispositivo/fecha), integración de firma digital certificada para representantes autorizados, políticas de retención y despliegue con controles de seguridad productivos.

**Importante:** registrar una aceptación en la aplicación y anclar un hash en Stellar **no convierte por sí solo un documento en una firma digital certificada ni garantiza su validez jurídica**. Las integraciones de firma certificada y los requisitos legales aplicables se evalúan de forma independiente.

## Recursos técnicos

- [Guía de demostración del MVP](https://github.com/DyxerSoft/dyxersignature/blob/feat/stellar-hackathon-mvp/docs/implementation/demo-guide.md) *(rama Stellar)*
- [Plan por fases](https://github.com/DyxerSoft/dyxersignature/blob/feat/stellar-hackathon-mvp/docs/implementation/phase-plan.md) *(rama Stellar)*
- [Prueba de carga](https://github.com/DyxerSoft/dyxersignature/blob/feat/stellar-hackathon-mvp/docs/implementation/load-test.md) *(rama Stellar)*
- [Integración Stellar y verificación](https://github.com/DyxerSoft/dyxersignature/blob/feat/stellar-hackathon-mvp/backend/blockchain/README.md) *(rama Stellar)*
- [Repositorio DyxerSignature](https://github.com/DyxerSoft/dyxersignature)

---

**DyxerSignature — Documentos confiables, versiones trazables y evidencia verificable.**
