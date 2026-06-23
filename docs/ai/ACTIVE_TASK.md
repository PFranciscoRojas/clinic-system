## Sin tarea pendiente

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Cerrar `MP_WEBHOOK_ENFORCE=true`** (bloqueante 🔴) — Hacer un pago real con tarjeta en `marcelachapues.com`, capturar el log de diagnóstico de firma (`docker logs sghcp_core_api 2>&1 | grep "signature check failed"`), comparar `manifest`/`expected`/`got` para identificar si el secreto en `.env` está mal, y volver a `enforce=true`. Sin esto, el webhook corre sin verificación de firma en producción.

2. **Ola 3 — IA clínica** — Continuar con el recap pre-sesión (Whisper + Sonnet): el módulo está iniciado pero la integración con el flujo de sesión está incompleta. Es el siguiente diferenciador de producto.

3. **Nº de HC en PDF de la historia clínica** — `patient_code` ya existe en BD y en la franja de identificación; falta incluirlo en el PDF exportado del Formato 1 (BACKLOG → Booking público).
