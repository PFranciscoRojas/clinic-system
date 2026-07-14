-- A session recording can transcribe to nothing (silence, mic failure).
-- Storing that as DRAFT_READY created a phantom "draft" the professional was
-- pushed to review; EMPTY is terminal: hidden from the review list, never
-- approvable, and the session counts as note-less in pending-notes.
ALTER TYPE ai_draft_status ADD VALUE IF NOT EXISTS 'EMPTY';
