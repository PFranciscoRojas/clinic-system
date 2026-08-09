-- 000075_ai_draft_pipeline_timings.up.sql
--
-- Instrumentación del pipeline de audio (Fase 0 de docs/ai/PLAN_LATENCIA_AUDIO.md).
--
-- El baseline de ~11 min entre "Finalizar sesión" y "borrador listo" se midió a
-- mano una vez, con un cronómetro, sobre una sesión. Eso alcanzó para saber por
-- dónde empezar y no alcanza para nada más: sin estas columnas, cualquier
-- afirmación sobre si un cambio sirvió es una anécdota. En particular la Fase 3
-- (cambiar el runtime de Whisper) sólo se puede evaluar comparando el RTF de
-- antes contra el de después, sobre el mismo tipo de audio real.
--
-- Ninguna columna es PII: son duraciones y nombres de modelo. La duración de la
-- sesión ya es deducible de `appointments`, y la fila sigue bajo la misma
-- política RLS de siempre.
--
-- Todas nullable a propósito: la migración es aditiva (el deploy corre `migrate
-- up` ANTES de recrear el contenedor, así que la versión vieja del worker tiene
-- que poder seguir escribiendo filas sin conocer estas columnas), y un borrador
-- que falló antes de transcribir no tiene tiempos que contar. NULL significa "no
-- se midió", que es distinto de cero.

ALTER TABLE ai_drafts
    ADD COLUMN upload_ms     INTEGER,
    ADD COLUMN transcribe_ms INTEGER,
    ADD COLUMN llm_ms        INTEGER,
    ADD COLUMN audio_seconds NUMERIC(10,2);

-- El RTF (real-time factor) es la métrica que decide si la Fase 3 sirvió:
-- segundos de CPU por segundo de audio. Es una columna generada y no un valor
-- que alguien escriba, porque un RTF que no coincida con sus propios operandos
-- es peor que no tener RTF — mentiría justo en la comparación para la que
-- existe.
--
-- Sin precisión declarada a propósito: un NUMERIC(8,4) desborda y **aborta el
-- INSERT** si llega una grabación de 10 ms (audio_seconds 0.01, RTF 60000), y
-- que el pipeline se caiga por una división en una columna de telemetría sería
-- un intercambio absurdo.
ALTER TABLE ai_drafts
    ADD COLUMN rtf NUMERIC GENERATED ALWAYS AS (
        (transcribe_ms::numeric / 1000) / NULLIF(audio_seconds, 0)
    ) STORED;

-- El reloj monótono no retrocede ni en Go (time.Since) ni en Python
-- (time.monotonic), así que un negativo aquí sería un error de programación,
-- no un dato raro. NULL pasa el CHECK, que es lo que queremos.
ALTER TABLE ai_drafts
    ADD CONSTRAINT ai_drafts_timings_non_negative CHECK (
        upload_ms     >= 0 AND
        transcribe_ms >= 0 AND
        llm_ms        >= 0 AND
        audio_seconds >= 0
    );
