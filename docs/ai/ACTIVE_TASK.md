## Sin tarea pendiente

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real desde el booking público en el VPS, capturar el header `x-signature` en `docker logs sghcp_core_api`, verificar que el secreto en `.env` coincide y activar `MP_WEBHOOK_ENFORCE=true`. Sin esto los webhooks de MercadoPago no validan firmas en producción.

2. **WhatsApp System User token permanente** — una vez Meta apruebe las 3 plantillas (`recordatorio_cita_24h`, `recordatorio_cita_2h`, `cita_confirmada`), generar un System User token permanente desde Meta Business Suite (no el token de 24h) y configurarlo en Ajustes → Notificaciones con Phone Number ID `1138431989358649`.
