-- Add audio_path_enc to ai_drafts so the worker knows which file to transcribe
-- even if the Redis Stream message is lost (idempotent re-processing).
ALTER TABLE ai_drafts ADD COLUMN audio_path_enc BYTEA;
