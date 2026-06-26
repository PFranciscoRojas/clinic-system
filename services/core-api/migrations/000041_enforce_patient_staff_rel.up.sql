-- Backfill patient_staff_rel from appointments: every professional who had or has
-- a scheduled/active session with a patient becomes PRIMARY_THERAPIST.
-- Going forward, appointment creation auto-inserts this row (see repository/create.go).
INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
SELECT DISTINCT organization_id, patient_id, staff_id, 'PRIMARY_THERAPIST'::staff_relation_type
FROM appointments
WHERE patient_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill supervisors from clinical records that required co-sign.
INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
SELECT DISTINCT organization_id, patient_id, supervisor_id, 'SUPERVISING'::staff_relation_type
FROM clinical_records
WHERE supervisor_id IS NOT NULL AND requires_cosign = TRUE
ON CONFLICT DO NOTHING;
