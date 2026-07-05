-- PostgreSQL cannot remove a value from an ENUM type. Intentional no-op:
-- rolling back would require recreating ai_draft_status and rewriting ai_drafts.
SELECT 1;
