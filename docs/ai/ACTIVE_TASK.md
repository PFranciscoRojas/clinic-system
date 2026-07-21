## Sin tarea pendiente

Sesión 2026-07-21 cerrada limpia — todo desplegado en producción y verificado:

- **Constructor visual de plantillas de registro clínico** (PR #206, backfilled hoy en STATUS/CHANGELOG): galería de 4 ejemplos, editor de campos con tarjetas (sin sintaxis `{}`), toggle a modo Markdown avanzado, reordenar con flechas, guardado fail-closed (round-trip contra `POST /record-templates/parse` antes de persistir). Markdown sigue siendo la fuente de verdad en `source_markdown`.
- **Retiro total de widgets bespoke** (PR #208, migración `000067_retire_template_widgets`): `risk` es ahora control fijo del sistema (sugerido por IA, ya no widget de plantilla); `diagnoses`/`treatment_plan` viven en los paneles de perfil del paciente. Marcado el ítem de BACKLOG "Widgets personalizados" como obsoleto.
- **Fix de layout reportado por el usuario tras probar en producción** (PR #209): la sección "Formatos de registro" en Settings estaba topada a 780px (el ancho de los formularios simples), así que el builder + la vista previa no cabían lado a lado — ahora usa 1400px. El botón "ver" de cada plantilla abría la vista previa como acordeón debajo de la fila — ahora abre al lado, con más espacio.
- **Pendiente sin confirmar** (BACKLOG → Infraestructura/DevOps): el usuario reportó inicialmente que solo veía "Empezar desde cero" sin la galería; se verificó que el bundle desplegado sí tiene el código correcto — explicación más probable es caché del service worker (PWA `autoUpdate`). Falta que el usuario confirme si un hard-refresh lo resolvió.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Confirmar con el usuario si la galería de ejemplos ya se ve bien** tras el fix de layout y un hard-refresh — si el problema de "solo empezar desde cero" persiste, es un bug real (no caché) y hay que reproducirlo a fondo.
2. **Lanzar la beta con 2-3 psicólogas externas** (bloqueante 🔴 más antiguo del 1.0.0) — sigue siendo la acción de mayor apalancamiento y es del founder, no de código; el producto está más listo que nunca (builder visual, widgets saneados, feedback loop de drafts midiendo desde #202).
3. **Rastrear el `record_type` mal etiquetado en el job de draft** (hallazgo #205, sección "IA — Robustez" del BACKLOG) — el draft de 1h llegó como INITIAL sobre una plantilla EVOLUTION; barato de rastrear.
4. **Verificar desbloqueo de WhatsApp Meta** (🟡) y configurar `tpl_reminder_24h`/`tpl_reminder_2h` — 15 minutos de ops si Meta ya liberó tras el pago.
