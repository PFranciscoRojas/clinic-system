-- Point a SUPERSEDED draft at the consolidated draft that absorbed it, so a
-- stale link (an old "draft ready" notification, a bookmarked review page) can
-- redirect the professional to the single, complete draft instead of a dead one.
ALTER TABLE ai_drafts ADD COLUMN superseded_by UUID REFERENCES ai_drafts(id);
