## Sin tarea pendiente

Sesión 6 de 2026-06-24 cerrada limpiamente. Commit `ccae867` desplegado (35 archivos, migraciones 000039+000040 aplicadas en VPS):
- Gobernanza: cuenta desactivada → 403 con mensaje claro; eliminación con confirmación por correo; reactivación de usuarios; CLINIC_ADMIN solo-lectura clínica; break-the-glass con audit trail; CMS legal editable desde el sistema.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real con el token de producción MP, capturar el header `x-signature` en los logs del VPS, corregir la verificación del secreto y activar enforcement. Archivo: `services/core-api/internal/billing/handler/` (webhook MP). Sin esto no hay cobro real garantizado.

2. **Visor de accesos break-the-glass** (C.3 diferido) — el registro en `audit_log` ya funciona desde sesión 6. Falta: `GET /audit/clinical-access` (filtrado por `metadata.reason IS NOT NULL`) + tarjeta en Settings → Auditoría. Tiempo estimado: 2–3 horas. Alto valor de cumplimiento (Res. 1995/1999).

3. **WhatsApp System User token permanente (no-código)** — una vez Meta apruebe las 3 plantillas HSM, crear token permanente en Meta Business Suite y configurar en Ajustes → Notificaciones (Phone ID `1138431989358649`).
