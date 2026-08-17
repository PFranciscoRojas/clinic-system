-- A partial transcript may only ever move forward.
--
-- The window jobs of Fase 4 arrive through a Redis Streams consumer group, and
-- a consumer group's redelivery is not ordered. A job that covered the first
-- five minutes can be reclaimed from the PEL and re-run after the job that
-- covered the first twenty already finished — a crash mid-job, a missed ack, a
-- reclaim window that elapsed. If that late arrival is allowed to write, it
-- replaces twenty minutes of session with five and moves the cut point back to
-- match. The next window then starts from the earlier cut and re-transcribes
-- what it already had, so the text even looks plausible: what is missing is
-- fifteen minutes in the middle, and nothing downstream is in a position to
-- notice.
--
-- The writer guards itself with `WHERE covered_ms < $n`, which makes the losing
-- job a no-op rather than an error — the ordinary case, and the right shape for
-- it. This trigger is for the writer that does not: it never fires on a guarded
-- UPDATE, because that one matches no rows at all.
CREATE FUNCTION partial_transcripts_advance_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.covered_ms < OLD.covered_ms OR NEW.covered_parts < OLD.covered_parts THEN
        RAISE EXCEPTION
            'partial transcript would go backwards (covered_ms % -> %, covered_parts % -> %)',
            OLD.covered_ms, NEW.covered_ms, OLD.covered_parts, NEW.covered_parts;
    END IF;

    -- updated_at means "when this session last made progress", which is what
    -- the sweep reads to decide the upload was abandoned. Touched here rather
    -- than trusted to every writer, and only on actual progress: an
    -- administrative UPDATE that changes neither the cut nor the text must not
    -- keep a dead session alive for another twelve hours.
    IF NEW.covered_ms > OLD.covered_ms
       OR NEW.transcript_enc IS DISTINCT FROM OLD.transcript_enc THEN
        NEW.updated_at := now();
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER partial_transcripts_advance_only
    BEFORE UPDATE ON partial_transcripts
    FOR EACH ROW EXECUTE FUNCTION partial_transcripts_advance_only();
