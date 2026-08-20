## Sin tarea pendiente

Sesión del 2026-08-18/20 cerrada limpia. PRs #292–#298 mergeados y desplegados, `make verify`
en verde antes de cada merge, cinco contenedores arriba con `core-api` y `ai-service` ahora
reportando `(healthy)`, y el monitor saliendo limpio por cron cada cinco minutos.

Lo que quedó montado: la vigilancia firmada (`scripts/monitor.sh`), que se registra como un
canario `PROFESSIONAL` de solo lectura y camina login → `/auth/me` → lista de pacientes cada
cinco minutos. La lección que la motivó está fechada: durante todo el encierro del 18 de agosto
`/healthz` respondió 200, porque el proceso estaba vivo y lo cerrado era la puerta.

De paso se cerró la cadena de cobro con dinero real (`fbf1fb3d` en `active`, hasta el
2026-09-18) y se arregló el bug que el propio despliegue de la vigilancia destapó: `monitor.sh`
se commiteó `100644` y cron estuvo recibiendo `permission denied`. Lo pinea `check_exec_bits.sh`
dentro de `make verify`.

Repo limpio: siete worktrees eliminados y `main` libre otra vez.

## Sugerencia de siguiente paso

El producto dejó de ser el cuello. Ya cobra, ya se vigila solo y ya avisa cuando se rompe.
Todo lo que sigue apunta a que entre gente, y casi nada de eso lo puede hacer un agente.

1. **Los tres directorios (Francisco, ~1 h).** AlternativeTo, Capterra (publica también en
   GetApp y Software Advice) y SaaSHub. El texto está escrito y listo para pegar en
   `../chapni/docs/marketing/directorios-checklist.md`. Es la única palanca que no depende de
   que un tercero quiera hacer un favor.
2. **Las tres frases de Marcela (Francisco, una conversación).** Cero prueba social en un
   producto que guarda historias clínicas. Las tres preguntas están escritas en
   `docs/ai/PLAN_VENTA_DIRECTA.md` §4.0.1; la sección se monta en cuanto existan.
3. **Dos o tres psicólogas externas en beta de diseño.** Es el bloqueante 🔴 real del go-live
   1.0.0 y lleva semanas sin iniciar. Hay 2 contactos disponibles.
4. **Las cinco entrevistas B2B**, paradas desde el 2026-07-07 (guion de 11 preguntas en
   `PLAN_B2B_COMERCIAL.md` §4). Bloquean el precio por tramos, la decisión sobre RIPS y publicar
   la tabla B2B en la landing.

Del lado del agente, cuando se pida: el batch de redes de la semana del 24 (toca el domingo; ahí
estrena la guía de RIPS en el slot educativo del lunes y Ley 1090 sigue en cola detrás), recortar
los streams de Redis antes de que haya carga (ver BACKLOG), y la sección de testimonios en cuanto
existan las frases.
