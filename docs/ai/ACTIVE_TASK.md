## Sin tarea pendiente

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real de prueba desde el booking público, capturar el header `x-signature` del log de core-api, verificar que el secreto en `.env` coincida y cambiar la variable a `true`. Sin esto el webhook de MercadoPago no valida firmas y no se puede lanzar en producción real.

2. **Exportar lista de pacientes a CSV** — datos disponibles en BD (nombre cifrado / HC / fecha apertura / teléfono); valor inmediato para Marcela sin dependencias externas.
