# Vigilancia de producción

> Qué se mira, cada cuánto, quién se entera y qué hacer con el aviso.
> El script es `scripts/monitor.sh`; lo que decide se prueba en `scripts/monitor_test.sh` y corre con `make verify`.

## Por qué existe

El 18 de agosto de 2026 MercadoPago cobró una suscripción a las 16:58 y la
psicóloga que la pagó se quedó fuera de su propio consultorio el resto del día,
detrás de un 402. Nadie se enteró hasta que ella lo dijo.

Ningún instrumento del servidor mintió. Los contenedores estaban arriba, el
disco vacío, `/healthz` respondía 200 en milisegundos. Lo que estaba roto era lo
único que nadie medía: si se podía entrar.

De ahí sale el diseño. Esto no pregunta si el proceso vive. Se registra con un
usuario de verdad y hace las tres peticiones que hace la aplicación al entrar.

## Qué se mira

| Chequeo | Qué pregunta | Cómo falla |
|---|---|---|
| `entry` | Se registra como profesional y pide `/auth/me` y la lista de pacientes | `unreachable`, `api-down`, `login-broken`, `session-broken`, `locked-out`, `workspace-broken` |
| `containers` | Los cinco contenedores están arriba y los que tienen healthcheck responden | `down:<nombres>`, `unhealthy:<nombres>` |
| `queue` | Las tres colas de IA: trabajo tomado y nunca terminado, o trabajo que nadie recoge | `<cola>-stuck`, `<cola>-stalled`, `<cola>-unknown` |
| `disk` | La raíz por debajo del 80% | `full` |

`locked-out` tiene nombre propio a propósito. El canario vive en la organización
demo interna, cuya suscripción corre hasta 2099: un 402 ahí nunca significa "no
pagó", significa que la puerta está rechazando a alguien que sí.

`stalled` es el modo de falla que se ve sano desde afuera: llega trabajo, el
worker no lo recoge, y el `last-delivered-id` de la cola sigue donde estaba hace
cinco minutos. Todos los contenedores en verde y el audio dejando de convertirse
en notas clínicas.

## Dónde corre

En el host, no dentro de la aplicación. Un chequeo que se muere con la cosa que
vigila no reporta nada justo en el único momento en que alguien lo necesitaba.

`/etc/cron.d/sghcp-monitor`, no el crontab de root:

```
*/5 * * * * root /root/clinic-system/scripts/monitor.sh >> /var/log/sghcp-monitor.log 2>&1
```

Un archivo aparte es aditivo y no puede pisar el respaldo diario ni el prune
semanal que ya viven en el crontab. El log rota semanal
(`/etc/logrotate.d/sghcp-monitor`, 8 semanas, comprimido).

Cron ejecuta el script por ruta, así que el bit de ejecución importa tanto como
el contenido. El repo tiene `core.fileMode = false`, de modo que git no mira el
modo del disco: un script creado con `chmod +x` local se commitea 100644 y nadie
se entera. Pasó el 2026-08-19 — al reemplazar la copia manual por la rastreada,
cron empezó a recibir "permission denied" cada cinco minutos y el log, que era
donde se habría quejado, fue el mismo log que se quedó callado. Lo pinea
`scripts/check_exec_bits.sh`, dentro de `make verify`.

Configuración en `/etc/sghcp/monitor.env`, modo 600:

```
MONITOR_EMAIL=monitor@demo.clinica.co
MONITOR_PASSWORD=…
ALERT_EMAIL=…
HEARTBEAT_URL=https://hc-ping.com/…
```

`HEARTBEAT_URL` es un secreto y no por lo que se pueda leer con ella, sino por lo
que se puede hacer: quien la tenga puede mandar latidos y **callar la alarma**.
Por eso vive aquí, en el archivo modo 600, y no en el repositorio ni en el `.env`
de los contenedores.

Aparte de `/root/clinic-system/.env` a propósito: ese archivo es el `env_file`
de los contenedores, y la credencial del vigilante no tiene por qué vivir dentro
de la aplicación que vigila. `RESEND_API_KEY` y `RESEND_FROM` sí se leen de ahí,
para que la llave tenga una sola casa en este host.

El canario es un `PROFESSIONAL` de la organización demo interna
(`a0000000-…-0001`). Solo lee. Se registra y mira; nunca escribe en un
consultorio real.

## Cuándo llega un correo

- La primera vez que un chequeo falla.
- Cada hora mientras siga fallando.
- Una vez cuando se recupera.
- Y siempre que aparezca una falla **distinta**, aunque haya otra abierta: la
  ventana de silencio es del problema viejo, y tragarse "la base de datos no
  está" porque el disco ya estaba lleno no es un intercambio que nadie haría a
  propósito.

El estado vive en `/var/lib/sghcp/monitor/<chequeo>.state`. Borrar ese
directorio hace que el siguiente ciclo vuelva a avisar de todo lo que siga roto.

Si Resend rechaza el envío, el aviso **no** se anota como enviado y el siguiente
ciclo lo reintenta. La primera versión tiraba la respuesta de la API: una llave
rotada o un dominio suspendido habrían dejado al monitor escribiendo "avisado"
en su archivo de estado cada cinco minutos sin que nadie se enterara de nada.

## Qué hacer con cada aviso

| Verdicto | Primera cosa que mirar |
|---|---|
| `unreachable` | DNS, Caddy, TLS. Desde afuera: `curl -sI https://app.chapni.com/healthz` |
| `api-down` | `docker logs sghcp_core_api --tail 100`. Suele ser la base de datos, no el API |
| `login-broken` | ¿Cambió la contraseña del canario? ¿Está `is_active`? ¿Redis vivo? |
| `locked-out` | La puerta de suscripción. Mirar `organizations.subscription_status` de la org demo — si está `active`, el fallo está en el gate, no en el cobro |
| `workspace-broken` | Postgres y RLS. `docker logs sghcp_core_api` buscando `app.current_org` |
| `*-stalled` | El worker de IA está arriba y no consume. `docker restart sghcp_ai_service` y mirar por qué |
| `*-stuck` | Un trabajo lleva más de 20 minutos sin cerrarse. `XPENDING` para ver cuál |
| `down:` / `unhealthy:` | `docker ps -a` y los logs del que falta |
| `full` | Audio sin barrer, logs, imágenes viejas. El prune semanal corre los domingos |

## Quién vigila al vigilante (desde 2026-08-21)

Todo lo de arriba solo puede avisar mientras este servidor esté vivo y con salida
a internet. El cron puede desaparecer, el host puede apagarse, Resend puede
rechazar la llave: los tres producen el mismo síntoma, que es silencio, y el
silencio se lee igual que la salud.

La única forma de cerrarlo es invertir quién pregunta. Al final de cada ciclo
`monitor.sh` **lata** contra healthchecks.io:

- Los cinco chequeos en `ok` → `GET $HEARTBEAT_URL`.
- Alguno en rojo → `POST $HEARTBEAT_URL/fail`, con las líneas rojas en el cuerpo
  (solo códigos HTTP, nombres de contenedor y porcentaje de disco — nada que
  cruce la frontera de cifrado).

Si la lata deja de llegar, el servicio de afuera alarma a los diez minutos: dos
ciclos perdidos, no uno, para que un hipo de red no despierte a nadie. El
temporizador vive fuera del sistema que vigila, que es todo el asunto.

Ese camino de fallo es además el **segundo canal de aviso, independiente de
Resend**. Antes, si Resend rechazaba el correo, `send_alert` devolvía 1 y la queja
se iba al log que nadie lee.

Tiene una propiedad útil: si algún día se pierde la URL en un despliegue o alguien
vacía el archivo de configuración, el servicio avisa por silencio. La
configuración olvidada se delata sola.

Se descartó un cron de GitHub Actions como receptor: su programación es de mejor
esfuerzo, se atrasa y se salta corridas, y un detector de silencio que a veces
calla solo produce falsas alarmas.

## La tasa de errores (desde 2026-08-20)

El chequeo `errores` cuenta las respuestas 5xx que los dos colores de `core-api`
registraron en los últimos cinco minutos, y avisa a partir de tres.

Tapa un hueco que la sonda de entrada no ve: se puede entrar perfectamente
mientras el guardado de una historia clínica devuelve 500 una vez de cada tres.
Ese fallo antes llegaba por WhatsApp de la usuaria, días después, si se animaba a
escribir.

El aviso nombra las rutas que fallan (`/api/v1/clinical-records(2)`), que es lo
que lo vuelve accionable: sin eso, "hay errores" obliga a empezar por el
principio.

Lee **los dos colores**, no solo el activo. Si el que no sirve está devolviendo
500 es que arrancó mal, y conviene saberlo antes de que un despliegue lo ponga
delante del tráfico.

Tres es el umbral porque a este volumen —una decena de profesionales— tres
errores de servidor en cinco minutos no son mala suerte. Uno suelto no despierta
a nadie, a propósito: un aviso por cada error aislado enseña a ignorar los avisos,
y entonces el canal deja de servir para el que importa. El recuento sale en el log
igualmente, así que nada se pierde de vista.

## Lo que esto todavía no cubre

**La lentitud.** Un sistema que responde 200 en catorce segundos pasa
todos estos chequeos y es inusable.
