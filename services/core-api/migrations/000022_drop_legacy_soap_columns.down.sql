ALTER TABLE clinical_records
    ADD COLUMN subjective_enc BYTEA,
    ADD COLUMN objective_enc  BYTEA,
    ADD COLUMN assessment_enc BYTEA,
    ADD COLUMN plan_enc        BYTEA;
