-- What is left to transcribe, once the session transcribed itself.
--
-- Fase 4, rebanada 4. Until now every draft was a whole recording: the worker
-- got a file and turned all of it into text. With window transcription on, most
-- of that text already exists by the time "Finalizar sesión" is pressed, and the
-- job only has the tail to do. Two numbers stop meaning what they meant.

-- 1. Which upload produced this take.
--
-- The link between a draft and the partial transcript it should absorb. It is
-- also how the queue estimate below finds out that a draft ahead of you is not
-- an hour of work — the audio may be an hour, but fifty minutes of it are
-- already text.
--
-- Nullable, and stays NULL for a recording picked from the file browser: that
-- one really is a whole file with nothing done to it yet.
ALTER TABLE ai_drafts ADD COLUMN upload_id UUID;

-- 2. How much audio this job actually put through Whisper.
--
-- `audio_seconds` keeps meaning what it always meant — how long the recording
-- is — because that is the number every earlier measurement in
-- docs/ai/PLAN_LATENCIA_AUDIO.md was taken with, and quietly redefining it
-- would make the before/after comparison the whole plan rests on compare two
-- different things.
--
-- This is the other one: the seconds of audio this run was given. Equal to
-- audio_seconds when nothing was transcribed in advance, much smaller when the
-- windows did their job.
ALTER TABLE ai_drafts ADD COLUMN transcribed_seconds NUMERIC(10,2);

ALTER TABLE ai_drafts
    ADD CONSTRAINT ai_drafts_transcribed_seconds_nonneg
    CHECK (transcribed_seconds IS NULL OR transcribed_seconds >= 0);

-- 3. The RTF has to divide by the work, not by the recording.
--
-- This is the column the Fase 3 decision rests on, and the one the queue
-- estimate reads to predict how long the next transcription will take. Left
-- dividing by audio_seconds, a tail-only run would report transcribing an hour
-- in forty seconds — an RTF of 0.01 — and every ETA on screen would inherit it
-- and quote a tenth of the real wait. Confidently, and in the direction nobody
-- reports as a bug.
--
-- Dropped and re-added rather than altered: a generated column's expression
-- cannot be changed in place. Nothing is lost, the values are derived.
ALTER TABLE ai_drafts DROP COLUMN rtf;
ALTER TABLE ai_drafts
    ADD COLUMN rtf NUMERIC GENERATED ALWAYS AS (
        (transcribe_ms::numeric / 1000)
        / NULLIF(COALESCE(transcribed_seconds, audio_seconds), 0)
    ) STORED;

-- 4. The queue estimate has to subtract what is already text.
--
-- Same function as migration 000076, plus two columns. It reports the covered
-- milliseconds rather than converting them to bytes itself: the bytes-per-second
-- of the recorder is one constant, it lives in Go next to the rest of the
-- arithmetic, and a second copy of it in SQL is a second copy to keep in step.
DROP FUNCTION IF EXISTS ai_queue_estimate(uuid);

CREATE FUNCTION ai_queue_estimate(p_draft_id uuid)
RETURNS TABLE (
  jobs_ahead      integer,
  bytes_ahead     bigint,
  unknown_ahead   integer,
  own_bytes       bigint,
  p50_rtf         numeric,
  covered_ms_ahead bigint,
  own_covered_ms   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (
    SELECT d.id, d.created_at,
           COALESCE(d.audio_bytes, 0) AS bytes,
           COALESCE(p.covered_ms, 0)  AS covered_ms
    FROM ai_drafts d
    LEFT JOIN partial_transcripts p
           ON p.organization_id = d.organization_id
          AND p.appointment_id  = d.appointment_id
          AND p.upload_id       = d.upload_id
    WHERE d.id = p_draft_id
  ),
  ahead AS (
    SELECT d.audio_bytes, COALESCE(p.covered_ms, 0) AS covered_ms
    FROM ai_drafts d
    LEFT JOIN partial_transcripts p
           ON p.organization_id = d.organization_id
          AND p.appointment_id  = d.appointment_id
          AND p.upload_id       = d.upload_id
    CROSS JOIN me
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
           ORDER BY created_at DESC LIMIT 50) recent),
    -- Only from the drafts whose size is known: subtracting covered audio from
    -- a draft that is being charged the default session length would take the
    -- estimate below the work that is actually left.
    (SELECT COALESCE(SUM(covered_ms) FILTER (WHERE audio_bytes IS NOT NULL), 0) FROM ahead)::bigint,
    (SELECT covered_ms FROM me)
  FROM me;
$$;

GRANT EXECUTE ON FUNCTION ai_queue_estimate(uuid) TO sghcp_app;

-- The join above is by (organization_id, appointment_id, upload_id), which the
-- partial's own unique constraint already indexes. This is for the other side:
-- finding the draft of an upload, which the worker does once per job.
CREATE INDEX idx_ai_drafts_upload ON ai_drafts (upload_id) WHERE upload_id IS NOT NULL;
