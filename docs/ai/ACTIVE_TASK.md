## Sin tarea pendiente

Sesión 2026-07-21/22 cerrada limpia — PRs #211, #213 y #215 mergeados y desplegados por CI, los 4
formatos clínicos reconstruidos y aplicados en producción, y el trabajo de landing/SEO del repo
`../chapni` desplegado y verificado.

Quedan dos pendientes que **no son código** y no bloquean nada:

- **Autorizar el MCP `cloudflare-api`** — `/mcp` en el prompt. El plugin `cloudflare@cloudflare` ya
  está instalado global (13 skills + 5 MCP); solo `cloudflare-docs` quedó conectado. Sin autorizar,
  cada cambio en Cloudflare vuelve a ser ida y vuelta manual por el panel, como pasó esta sesión con
  la regla de redirección. De paso queda por confirmar si *JavaScript Detections* está apagado: el
  script `/cdn-cgi/challenge-platform/…` seguía inyectado pero el HTML se sirve cacheado
  (`cf-cache-status: HIT`), así que hace falta purgar para verificarlo. Es cosmético — ese script es
  inline y el CSP del sitio (`script-src 'self'`) ya lo bloquea.
- **Revisión clínica de 2 decisiones del rebuild de formatos** (ver Bloqueantes en `STATUS.md`):
  consumo de SPA quedó como multiselect de sustancias con frecuencias plegadas en vez del "Sí/No" +
  casillas del papel; e ideación suicida / intento previo siguen como campos del formato aunque el
  sistema ya tiene su control fijo de riesgo. Ambas se ajustan desde el builder visual, sin tocar BD.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Testimonios de Marcela para la landing** — es el hueco más grande del sitio y lo señalaron los
   dos LLM que evaluaron chapni.com: cero prueba social en un producto que guarda historias clínicas,
   donde la confianza lo es todo. Marcela ya es usuaria real; con tres frases suyas (nombre, foto,
   ciudad) la sección se monta en una sesión corta. Barato y ataca conversión, que es el cuello real.
2. **Directorios: AlternativeTo, Capterra, GetApp** — el dominio sigue con casi cero backlinks y por
   eso solo el home está indexado; las 6 guías de `/recursos` siguen descubiertas pero sin indexar.
   Ninguno pide dirección ni código, y es la única palanca que destraba la indexación. No la puedo
   ejecutar yo.
3. **Las 5 entrevistas B2B** (Insight Psicología IPS, Clínica Retornar, IPS Psicoe, Trascender,
   Centro de Familia UPB) — paradas desde 2026-07-07; bloquean el precio por tramos, RIPS y publicar
   la tabla B2B en la landing.
4. **Beta con 2-3 psicólogas externas** (🔴, el bloqueante más antiguo del 1.0.0) — sigue siendo la
   acción de mayor apalancamiento y es del founder, no de código.

> El patrón de fondo de la sesión: lo técnico ya está resuelto. Lo que falta para vender no es
> producto, es que alguien más que Marcela use Chapni.
