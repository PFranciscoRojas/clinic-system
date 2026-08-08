## Sin tarea pendiente

Sesión del 2026-08-07 cerrada limpia: PRs #256, #257 y #258 mergeados y desplegados,
`schema_migrations` = 74 (dirty=f), `make verify` en verde antes de cada merge, y la guía
enlazada desde el cuerpo del home y de `/precios` en el repo `../chapni` (`fa4e665`, en vivo).

Lo que quedó montado: el embudo de activación en `/admin?tab=activacion`, que ya avisa cuando
la cohorte es demasiado chica para leer porcentajes y distingue un cobro real de una activación
manual desde la consola. De paso se arregló un bug que llevaba desde la migración 000018: la
consola de operador mostraba "0 pacientes" en todos los tenants y la cola de IA siempre vacía,
porque los endpoints de admin consultan sin `app.current_org` y FORCE RLS devuelve cero filas.

## Sugerencia de siguiente paso

El producto no es el cuello y ahora hay con qué probarlo: la cohorte del embudo es **una sola
organización**, y el único signup externo que hubo canceló sin registrar un paciente. Todo lo
que sigue apunta a que entre gente, no a construir más.

1. **Los tres directorios (Francisco, ~1 h).** AlternativeTo, Capterra (publica también en
   GetApp y Software Advice) y SaaSHub. El texto está escrito y listo para pegar en
   `../chapni/docs/marketing/directorios-checklist.md`; no hay que redactar nada. Es la única
   palanca que no depende de que un tercero quiera hacer un favor, y sin backlinks el dominio
   no aparece ni buscando `"Chapni"`. Guía TIC quedó descartada: es pauta pagada, no directorio.
2. **Verificar el cobro de Marcela en MercadoPago (Francisco, 10 min).** El embudo la reporta
   como `checkout` y no `charged`: está suscrita pero no hay ningún cobro registrado en
   `last_billing_payment_id`. O el recurrente no ha entrado, o el webhook nunca llegó. Está en
   la tabla de bloqueantes de `STATUS.md`.
3. **Las tres frases de Marcela (Francisco, una conversación).** Es el hueco más grande del
   sitio y lo señalaron los dos LLM que lo evaluaron: cero prueba social en un producto que
   guarda historias clínicas. La sección se monta en cuanto existan.
4. **Las cinco entrevistas B2B**, paradas desde el 2026-07-07 (guion de 11 preguntas en
   `PLAN_B2B_COMERCIAL.md` §4). Bloquean el precio por tramos, la decisión sobre RIPS y publicar
   la tabla B2B en la landing.

Del lado del agente, cuando se pida: la guía de RIPS en `/recursos` (ataca de frente lo que la
competencia usa como diferenciador), la sección de testimonios en cuanto existan las frases, y
las semanas de redes del 3 y el 10 de agosto, que están sin generar (`chapni-social`).
