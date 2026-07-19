-- 000067 down: data migration, intentionally irreversible.
--
-- The up migration archived the widget-bearing template versions and created
-- converted successors — the archived rows are untouched history, so nothing
-- is lost, but automatically re-activating them would demote the converted
-- versions professionals may already have edited or recorded against.
-- If a rollback is ever genuinely needed, re-activate the archived version
-- by hand for the specific template involved.
SELECT 1;
