-- 000071_ai_drafts_immutable_after_approval.down.sql

DROP TRIGGER IF EXISTS trg_ai_drafts_immutable_after_approval ON ai_drafts;
DROP FUNCTION IF EXISTS ai_drafts_reject_post_approval_change();
