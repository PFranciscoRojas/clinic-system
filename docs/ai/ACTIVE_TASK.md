## Sin tarea pendiente

Sesión 8 de 2026-06-26 cerrada limpiamente. Commit `31ef04e` en CI (desplegando):
- Acceso clínico need-to-know: patient_staff_rel enforced para PROFESSIONAL/INTERN.
- Adendas, "Iniciar/Finalizar sesión" y grabación ocultos para CLINIC_ADMIN puro.
- Bug fix grabación: recovery banner aparece sin F5 tras fallo de upload.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real con el token de producción MP, capturar el header `x-signature` en los logs del VPS, corregir la verificación del secreto y activar enforcement. Archivo: `services/core-api/internal/billing/handler/` (webhook MP). Sin esto no hay cobro real garantizado.

2. **Visor de accesos break-the-glass** (BACKLOG → Gobernanza clínica C.3) — el registro en `audit_log` ya funciona. Falta: `GET /audit/clinical-access` (filtrado por `metadata.reason IS NOT NULL`) + tarjeta en Settings → Auditoría. Alto valor de cumplimiento (Res. 1995/1999). Tiempo estimado: 2–3 horas.

3. **WhatsApp System User token permanente (no-código)** — una vez Meta apruebe las 3 plantillas HSM, crear token permanente en Meta Business Suite y configurar en Ajustes → Notificaciones (Phone ID `1138431989358649`).
