## Sin tarea pendiente

Sesión 2026-07-15 cerrada limpia (PRs #199–#200, mergeados, desplegados por CI y verificados con smoke test):

- **Disparador**: el usuario subió el audio de prueba de 1h y ningún campo de "Evaluación del cierre de sesión" se llenó en la Nota de Evolución real de Marcela.
- **Diagnóstico**: no era un bug de mapeo — el `ai_schema` de 6 widgets (`session_evaluation`, `task_adherence`, `functionality`, `formulation_5f`, `spa_history`, `functional_analysis`) estaba desincronizado del componente React real desde que se construyeron, así que la IA nunca los llenó bien en ningún formato.
- **Fix estructural (#199)**: nuevos tipos genéricos `multiselect` + modificadores `{pills}`/`{allow_other}` en el sistema de plantillas (Go parser, React render, prompt Python, PDF export) — el ai_schema se deriva de `options` automáticamente, sin construir un widget bespoke por cada checklist/radio-button nuevo. Los 4 formatos de Marcela (Apertura, Plan Terapéutico, Nota de Evolución, Informe de Cierre) reescritos con la sintaxis nueva vía Settings; `mental_exam`/`task_checklist`/`risk` se mantienen como widget por valor de UX/legal genuino.
- **Bug de fondo destapado y arreglado (#200)**: al editar los 4 templates en vivo, `recordtemplates.Update` mutaba la misma fila en sitio — rompía borradores en curso (422 en autosave/finalize) y habría dejado que un PDF de un registro ya **firmado** se re-renderizara con el schema de hoy en vez del vigente al aprobarse (violaba Res. 1995/1999). Ahora cada edición archiva la fila vieja y crea una versión nueva activa.
- **Ops**: borrador de prueba huérfano (roto por el bug de #200, sin filas dependientes) eliminado directo en BD del VPS.
- **2 ideas nuevas en BACKLOG** (sección "Plantillas de registro — Fase 2"): visibilidad condicional de campos (perdida al aplanar task_adherence/functionality/spa_history — evaluar `{show_if:...}` si la beta se queja), y verificar que `mental_exam`/`treatment_plan`/`diagnoses` no tengan el mismo bug de ai_schema desincronizado (no se revisaron hoy).

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Lanzar la beta con 2-3 psicólogas externas** (bloqueante 🔴 más antiguo del 1.0.0) — sigue siendo la acción de mayor apalancamiento: pipeline de audio validado, UX pulida, DR probado, y ahora el sistema de plantillas custom es genérico y sin el bug de versionado. Es acción del founder (mensaje de reclutamiento ya aprobado en BACKLOG → Validación), no de código.
2. **Verificar el ai_schema de `mental_exam`/`treatment_plan`/`diagnoses`** (idea nueva de hoy) — mismo patrón de bug que ya costó una sesión completa en `session_evaluation` y 5 widgets más; barato de confirmar ahora que el método de diagnóstico ya está probado (leer el componente React real y compararlo contra `field-widgets.json`/`claude.py`).
3. **Verificar desbloqueo de WhatsApp Meta** (🟡) y configurar `tpl_reminder_24h`/`tpl_reminder_2h` — 15 minutos de ops si Meta ya liberó tras el pago.
