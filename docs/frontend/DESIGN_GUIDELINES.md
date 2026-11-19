# Lineamientos frontend

## Objetivo UX

La interfaz debe transmitir **confianza documental, trazabilidad y claridad**, no una estética Web3. El usuario no necesita comprender wallets, gas, RPC o smart contracts.

## Arquitectura

```text
src/
├─ app/
├─ pages/
├─ features/
│  ├─ contracts/
│  ├─ signatures/
│  ├─ evidence/
│  └─ verification/
├─ components/
│  ├─ ui/
│  └─ layout/
├─ services/
│  └─ api/
├─ hooks/
├─ lib/
├─ types/
└─ styles/
```

### Reglas

- `pages/` compone pantallas; no contiene lógica de negocio reutilizable.
- `features/` encapsula cada flujo funcional.
- `components/ui/` contiene componentes agnósticos al dominio.
- `services/api/` es la única capa que conoce URLs HTTP.
- No llamar `fetch` directamente desde componentes.
- Estados del backend se representan mediante tipos/enums, nunca strings dispersos.

## Design system

Enfoque **light-first**, corporativo y sobrio.

### Tokens

- Colores mediante variables CSS semánticas: `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`, etc.
- La identidad cromática final de Grupo Paz debe aplicarse modificando tokens, no componentes.
- Espaciado basado en múltiplos de 4 px.
- Radius moderado; evitar estética excesivamente redondeada.
- Tipografía de sistema inicialmente; fuente corporativa solo cuando esté formalmente definida.

### Estados

Los estados documentales deben tener presentación consistente:

- ACTIVE: éxito.
- IN_SIGNATURE / PENDING: información/proceso.
- SUPERSEDED: neutral.
- FAILED: error.
- VOIDED/CANCELLED: advertencia/error según contexto.

Nunca comunicar el estado solo mediante color: siempre texto + icono/indicador accesible.

## Pantallas MVP

1. Dashboard.
2. Listado de contratos.
3. Detalle de contrato.
4. Historial de versiones.
5. Timeline de auditoría.
6. Detalle de evidencia blockchain.
7. Solicitud de corrección/nueva versión.
8. Portal de verificación documental.
9. Cola/estado operativo de anclajes para administradores.

## Detalle de contrato

La versión `ACTIVE` debe dominar visualmente. Las anteriores aparecen como historial inmutable con:

- número de versión;
- fecha;
- estado;
- motivo de sustitución;
- SHA-256;
- estado blockchain;
- TX hash;
- acción de verificación.

## Accesibilidad

- WCAG 2.2 AA como objetivo.
- Navegación por teclado.
- Focus visible.
- Contraste mínimo conforme AA.
- Labels explícitos.
- Confirmaciones para acciones irreversibles.
- Mensajes de error accionables.

## Seguridad UX

- OTP nunca se persiste en localStorage.
- Tokens de sesión preferentemente mediante cookie segura/httpOnly si la arquitectura de autenticación lo permite.
- No exponer private keys, RPC credentials ni secretos blockchain en variables Vite.
- Evitar mostrar PII innecesaria en listados.
