## Sin tarea pendiente

Sesión 11 de 2026-06-27 cerrada limpiamente. Commits `506e25f`→`d5c7b58` desplegados. Migraciones 000043+000044 aplicadas en VPS. Token de Marcela restaurado a producción (`live`).

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Activar `MP_WEBHOOK_ENFORCE=true`** — el pago real ya funciona (cita creada ✅) pero la firma del webhook se verifica con el secret global en vez del de Marcela. Depurar por qué `orgWebhookSecret` retorna vacío (quizás el `?org=` en la URL de notificación no llega correctamente). Una vez corregido, cambiar en VPS `.env` y reiniciar core-api. Cierra el bloqueante de seguridad más importante para go-live.

2. **Pagar cargo Meta Billing (COP $90.675)** — desbloquea la API de WhatsApp Cloud. Las plantillas ya están en revisión con Meta; una vez pagado y aprobadas, los recordatorios 24h/2h y confirmación de cita quedan activos. No requiere código.
