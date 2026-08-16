DROP INDEX IF EXISTS idx_ai_drafts_queue;
DROP FUNCTION IF EXISTS ai_queue_estimate(uuid);
ALTER TABLE ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_audio_bytes_nonneg;
ALTER TABLE ai_drafts DROP COLUMN IF EXISTS audio_bytes;
