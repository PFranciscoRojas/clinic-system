## Sin tarea pendiente

Sesión 2026-06-19 (bloque 2): SlotPicker + endpoint de disponibilidad + fixes reagendar — todo completado y desplegado en producción.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap):

1. **B-11 — Enforce firma webhook MercadoPago** (🔴 seguridad crítica pre go-live) — El handler de MP tiene fail-open: si `MP_WEBHOOK_SECRET` no está seteado, acepta cualquier webhook. Cambio pequeño en `core-api/internal/billing/handler/` (buscar el handler que valida `x-signature`). Bloqueante directo para `1.0.0`.

2. **B6 — Política de reembolso/cancelación en el booking** — Marcela debe redactar el texto; una vez listo, se añade como checkbox de aceptación en `/book/:slug` (igual al check de consentimiento existente). Actualmente bloqueado por contenido, no por código.

3. **`ALLOW_DATA_RESET=false` en VPS** — Cambiar variable de entorno antes del go-live real. Riesgo: con `true` cualquier admin puede borrar todos los datos del tenant.
