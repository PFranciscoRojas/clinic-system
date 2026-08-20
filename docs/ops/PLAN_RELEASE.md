# Plan de release — de un tenant propio a usuarios externos

> Escrito el 2026-08-20, antes de entregar el sistema a psicólogas externas.
> Runbooks relacionados: `MONITORING.md` (vigilancia), `DR_RUNBOOK.md` (recuperación).

## Qué cambia

Hasta hoy el único tenant real es de la casa. Si un despliegue rompe algo, lo
descubre alguien que sabe qué pasó y puede esperar. A partir del primer externo
hay historias clínicas de terceros en la caja: un fallo deja de ser una molestia
y pasa a ser una profesional que no puede atender, con un paciente sentado
enfrente.

Eso mueve el riesgo de sitio. **No lo mueve a `main`**, que es la parte mejor
protegida de todo esto.

## Lo que ya está bien y no hay que tocar

Vale la pena decirlo antes de proponer nada, porque el plan es más corto de lo
que parece:

- `main` exige PR, con `enforce_admins` y ocho checks obligatorios. No hay push
  directo ni force-push, ni siquiera para el dueño.
- `make verify` es la definición de "hecho", con trinquetes de cobertura, de
  tests apagados y de tamaño de bundle. Un test no se puede apagar en silencio.
- Hay tests de aislamiento RLS, de cripto/DEK, de concurrencia, fuzzing con 15
  objetivos y una suite de aceptación en Gherkin contra el router real.
- Las migraciones las aplica el propio despliegue, antes de arrancar el binario
  nuevo, y falla si `schema_migrations` queda `dirty`.
- Hay respaldo diario cifrado fuera del servidor y un runbook de recuperación
  con tiempos medidos.
- Desde el 2026-08-19 hay vigilancia firmada cada cinco minutos.

La calidad del **código** antes de entrar a `main` está cubierta. El hueco está
entero del otro lado: en lo que pasa después del merge.

## Los cuatro huecos, medidos

### 1. No hay forma de volver atrás

El CI publica las imágenes solo como `:latest`, y el despliegue termina con
`docker image prune -f`, que borra la anterior por quedar sin etiqueta. En el
VPS hay **una sola** imagen de `core-api` y una de `ai-service`. El frontend se
copia con `rsync --delete` sobre el directorio montado y el tarball se borra al
terminar.

Consecuencia concreta: deshacer un despliegue malo hoy significa revertir el
commit y esperar un build completo de CI — la imagen de `ai-service` pesa 2,19 GB —
mientras la psicóloga está afuera. No hay ningún artefacto anterior al que
apuntar, ni en el servidor ni en GHCR.

Es el hueco más grave y el más barato de tapar. Lo tapa el blue/green de la
Fase 0.1: si la versión anterior sigue encendida al lado, volver a ella es
cambiar de upstream, no reconstruir nada.

### 2. El respaldo puede tener hasta 24 horas cuando corre una migración

`pg_dump` cifrado a las 02:00. Una migración que toque datos y salga mal a las
16:00 se lleva por delante lo escrito desde la madrugada. Las migraciones son
aditivas por regla, lo que cubre el caso de esquema, pero no el de un backfill
con un `UPDATE` mal filtrado.

### 3. No hay dónde ensayar

El VPS es un CX21: **1,9 GB de RAM, 2 vCPU, 87 MB libres**. Un segundo stack
completo en esta caja no cabe, y menos con Whisper corriendo local. Hoy la
primera vez que una migración toca datos de verdad es en producción.

### 4. Nadie se entera de un error que no tumba el servicio

La vigilancia responde "¿se puede entrar?". No responde "¿está fallando el 30%
de los guardados de historia clínica para un consultorio?". Ese fallo hoy llega
por WhatsApp de la usuaria, si se anima a escribir. Se ataca en la Fase 3.1, y no
bloquea la entrega porque con blue/green el daño de una versión mala se deshace
en segundos.

---

## Fase 0 — antes de que entre el primer externo

Bloqueante. Sin esto no se entrega el sistema.

**0.1 Blue/green en `core-api`, que trae el rollback dentro. ✅ HECHO 2026-08-20** (PRs #300 y #301).** En vez de
recrear el contenedor en sitio, se levanta la versión nueva **al lado** de la
vieja, se espera a que reporte `healthy`, y solo entonces Caddy cambia de
upstream. La vieja se queda encendida unos minutos.

Se midió antes de decidirlo: `core-api` consume **12 MiB** en producción. Un
segundo contenedor cuesta otros doce, sobre 1,3 GB disponibles. La restricción de
RAM que descarta un staging completo no aplica aquí.

Da tres cosas de un golpe:

- **Rollback en segundos**, cambiando el upstream de vuelta. No hay que traerse
  ninguna imagen ni pasar por CI, que era el hueco #1 de este documento.
- **Cero caída** en cada despliegue. Hoy hay una ventana de 502 mientras el
  contenedor se recrea.
- **Falla en cerrado.** Si la versión nueva nunca llega a `healthy`, el upstream
  sencillamente no cambia y la vieja sigue sirviendo. Esto reemplaza al punto
  "que el deploy falle fuerte" del borrador anterior, que ya no hace falta.

Requisito que ya está cumplido: durante la transición las dos versiones hablan
con la misma base a la vez, así que las migraciones tienen que ser aditivas. Esa
regla existe en el repo desde el PR #255.

#### Cómo se opera

```
scripts/deploy_switch.sh status     qué color sirve y qué imagen tiene cada uno
scripts/deploy_switch.sh rollback   volver al color anterior (mide 1,6 s)
scripts/deploy_switch.sh retire     apagar el color que no sirve
```

El botón de volver atrás también está en Actions → *Rollback (prod)*, escribiendo
`volver` para confirmar. Correr el rollback dos veces devuelve al color de
partida: la operación es simétrica.

#### La trampa que casi lo deja inservible

Docker monta un fichero suelto **por inodo**. La primera versión escribía el
cambio de color con `mv` — el rename atómico de siempre — y eso crea un inodo
nuevo: el host quedaba con el fichero nuevo y Caddy seguía leyendo el viejo.
`caddy reload` parseaba lo que veía, lo aceptaba y salía 0. Se comprobó en
producción: el host decía `green`, Caddy tenía montado el fichero anterior, y las
peticiones reales seguían llegando a `blue`.

Dos consecuencias, las dos ya aplicadas:

- El fichero se escribe **en sitio**, nunca renombrado a su posición.
- El script no se fía del código de salida del reload: lee desde dentro del
  contenedor qué color reporta Caddy, y si no es el pedido falla en voz alta. Un
  cambio que no se ve desde adentro no ocurrió.

Y el fichero vivo **no se versiona** (`caddy-upstream.conf.example` es la
plantilla). Estaba en git y a la vez lo reescribía el servidor, mientras el
propio despliegue hacía `git pull` sobre ese directorio: git quería restaurarlo,
el runtime quería cambiarlo, y cada reemplazo rompía el montaje otra vez.

Si alguna vez el fichero se borra y se recrea en el host — un `git checkout`, una
restauración a mano — hay que recrear Caddy una vez
(`docker compose up -d --force-recreate caddy`). La guarda lo detecta y lo dice
en el mensaje de error.

**No aplica a `ai-service`,** y no hace falta. Su imagen pesa 2,19 GB y Whisper
carga modelos en memoria, así que dos no caben. Pero sus trabajos viajan por
Redis Streams: si el contenedor se reinicia unos segundos, los trabajos esperan
en la cola y nadie ve nada. Su caída ya es invisible por diseño.

**0.2 Respaldo inmediatamente antes de migrar. ✅ HECHO 2026-08-20.** El
despliegue corre `scripts/predeploy_dump.sh` justo antes de `migrate up` y se
detiene si la copia no sale. Retención siete días en `/var/backups/sghcp/predeploy`.

Va a disco local y sin GPG a propósito: este host solo tiene la llave pública y
no puede descifrar sus propios respaldos. Esa forma es la correcta para una
catástrofe — el servidor desaparece y alguien restaura desde B2 con la llave
offline — y la equivocada para lo que de verdad pasa un martes, que es una
migración con un backfill malo a las cuatro de la tarde. Deshacer eso necesita
una copia que **esta** máquina pueda leer, y de las cuatro de la tarde.

No basta con que `pg_dump` salga 0. Sale 0 igual para una base vacía, y escribe
un fichero pequeño y perfectamente válido — que es justo el estado que estaríamos
a punto de volver permanente. Por eso también hay un piso de tamaño.

Sobre qué contiene, corrigiendo lo que decía antes este documento: **no es cierto
que "va todo cifrado"**. Los nombres, documentos, teléfonos, direcciones y la
historia clínica sí van en `BYTEA` con la DEK del paciente, y las DEK van
cifradas con `MASTER_KEY`, que vive en `.env` y nunca en la base — así que el
dump por sí solo no abre una sola nota clínica. Pero `users.email` está en claro,
y también los hashes bcrypt de contraseña y el `birth_date` y `gender` de los
pacientes. El argumento real para dejarlo sin cifrar es más estrecho: el propio
directorio de datos de Postgres, en este mismo disco, ya guarda esas columnas en
ese mismo estado. Quien pueda leer el dump puede leer los ficheros de la base que
tiene al lado. Lo que el fichero sí añade es una copia que sobrevive a un `DROP`,
y por eso es de root, `0600`, y se barre a los siete días.

**0.3 Simulacro de restauración con las llaves de hoy. ✅ HECHO 2026-08-20.** El anterior fue en
julio, antes de la rotación de llave, así que hasta hoy nadie había comprobado
que los respaldos actuales se pudieran leer.

Restauración desde B2, no desde la copia local del VPS, que es la prueba más
estricta. 50 tablas, 0 errores, **7 segundos**, y el contenido idéntico a
producción. La cadena de sobre completa quedó verificada extremo a extremo:
`MASTER_KEY` descifra la DEK del paciente, la DEK descifra el campo, y el
apellido recuperado se re-hashea con `SEARCH_PEPPER` y coincide con el hash
guardado en los tres pacientes probados. Detalle y método en `DR_RUNBOOK.md`.

Un respaldo que nunca se restauró no es un respaldo; ahora sí lo es.

**0.4 Poder ver qué está corriendo. ✅ HECHO 2026-08-20.** Dos mitades que se
verifican entre sí:

- **GitHub Environments**, que es nativo y no hay que construirlo: historial de
  despliegues con fecha y autor, qué SHA está vivo, botón de volver a desplegar
  y, si se quiere, aprobación manual antes de que algo salga. El rollback vive
  aquí como `workflow_dispatch`.
- **Distintivo de versión en la cabecera de Sistema**, de solo lectura: SHA
  desplegado, color activo y versión de migración, con aviso en rojo si quedó
  `dirty`. El SHA se enlaza dentro del binario
  (`-X …/buildinfo.Version`, `ARG VERSION` en el Dockerfile) y **no** se lee de
  una variable de entorno: una variable dice lo que alguien quiso desplegar, el
  símbolo del enlazador dice qué se compiló de verdad en el proceso que está
  contestando. Un build local se muestra como `dev (sin CI)` en ámbar, sin
  disfrazarlo de hash.

  El estado de los contenedores queda deliberadamente fuera: la aplicación no
  ve Docker, y darle el socket para que lo viera sería deshacer el PR #107. Eso
  ya lo cubre `monitor.sh`, que corre en el host.

Cuando el número que muestra GitHub y el que muestra el superadmin no coinciden,
algo se rompió en el camino — que es exactamente lo que antes no se podía ver
desde ningún lado.

**Con esto la Fase 0 queda cerrada.** El sistema se puede entregar: un despliegue
malo se deshace en segundos, cada migración lleva una copia fresca detrás, esa
copia está probada, y se puede ver qué está corriendo.

### Por qué el botón de rollback NO va dentro de la aplicación

Es la petición natural y hay que decir que no, por dos razones.

La consola de superadmin la sirve exactamente el proceso que se quiere revertir:
si `core-api` quedó roto, el botón para arreglarlo está roto también. Es la misma
recursión del dead man's switch.

Y para que la aplicación ejecute `docker` habría que montarle el socket de Docker
dentro del contenedor, que es precisamente lo que se quitó en el PR #107 porque
daba root en el host a través de cualquier RCE en la API. Cambiar eso por
comodidad sería el peor intercambio del plan.

El botón existe, solo que fuera: `workflow_dispatch` en GitHub Actions. Ya es una
interfaz gráfica, corre fuera del servidor, no necesita el socket y queda
registrado quién lo apretó.

### Por qué canary tampoco, todavía

Con cinco usuarias, "el 10% del tráfico a la versión nueva" es usuaria y media:
el número no informa y el enrutado por porcentaje añade una pieza que puede
fallar sola. El equivalente que sí sirve a esta escala es canary **por
organización**, y eso ya está en el plan bajo otro nombre — feature flags (2.2),
que son una variable de entorno y no tocan el enrutado.

## Fase 1 — el ambiente de pruebas

Aquí conviene separar tres cosas que suelen pedirse juntas y necesitan
respuestas distintas.

**1.a Probar features a mano → ya existe, hay que formalizarlo.** La organización
demo interna (`is_internal`) es el tenant de pruebas. Se usa desde el navegador
como una usuaria más, sin tocar datos reales, y el smoke ya la resetea. Falta
documentar el seed y dejar dicho que ninguna prueba manual se hace en un
consultorio real.

**1.b Validar el camino de despliegue → stack efímero en CI.** Levantar el
`docker-compose.yml` real en el runner, aplicar las 80 migraciones desde cero y
correr la suite de aceptación contra él. Atrapa dos cosas que hoy nadie atrapa:
un compose roto y una migración que no aplica sobre una base limpia.

**1.c Validar migraciones contra datos reales → ensayo sobre una copia. ✅ HECHO
2026-08-20.** Era la pieza de más valor y no cuesta RAM. Antes de tocar la base de verdad, el
despliegue restaura el último dump en una base desechable **dentro del mismo
Postgres**, corre `migrate up` ahí, verifica que termina limpia, y la borra. Solo
si el ensayo pasa se migra la base real. Los datos nunca salen del servidor y no
hace falta un segundo contenedor.

Usa la copia que `predeploy_dump.sh` acaba de tomar, así que las dos piezas de la
Fase 0.2 y ésta encajan sin trabajo extra: se toma una copia, se ensaya sobre
ella, y solo entonces se estrena.

Probado contra el Postgres de producción antes de mergearlo, con los tres casos:

| Caso | Resultado |
|---|---|
| Sin migraciones pendientes | `no change`, ensayo limpio en la versión 80 |
| Una migración válida nueva | Aplicada sobre datos reales, llega a la 81 |
| Una migración que revienta a mitad | `dirty=t`, el despliegue **se detiene antes de tocar la base real** |

En los tres, la base de ensayo se borró al terminar —también al fallar— y la real
quedó intacta en la versión 80 con `dirty=f`.

Lo que protege es concreto: las migraciones son aditivas por regla, lo que cubre
el esquema, pero no cubre un backfill con un `UPDATE` mal filtrado. Y ése no
fracasa ruidosamente: termina bien, deja la base en un estado que nadie pidió, y
se descubre días después porque una psicóloga dice que un dato está raro.

La función más importante del script no es el ensayo sino `drop_guard`. El ensayo
termina borrando una base de datos y corre desatendido dentro de un despliegue:
si una variable llegara vacía o mal, el `DROP` caería sobre historias clínicas
reales. Siete casos lo fijan en `make verify`, incluido el de las dos variables
vacías — donde un guardián descuidado diría que los nombres coinciden y
autorizaría.

**Lo que NO propongo todavía: un VPS de staging.** Costaría unos €5 al mes y sí
resolvería el soak de varios días, pero con 1.c y 1.b cubierto el riesgo que
queda no lo justifica para un dev solo. Se revisa cuando haya un segundo cliente
pagando o una feature que necesite días de uso real antes de salir.

## Fase 2 — despliegue controlado

**2.1 Separar mergear de desplegar. ✅ HECHO 2026-08-20**, y salió de la 2.3: al
poner la ventana nocturna, el merge y el despliegue quedaron separados solos.

El merge construye y publica la imagen; el despliegue corre a su hora. No hay
paso manual que recordar —que es lo que mató a las etiquetas de este repo en
junio— y se gana lo mismo: eliges cuándo le cambia el sistema a la usuaria, y una
semana de merges sale junta.

**2.2 Flags apagados por defecto.** Cualquier cosa que toque el camino clínico
entra detrás de una variable de entorno apagada, siguiendo el patrón que ya usa
`AI_WINDOW_TRANSCRIPTION`. Se enciende en un despliegue aparte, después de que el
código lleve días corriendo sin ejecutarse. Flags por organización solo cuando
una feature necesite canario de verdad; no antes.

**2.3 Ventana de despliegue. ✅ HECHO 2026-08-20.** El despliegue deja de colgar
del merge y tiene su propia hora: **22:00 en Bogotá** (`0 3 * * *` UTC), cuando no
hay consulta. Se mergea todo el día sin que salga nada, y por la noche sale lo que
haya. Para un arreglo urgente está *Run workflow*, que despliega en el momento.

No es una regla que alguien deba recordar, es un horario: `deploy.yml` con
`schedule`. Una regla escrita en un documento se rompe el primer día ocupado.

**El orden dentro del despliegue importa:** primero la API y después el frontend.
Las migraciones son aditivas, así que una API nueva sirve al frontend viejo sin
problema; al revés no — un frontend nuevo puede pedirle a la API un campo que
todavía no existe. Por eso el despliegue del frontend se movió también a la
ventana: dejarlo saliendo en cada merge habría abierto una brecha de horas en la
que el frontend va por delante de su API.

Y una guarda que la ventana hizo necesaria: la mayoría de las noches no habrá
nada nuevo, y volver a desplegar lo mismo **no es inofensivo** — `retire` apaga la
reserva y el ciclo levanta la misma versión, o sea que se pierde el punto de
retorno a cambio de nada. `deploy_needed` corta eso, con sus cuatro casos en
`make verify`.

## Fase 3 — enterarse antes que la usuaria

**3.1 Tasa de 5xx en la vigilancia. ✅ HECHO 2026-08-20.** `monitor.sh` ya corre cada cinco minutos y
ya sabe mandar correo. Añadir un chequeo que cuente respuestas 5xx en el log de
`core-api` desde el ciclo anterior y avise pasado un umbral. Es el fallo que hoy
es invisible: el servicio está arriba y una operación concreta está rota.

**3.2 El canario cubre a cada organización nueva.** Hoy el canario vive en la org
demo. Con externos, que el chequeo de entrada recorra también un usuario de solo
lectura por cada organización real, para que un fallo de gating o de suscripción
en *una* no quede tapado por el resto.

## Fase 4 — el circuito de feedback

No es código, pero sin esto lo demás no sirve.

- Todo bug reportado por una externa entra **primero como test que falla**, que
  ya es regla del repo. Sin excepción por ser urgente.
- Un canal único para reportar y respuesta el mismo día, aunque la respuesta sea
  "lo estoy mirando".
- Decirles de entrada qué **no** hay: WhatsApp está apagado a propósito, y no
  existen videollamada, app móvil ni RIPS. Una expectativa falsa gasta la misma
  confianza que un bug.

## Lo que deliberadamente no vamos a construir

Para que el plan siga siendo proporcional a un dev solo con cinco usuarias:
Kubernetes, blue/green, Prometheus + Grafana (ya diferido en el BACKLOG por su
coste operativo), y el dead man's switch, que sigue diferido hasta que haya
usuarios reales — momento que, ojo, es exactamente este. Conviene revisarlo al
cerrar la Fase 0.

## Orden sugerido

| Orden | Qué | Costo | Bloquea la entrega |
|---|---|---|---|
| 1 | 0.1 blue/green + rollback ✅ | 1 día | sí |
| 2 | 0.2 respaldo pre-migración ✅ | 1 h | sí |
| 3 | 0.3 simulacro de restauración ✅ | 1 h | sí |
| 4 | 0.4 Environments + tarjeta de versión ✅ | medio día | sí |
| 5 | 1.c ensayo de migración sobre copia ✅ | medio día | no, pero antes de la 1ª migración con externos |
| 6 | 2.3 ventana de despliegue ✅ | 0 | no |
| 7 | 3.1 tasa de 5xx ✅ | medio día | no |
| 8 | 2.1 separar merge de deploy ✅ (salió de la 2.3) | — | no |
| 9 | 1.b stack efímero en CI | 1 día | no |
| 10 | 2.2 flags apagados | por feature | no |
