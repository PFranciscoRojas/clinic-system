-- Distinguishes a record that was only ever autosaved (never passed strict
-- validation) from one that was actually authored/finalized by the
-- professional. NULL = autosave draft in progress; NOT NULL = the real,
-- legally-meaningful note (created or finalized through the validated path).
ALTER TABLE clinical_records ADD COLUMN finalized_at timestamptz;

-- Every pre-existing record was created through the strict path, so it is
-- finalized as of its creation.
UPDATE clinical_records SET finalized_at = created_at WHERE finalized_at IS NULL;
