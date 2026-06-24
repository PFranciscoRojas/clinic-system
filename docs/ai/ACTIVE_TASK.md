## Sin tarea pendiente

Sesión 4 de 2026-06-24 cerrada limpiamente. Commits `acd74d3`–`4642d7b` desplegados:
- Tablero sistema: CPU (proc/stat), backup status (marker file + volume mount), tenant actions (Suspender/Cancelar/Extender-trial), lista de usuarios por tenant con ✕ desactivar.
- Equipo: CLINIC_ADMIN y SYSTEM_ADMIN pueden eliminar usuarios (soft delete — is_active=false, user_roles eliminados, datos clínicos intactos).
- Decisión de producto: el super admin NO accede a datos clínicos de tenants (Ley 23/1981 secreto profesional + confianza).
- Fix: columna `organization_id` no `org_id` en JOIN de listOrgs.

## Pendiente operativo (no-código)

- Cobro Meta COP$90,675 estado Pending — preautorización de verificación, se reversa en 5–7 días.
- Cuando Meta apruebe las 3 plantillas WhatsApp: generar System User token permanente y configurar en Ajustes → Notificaciones.
- El backup marker (`/var/lib/sghcp/last_backup_ok`) se creará la próxima vez que corra el cron (2am). Hasta entonces el card de Backup mostrará "sin datos".

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — hacer un pago real con el token de producción, capturar `x-signature` en los logs del VPS, corregir la verificación del secreto. Archivo: `services/core-api/internal/billing/handler/` (webhook MP).

2. **WhatsApp System User token permanente** — en cuanto Meta apruebe las 3 plantillas HSM, crear token permanente en Meta Business Suite y actualizar `.env` del VPS. Coordinar con la aprobación (actualmente `🟡 en revisión`).
