DROP TABLE patient_diagnoses;
DROP TABLE icd10_codes;
DROP TYPE diagnosis_status;
DROP TYPE diagnosis_type;

DROP INDEX idx_cr_patient_risk;
ALTER TABLE clinical_records
    DROP COLUMN template_version,
    DROP COLUMN sections_enc,
    DROP COLUMN risk_level,
    DROP COLUMN discharge_reason;

DROP TYPE discharge_reason;
DROP TYPE risk_level;
