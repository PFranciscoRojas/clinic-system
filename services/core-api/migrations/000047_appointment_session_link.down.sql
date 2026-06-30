DROP INDEX IF EXISTS idx_cr_patient_session;
ALTER TABLE clinical_records DROP COLUMN IF EXISTS session_number;
DROP INDEX IF EXISTS idx_draft_appointment;
ALTER TABLE ai_drafts DROP COLUMN IF EXISTS appointment_id;
