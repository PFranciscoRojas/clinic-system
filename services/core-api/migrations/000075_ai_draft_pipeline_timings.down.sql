-- 000075_ai_draft_pipeline_timings.down.sql
--
-- `rtf` es generada a partir de transcribe_ms y audio_seconds, así que se cae
-- sola al borrar sus operandos; se nombra igual para que el DROP no dependa de
-- ese detalle. El CHECK también desaparece con las columnas, pero explícito es
-- mejor que implícito en una bajada que alguien va a leer con prisa.

ALTER TABLE ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_timings_non_negative;

ALTER TABLE ai_drafts
    DROP COLUMN IF EXISTS rtf,
    DROP COLUMN IF EXISTS audio_seconds,
    DROP COLUMN IF EXISTS llm_ms,
    DROP COLUMN IF EXISTS transcribe_ms,
    DROP COLUMN IF EXISTS upload_ms;
