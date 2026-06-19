-- Persist the patient's emergency contact, which the new-patient form collected
-- but the backend silently dropped (no column existed). Stored as a single
-- encrypted blob (AES-256-GCM with the patient DEK) holding a JSON object
-- {name, phone, relationship} — one column keeps the read/scan paths simple and
-- the data is PII, so it is encrypted like every other patient field.
ALTER TABLE patients ADD COLUMN emergency_contact_enc BYTEA;
