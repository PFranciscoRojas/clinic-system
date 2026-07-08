## Sin tarea pendiente

Sesión 2026-07-07: remoción del correo personal `franciscorojas92@gmail.com` de todo el contenido legal/consentimientos (clinic-system + verificado en `../chapni`), reemplazado por `legal@chapni.com`/`privacidad@chapni.com`. BD de producción corregida directamente y código fuente alineado (PR #153, squash-merged). Desplegado completo: CI verde para core-api (lint+test+build+deploy+smoke), frontend reconstruido manualmente en VPS y verificado en el bundle servido — cero ocurrencias del correo personal. Decisión tomada y comunicada: mantener `hola@chapni.com` (no `info@chapni.com`). Skill `chapni-social` ampliada con reglas de puntuación/formato/humanización tras debate con el usuario.

Quedaron 3 items de limpieza opcional, no urgentes, registrados en BACKLOG.md → Legal/Cumplimiento: código muerto en `pages/Public/legal/` (`content.ts`, `LegalDoc.tsx`, `LEGAL_VERSION`), branding "SGHCP" obsoleto en el seed `000040` (no afecta prod), y correo personal en `docs/history/RFC-001-Sistema-Clinico.md` (log histórico de dev, no es contenido legal).

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Decidir el siguiente paso de la validación B2B**: ¿entrevistas directas con 3-5 IPS/clínicas ya identificadas (Insight Psicología IPS, Clínica Retornar, IPS Psicoe, Centro Psicológico Trascender) antes de fijar precio/plan, o saltar ya al plan completo con la señal de mercado actual?
2. **Validación de demanda con beta de diseño (2-3 psicólogas externas individuales)** — sigue sin iniciar y es el blocker más antiguo para el go-live 1.0.0; no depende de lo de B2B, se puede correr en paralelo.
3. **Fase 3 de auditoría — IA guardrails** (aislado, 1-2 sesiones): temperature=0.2, anonimización reforzada, anti-injection, validación ICD-10, jobs huérfanos del worker.
4. **WhatsApp Meta API** — confirmar que el cargo pagado desbloqueó la API y configurar `tpl_reminder_24h`/`tpl_reminder_2h` en Ajustes → Integraciones.
