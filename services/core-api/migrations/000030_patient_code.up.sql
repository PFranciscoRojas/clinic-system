-- Human-friendly consecutive clinical-history number (Nº de HC), assigned per
-- organization when a patient is registered — one HC per patient. Stored as a
-- plain integer and rendered as HC-000001 in the UI. The clinical history's
-- "Fecha de apertura" is the patient's created_at, so no extra column is needed.
ALTER TABLE patients ADD COLUMN patient_code INTEGER;

-- No two patients in the same org may share an HC number.
CREATE UNIQUE INDEX idx_patient_code_per_org
    ON patients (organization_id, patient_code)
    WHERE patient_code IS NOT NULL;

-- Backfill existing patients: number them per org by registration order so the
-- HC sequence is continuous and matches how they were opened. patients has
-- FORCE ROW LEVEL SECURITY (migration 000018), which would filter this UPDATE to
-- zero rows since no app.current_org GUC is set during migrations — so lift FORCE
-- for the duration of the backfill, then restore it.
ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;

WITH numbered AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn
    FROM patients
)
UPDATE patients p
SET patient_code = n.rn
FROM numbered n
WHERE p.id = n.id;

ALTER TABLE patients FORCE ROW LEVEL SECURITY;
