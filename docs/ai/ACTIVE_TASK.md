## Sin tarea pendiente

Sesión 2026-06-19: meta-trabajo de infraestructura de contexto — todo completado.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap):

1. **B-11 — Enforce firma webhook MercadoPago** (🔴 seguridad) — Quitar el fail-open: si `MP_WEBHOOK_SECRET` no está seteado → 401. Cambio pequeño en el handler MP, bloqueante crítico antes del go-live. Buscar en `core-api/internal/` el handler que valida `x-signature`.

2. **B6 — Política de reembolso/cancelación en el booking** — Marcela debe redactar el texto; cuando lo tenga, se añade como check de aceptación en `/book/:slug` (igual que el check de consentimiento existente). Bloqueado por contenido, no por código.

3. **RLS en ai_drafts + endpoints públicos** — Aplicar `tenant_isolation` a `ai_drafts` y verificar que booking/consents públicos no filtren cross-tenant.
