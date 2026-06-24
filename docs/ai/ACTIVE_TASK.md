## Sin tarea pendiente

Sesión 5 de 2026-06-24 cerrada limpiamente. Commit `666ba06` desplegado:
- Cumplimiento legal go-live Colombia: páginas `/legal/terminos` + `/legal/privacidad`, checkbox en signup, migración 000038 (`terms_accepted_at`, `terms_version`, `dpa_accepted_at`), endpoint `/auth/accept-dpa`, modal DPA bloqueante en AppShell, banner IA reforzado.
- Los documentos legales son borradores funcionales — requieren validación por abogado antes del go-live real.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real con el token de producción MP, capturar el header `x-signature` en los logs del VPS, corregir la verificación del secreto y activar enforcement. Archivo: `services/core-api/internal/billing/handler/` (webhook MP). Sin esto no hay cobro real garantizado.

2. **Validación legal (no-código)** — llevar los borradores de ToS y Política de Privacidad (ya publicados en `/legal/`) a un abogado colombiano de derecho digital para revisión y aval. Costo estimado COP $500k–$1.5M. Bloqueante "suave" para el primer cliente pagando real.

3. **WhatsApp System User token permanente (no-código)** — en cuanto Meta apruebe las 3 plantillas HSM, crear token permanente en Meta Business Suite y configurar en Ajustes → Notificaciones con Phone Number ID `1138431989358649`.
