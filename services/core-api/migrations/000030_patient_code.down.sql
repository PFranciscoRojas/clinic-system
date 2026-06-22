DROP INDEX IF EXISTS idx_patient_code_per_org;
ALTER TABLE patients DROP COLUMN IF EXISTS patient_code;
