-- Link ai_drafts directly to the appointment that triggered the upload.
ALTER TABLE ai_drafts ADD COLUMN appointment_id UUID REFERENCES appointments(id);
CREATE INDEX idx_draft_appointment ON ai_drafts(appointment_id);

-- Reserve a per-patient consecutive session number at DRAFT creation time
-- (not just at APPROVED), so two drafts/records can never occupy the same slot.
ALTER TABLE clinical_records ADD COLUMN session_number SMALLINT;

-- Backfill: assign sequential numbers by creation order per patient.
UPDATE clinical_records cr
SET session_number = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY created_at) AS rn
  FROM clinical_records
) sub
WHERE cr.id = sub.id;

-- Unique index prevents two records for the same patient from sharing a number.
CREATE UNIQUE INDEX idx_cr_patient_session
  ON clinical_records(patient_id, session_number)
  WHERE session_number IS NOT NULL;
