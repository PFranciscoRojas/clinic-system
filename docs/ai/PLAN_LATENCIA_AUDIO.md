# PLAN — Latencia del pipeline de audio y concurrencia

> Objetivo: bajar el tiempo entre "Finalizar sesión" y "borrador listo" de ~11 min
> a ~1–3 min, y cerrar los agujeros de concurrencia que hoy no están cubiertos por
> ninguna prueba.
>
> Restricción dura (CLAUDE.md regla 5): **Whisper corre local, el audio nunca sale
> del servidor.** Eso descarta Deepgram, AssemblyAI, Groq y la API de OpenAI, que
> serían la respuesta obvia y equivocada. Todo lo de abajo respeta esa regla.

---

## 1. Baseline medido

Prod, Hetzner **2 vCPU / 1,9 GB de RAM**, sesión de 58 min (validado 2026-07-11,
runbook en `scripts/e2e_audio/`).

> **Corrección 2026-08-11.** Este plan decía "CX21 (2 vCPU / 4 GB)" y esa cifra
> nunca se verificó. La caja tiene **1915 MB** (`free -m`), menos de la mitad. El
> error se arrastró por cuatro fases y se cobró en la primera corrida real: la
> Fase 3 pedía ~3,4 GB para transcribir una hora y el kernel mató el ai-service.
> Todo presupuesto de memoria de aquí en adelante se mide contra 1,9 GB, de los
> cuales ~1,37 GB están libres con el resto del stack arriba.

| Etapa | Tiempo | Dónde |
|---|---|---|
| Grabación → blob webm 61 MB | 0 (en vivo) | `AppointmentPage.tsx:588` `rec.start(1000)` |
| Upload 61 MB @ ~500 KB/s | ~2 min | `POST /appointments/:id/audio`, multipart de un solo tiro |
| Transcripción Whisper `base` CPU | ~8,5 min (RTF 0,15) | `transcription/whisper.py:75` |
| Claude draft | ~28 s | `drafts/claude.py` |
| **Total percibido tras "Finalizar sesión"** | **~11 min** | |

Los 11 minutos son **todos** percibidos: el reloj arranca cuando el profesional
cierra la sesión. Nada del trabajo ocurre mientras la sesión pasa, que es cuando
sobra CPU y sobra ancho de banda.

---

## 2. Los cuellos de botella

**a) El audio pesa 6× más de lo necesario.**
`new MediaRecorder(stream, {mimeType:'audio/webm'})` sin `audioBitsPerSecond` deja
el default del navegador (~140 kbps para los 61 MB medidos). Whisper remuestrea
todo a **16 kHz mono** antes de mirarlo: cada bit por encima de eso se transmite,
se escribe a disco y se descarta. Opus mono a 24 kbps es transparente para ASR.

**b) El upload es serial y al final.** Los chunks ya existen en IndexedDB desde el
segundo 1, pero se mandan todos juntos al terminar.

**c) `openai-whisper` es la implementación de referencia en PyTorch**, la más lenta
que existe. `faster-whisper` (CTranslate2) con int8 corre el *mismo modelo*
típicamente 3–4× más rápido en CPU, con menos memoria y con VAD integrado.

**d) Nada empieza hasta que todo llegó.** Si los bytes llegan durante la sesión, se
puede transcribir por ventanas mientras la sesión sigue.

**e) El worker es estrictamente secuencial** (`worker.py:109-111`, `await
self._handle(...)` inline en el bucle de lectura). Una hora de audio bloquea ~9 min
todos los jobs de todas las orgs, incluidos los recaps de 3 s que solo esperan a la
API de Claude y no consumen CPU.

**f) Defecto que empeora con la duración** ✅ *(resuelto en la Fase 1)*:
`recordingStore.appendChunk` leía el array completo y lo reescribía en **cada
chunk de 1 s**. Al minuto 55 eran ~3.300 entradas releídas y reescritas por
segundo. O(n²) sobre la duración de la sesión, justo en las sesiones largas para
las que existe la recuperación.

---

## 3. Concurrencia — qué pasa con dos profesionales grabando a la vez

### 3.1 Comportamiento actual

| Etapa | Con 2 grabaciones simultáneas | ¿Problema? |
|---|---|---|
| Grabación (navegador) | Aisladas, en máquinas distintas | No |
| Upload HTTP | Go atiende ambas en paralelo, cada una con deadline propio de 20 min | Sí, de recursos |
| Ruta en disco | `/data/audio/{org}/{appointment}/{appointment}.webm` | No entre profesionales; **sí entre tomas** |
| Fila Redis | Ambos jobs entran a `ai_jobs`, sin pérdida | No |
| Worker | **Secuencial**: el segundo espera a que termine el primero | Sí, de latencia |
| RLS / DEK / cifrado | Cada draft con su DEK; GUC de tenant es `local=true` | No, correcto |

No se corrompen datos entre profesionales, no se mezclan tenants, no se pierde
ningún job. Lo que pasa es que el segundo espera el doble. Con sesiones que
terminan en punto (lo normal), dos profesionales que cierran a las 10:00 hacen que
el segundo vea su borrador a los ~22 min. Con cinco orgs activas, ~55 min. La UI
solo dice "procesando grabación", sin posición en fila ni ETA.

### 3.2 Problemas reales encontrados

**P1 — Colisión de archivo entre tomas de la misma cita, con pérdida de datos.**
✅ *Resuelto en PR #260. Se deja el diagnóstico porque es lo que justifica la
forma que tiene hoy `saveAudio`.*

`upload.go:87` arma el directorio con el appointment y `writer.go:120` nombra el
archivo con el mismo appointment. Ruta determinista, y `saveAudio` abre con
`O_TRUNC` (`upload.go:93`). Dos tomas de la misma cita escriben el mismo archivo.

No es hipotético: el propio worker documenta el flujo de varias tomas
(`worker.py:290-294`) y tiene la consolidación para soportarlo. Secuencia que
rompe:

1. Toma 1 sube → draft A → el worker empieza a transcribir (8,5 min).
2. Toma 2 sube dentro de esa ventana → **trunca y reescribe el archivo que ffmpeg
   está leyendo**.
3. Draft A sale con transcripción corrupta o truncada, y al terminar borra el
   archivo (`worker.py:415`).
4. El job B arranca, no encuentra el archivo → `ERROR` → 3 reintentos → dead letter.

Se pierde la toma 2 entera y la toma 1 sale mal.

**P2 — `RECLAIM_IDLE_MS` es más corto que el trabajo que protege.**
✅ *Resuelto en PR #260 — la ventana se deriva del peor trabajo legítimo.*

`worker.py:38` reclama entradas del PEL tras **5 min** de inactividad. Una
transcripción de 1 h tarda **8,5 min**. Hoy no explota únicamente porque `_handle`
se hace `await` inline dentro del bucle, así que `_reclaim_stale` no puede correr
mientras hay un job vivo. Está a salvo **por ser secuencial, no porque el número
esté bien**. `CONSUMER_NAME` además está fijo en `"ai-worker-1"` (`worker.py:28`),
así que escalar réplicas hoy no es una opción de configuración.

> Consecuencia de orden: la fase de carriles concurrentes (§4, Fase 5) **pisa esta
> mina**. En cuanto haya dos jobs a la vez, o una segunda réplica, el reclaim se
> dispara sobre un job todavía corriendo y lo procesa dos veces: doble
> transcripción, doble draft, doble costo de Claude. P2 es **prerequisito** de la
> Fase 5, no un detalle posterior.

**P3 — El upload de audio no tiene tope de concurrencia.**
`ParseMultipartForm(32 << 20)` (`writer.go:64`) reserva hasta 32 MB en memoria por
petición; la ruta está exenta del timeout global de 30 s
(`routes.go:243-256`) y no pasa por `RateLimit`, que solo cubre las rutas públicas
(`routes.go:96-98`). En una caja de 1,9 GB con postgres, redis y Whisper compitiendo,
N subidas simultáneas × 32 MB no tiene freno. No es explotable desde fuera
(requiere JWT con `ai_drafts:request`), pero sí es un pico de memoria no acotado en
el escenario legítimo de varias sesiones cerrando a la vez.

### 3.3 Qué ya está garantizado por pruebas

La mitad peligrosa está cubierta, y bien:

- `integration/concurrency_test.go:309` `TestRLSHoldsUnderConcurrency` y `:377`
  `TestNoConnectionReturnsToThePoolScoped` — el aislamiento entre tenants aguanta
  carga concurrente y ninguna conexión vuelve al pool con el GUC pegado.
- `:227` `TestTwoProfessionalsShareTheSameHour` y `:151`
  `TestConcurrentAppointmentsCannotDoubleBookAProfessional` — agenda concurrente.
- `_notify` usa `set_config(..., true)` (`worker.py:429`), transaction-local: no hay
  fuga de GUC entre conexiones del pool. Correcto por diseño.

### 3.4 Qué NO está cubierto

*(Actualizado tras PR #260 y la Fase 1. Lo tachado ya está cubierto.)*

- ~~**Cero tests de `worker.py`**~~ — ya hay
  `tests/test_worker_queue_safety.py`, los primeros del archivo. Pinean las
  invariantes de la cola (ventana de reclaim, umbral del sweep, identidad del
  consumidor). Sigue sin cubrirse la **semántica** de la cola: consolidación de
  tomas, borrado de audio, dos jobs a la vez de extremo a extremo.
- ~~**Ningún test de subida de audio concurrente**~~ — cubierto en
  `aidrafts/service/upload_test.go`: dos tomas de la misma cita (secuenciales y
  concurrentes), separación por org y por cita, y limpieza del parcial cuando el
  cuerpo falla.
- **Ninguna prueba de carga.** Sigue abierto: no hay forma de responder "¿aguanta
  5 sesiones cerrando a la vez?" con datos en vez de con opinión. Depende de las
  columnas de tiempos de la Fase 0.

### 3.5 Hallazgo colateral, fuera del alcance de este plan

`retention/sweeper.go:78-81` fija `app.current_org` con `set_config(..., false)`
— **session-level, no transaction-local** — sobre una conexión del pool, y lo
resetea con un `defer conn.Exec(ctx, ...)`. Si ese reset falla (ctx cancelado
durante el apagado, por ejemplo), la conexión vuelve al pool con el GUC de una org
puesto. Es exactamente el patrón contra el que existe
`TestNoConnectionReturnsToThePoolScoped`, y ahí está mitigado solo por el defer.

No lo toco aquí porque no tiene nada que ver con latencia de audio y ensancharía
el PR. Va al BACKLOG como ítem propio, con su test rojo antes del parche.

---

## 4. Fases

### Fase 0 — Instrumentar (bloqueante para todo lo demás) ✅ (hecha)

Columnas no-PII en `ai_drafts`: `audio_seconds`, `upload_ms`, `transcribe_ms`,
`llm_ms`, `rtf`, `whisper_model`. Sin esto no hay forma de probar que una
optimización sirvió más allá de cronometrar a mano. Migración ~~`000070`~~
`000075` (la numeración avanzó mientras el plan esperaba).

Cómo quedó:

- `upload_ms` lo mide core-api desde antes de leer el cuerpo hasta que el
  archivo está en disco, y viaja en el mismo INSERT que crea el borrador. NULL
  cuando nadie midió, nunca 0: un borrador sin medición no puede entrar a los
  percentiles como una subida instantánea.
- `transcribe_ms`, `audio_seconds` y `llm_ms` los escribe el worker. También en
  el camino `EMPTY`: una corrida que quemó nueve minutos de CPU para no producir
  nada es justo lo que la instrumentación existe para hacer visible.
- `rtf` es **columna generada**, no un valor que alguien escriba. Un RTF que no
  cuadre con sus propios operandos sería peor que no tener RTF: mentiría
  exactamente en la comparación para la que existe.
- `audio_seconds` sale de `ffprobe` (lee la cabecera, no decodifica) y cae a la
  última marca de segmento de Whisper cuando el contenedor no declara duración —
  el caso normal de un WebM armado con `MediaRecorder`. Si ninguna de las dos
  puede, queda NULL y el RTF también. Nunca se adivina.

**Hallazgo colateral:** `whisper_model` ya existía, y era mentira. Lo escribía
core-api al subir, desde una constante `"base"` que no tiene forma de saber qué
modelo corre el ai-service — que lee el suyo de `settings.whisper_model`, es
decir, de una variable de entorno del VPS. Bastaba con exportar
`WHISPER_MODEL=small` para que la base de datos siguiera diciendo `base` sin que
nada fallara. Ahora el worker lo sobrescribe con lo que realmente corrió, que es
un prerequisito de la Fase 3: comparar el RTF de dos modelos usando una etiqueta
que no sabe que el modelo cambió no compara nada.

### Fase 0.5 — Concurrencia y seguridad de la cola ✅ (hecha, PR #260)

P1 era un bug con pérdida de datos que existía en producción, independiente de
toda la optimización de latencia.

1. **Ruta única por toma**: `{org}/{appointment}/{take-uuid}.webm` en vez de
   `{appointment}.webm`, con escritura a `.part` + `rename` atómico y limpieza del
   parcial si el `io.Copy` falla. Nada reconstruye la ruta desde el appointment: el
   path viaja por el job de Redis y por `audio_path_enc`, así que el cambio es local.
2. **Ventana de reclaim** mayor que el peor caso real de transcripción, y derivada
   de una constante única en vez de un número adivinado.
3. **`CONSUMER_NAME` derivado del hostname** del contenedor, para que escalar
   réplicas deje de ser un pie de bala.
4. **Semáforo de subidas concurrentes** en la ruta de audio, con 429 y mensaje en
   español. *(Diferido: necesita manejo del 429 en el frontend para no empeorar la
   experiencia que intenta proteger. Va con la Fase 2, que reescribe esa ruta.)*

**Pruebas que acompañan** (son la respuesta a "¿cómo sabemos que funciona?"):

- ✅ Go: dos subidas sobre la **misma cita**, secuenciales y concurrentes → dos
  archivos distintos, ninguno truncado. **Falló antes del fix** (regla 3 del
  CLAUDE.md: el bug entra primero como test rojo).
- ✅ Go: separación por org y por cita en la ruta; extensión validada en el
  servicio, no solo en el handler; un `io.Copy` fallido no deja PHI a medio
  escribir.
- ✅ Python: primeros tests de `worker.py` (el archivo no tenía ninguno). Pinean
  que la ventana de reclaim supera el peor trabajo legítimo, que el umbral del
  sweep no es más corto que ella, y que dos procesos no comparten identidad de
  consumidor.
- ⬜ **Diferido a la Fase 5**: tests de semántica de cola de extremo a extremo (dos
  jobs a la vez salen ambos `DRAFT_READY`; un job largo no se procesa dos veces;
  el borrado de audio de un job no toca el de otro). Necesitan `fakeredis` y que
  `AIWorker` acepte inyección de cliente en vez de construirlo desde la URL en
  `start()`. Ese refactor pertenece a la fase que de verdad introduce
  concurrencia; hacerlo aquí sería pagarlo dos veces.
- ⬜ `scripts/e2e_audio/`: escenario de 3 sesiones cerrando simultáneamente, con
  p50/p95 por etapa usando las columnas de la Fase 0.

### Fase 1 — Bytes y bitrate ✅ (hecha)

`audioBitsPerSecond: 24000` + `getUserMedia({audio:{channelCount:1,
sampleRate:16000, echoCancellation:true, noiseSuppression:true}})`, `timeslice`
de 1 s a 5 s, y `appendChunk` O(n²) reemplazado por un registro por chunk con
índice por cita (`lib/recording.ts`, `lib/recordingStore.ts`).

→ Upload 2 min → ~20 s. Disco y volumen `audio_data`: 6× menos.

Notas de la implementación:

- El store sube a `DB_VERSION` 2 pero **conserva el almacén v1** y lo lee: quien
  esté grabando cuando aterrice el deploy tiene ahí la única copia de su sesión,
  y el banner de recuperación tiene que seguir encontrándola. Cubierto por tests.
- `seq` es autoincremental **numérico** a propósito: una secuencia en texto
  pondría el chunk 10 antes del 2 y devolvería una sesión que salta en el tiempo.
- El O(n²) quedó medido, no argumentado: el test cuenta ítems escritos y daba
  820 para 40 chunks (n(n+1)/2) antes del cambio, 40 después.
- `fake-indexeddb` entra como dependencia de desarrollo porque happy-dom no trae
  IndexedDB. Los tests usan el `Blob` de `node:buffer`: el de happy-dom no
  sobrevive el structured clone del fake (queda en `{type}`, sin bytes), y con
  él las aserciones de orden y contenido habrían pasado con cualquier
  implementación.

### Fase 2 — Upload por partes durante la sesión

`POST /appointments/:id/audio/parts` (índice de parte, ~30–60 s cada una) +
`POST .../audio/complete` que finaliza y encola. El servidor concatena en un
`.part`. Efectos colaterales que valen tanto como la velocidad:

- Muere el "falló el upload, vuelve a subir la hora entera" y el banner de
  recuperación.
- `maxAudioSize` 200 MB y el `audioUploadDeadline` de 20 min (`writer.go:21-26`)
  dejan de ser excepciones frágiles: cada parte cabe en los timeouts normales.
- **Desaparece el límite de 100 MB de Cloudflare**, una de las dos razones por las
  que el DNS está en nube gris (`STATUS.md`). Habilita reconsiderar el proxy (el
  problema de ACME sigue aparte).
- Requiere un barredor de `.part` huérfanos (sesión abandonada): PHI en disco sin
  draft asociado.

→ Upload percibido ~20 s → ~2 s.

### Fase 3 — Cambiar el runtime de Whisper ✅ (hecha, falta medir)

`openai-whisper` → `faster-whisper` con `compute_type="int8"`, `cpu_threads=2`,
`vad_filter=True`, `condition_on_previous_text=False`. Se conservan
`language="es"`, `initial_prompt=CLINICAL_PROMPT_ES` y el filtrado por
`no_speech_prob`: la API de segmentos es equivalente. El VAD ataca de raíz el bucle
de alucinación que hoy `_looks_hallucinated` limpia a posteriori, que pasa a ser
red de seguridad en vez de defensa principal. Bonus: se cae `torch` del Dockerfile
(~2 GB menos de imagen).

→ Transcripción 8,5 min → **~2–2,5 min esperados** (a medir, no a asumir).

Decisión que se abre: con ese margen, `small` en int8 queda en ~0,12 RTF, es decir
**más rápido que el `base` de hoy y con mejor español**. Evaluar con el audio de
referencia de `scripts/e2e_audio/` y WER medido. Ahora es un cambio de
`WHISPER_MODEL` en el `.env` más un rebuild, sin tocar código.

### Fase 3.1 — Trocear el audio antes de transcribirlo ✅

**Regresión encontrada en producción el 2026-08-11.** La primera grabación real
de sesión completa mató el ai-service por falta de memoria:

```
Out of memory: Killed process 2840029 (uvicorn) ... anon-rss:1671844kB
```

Causa: `faster_whisper/feature_extractor.py` calcula el espectrograma log-Mel del
archivo **entero** de una sola pasada. Los frames float32 estriados, la FFT
compleja de 128 bits y su copia a complex64 viven al mismo tiempo. Son ~0,9 MB por
segundo de audio: una hora pide ~3,4 GB, y esta caja tiene 1,9 GB. No es culpa del
VAD — medido con y sin él sobre la misma grabación de 3369 s:

| variante | pico RSS | tiempo | caracteres |
|---|---|---|---|
| archivo entero, `vad_filter=True` | 3459 MB | 211 s | — |
| archivo entero, `vad_filter=False` | 3187 MB | 201 s | — |
| troceado con numpy cada 300 s | 1005 MB | 210 s | 58 728 |
| troceado con numpy cada 180 s | 820 MB | 214 s | 58 619 |
| ffmpeg, cortes ciegos cada 180 s | 606 MB | 217 s | 57 968 |
| **ffmpeg, cortes dentro del silencio** | **528 MB** | **216 s** | **58 545** |

Arreglo: ffmpeg parte la grabación antes de transcribir y Whisper nunca ve más de
`WHISPER_CHUNK_SECONDS` (180 s) a la vez. El pico pasa a depender del trozo, no de
la duración de la sesión. Cuesta ~2 % de tiempo de pared.

Los cortes no son ciegos: una pasada de `silencedetect` dice dónde nadie habla y
cada corte se hace en el punto medio del silencio más cercano a la frontera
nominal. Eso recupera las palabras que un corte ciego parte por la mitad (58 545
caracteres contra 57 968) y no cuesta nada. Si `silencedetect` falla, se corta a
intervalos fijos: saber dónde están los silencios es una optimización, **cortar
es la propiedad de seguridad**.

Efecto lateral bueno: la duración ya no se le pregunta al contenedor. Se suma la
de cada trozo decodificado, que es exacta — un WebM armado con chunks de
MediaRecorder declara `Duration: N/A`, que es la razón original por la que este
pipeline no podía reportar RTF.

→ Pico de memoria 3459 MB → **528 MB**. Con el código de producción real sobre la
grabación de 56 min: 562 MB de pico, 3368,76 s de duración medida, RTF 0,079 en
una máquina de escritorio. **El número del VPS sigue sin medirse.**

**Trampa que costó un test:** `transcribe()` de faster-whisper devuelve un
**generador**. Vuelve en 0,16 s sin haber transcrito nada; el trabajo ocurre
mientras se consume. Cronometrar la llamada —que es la forma obvia de escribirlo,
y la que heredaba la Fase 0— reporta ~0 ms para una transcripción de ocho
minutos. Verificado: contra esa versión el test da `assert 0 >= 50`.

`audio_seconds` ahora sale de `info.duration`, que es lo que el runtime realmente
decodificó. Eso hace redundante el `ffprobe` de la Fase 0 y se borró: mantener
dos fuentes que pueden discrepar es como empieza a mentir una instrumentación.

**Pendiente y explícito: el número todavía no está medido.** El código está en
producción y la mejora es esperada, no observada. La medición sale de correr
`scripts/e2e_audio/` y leer `rtf` de la fila, que es precisamente para lo que se
hizo la Fase 0.

### Fase 4 — Transcribir durante la sesión

Con las partes ya en el servidor, un job transcribe ventanas de ~5 min sobre el
archivo parcial (ffmpeg decodifica un webm que crece). Al finalizar solo queda la
última ventana + Claude.

→ Total percibido **~40–60 s**.

Cuidados: cortar en silencio (VAD) o solapar 3–5 s y deduplicar, para no partir
palabras; y la consolidación de tomas (`_prior_transcriptions`) no debe confundir
ventanas de una misma toma con tomas distintas — las ventanas se acumulan en el
mismo draft, no crean drafts hermanos. Compite por CPU **durante** la sesión: exige
límite de CPU al contenedor `ai-service` (hoy no tiene ninguno en el compose) o más
núcleos.

### Fase 5 — Carriles en el worker *(bloqueada por Fase 0.5 punto 2)*

Separar jobs de transcripción (CPU-bound, 1 slot) de recap/plan/riesgo (IO-bound
contra la API de Claude, N slots) con un semáforo o dos consumer groups.

---

## 5. Proyección

| | Hoy | F1+F2 | +F3 | +F4 |
|---|---|---|---|---|
| Upload percibido | 2 min | ~2 s | ~2 s | ~2 s |
| Transcripción | 8,5 min | 8,5 min | ~2,2 min | ~45 s |
| Claude | 28 s | 28 s | 28 s | 28 s |
| **Total tras "Finalizar"** | **~11 min** | **~9 min** | **~3 min** | **~1,3 min** |

Las fases 1–3 dan la mejor relación esfuerzo/ganancia: 11 min → 3 min sin
arquitectura nueva. La 4 es la que llega a "casi instantáneo" y la que trae
complejidad real.

---

## 6. Advertencia: paralelizar en esta caja no sirve

Contraintuitivo pero importante: **correr dos transcripciones en paralelo en el
hardware actual no acelera nada.** Son 2 vCPU y Whisper ya usa los dos (torch toma
todos los núcleos por defecto). Dos jobs simultáneos se reparten el mismo hardware,
cada uno tarda el doble, el total es idéntico. Peor: `_load_model` cachea una única
instancia (`whisper.py:40`) y `openai-whisper` instala hooks de KV-cache sobre el
modelo en cada decodificación, así que compartir esa instancia entre hilos es
directamente incorrecto.

Lo que los carriles compran no es throughput, es **equidad**: que un recap de 3 s
deje de hacer cola detrás de una hora de audio. Throughput de verdad solo lo dan la
Fase 3 (menos CPU por job) o más núcleos — un CPX31 (4 vCPU AMD, ~€14/mes) o un
CAX ARM (CTranslate2 soporta NEON, y sale más barato que la caja actual).

Y hay un segundo techo, más duro que la CPU: **la memoria**. Dos transcripciones
simultáneas son dos picos de ~530 MB sobre 1,37 GB libres. Cabe, pero sin margen
para spaCy y el resto. La Fase 5 tiene que contar esa memoria, no solo los
núcleos.

---

## 7. Orden

~~`Fase 0`~~ ✅ → ~~`Fase 0.5`~~ ✅ → ~~`Fase 1`~~ ✅ → ~~`Fase 3`~~ ✅ →
~~`Fase 3.1` (troceo, arregla el OOM)~~ ✅ → **medir en el VPS** ← *aquí estamos*
→ `Fase 2` → `Fase 5` → decidir `Fase 4` contra upgrade de VPS.

La Fase 3 va antes que la 2 a propósito: es el cambio con más ganancia por línea
tocada (8,5 min → ~2,2 min cambiando una dependencia). Una vez medida sabremos si
la Fase 4 vale su complejidad o si conviene más gastar €8/mes en núcleos.

---

## 8. Reglas que aplican

- **Definition of Done**: `make verify` en verde. No antes, y no por otro criterio.
- **Regla 3 (CLAUDE.md)**: P1 y P2 entran primero como test rojo, después el parche.
- Ni un `skip` nuevo, ni tocar `skip-budget.txt`.
- Este es trabajo de rendimiento y el riesgo de colar una regresión de **calidad**
  de transcripción es alto: hace falta un audio de referencia fijo con WER medido
  (base en `scripts/e2e_audio/`) que corra fuera del `make verify` normal.
- **PHI**: las partes parciales son PHI igual que el archivo final. Mismo `0600`,
  mismo borrado tras transcribir, y barrido de huérfanos. Ya hubo un incidente de
  audios acumulados por el `:ro` (PR #180); no repetirlo por la puerta de las partes.
