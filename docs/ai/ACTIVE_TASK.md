## Sin tarea pendiente

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Cerrar `MP_WEBHOOK_ENFORCE=true`** (bloqueante 🔴 — bloquea el go-live 1.0.0) — El secreto del webhook está configurado en VPS pero `enforce=false` por seguridad mientras se verifica. Hacer un pago real con tarjeta en producción, capturar `docker logs sghcp_core_api 2>&1 | grep "signature check failed"`, comparar los campos `manifest`/`expected`/`got` para identificar el mismatch, corregir el secreto y activar `MP_WEBHOOK_ENFORCE=true`. Sin esto los webhooks corren sin verificación de firma.

2. **Botón "Cambiar correo del admin" en Configuración** (bloqueante 🟡 UI) — La pantalla de Configuración no tiene esta opción. Necesita `PATCH /me/email` con re-verificación + formulario en frontend.
