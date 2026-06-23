## Sin tarea pendiente

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real desde el booking público, capturar `x-signature` en `docker logs sghcp_core_api`, verificar mismatch con el secreto en `.env` y activar `true`. Sin esto los webhooks de MercadoPago no validan firmas.

2. **Filtro de búsqueda por nombre en la lista de pacientes** — actualmente solo busca por apellido o documento (hash exact-match). Un filtro libre por nombre mejoraría la UX sin cambio de esquema.
