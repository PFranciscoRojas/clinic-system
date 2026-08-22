## Sin tarea pendiente

Sesión del 2026-08-21: se cerraron los cuatro pendientes de infraestructura que
quedaban, todos de la misma familia — instrumentos que decían algo distinto de lo
que pasaba.

- **El dead man's switch está encendido.** `monitor.sh` late contra
  healthchecks.io al cerrar cada ciclo, y a `/fail` con las líneas rojas en el
  cuerpo cuando algo no salió `ok`. Era el único agujero que la vigilancia no
  podía tapar por construcción: solo avisa mientras el VPS esté vivo, así que una
  caída del servidor, un cron roto o una llave de Resend rechazada producían el
  mismo silencio. Ahora el temporizador vive afuera. La URL del ping es un
  secreto —quien la tenga puede callar la alarma— y vive en
  `/etc/sghcp/monitor.env` modo 600.
- **Los streams de Redis tienen techo.** `XACK` no borra, así que crecían para
  siempre. Eran cuatro productores, no los tres anotados.
- **El aviso de "data will be lost" desapareció**, y de paso resultó ser falso:
  esos volúmenes son bind al directorio del host, y borrarlos deja el directorio
  intacto. Lo que se estaba perdiendo no eran datos, era la costumbre de leer los
  avisos.
- **`govulncheck` vuelve a significar una sola cosa**: la red se separó del
  análisis.

Decisión del usuario: **los directorios de software quedan descartados**. Los
revisó uno por uno y no valen nada. Con eso se cae la palanca que el plan SEO daba
por hecha para los primeros backlinks.

## Sugerencia de siguiente paso

La infraestructura ya no tiene nada abierto que bloquee. Lo que queda apunta a que
entre gente, y casi nada de eso lo puede hacer un agente:

1. **Dos o tres psicólogas externas en beta de diseño.** Es el bloqueante 🔴 real
   del go-live 1.0.0. Hay 2 contactos disponibles y el mensaje de reclutamiento
   está escrito en `BACKLOG.md` → Validación / Go-to-market. Ya hay dónde
   soltarlas sin miedo: vuelta atrás en 1,6 s, copia antes de cada migración y un
   vigilante que ahora también avisa cuando es él quien se calla.
2. **Las tres frases de Marcela (una conversación).** Suben de prioridad
   justamente porque los directorios se cayeron: sin backlinks de relleno, la
   autoridad tiene que venir de contenido y de prueba social real. Cero
   testimonios en un producto que guarda historias clínicas. Preguntas en
   `docs/ai/PLAN_VENTA_DIRECTA.md` §4.0.1.
3. **Las cinco entrevistas B2B**, paradas desde el 2026-07-07 (guion en
   `PLAN_B2B_COMERCIAL.md` §4). Bloquean el precio por tramos, la decisión sobre
   RIPS y publicar la tabla en la landing.
4. **Revisión jurídica de ToS y privacidad** antes del primer cliente pagando.

Del lado del agente, cuando se pida: el stack efímero completo en CI (fase 1.b,
anotada en BACKLOG y explícitamente no bloqueante), la sección de testimonios en
cuanto existan las frases, y el batch de redes de la semana.
