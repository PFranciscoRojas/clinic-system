## Sin tarea pendiente

Sesión cerrada limpia (2026-06-24). Todo desplegado:
- Fixes de agenda (citas no aparecían, profesional incorrecto, ENUM ai_draft).
- Preferencias de IA persistentes (estilo + tono) end-to-end + limpieza de la sección IA en Settings.
- Incidente de disco resuelto + Capa 1 (crons) y Capa 3 (ai-service en ghcr.io vía CI) implementadas.

## Pendiente operativo (no-código, fuera de sesión)
- GitHub Actions: ya hay 3 secrets configurados (`VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN`). El paquete ghcr.io puede dejarse público o seguir usando `GHCR_TOKEN` para pull.
- Warnings Node.js 20 en CI: cosméticos, desaparecen cuando GitHub/Docker publiquen `checkout@v5` / `build-push-action@v7`.

## Sugerencia de siguiente paso
Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora:

1. **Evaluaciones psicométricas con backend (BACKLOG → Code-debt, ALTO)** — la UI de PHQ-9/GAD-7 ya existe pero descarta los resultados con un `setTimeout`. Implementar tabla cifrada `patient_evaluations` + endpoints BC-5 + histórico en el perfil del paciente. Alto valor clínico y ya tiene la UI hecha.

2. **Quick-wins de la auditoría de mocks** — formato "Con viñetas" (trivial: instrucción en claude.py o quitar la opción), persistir el tiempo de bloqueo de pantalla (hoy hardcoded a 5 min en `AppShell.tsx`), eliminar `StubPage.tsx`. Bajo esfuerzo, quitan deuda visible.

3. **MP_WEBHOOK_ENFORCE=true** (🔴 bloqueante go-live) — pago real desde booking público, capturar `x-signature` en logs, verificar secreto en `.env`, activar enforce. Depende de token MP de producción.
