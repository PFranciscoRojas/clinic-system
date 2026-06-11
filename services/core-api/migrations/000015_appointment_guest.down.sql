BEGIN;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_or_guest_chk;
DELETE FROM appointments WHERE patient_id IS NULL;
ALTER TABLE appointments ALTER COLUMN patient_id SET NOT NULL;
ALTER TABLE appointments DROP COLUMN IF EXISTS guest_name;
COMMIT;
