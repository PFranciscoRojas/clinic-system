-- Appointments no longer require a registered patient at booking time:
-- the slot can be reserved with just a name (guest_name) and the patient
-- is associated later, at the first consultation.
BEGIN;

ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE appointments ADD COLUMN guest_name TEXT;

-- Every appointment must identify who it is for, one way or the other.
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_or_guest_chk
    CHECK (patient_id IS NOT NULL OR guest_name IS NOT NULL);

COMMIT;
