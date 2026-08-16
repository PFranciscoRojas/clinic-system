-- Telling a professional how long the draft still has to wait.
--
-- Until now the only thing on screen while a recording is transcribed was
-- "Procesando la grabación…", which reads the same at forty seconds and at
-- forty minutes. Those are very different situations: the first is a coffee,
-- the second is "finish the day and check tomorrow". The difference is not the
-- audio, it is the queue — the worker runs one transcription at a time on
-- purpose (2 vCPU, and Whisper already uses both), so four sessions closing at
-- the same hour means the fourth waits for three.
--
-- Two things are needed to say a number, and neither existed:
--   1. how much audio is ahead of this draft, and
--   2. how fast this box actually transcribes.

-- 1. How much audio this draft is.
--
-- Bytes rather than seconds because bytes are known when the row is created and
-- seconds are not: `audio_seconds` is written by the worker from a real probe,
-- after the transcription it is supposed to be measuring. Reusing that column
-- to hold an estimate would put a guess inside the operand of the generated
-- `rtf`, which is the number the whole latency plan is measured against.
--
-- At the recorder's fixed 24 kbps this converts to seconds exactly. For a file
-- the professional picked by hand it is a rough guess, which is what an ETA is.
ALTER TABLE ai_drafts ADD COLUMN IF NOT EXISTS audio_bytes BIGINT;

ALTER TABLE ai_drafts
    ADD CONSTRAINT ai_drafts_audio_bytes_nonneg
    CHECK (audio_bytes IS NULL OR audio_bytes >= 0);

-- 2. The queue, which is global, and the observed speed, which is also global.
--
-- The worker is one process serving every tenant, so the draft a professional
-- is waiting on may well be behind another clinic's recording. A per-tenant
-- count would answer "nobody is ahead of you" and then take forty minutes,
-- which is worse than saying nothing at all.
--
-- Same shape and same reasoning as platform_org_activation() in 000073: one
-- SECURITY DEFINER read that returns aggregates only — how many jobs, how many
-- bytes, and a median. No row, no organization, no patient, nothing encrypted.
-- A caller learns how busy the shared worker is and nothing about whose work is
-- in it. Granting it to sghcp_app adds no reachable privilege: anything running
-- as sghcp_app can already set app.current_org to any organization.
--
-- A RUNNING job counts as a whole job because nothing records when it started.
-- The estimate therefore leans long, which is the right direction to lean: an
-- ETA that passes and leaves the spinner turning is worse than one that beats
-- itself.
CREATE OR REPLACE FUNCTION ai_queue_estimate(p_draft_id uuid)
RETURNS TABLE (
  jobs_ahead    integer,   -- drafts queued or running before this one
  bytes_ahead   bigint,    -- audio of those, summed where it is known
  unknown_ahead integer,   -- how many of those carry no byte count
  own_bytes     bigint,    -- this draft's audio, 0 when unknown
  p50_rtf       numeric    -- median observed real-time factor, NULL if too few
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, created_at, COALESCE(audio_bytes, 0) AS bytes
    FROM ai_drafts WHERE id = p_draft_id
  ),
  ahead AS (
    -- (created_at, id) rather than created_at alone: two drafts created in the
    -- same millisecond would otherwise each count the other as ahead, and the
    -- two professionals would both be quoted the longer wait.
    SELECT d.audio_bytes
    FROM ai_drafts d, me
    WHERE d.status IN ('PENDING', 'PROCESSING')
      AND (d.created_at, d.id) < (me.created_at, me.id)
  )
  SELECT
    (SELECT COUNT(*)                             FROM ahead)::integer,
    (SELECT COALESCE(SUM(audio_bytes), 0)        FROM ahead)::bigint,
    (SELECT COUNT(*) FILTER (WHERE audio_bytes IS NULL) FROM ahead)::integer,
    (SELECT bytes FROM me),
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rtf)
     FROM (
       SELECT rtf FROM ai_drafts
       WHERE rtf IS NOT NULL AND transcribe_ms IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 50
     ) recent)
  FROM me;
$$;

GRANT EXECUTE ON FUNCTION ai_queue_estimate(uuid) TO sghcp_app;

-- The queue scan runs on every poll of every waiting draft (every 3 s per open
-- appointment page), so it must not be a sequential scan of the whole table.
CREATE INDEX IF NOT EXISTS idx_ai_drafts_queue
    ON ai_drafts (created_at, id)
    WHERE status IN ('PENDING', 'PROCESSING');
