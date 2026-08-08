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

Prod, Hetzner **CX21 (2 vCPU / 4 GB)**, sesión de 58 min (validado 2026-07-11,
runbook en `scripts/e2e_audio/`):

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

**f) Defecto que empeora con la duración:** `recordingStore.appendChunk`
(`recordingStore.ts:19`) lee el array completo y lo reescribe en **cada chunk de
1 s**. Al minuto 55 son ~3.300 entradas releídas y reescritas por segundo. O(n²)
sobre la duración de la sesión.

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
(`routes.go:96-98`). En un CX21 de 4 GB con postgres, redis y Whisper compitiendo,
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

- **Cero tests de `worker.py`.** 697 líneas, el archivo más complejo del servicio,
  sin ninguna prueba. Los tests de `ai-service` son todos unitarios y puros
  (anonimización, prompt guard, alucinación, widgets, prompts por enfoque). Nada de
  la cola, del PEL, del reclaim, de la consolidación de tomas ni del borrado de
  audio.
- **Ningún test de subida de audio concurrente.** `ai_drafts_test.go` cubre resolve,
  roundtrip de plantilla y fail-closed sin TenantScope. Nada de dos subidas
  simultáneas ni de la colisión de rutas.
- **Ninguna prueba de carga.** Hoy no hay forma de responder "¿aguanta 5 sesiones
  cerrando a la vez?" con datos en vez de con opinión.

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

### Fase 0 — Instrumentar (bloqueante para todo lo demás)

Columnas no-PII en `ai_drafts`: `audio_seconds`, `upload_ms`, `transcribe_ms`,
`llm_ms`, `rtf`, `whisper_model`. Sin esto no hay forma de probar que una
optimización sirvió más allá de cronometrar a mano. Migración `000070`.

### Fase 0.5 — Concurrencia y seguridad de la cola ← **va primero**

P1 es un bug con pérdida de datos que existe **hoy en producción**, independiente
de toda la optimización de latencia.

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

### Fase 1 — Bytes y bitrate (bajo riesgo, ganancia inmediata)

`audioBitsPerSecond: 24000` + `getUserMedia({audio:{channelCount:1,
sampleRate:16000, echoCancellation:true, noiseSuppression:true}})`. Subir el
`timeslice` de 1 s a 5 s y arreglar el `appendChunk` O(n²) con claves
autoincrementales en vez de un array reescrito.

→ Upload 2 min → ~20 s. Disco y volumen `audio_data`: 6× menos.

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

### Fase 3 — Cambiar el runtime de Whisper

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
referencia de `scripts/e2e_audio/` y WER medido.

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

## 6. Advertencia: paralelizar en el CX21 no sirve

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
CAX ARM (CTranslate2 soporta NEON, y sale más barato que el CX21 actual).

---

## 7. Orden

`Fase 0` → `Fase 0.5` → `Fase 1` → `Fase 3` → **medir** → `Fase 2` → `Fase 5` →
decidir `Fase 4` contra upgrade de VPS.

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
