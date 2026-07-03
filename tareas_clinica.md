# Tareas Clínica — Feedback de uso (sesiones con IA)

> Registrado: 2026-07-02. Mantener actualizado: marcar ✅ al resolver cada ítem e indicar PR/commit.

## 🐛 Bugs Críticos

- [x] ✅ **1. Borrador IA re-aprobable → registros clínicos duplicados.** Causa raíz: `Repository.Resolve` (marca el borrador como `APPROVED`) corría sobre el pool crudo de Postgres sin el GUC `app.current_org`; la política RLS de `ai_drafts` hacía que el UPDATE afectara 0 filas, el handler lo degradaba a un warning y el borrador quedaba `DRAFT_READY` para siempre → re-aprobable *n* veces. Fix: `Resolve` ahora usa la conexión con scope de tenant (`dbctx.From`); además la UI deshabilita "Aprobar" tras crear el registro. Tests de integración de regresión añadidos (`ai_drafts_test.go`).
- [x] ✅ **5. Discrepancia de fecha en registros clínicos.** Dos causas: (a) el frontend parseaba fechas `DATE` ("2026-07-02") con `new Date(...)` → medianoche UTC → en Bogotá (UTC-5) renderizaba el día anterior; fix con helper `lib/dates.ts` (`fmtDateOnly`, ancla a mediodía local) aplicado a `session_date`, `diagnosed_at`, `resolved_at` y `birth_date`. (b) Al aprobar sin `session_date` el backend usaba `time.Now()` del servidor (UTC) y `diagnosed_at` caía en `DEFAULT CURRENT_DATE` (UTC) — después de las 7pm Bogotá quedaba el día siguiente; ahora el frontend siempre envía la fecha local (`todayLocalISO`).

## 🎨 UI/UX

- [x] ✅ **3. Sin forma de volver a una sesión con borrador IA en proceso.** Resuelto en tres capas (PR #116): chip global en el topbar (`AIDraftIndicator`) que aparece cuando hay borradores generándose (ámbar, polling en vivo) o con error reciente sin registro (rojo) y navega directo al borrador; filas de borradores en la página Clínica clicables en todos los estados activos (Revisar / Ver estado / Ver error); y botón "Ir a la cita" en la página del borrador (usa el `appointment_id` persistido en PR #114).
- [x] ✅ **4. Recap pre-sesión no colapsable.** Acordeón con botón Ver/Ocultar (cabecera clicable); el estado se recuerda por paciente durante la sesión del navegador (PR #116).

## 🤖 Lógica de IA

- [x] ✅ **2. Resumen del borrador no se adapta al formato clínico configurado.** Eran 3 bugs combinados: `template_id` no se persistía en `ai_drafts` ni lo devolvía el GET (la página de revisión siempre caía al formato integrado quemado); los schemas del formato integrado estaban triplicados y desincronizados (Python generaba 4 secciones, el frontend renderizaba 2, Go validaba un superset); y el `template_id` se perdía al subir el audio si el formulario no estaba abierto. Fix (PR #114): migración 000050 persiste `template_id`, el GET lo devuelve, el approve cae al template del draft y decodifica secciones tipadas, core-api envía el schema del formato integrado en el job (fuente única, con test que lo fija a la whitelist), la UI muestra secciones extra de drafts legacy y el upload cae al template del setup.
- [x] ✅ **6. Perfil profesional: campo "enfoque terapéutico".** Implementado en `ai_prefs.approach` (catálogo cerrado: TCC, humanista, psicodinámico, sistémico, Gestalt, ACT, DBT, integrador) con validación fail-closed en el PUT y selector en Settings → sección IA (PR #115). Sin migración.
- [x] ✅ **7. Salidas de IA orientadas al enfoque terapéutico.** El enfoque viaja en los jobs de Redis y parametriza los prompts (PR #115): el plan terapéutico dejó de estar quemado a TCC (bloque de instrucciones por enfoque; vacío/desconocido → TCC, sin regresión); recaps y borradores reciben una pista de terminología; la detección de riesgo queda deliberadamente agnóstica. Tests de contrato en Python garantizan que el shape JSON que consume el frontend no varía con ningún enfoque.

---

## Historial de resolución

| Fecha | Ítem | PR/Commit | Notas |
|---|---|---|---|
| 2026-07-02 | 1 | fix(clinical): AI draft approve idempotent | RLS bloqueaba el UPDATE de `Resolve` (pool sin GUC de tenant); + guardas en UI y tests de integración |
| 2026-07-02 | 5 | fix(clinical): AI draft approve idempotent | Render de fechas `DATE` con `fmtDateOnly` + envío de fecha local en aprobación y diagnósticos |
| 2026-07-02 | 2 | PR #114 | `template_id` persistido y devuelto; fuente única del schema integrado (job `sections_schema` + test contra whitelist); fallbacks en approve y upload |
| 2026-07-02 | 6 | PR #115 | `ai_prefs.approach` con catálogo cerrado + validación fail-closed + selector en Settings |
| 2026-07-02 | 7 | PR #115 | Prompts parametrizados por enfoque (plan ya no quemado a TCC); riesgo agnóstico; tests de contrato Python 7/7 |
| 2026-07-02 | 3 | PR #116 | Chip topbar de borradores en proceso/error + filas clicables en Clínica + "Ir a la cita" en el borrador |
| 2026-07-02 | 4 | PR #116 | Recap colapsable (Ver/Ocultar), estado recordado por paciente en la sesión del navegador |
