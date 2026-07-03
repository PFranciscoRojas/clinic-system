## Sin tarea pendiente

Sesión 2026-07-02: resolvimos los 7 puntos de `tareas_clinica.md` (feedback de uso del sistema IA clínica). Todos ✅ desplegados en producción (PRs #113–#116).

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Beta de diseño con 2-3 psicólogas externas (validación de demanda)** — Los 7 puntos cubrieron estabilidad y UX del sistema existente, pero no hay feedback externo sobre willingness-to-pay. Dos colegas de Marcela identificadas, 2 semanas gratis, acompañamiento 1ª sesión. Riesgo: seguir building sin demanda externa. Ganancia: separar hobby de negocio antes de escalar feature-building.

2. **Fase 3 de auditoría — Guardrails de IA** — High value, deploy aislado (ai-service): `temperature=0.2`, anonimización reforzada (regex + nombres), anti-injection en prompts, validar ICD-10, reclaim de jobs huérfanos. Cierra riesgos de IA antes de exponer a las beta testers.

3. **Arreglar el secret `SMOKE_PASSWORD` de CI** — 5 min, high-value (smoke test hoy falla `login` con `USER-NOT-FOUND`). Crear cuenta de smoke dedicada en prod.

**Orden recomendado:** Beta de diseño (validar demanda) + Fase 3 en paralelo (blindar riesgos antes de exponer el producto) → Go-live 1.0.0.
