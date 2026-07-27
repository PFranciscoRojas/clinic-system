-- 000071_ai_drafts_immutable_after_approval.up.sql
--
-- Enforces the last unenforced half of CLAUDE.md rule 5: "los borradores IA
-- (ai_drafts) son inmutables — el profesional aprueba explícitamente". Until
-- now that was prose. Nothing in the database stopped an UPDATE from rewriting
-- the text a professional had already approved and signed off on, which is the
-- clinical record's provenance: what the AI produced must be exactly what the
-- human accepted, forever.
--
-- The rule is scoped to APPROVED because a draft is legitimately mutable
-- before that point. Every existing write path stays valid:
--
--   * worker.py fills transcription_enc/draft_content_enc while the row is
--     PENDING or PROCESSING, moving it to DRAFT_READY.
--   * worker.py marks a row EMPTY or ERROR, also pre-approval.
--   * _supersede_drafts nulls the content of earlier takes, but its selection
--     query filters on status = 'DRAFT_READY', so it never reaches an
--     approved row.
--   * aidrafts/repository/resolve.go sets APPROVED from
--     DRAFT_READY/PENDING/PROCESSING and never touches the content columns —
--     OLD.status is not yet APPROVED when it runs, so the trigger allows it.
--
-- Retention still works: the delete_after sweep DELETEs rows, and this trigger
-- only guards UPDATE.

CREATE OR REPLACE FUNCTION ai_drafts_reject_post_approval_change()
RETURNS trigger AS $$
BEGIN
    IF OLD.status <> 'APPROVED' THEN
        RETURN NEW;
    END IF;

    IF NEW.draft_content_enc IS DISTINCT FROM OLD.draft_content_enc THEN
        RAISE EXCEPTION 'ai_drafts: draft_content_enc is immutable once APPROVED (draft %)', OLD.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.transcription_enc IS DISTINCT FROM OLD.transcription_enc THEN
        RAISE EXCEPTION 'ai_drafts: transcription_enc is immutable once APPROVED (draft %)', OLD.id
            USING ERRCODE = '23514';
    END IF;

    -- Re-approving, un-approving or superseding an approved draft would break
    -- the link between the record and the text that was actually accepted.
    IF NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'ai_drafts: status cannot change once APPROVED (draft %, attempted %)', OLD.id, NEW.status
            USING ERRCODE = '23514';
    END IF;

    IF NEW.clinical_record_id IS DISTINCT FROM OLD.clinical_record_id THEN
        RAISE EXCEPTION 'ai_drafts: clinical_record_id is immutable once APPROVED (draft %)', OLD.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_drafts_immutable_after_approval
    BEFORE UPDATE ON ai_drafts
    FOR EACH ROW
    EXECUTE FUNCTION ai_drafts_reject_post_approval_change();
