-- A session can be recorded in several takes (a power cut mid-session, an F5,
-- then a fresh recording). Each upload creates its own ai_draft; the AI worker
-- now folds the earlier takes' transcriptions into the newest draft so one
-- draft covers the whole session, and marks the superseded takes with this
-- status so they drop out of the review list and can never be approved.
ALTER TYPE ai_draft_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';
