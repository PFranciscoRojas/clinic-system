## Sin tarea pendiente

Fases 1 y 2 de la auditoría 360° cerradas, mergeadas y desplegadas (PR #107, #108). El plan vive en `docs/ai/PLAN_AUDIT_FIXES.md` con las casillas de Fase 1-2 marcadas.

## Sugerencia de siguiente paso

Según el plan de auditoría, STATUS (bloqueantes) y BACKLOG, lo más valioso a atacar ahora:

1. **Fase 3 — Guardrails de IA** (`enhancement/ai-guardrails`). Alto valor, deploy aislado (solo ai-service + compose): `temperature=0.2` en las 4 llamadas, anonimización reforzada (regex de email + reemplazo literal de nombres del paciente que el worker ya descifra), guardrail anti prompt-injection en los 4 system prompts, validar el ICD-10 sugerido contra el catálogo, cap de historia para risk/plan, y reclaim de jobs huérfanos del worker (`XAUTOCLAIM` + dead-letter). Es la fase con mejor relación impacto/riesgo antes de la beta.

2. **Adelantar Fase 5.1 — test de aislamiento RLS** (testcontainers). Blinda justo el cambio de hashes de la Fase 1 y es el test más importante del sistema (org A no lee filas de org B). Buen momento porque el modelo de datos está fresco en contexto.

3. **Arreglar el secret `SMOKE_PASSWORD`** (rápido, en BACKLOG → DevOps): el gate de smoke está inútil hasta que el email del test exista en prod.

Recomendación: Fase 3 primero (cierra los riesgos de IA antes de exponer el producto a las psicólogas beta), con la Fase 5.1 pegada después para asegurar el trabajo de seguridad ya hecho.
