DROP INDEX IF EXISTS idx_ai_drafts_upload;
DROP FUNCTION IF EXISTS ai_queue_estimate(uuid);

CREATE FUNCTION ai_queue_estimate(p_draft_id uuid)
RETURNS TABLE (
  jobs_ahead    integer,
  bytes_ahead   bigint,
  unknown_ahead integer,
  own_bytes     bigint,
  p50_rtf       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (
    SELECT id, created_at, COALESCE(audio_bytes, 0) AS bytes
    FROM ai_drafts WHERE id = p_draft_id
  ),
  ahead AS (
    SELECT d.audio_bytes
    FROM ai_drafts d, me
    WHERE d.status IN ('PENDING', 'PROCESSING')
      AND (d.created_at, d.id) < (me.created_at, me.id)
  )
  SELECT
    (SELECT COUNT(*) FROM ahead)::integer,
    (SELECT COALESCE(SUM(audio_bytes), 0) FROM ahead)::bigint,
    (SELECT COUNT(*) FILTER (WHERE audio_bytes IS NULL) FROM ahead)::integer,
    (SELECT bytes FROM me),
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rtf)
     FROM (SELECT rtf FROM ai_drafts
           WHERE rtf IS NOT NULL AND transcribe_ms IS NOT NULL
           ORDER BY created_at DESC LIMIT 50) recent)
  FROM me;
$$;
GRANT EXECUTE ON FUNCTION ai_queue_estimate(uuid) TO sghcp_app;

ALTER TABLE ai_drafts DROP COLUMN rtf;
ALTER TABLE ai_drafts
    ADD COLUMN rtf NUMERIC GENERATED ALWAYS AS (
        (transcribe_ms::numeric / 1000) / NULLIF(audio_seconds, 0)
    ) STORED;

ALTER TABLE ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_transcribed_seconds_nonneg;
ALTER TABLE ai_drafts DROP COLUMN IF EXISTS transcribed_seconds;
ALTER TABLE ai_drafts DROP COLUMN IF EXISTS upload_id;
