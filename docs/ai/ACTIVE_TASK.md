## Sin tarea pendiente

Sesión 2026-06-20: F1–F4 formatos clínicos completados + 2 crash fixes de localStorage desplegados en producción.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap):

1. **B-11 — Enforce firma webhook MercadoPago** (🔴 seguridad crítica pre go-live) — El handler de MP tiene fail-open: si `MP_WEBHOOK_SECRET` no está seteado acepta cualquier webhook. Cambio pequeño en `core-api/internal/billing/handler/`. Bloqueante directo para `1.0.0`.

2. **Probar los 4 formatos clínicos en producción** — Con la corrección de los arrays stale, verificar que F1 (Apertura), F2 (Plan Terapéutico), F3 (Evolución) y F4 (Cierre) funcionan end-to-end: crear registro → guardar → releer desde historial.

3. **B6 — Política de reembolso/cancelación en el booking** — Marcela debe redactar el texto; luego se añade como checkbox de aceptación en `/book/:slug`. Actualmente bloqueado por contenido, no por código.
