-- Psychology-native clinical record templates (template v2) + structured
-- risk and ICD-10 diagnoses. Existing SOAP records remain readable as
-- template_version = 1; v2 records store their sections as one encrypted
-- JSON blob so future format changes never require a schema migration.

CREATE TYPE risk_level AS ENUM ('NONE', 'IDEATION', 'PLAN', 'ATTEMPT');
CREATE TYPE discharge_reason AS ENUM (
    'THERAPEUTIC_DISCHARGE', 'DROPOUT', 'REFERRAL', 'MUTUAL_AGREEMENT'
);

ALTER TABLE clinical_records
    ADD COLUMN template_version SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN sections_enc     BYTEA,
    ADD COLUMN risk_level       risk_level,
    ADD COLUMN discharge_reason discharge_reason;

-- Latest documented risk per patient drives the profile badge and future alerts.
CREATE INDEX idx_cr_patient_risk
    ON clinical_records(patient_id, session_date DESC)
    WHERE risk_level IS NOT NULL;

-- ── ICD-10 reference catalog ──────────────────────────────────────────────────
-- Public reference data (plaintext by design). Seeded with the subset relevant
-- to an outpatient psychology practice; extend with INSERTs, no migration needed.
CREATE TABLE icd10_codes (
    code        TEXT    PRIMARY KEY,
    description TEXT    NOT NULL,
    chapter     TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TYPE diagnosis_type   AS ENUM ('PRINCIPAL', 'RELATED');
CREATE TYPE diagnosis_status AS ENUM ('ACTIVE', 'RESOLVED', 'RULED_OUT');

CREATE TABLE patient_diagnoses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organizations(id),
    patient_id         UUID NOT NULL REFERENCES patients(id),
    staff_id           UUID NOT NULL REFERENCES users(id),
    clinical_record_id UUID REFERENCES clinical_records(id),
    icd10_code         TEXT NOT NULL REFERENCES icd10_codes(code),
    diagnosis_type     diagnosis_type   NOT NULL DEFAULT 'PRINCIPAL',
    status             diagnosis_status NOT NULL DEFAULT 'ACTIVE',
    diagnosed_at       DATE NOT NULL DEFAULT CURRENT_DATE,
    resolved_at        DATE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pd_org     ON patient_diagnoses(organization_id);
CREATE INDEX idx_pd_patient ON patient_diagnoses(patient_id, status);
CREATE INDEX idx_pd_code    ON patient_diagnoses(icd10_code);

ALTER TABLE patient_diagnoses ENABLE ROW LEVEL SECURITY;

-- ── Seed: ICD-10 chapter V (F) subset + frequent Z codes, Spanish labels ──────
INSERT INTO icd10_codes (code, description, chapter) VALUES
    ('F32.0', 'Episodio depresivo leve', 'F30-F39'),
    ('F32.1', 'Episodio depresivo moderado', 'F30-F39'),
    ('F32.2', 'Episodio depresivo grave sin síntomas psicóticos', 'F30-F39'),
    ('F32.3', 'Episodio depresivo grave con síntomas psicóticos', 'F30-F39'),
    ('F32.9', 'Episodio depresivo, no especificado', 'F30-F39'),
    ('F33.0', 'Trastorno depresivo recurrente, episodio leve actual', 'F30-F39'),
    ('F33.1', 'Trastorno depresivo recurrente, episodio moderado actual', 'F30-F39'),
    ('F33.2', 'Trastorno depresivo recurrente, episodio grave actual sin síntomas psicóticos', 'F30-F39'),
    ('F34.1', 'Distimia', 'F30-F39'),
    ('F31.9', 'Trastorno afectivo bipolar, no especificado', 'F30-F39'),
    ('F41.0', 'Trastorno de pánico (ansiedad paroxística episódica)', 'F40-F48'),
    ('F41.1', 'Trastorno de ansiedad generalizada', 'F40-F48'),
    ('F41.2', 'Trastorno mixto de ansiedad y depresión', 'F40-F48'),
    ('F41.9', 'Trastorno de ansiedad, no especificado', 'F40-F48'),
    ('F40.0', 'Agorafobia', 'F40-F48'),
    ('F40.1', 'Fobias sociales', 'F40-F48'),
    ('F40.2', 'Fobias específicas (aisladas)', 'F40-F48'),
    ('F42.9', 'Trastorno obsesivo-compulsivo, no especificado', 'F40-F48'),
    ('F43.0', 'Reacción al estrés agudo', 'F40-F48'),
    ('F43.1', 'Trastorno de estrés postraumático', 'F40-F48'),
    ('F43.2', 'Trastornos de adaptación', 'F40-F48'),
    ('F43.21', 'Trastorno de adaptación con reacción depresiva prolongada', 'F40-F48'),
    ('F43.22', 'Trastorno de adaptación con reacción mixta de ansiedad y depresión', 'F40-F48'),
    ('F45.9', 'Trastorno somatomorfo, no especificado', 'F40-F48'),
    ('F48.0', 'Neurastenia (síndrome de fatiga)', 'F40-F48'),
    ('F50.0', 'Anorexia nerviosa', 'F50-F59'),
    ('F50.2', 'Bulimia nerviosa', 'F50-F59'),
    ('F50.9', 'Trastorno de la conducta alimentaria, no especificado', 'F50-F59'),
    ('F51.0', 'Insomnio no orgánico', 'F50-F59'),
    ('F51.5', 'Pesadillas', 'F50-F59'),
    ('F52.9', 'Disfunción sexual no debida a enfermedad ni a trastorno orgánico', 'F50-F59'),
    ('F60.3', 'Trastorno de inestabilidad emocional de la personalidad', 'F60-F69'),
    ('F60.9', 'Trastorno de la personalidad, no especificado', 'F60-F69'),
    ('F90.0', 'Perturbación de la actividad y de la atención (TDAH)', 'F90-F98'),
    ('F84.0', 'Autismo en la niñez', 'F80-F89'),
    ('F84.5', 'Síndrome de Asperger', 'F80-F89'),
    ('F93.0', 'Trastorno de ansiedad de separación en la niñez', 'F90-F98'),
    ('F94.0', 'Mutismo electivo', 'F90-F98'),
    ('F98.0', 'Enuresis no orgánica', 'F90-F98'),
    ('F10.1', 'Uso nocivo de alcohol', 'F10-F19'),
    ('F10.2', 'Síndrome de dependencia del alcohol', 'F10-F19'),
    ('F12.1', 'Uso nocivo de cannabinoides', 'F10-F19'),
    ('F17.2', 'Síndrome de dependencia del tabaco', 'F10-F19'),
    ('F19.1', 'Uso nocivo de múltiples drogas y otras sustancias psicoactivas', 'F10-F19'),
    ('F20.9', 'Esquizofrenia, no especificada', 'F20-F29'),
    ('F23.9', 'Trastorno psicótico agudo y transitorio, no especificado', 'F20-F29'),
    ('F06.7', 'Trastorno cognoscitivo leve', 'F00-F09'),
    ('F70.9', 'Retraso mental leve, deterioro del comportamiento nulo o mínimo', 'F70-F79'),
    ('F95.9', 'Trastorno de tics, no especificado', 'F90-F98'),
    ('F99', 'Trastorno mental, no especificado', 'F99'),
    ('Z63.0', 'Problemas en la relación entre esposos o pareja', 'Z55-Z65'),
    ('Z63.4', 'Desaparición o muerte de un miembro de la familia (duelo)', 'Z55-Z65'),
    ('Z63.7', 'Otros hechos estresantes que afectan a la familia y al hogar', 'Z55-Z65'),
    ('Z73.0', 'Agotamiento (burnout)', 'Z70-Z76'),
    ('Z73.1', 'Acentuación de rasgos de la personalidad', 'Z70-Z76'),
    ('Z73.3', 'Estrés, no clasificado en otra parte', 'Z70-Z76'),
    ('Z56.9', 'Problema no especificado relacionado con el empleo', 'Z55-Z65'),
    ('Z60.0', 'Problemas de adaptación a las transiciones del ciclo vital', 'Z55-Z65'),
    ('Z61.0', 'Pérdida de relación afectiva en la infancia', 'Z55-Z65'),
    ('Z65.9', 'Problema no especificado relacionado con circunstancias psicosociales', 'Z55-Z65');
