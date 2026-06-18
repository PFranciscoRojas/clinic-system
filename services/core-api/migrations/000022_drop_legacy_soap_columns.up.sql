-- The legacy v1 SOAP storage (subjective/objective/assessment/plan) is gone:
-- clinical records are stored only as the encrypted section payload (v2,
-- template_version = 2). Drop the now-unused encrypted columns.
ALTER TABLE clinical_records
    DROP COLUMN IF EXISTS subjective_enc,
    DROP COLUMN IF EXISTS objective_enc,
    DROP COLUMN IF EXISTS assessment_enc,
    DROP COLUMN IF EXISTS plan_enc;
