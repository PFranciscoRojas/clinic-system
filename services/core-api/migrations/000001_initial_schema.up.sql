-- Migration 000001: initial schema
-- All DDL from docs/data-models/schema.md

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ── ENUMs ────────────────────────────────────────────────────────────────────
CREATE TYPE plan_tier AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE license_state AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE appointment_modality AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');
CREATE TYPE appointment_status AS ENUM (
    'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'
);
CREATE TYPE record_type AS ENUM ('INITIAL', 'EVOLUTION', 'DISCHARGE', 'INTERCONSULTATION');
CREATE TYPE record_status AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE ai_draft_status AS ENUM (
    'PENDING', 'PROCESSING', 'DRAFT_READY', 'APPROVED', 'REJECTED', 'ERROR'
);
CREATE TYPE consent_type AS ENUM (
    'TREATMENT', 'RECORDING', 'DATA_PROCESSING', 'INFORMATION_SHARING'
);
CREATE TYPE consent_signing_method AS ENUM ('DIGITAL', 'PHYSICAL_SCAN');
CREATE TYPE staff_relation_type AS ENUM (
    'PRIMARY_THERAPIST', 'SECONDARY_THERAPIST', 'SUPERVISING', 'INTERN_TRAINEE', 'REFERRING'
);
CREATE TYPE invoice_status AS ENUM (
    'DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'INSURED', 'CANCELLED'
);
CREATE TYPE payment_method_type AS ENUM (
    'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER',
    'NEQUI', 'DAVIPLATA', 'PSE', 'INSURANCE_EPS', 'INSURANCE_PRIVATE', 'OTHER'
);
CREATE TYPE treatment_plan_status AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONTINUED');

-- ── Reference tables ─────────────────────────────────────────────────────────
CREATE TABLE document_types (
    code            TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    country_code    CHAR(2) NOT NULL DEFAULT 'CO',
    requires_expiry BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO document_types (code, name, requires_expiry) VALUES
    ('CC',  'Cédula de Ciudadanía',           FALSE),
    ('CE',  'Cédula de Extranjería',          TRUE),
    ('PA',  'Pasaporte',                      TRUE),
    ('TI',  'Tarjeta de Identidad',           FALSE),
    ('RC',  'Registro Civil de Nacimiento',   FALSE),
    ('PEP', 'Permiso Especial de Permanencia',TRUE),
    ('PPT', 'Permiso de Protección Temporal', TRUE),
    ('NIT', 'NIT (persona jurídica)',         FALSE);

CREATE TABLE specialties (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO specialties (code, name) VALUES
    ('PSI_CLI', 'Psicología Clínica'),
    ('PSI_NEU', 'Neuropsicología'),
    ('PSI_INF', 'Psicología Infantil y del Adolescente'),
    ('PSI_FOR', 'Psicología Forense'),
    ('PSI_ORG', 'Psicología Organizacional'),
    ('PSI_GEN', 'Psicología General'),
    ('MED_GEN', 'Medicina General'),
    ('NUT',     'Nutrición y Dietética'),
    ('TO',      'Terapia Ocupacional'),
    ('FIS',     'Fisioterapia');

-- ── BC-1: Organización & Auth ─────────────────────────────────────────────────
CREATE TABLE organizations (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT      NOT NULL,
    slug        TEXT      NOT NULL UNIQUE,
    nit         TEXT      UNIQUE,
    plan        plan_tier NOT NULL DEFAULT 'STARTER',
    is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
    features    JSONB     NOT NULL DEFAULT '{}',
    settings    JSONB     NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id),
    email           TEXT    NOT NULL,
    email_hash      TEXT    NOT NULL,
    password_hash   TEXT    NOT NULL,
    mfa_secret_enc  BYTEA,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, email_hash)
);

CREATE INDEX idx_users_org        ON users(organization_id);
CREATE INDEX idx_users_email_hash ON users(organization_id, email_hash);

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name            TEXT NOT NULL,
    description     TEXT,
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

INSERT INTO roles (name, description, is_system_role) VALUES
    ('SYSTEM_ADMIN',  'Acceso completo. Gestiona organizaciones.',              TRUE),
    ('CLINIC_ADMIN',  'Admin de la organización. Gestiona usuarios y config.',  TRUE),
    ('PROFESSIONAL',  'Acceso clínico completo a sus pacientes asignados.',     TRUE),
    ('INTERN',        'Acceso supervisado. Puede crear borradores, no aprobar.',TRUE),
    ('RECEPTIONIST',  'Agenda y registro de pacientes. Sin acceso clínico.',    TRUE),
    ('PATIENT',       'Portal del paciente. Solo sus propios datos.',           TRUE);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    description TEXT,
    module      TEXT NOT NULL DEFAULT 'core'
);

INSERT INTO permissions (code, description, module) VALUES
    ('organization:read',            'Ver configuración de la organización',       'core'),
    ('organization:configure',       'Modificar configuración de la organización', 'core'),
    ('users:read',                   'Ver listado de usuarios',                    'core'),
    ('users:create',                 'Crear usuarios',                             'core'),
    ('users:update',                 'Modificar usuarios',                         'core'),
    ('users:deactivate',             'Desactivar usuarios',                        'core'),
    ('patients:read',                'Ver pacientes asignados',                    'core'),
    ('patients:read_all',            'Ver todos los pacientes de la org',          'core'),
    ('patients:create',              'Registrar nuevos pacientes',                 'core'),
    ('patients:update',              'Modificar datos de pacientes',               'core'),
    ('clinical_records:read',        'Leer historias clínicas',                    'core'),
    ('clinical_records:create',      'Crear registros en borrador',                'core'),
    ('clinical_records:update',      'Editar borradores',                          'core'),
    ('clinical_records:approve',     'Aprobar y firmar registros oficiales',       'core'),
    ('clinical_records:cosign',      'Co-firmar registros de supervisados',        'core'),
    ('appointments:read',            'Ver citas',                                  'core'),
    ('appointments:create',          'Agendar citas',                              'core'),
    ('appointments:update',          'Modificar citas',                            'core'),
    ('appointments:cancel',          'Cancelar citas',                             'core'),
    ('consents:read',                'Ver consentimientos',                        'core'),
    ('consents:create',              'Generar documentos de consentimiento',       'core'),
    ('ai_drafts:request',            'Solicitar procesamiento de audio',           'core'),
    ('ai_drafts:review',             'Revisar y resolver borradores de IA',        'core'),
    ('audit_log:read',               'Consultar registros de auditoría',           'core'),
    ('assessments:read',             'Ver evaluaciones del paciente',              'core'),
    ('assessments:create',           'Aplicar instrumento psicométrico',           'core'),
    ('treatment_plans:read',         'Ver plan terapéutico del paciente',          'core'),
    ('treatment_plans:create',       'Crear plan terapéutico',                     'core'),
    ('treatment_plans:update',       'Modificar o cerrar plan terapéutico',        'core'),
    ('reports:read',                 'Ver reportes clínicos y de gestión',         'analytics'),
    ('reports:generate',             'Generar y exportar reportes',                'analytics'),
    ('analytics:read',               'Ver dashboards y reportes',                  'analytics'),
    ('inventory:read',               'Ver inventario',                             'inventory'),
    ('inventory:create',             'Agregar ítems al inventario',                'inventory'),
    ('inventory:update',             'Modificar inventario',                       'inventory'),
    ('inventory:delete',             'Eliminar ítems del inventario',              'inventory'),
    ('billing:read',                 'Ver facturas y pagos del paciente',          'billing'),
    ('billing:create',               'Generar facturas manualmente',               'billing'),
    ('billing:record_payment',       'Registrar un pago recibido',                 'billing'),
    ('billing:manage_rates',         'Gestionar tarifario de servicios',           'billing'),
    ('billing:manage_insurance',     'Gestionar datos de EPS/seguro del paciente', 'billing'),
    ('billing:reports',              'Ver reportes de ingresos y cartera',         'billing');

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    assigned_by     UUID REFERENCES users(id),
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

CREATE TABLE supervision_rel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    supervisor_id   UUID NOT NULL REFERENCES users(id),
    supervisee_id   UUID NOT NULL REFERENCES users(id),
    started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_supervision CHECK (supervisor_id <> supervisee_id)
);

CREATE UNIQUE INDEX idx_supervision_active ON supervision_rel(supervisee_id) WHERE ended_at IS NULL;
CREATE INDEX idx_supervision_supervisor ON supervision_rel(supervisor_id);

-- ── BC-2: Staff & Perfiles ────────────────────────────────────────────────────
CREATE TABLE professional_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    specialty_id         UUID NOT NULL REFERENCES specialties(id),
    first_name           TEXT NOT NULL,
    middle_name          TEXT,
    paternal_last_name   TEXT NOT NULL,
    maternal_last_name   TEXT,
    license_number       TEXT NOT NULL UNIQUE,
    license_state        license_state NOT NULL DEFAULT 'ACTIVE',
    phone                TEXT,
    session_duration_min INTEGER NOT NULL DEFAULT 60,
    working_hours        JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prof_specialty          ON professional_profiles(specialty_id);
CREATE INDEX idx_prof_paternal_last_name ON professional_profiles(paternal_last_name);
CREATE INDEX idx_prof_license            ON professional_profiles(license_number);

-- ── BC-3: Pacientes ───────────────────────────────────────────────────────────
CREATE TABLE encryption_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_dek BYTEA NOT NULL,
    key_source    TEXT  NOT NULL,   -- 'env:MASTER_KEY' | 'aws-kms:arn:...'
    algorithm     TEXT  NOT NULL DEFAULT 'AES-256-GCM',
    key_version   INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at    TIMESTAMPTZ
);

CREATE TABLE patients (
    id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           UUID    NOT NULL REFERENCES organizations(id),
    document_type_code        TEXT    NOT NULL REFERENCES document_types(code),
    dek_id                    UUID    NOT NULL REFERENCES encryption_keys(id),
    first_name_enc            BYTEA   NOT NULL,
    middle_name_enc           BYTEA,
    paternal_last_name_enc    BYTEA   NOT NULL,
    maternal_last_name_enc    BYTEA,
    paternal_last_name_hash   TEXT    NOT NULL,
    full_name_search_hash     TEXT    NOT NULL,
    document_number_enc       BYTEA   NOT NULL,
    doc_search_hash           TEXT    NOT NULL,
    phone_enc                 BYTEA,
    email_enc                 BYTEA,
    address_enc               BYTEA,
    birth_date                DATE    NOT NULL,
    gender                    TEXT,
    is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_org                ON patients(organization_id);
CREATE INDEX idx_patients_paternal_last_name ON patients(organization_id, paternal_last_name_hash);
CREATE INDEX idx_patients_full_name          ON patients(organization_id, full_name_search_hash);
CREATE INDEX idx_patients_doc                ON patients(organization_id, doc_search_hash);
CREATE INDEX idx_patients_doctype            ON patients(document_type_code);

CREATE TABLE patient_staff_rel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    staff_id        UUID NOT NULL REFERENCES users(id),
    relation_type   staff_relation_type NOT NULL,
    started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at        DATE,
    end_reason      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_psr_active_unique
    ON patient_staff_rel(patient_id, staff_id, relation_type)
    WHERE ended_at IS NULL;

CREATE INDEX idx_psr_patient ON patient_staff_rel(patient_id);
CREATE INDEX idx_psr_staff   ON patient_staff_rel(staff_id);
CREATE INDEX idx_psr_org     ON patient_staff_rel(organization_id);

-- ── BC-4: Agenda ──────────────────────────────────────────────────────────────
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    staff_id        UUID NOT NULL REFERENCES users(id),
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_min    INTEGER NOT NULL DEFAULT 60,
    modality        appointment_modality NOT NULL DEFAULT 'IN_PERSON',
    status          appointment_status   NOT NULL DEFAULT 'SCHEDULED',
    notes_enc       BYTEA,
    rescheduled_to  UUID REFERENCES appointments(id),
    cancelled_by    UUID REFERENCES users(id),
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appt_org          ON appointments(organization_id);
CREATE INDEX idx_appt_patient      ON appointments(patient_id);
CREATE INDEX idx_appt_staff        ON appointments(staff_id);
CREATE INDEX idx_appt_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appt_status       ON appointments(status);
CREATE INDEX idx_appt_daily
    ON appointments(staff_id, scheduled_at)
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED');

-- ── BC-5: Clínico ─────────────────────────────────────────────────────────────
CREATE TABLE clinical_records (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES organizations(id),
    patient_id             UUID NOT NULL REFERENCES patients(id),
    responsible_staff_id   UUID NOT NULL REFERENCES users(id),
    created_by             UUID NOT NULL REFERENCES users(id),
    appointment_id         UUID REFERENCES appointments(id),
    dek_id                 UUID NOT NULL REFERENCES encryption_keys(id),
    record_type            record_type   NOT NULL,
    session_date           DATE NOT NULL,
    subjective_enc         BYTEA,
    objective_enc          BYTEA,
    assessment_enc         BYTEA,
    plan_enc               BYTEA,
    audio_path_enc         BYTEA,
    audio_duration_s       INTEGER,
    status                 record_status NOT NULL DEFAULT 'DRAFT',
    approved_at            TIMESTAMPTZ,
    requires_cosign        BOOLEAN NOT NULL DEFAULT FALSE,
    supervisor_id          UUID REFERENCES users(id),
    supervisor_cosigned_at TIMESTAMPTZ,
    content_hash           TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cr_org          ON clinical_records(organization_id);
CREATE INDEX idx_cr_patient      ON clinical_records(patient_id);
CREATE INDEX idx_cr_responsible  ON clinical_records(responsible_staff_id);
CREATE INDEX idx_cr_created_by   ON clinical_records(created_by);
CREATE INDEX idx_cr_session_date ON clinical_records(session_date);
CREATE INDEX idx_cr_status       ON clinical_records(status);
CREATE INDEX idx_cr_appointment  ON clinical_records(appointment_id);
CREATE INDEX idx_cr_pending_cosign
    ON clinical_records(supervisor_id)
    WHERE requires_cosign = TRUE AND supervisor_cosigned_at IS NULL;

CREATE TABLE assessment_scales (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    code             TEXT    NOT NULL UNIQUE,
    name             TEXT    NOT NULL,
    description      TEXT,
    item_count       INTEGER NOT NULL,
    min_score        INTEGER NOT NULL DEFAULT 0,
    max_score        INTEGER NOT NULL,
    scoring_guide    JSONB   NOT NULL DEFAULT '[]',
    target_condition TEXT,
    is_system        BOOLEAN NOT NULL DEFAULT TRUE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO assessment_scales (code, name, item_count, min_score, max_score, target_condition, scoring_guide) VALUES
    ('PHQ9',  'Patient Health Questionnaire-9 (Depression)',   9,  0, 27, 'depression',
     '[{"min":0,"max":4,"label":"Minimal","severity":"low"},{"min":5,"max":9,"label":"Mild","severity":"low"},{"min":10,"max":14,"label":"Moderate","severity":"medium"},{"min":15,"max":19,"label":"Moderately Severe","severity":"high"},{"min":20,"max":27,"label":"Severe","severity":"critical"}]'),
    ('GAD7',  'Generalized Anxiety Disorder-7',               7,  0, 21, 'anxiety',
     '[{"min":0,"max":4,"label":"Minimal","severity":"low"},{"min":5,"max":9,"label":"Mild","severity":"low"},{"min":10,"max":14,"label":"Moderate","severity":"medium"},{"min":15,"max":21,"label":"Severe","severity":"high"}]'),
    ('BDI_II','Beck Depression Inventory-II',                 21, 0, 63, 'depression',
     '[{"min":0,"max":13,"label":"Minimal","severity":"low"},{"min":14,"max":19,"label":"Mild","severity":"low"},{"min":20,"max":28,"label":"Moderate","severity":"medium"},{"min":29,"max":63,"label":"Severe","severity":"high"}]'),
    ('PCL5',  'PTSD Checklist for DSM-5',                    20, 0, 80, 'ptsd',
     '[{"min":0,"max":32,"label":"Below threshold","severity":"low"},{"min":33,"max":80,"label":"Probable PTSD","severity":"high"}]'),
    ('MMSE',  'Mini-Mental State Examination',               30, 0, 30, 'cognition',
     '[{"min":25,"max":30,"label":"Normal","severity":"low"},{"min":18,"max":24,"label":"Mild impairment","severity":"medium"},{"min":0,"max":17,"label":"Severe impairment","severity":"high"}]');

CREATE TABLE patient_assessments (
    id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID    NOT NULL REFERENCES organizations(id),
    patient_id         UUID    NOT NULL REFERENCES patients(id),
    staff_id           UUID    NOT NULL REFERENCES users(id),
    clinical_record_id UUID    REFERENCES clinical_records(id),
    scale_id           UUID    NOT NULL REFERENCES assessment_scales(id),
    dek_id             UUID    NOT NULL REFERENCES encryption_keys(id),
    applied_at         TIMESTAMPTZ NOT NULL,
    responses_enc      BYTEA   NOT NULL,
    total_score        INTEGER NOT NULL,
    interpretation     TEXT,
    severity           TEXT,
    notes_enc          BYTEA,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assessment_org       ON patient_assessments(organization_id);
CREATE INDEX idx_assessment_patient   ON patient_assessments(patient_id);
CREATE INDEX idx_assessment_scale     ON patient_assessments(scale_id);
CREATE INDEX idx_assessment_staff     ON patient_assessments(staff_id);
CREATE INDEX idx_assessment_evolution ON patient_assessments(patient_id, scale_id, applied_at ASC);

CREATE TABLE treatment_plans (
    id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID    NOT NULL REFERENCES organizations(id),
    patient_id           UUID    NOT NULL REFERENCES patients(id),
    responsible_staff_id UUID    NOT NULL REFERENCES users(id),
    dek_id               UUID    NOT NULL REFERENCES encryption_keys(id),
    diagnosis_enc        BYTEA,
    goals_enc            BYTEA,
    approach_enc         BYTEA,
    started_at           DATE    NOT NULL DEFAULT CURRENT_DATE,
    estimated_end_at     DATE,
    actual_end_at        DATE,
    status               treatment_plan_status NOT NULL DEFAULT 'ACTIVE',
    end_reason_enc       BYTEA,
    next_review_at       DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_treatment_plan_active
    ON treatment_plans(patient_id, responsible_staff_id)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_treatment_plan_org     ON treatment_plans(organization_id);
CREATE INDEX idx_treatment_plan_patient ON treatment_plans(patient_id);
CREATE INDEX idx_treatment_plan_review  ON treatment_plans(next_review_at) WHERE status = 'ACTIVE';

CREATE TABLE consents (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES organizations(id),
    patient_id             UUID NOT NULL REFERENCES patients(id),
    staff_id               UUID NOT NULL REFERENCES users(id),
    dek_id                 UUID NOT NULL REFERENCES encryption_keys(id),
    consent_type           consent_type           NOT NULL,
    signing_method         consent_signing_method NOT NULL DEFAULT 'DIGITAL',
    document_enc           BYTEA NOT NULL,
    document_template_hash TEXT  NOT NULL,
    signature_enc          BYTEA,
    signature_method       TEXT,
    scan_path_enc          BYTEA,
    scan_file_type         TEXT,
    scanned_at             TIMESTAMPTZ,
    scanned_by             UUID REFERENCES users(id),
    signed_at              TIMESTAMPTZ NOT NULL,
    valid_until            TIMESTAMPTZ,
    revoked_at             TIMESTAMPTZ,
    revocation_reason      TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_digital_has_signature
        CHECK (signing_method <> 'DIGITAL' OR signature_enc IS NOT NULL),
    CONSTRAINT chk_physical_has_scan
        CHECK (signing_method <> 'PHYSICAL_SCAN' OR scan_path_enc IS NOT NULL)
);

CREATE INDEX idx_consent_org     ON consents(organization_id);
CREATE INDEX idx_consent_patient ON consents(patient_id);
CREATE INDEX idx_consent_type    ON consents(consent_type);
CREATE INDEX idx_consent_active  ON consents(patient_id, consent_type) WHERE revoked_at IS NULL;

CREATE TABLE ai_drafts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    clinical_record_id  UUID REFERENCES clinical_records(id),
    patient_id          UUID NOT NULL REFERENCES patients(id),
    requested_by        UUID NOT NULL REFERENCES users(id),
    dek_id              UUID NOT NULL REFERENCES encryption_keys(id),
    draft_content_enc   BYTEA,
    transcription_enc   BYTEA,
    ai_model_version    TEXT NOT NULL,
    whisper_model       TEXT NOT NULL,
    status              ai_draft_status NOT NULL DEFAULT 'PENDING',
    error_message       TEXT,
    processed_at        TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delete_after        TIMESTAMPTZ
);

CREATE INDEX idx_draft_org          ON ai_drafts(organization_id);
CREATE INDEX idx_draft_patient      ON ai_drafts(patient_id);
CREATE INDEX idx_draft_status       ON ai_drafts(status);
CREATE INDEX idx_draft_delete_after ON ai_drafts(delete_after);

-- ── BC-6: Facturación ─────────────────────────────────────────────────────────
CREATE TABLE service_rates (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id),
    name            TEXT    NOT NULL,
    description     TEXT,
    specialty_id    UUID    REFERENCES specialties(id),
    modality        appointment_modality,
    amount          NUMERIC(10,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'COP',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from      DATE    NOT NULL DEFAULT CURRENT_DATE,
    valid_until     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rates_org    ON service_rates(organization_id);
CREATE INDEX idx_rates_active ON service_rates(organization_id, is_active, valid_from);

CREATE TABLE patient_billing_profiles (
    patient_id                UUID    PRIMARY KEY,
    organization_id           UUID    NOT NULL REFERENCES organizations(id),
    dek_id                    UUID    NOT NULL REFERENCES encryption_keys(id),
    insurance_type            TEXT,
    insurance_name_enc        BYTEA,
    policy_number_enc         BYTEA,
    eps_auth_code_enc         BYTEA,
    eps_auth_expires_at       DATE,
    preferred_payment_method  payment_method_type,
    billing_email_enc         BYTEA,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_profile_org ON patient_billing_profiles(organization_id);

CREATE TABLE invoices (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID    NOT NULL REFERENCES organizations(id),
    patient_id          UUID    NOT NULL,
    appointment_id      UUID,
    rate_id             UUID    REFERENCES service_rates(id),
    dek_id              UUID    NOT NULL REFERENCES encryption_keys(id),
    currency            CHAR(3) NOT NULL DEFAULT 'COP',
    subtotal            NUMERIC(10,2) NOT NULL,
    discount            NUMERIC(10,2) NOT NULL DEFAULT 0,
    insurance_covered   NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_due           NUMERIC(10,2) NOT NULL,
    total_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
    status              invoice_status NOT NULL DEFAULT 'DRAFT',
    dian_invoice_number TEXT    UNIQUE,
    issued_at           TIMESTAMPTZ,
    due_at              TIMESTAMPTZ,
    notes_enc           BYTEA,
    created_by          UUID    NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_org         ON invoices(organization_id);
CREATE INDEX idx_invoice_patient     ON invoices(patient_id);
CREATE INDEX idx_invoice_status      ON invoices(organization_id, status);
CREATE INDEX idx_invoice_appointment ON invoices(appointment_id);
CREATE INDEX idx_invoice_overdue
    ON invoices(due_at)
    WHERE status IN ('ISSUED', 'PARTIAL') AND due_at IS NOT NULL;

CREATE TABLE payments (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id),
    invoice_id      UUID    NOT NULL REFERENCES invoices(id),
    amount          NUMERIC(10,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'COP',
    payment_method  payment_method_type NOT NULL,
    reference_enc   BYTEA,
    paid_at         TIMESTAMPTZ NOT NULL,
    recorded_by     UUID    NOT NULL REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_org     ON payments(organization_id, paid_at DESC);
CREATE INDEX idx_payments_method  ON payments(organization_id, payment_method);

-- ── Transversal ───────────────────────────────────────────────────────────────
CREATE TABLE domain_events (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL,
    aggregate_type  TEXT    NOT NULL,
    aggregate_id    UUID    NOT NULL,
    event_type      TEXT    NOT NULL,
    payload         JSONB   NOT NULL DEFAULT '{}',
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_unpublished ON domain_events(occurred_at) WHERE published = FALSE;
CREATE INDEX idx_events_aggregate   ON domain_events(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX idx_events_org         ON domain_events(organization_id, event_type, occurred_at DESC);

CREATE TABLE audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     UUID,
    user_id             UUID,
    user_email_hash     TEXT,
    user_roles_snapshot TEXT[],
    action              TEXT NOT NULL,
    resource_type       TEXT NOT NULL,
    resource_id         UUID,
    ip_address          INET,
    user_agent          TEXT,
    success             BOOLEAN NOT NULL,
    error_code          TEXT,
    metadata            JSONB,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org         ON audit_log(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_user        ON audit_log(user_id, occurred_at DESC);
CREATE INDEX idx_audit_resource    ON audit_log(resource_type, resource_id, occurred_at DESC);
CREATE INDEX idx_audit_occurred_at ON audit_log(occurred_at DESC);

-- ── Row-Level Security (multi-tenancy) ────────────────────────────────────────
-- Enable RLS on all tenant-scoped tables. Policies enforce organization isolation
-- at the database level as a second line of defense after application-level checks.
ALTER TABLE patients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_drafts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events        ENABLE ROW LEVEL SECURITY;

-- ── Application user permissions ──────────────────────────────────────────────
-- Run as superuser during setup: CREATE USER sghcp_app WITH PASSWORD '...';
-- GRANT USAGE ON SCHEMA public TO sghcp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sghcp_app;
-- GRANT INSERT, SELECT ON audit_log TO sghcp_app; (override DELETE)
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sghcp_app;
