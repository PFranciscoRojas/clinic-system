## Sin tarea pendiente

Sesión del 2026-08-20 cerrada limpia. PRs #300–#314 mergeados, `make verify` en verde antes
de cada merge, y **cada pieza ejercitada en producción**, no solo escrita.

Lo que cambió de fondo: **el merge a `main` ya no despliega**. La imagen se construye y se
publica; el despliegue sale a las 22:00 de Bogotá, o a mano con un motivo escrito. Si algo
sale mal, la vuelta atrás son 1,6 segundos y un clic en `rollback.yml`, con la versión
anterior todavía encendida esperando. Antes eran ocho minutos de rebuild y ninguna red.

Los cuatro bugs de la sesión salieron de *ejercitar* la maquinaria, no de leer un código de
salida — y los cuatro habrían sido silenciosos: Caddy sirviendo el archivo viejo por el
inode del bind-mount mientras el host juraba haber cambiado de color; el deploy eligiendo un
commit **anterior** al que el build publicó; el archivo de estado vivo peleándose con
`git pull`; y un puerto de registro confundido con una etiqueta de imagen.

Repo limpio: siete worktrees y 65 ramas eliminados, queda `main` sola.

## Sugerencia de siguiente paso

Del plan de release solo quedan dos cosas y **ninguna bloquea**: el stack efímero completo en
CI (fase 1.b, anotada en BACKLOG) y los flags apagados por defecto, que son por feature y no
una tarea suelta. La infraestructura dejó de ser el cuello.

Lo que sigue apunta a que entre gente, y casi nada de eso lo puede hacer un agente:

1. **El dead man's switch, ahora sí (Francisco, 5 minutos + agente).** Lleva diferido "hasta
   tener usuarios reales" y ese momento es esta semana. El diseño está decidido y escrito en
   `BACKLOG.md` → Infraestructura; lo único que bloquea es crear la cuenta en healthchecks.io
   y pasarme la URL del ping. Sin esto, si el VPS se cae de madrugada el síntoma es silencio,
   que se lee igual que salud.
2. **Los tres directorios (Francisco, ~1 h).** AlternativeTo, Capterra (publica también en
   GetApp y Software Advice) y SaaSHub. El texto está escrito y listo para pegar en
   `../chapni/docs/marketing/directorios-checklist.md`.
3. **Las tres frases de Marcela (Francisco, una conversación).** Cero prueba social en un
   producto que guarda historias clínicas. Las preguntas están en
   `docs/ai/PLAN_VENTA_DIRECTA.md` §4.0.1; la sección se monta en cuanto existan.
4. **Dos o tres psicólogas externas en beta de diseño.** Es el bloqueante 🔴 real del go-live
   1.0.0. Hay 2 contactos disponibles, y ya hay dónde soltarlas sin miedo.
5. **Las cinco entrevistas B2B**, paradas desde el 2026-07-07 (guion en `PLAN_B2B_COMERCIAL.md`
   §4). Bloquean el precio por tramos, la decisión sobre RIPS y publicar la tabla en la landing.

Del lado del agente, cuando se pida: recortar los streams de Redis antes de que haya carga
(ver BACKLOG — hoy son 120 KB y por eso conviene hacerlo hoy), el batch de redes de la semana
del 24, y la sección de testimonios en cuanto existan las frases.
