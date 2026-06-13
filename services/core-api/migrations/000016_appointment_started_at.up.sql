-- The session timer counts down from the moment the professional actually
-- starts the session, not from the scheduled slot.
ALTER TABLE appointments ADD COLUMN started_at TIMESTAMPTZ;
