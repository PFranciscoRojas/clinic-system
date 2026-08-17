-- Where a session's transcript accumulates while the session is still running.
--
-- Today every second of Whisper work happens after "Finalizar sesión": the
-- parts have been arriving once a minute since the recording started, and the
-- box does not touch a single one of them until the professional has already
-- left the room. That is the whole of the latency problem — not a shortage of
-- CPU (the box transcribes ~8 audio-hours per wall-clock hour, and five
-- simultaneous professionals only produce five), but all of the work bunched
-- into one instant. Spreading it across the session it belongs to fixes it on
-- the hardware we already have. See docs/ai/PLAN_LATENCIA_AUDIO.md, Fase 4.
--
-- This table is where a window job leaves what it transcribed so that the job
-- at "Finalizar" only has the tail left to do.
--
-- Deliberately NOT a column on ai_drafts, for two reasons that are each enough
-- on their own:
--
--   1. The draft row does not exist yet. It is created at /audio/complete, out
--      of the take that assembleParts produces — an hour after the first part
--      landed.
--   2. Take consolidation (_prior_transcriptions in the worker) walks every
--      DRAFT_READY draft on the appointment and folds their transcriptions into
--      the newest one. A half-session sitting on a draft-shaped row is exactly
--      the thing that logic would mistake for an earlier take and splice into
--      the note twice.
--
-- The row is ephemeral by construction: created when the first part of an
-- upload arrives, deleted when the draft absorbs it, and swept when nobody ever
-- finished the session.
CREATE TABLE partial_transcripts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    -- ON DELETE CASCADE, unlike ai_drafts.appointment_id, because this row is
    -- scratch space and must never be the reason an appointment cannot be
    -- deleted. The admin purge paths delete it explicitly anyway; the cascade
    -- is what covers the next path somebody writes and forgets.
    appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    -- Minted by the browser, the same id the parts on disk are named after.
    -- UUID rather than TEXT so a client-controlled value cannot be anything
    -- else. Not unique on its own: a global unique would turn a collision into
    -- a cross-tenant existence oracle (INSERT fails ⇒ that id exists somewhere).
    upload_id        UUID NOT NULL,
    -- Its own DEK, minted by core-api like a draft's. The worker only ever
    -- decrypts it, so nothing in Python has to learn how to mint one.
    dek_id           UUID NOT NULL REFERENCES encryption_keys(id),
    -- The session so far, AES-256-GCM under that DEK. NULL until the first
    -- window finishes.
    transcript_enc   BYTEA,
    -- How many parts existed when the last window ran. Lets core-api decide
    -- that enough new audio has arrived to be worth another window, without
    -- re-deriving it from the filesystem.
    covered_parts    INTEGER NOT NULL DEFAULT 0,
    -- How many milliseconds of the decoded session transcript_enc covers. This
    -- is the authoritative cut point, not covered_parts: a window is cut at
    -- silence, which does not land on a part boundary.
    covered_ms       BIGINT  NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT partial_transcripts_one_per_upload
        UNIQUE (organization_id, appointment_id, upload_id),

    CONSTRAINT partial_transcripts_progress_nonneg
        CHECK (covered_parts >= 0 AND covered_ms >= 0),

    -- The invariant that protects the note itself. If a row could claim covered
    -- audio while holding no text, the tail-only pass at /audio/complete would
    -- start after minutes it has no words for, and what comes out is a perfectly
    -- fluent note describing a conversation with a hole in it. Nothing
    -- downstream would ever notice.
    CONSTRAINT partial_transcripts_covered_audio_has_text
        CHECK (covered_ms = 0 OR transcript_enc IS NOT NULL)
);

-- The sweep below is the only query that does not go through the unique
-- constraint's index.
CREATE INDEX idx_partial_transcripts_updated ON partial_transcripts (updated_at);

ALTER TABLE partial_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partial_transcripts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON partial_transcripts
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON partial_transcripts TO sghcp_app;
