## Sin tarea pendiente

Sesión del 2026-08-22, sin código. El usuario está haciendo el reto "Máquina de
Contenido con AI" (Lab10) y pidió aterrizar cada clase al proyecto. Salieron dos
entregables de marketing (`#318`), una poda de contexto (`#319`) y la skill
`chapni-social` ampliada con carruseles.

Lo que se aprendió, más útil que lo que se produjo:

- **El ICP individual es más estrecho de lo que se creía.** ENLAPSIC 2022 (Colpsic,
  n = 8.495): 18% del gremio sin ningún ingreso reportado, 27% hasta $1.5M/mes. A
  $180.000 de lista, el mercado del plan individual es el ~15% que gana más de $3.5M
  y ejerce independiente. El argumento de venta correcto es por sesión, no por mes.
- **El cifrado dejó de ser diferenciador**: PSICONAPSIS ya lo vende en Colombia con
  exportación RIPS. Whisper local sigue siéndolo.
- **23 posts publicados desde julio, cero métricas.** No se sabe qué produjeron.
- **Ningún caso de cliente**, lo que deja 6 de los 30 ángulos de contenido sin poder
  escribirse, y son justo los que más pesan en la decisión de compra.

## Sugerencia de siguiente paso

Todo lo abierto apunta a lo mismo y casi nada lo puede hacer un agente. En orden de
retorno:

1. **Instrumentar métricas de activación.** Es una tarde y desbloquea todo lo demás:
   sin saber qué produjeron los 23 posts no se puede decidir si el problema es el
   alcance, el gancho, la landing o la oferta. Está en `Bloqueantes` como 🔴 y va
   antes de subir volumen o agregar formatos.
2. **Las cinco entrevistas B2B**, paradas desde el 2026-07-07 (guion de 11 preguntas
   en `PLAN_B2B_COMERCIAL.md` §4). Bloquean el precio por tramos, la decisión sobre
   RIPS, y de paso llenan el giro "caso" del banco de ángulos.
3. **Dos o tres psicólogas externas en beta de diseño** — sigue siendo el bloqueante
   🔴 del go-live 1.0.0.
4. **Una conversación grabada con Marcela**, pidiendo permiso de uso. Es la única
   profesional con uso diario real y la única fuente posible de prueba social hoy.
5. **Revisión jurídica de ToS y privacidad** antes del primer cliente pagando.

Del lado del agente, cuando se pida: la plantilla de reel para `chapni-social`, los
13 tests de invariantes de `PLAN_TESTING_GAUNTLET.md` (RLS en tablas nuevas, dinero en
NUMERIC, PII en BYTEA, `ai_drafts` inmutables, anonimización antes del LLM), y el batch
de redes de la semana.

## Cabo suelto de infraestructura

La skill `chapni-social` **no está versionada en ningún repo**. El repo `claude-skills`
(`~/.claude/commands`) solo rastrea los `.md` de comandos sueltos, no las skills de
carpeta. Todo lo que se le agregó hoy — `templates/slide.html`,
`scripts/render_carousel.py`, `references/angulos.md` — vive únicamente en esta máquina.
