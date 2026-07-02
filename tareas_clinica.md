# Tareas Clínica — Feedback de uso (sesiones con IA)

> Registrado: 2026-07-02. Mantener actualizado: marcar ✅ al resolver cada ítem e indicar PR/commit.

## 🐛 Bugs Críticos

- [x] ✅ **1. Borrador IA re-aprobable → registros clínicos duplicados.** Causa raíz: `Repository.Resolve` (marca el borrador como `APPROVED`) corría sobre el pool crudo de Postgres sin el GUC `app.current_org`; la política RLS de `ai_drafts` hacía que el UPDATE afectara 0 filas, el handler lo degradaba a un warning y el borrador quedaba `DRAFT_READY` para siempre → re-aprobable *n* veces. Fix: `Resolve` ahora usa la conexión con scope de tenant (`dbctx.From`); además la UI deshabilita "Aprobar" tras crear el registro. Tests de integración de regresión añadidos (`ai_drafts_test.go`).
- [x] ✅ **5. Discrepancia de fecha en registros clínicos.** Dos causas: (a) el frontend parseaba fechas `DATE` ("2026-07-02") con `new Date(...)` → medianoche UTC → en Bogotá (UTC-5) renderizaba el día anterior; fix con helper `lib/dates.ts` (`fmtDateOnly`, ancla a mediodía local) aplicado a `session_date`, `diagnosed_at`, `resolved_at` y `birth_date`. (b) Al aprobar sin `session_date` el backend usaba `time.Now()` del servidor (UTC) y `diagnosed_at` caía en `DEFAULT CURRENT_DATE` (UTC) — después de las 7pm Bogotá quedaba el día siguiente; ahora el frontend siempre envía la fecha local (`todayLocalISO`).

## 🎨 UI/UX

- [ ] **3. Sin forma de volver a una sesión con borrador IA en proceso.** Si el usuario sale de la pestaña de la sesión (`/appointments/<id>`) mientras el borrador IA está demorado o sin terminar, no hay ruta/listado para regresar y ver el estado o un posible error. Falta un acceso (ej. lista de borradores pendientes/fallidos o indicador en la agenda).
- [ ] **4. Recap pre-sesión no colapsable.** El Recap pre-sesión permanece siempre visible. Debe funcionar como acordeón: botón ocultar/ver para colapsarlo una vez leído.

## 🤖 Lógica de IA

- [ ] **2. Resumen del borrador no se adapta al formato clínico configurado.** (Ligado al punto 1.) El resumen siempre muestra los mismos campos — estado actual, descripción clínica de la sesión, diagnóstico CIE-10 sugerido y nivel de riesgo — aunque el formato en uso tenga más secciones. **Diagnóstico hecho (2026-07-02):** 3 bugs combinados — `template_id` no se persiste en `ai_drafts` ni lo devuelve el GET (la página siempre cae al formato integrado quemado), los schemas del formato integrado están triplicados y desincronizados (Python 4 claves / frontend 2 / Go superset), y el `template_id` se pierde al subir el audio si el formulario no está abierto. Plan de fix en [docs/ai/PLAN_IA_puntos_2_6_7.md](docs/ai/PLAN_IA_puntos_2_6_7.md) (PRs A y B).
- [ ] **6. Perfil profesional: campo "enfoque terapéutico".** Añadir al perfil del psicólogo su enfoque (humanista, terapia cognitivo-conductual, sistémico, etc.). **Planificado:** extender `ai_prefs` JSONB (catálogo cerrado de enfoques) + selector en Settings/onboarding — ver [docs/ai/PLAN_IA_puntos_2_6_7.md](docs/ai/PLAN_IA_puntos_2_6_7.md).
- [ ] **7. Salidas de IA orientadas al enfoque terapéutico.** El plan terapéutico debe variar según el enfoque seleccionado (punto 6), y también respuestas, resúmenes, recaps, sugerencias y demás salidas de IA deben orientarse a ese enfoque. **Planificado:** hoy el prompt del plan está quemado a TCC; se parametrizará por enfoque (solo instrucciones, nunca el shape JSON del contrato con el frontend); riesgo queda deliberadamente agnóstico — ver [docs/ai/PLAN_IA_puntos_2_6_7.md](docs/ai/PLAN_IA_puntos_2_6_7.md).

---

## Historial de resolución

| Fecha | Ítem | PR/Commit | Notas |
|---|---|---|---|
| 2026-07-02 | 1 | fix(clinical): AI draft approve idempotent | RLS bloqueaba el UPDATE de `Resolve` (pool sin GUC de tenant); + guardas en UI y tests de integración |
| 2026-07-02 | 5 | fix(clinical): AI draft approve idempotent | Render de fechas `DATE` con `fmtDateOnly` + envío de fecha local en aprobación y diagnósticos |
