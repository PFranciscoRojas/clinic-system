-- Treatment plans: encrypted per-patient therapeutic goals with lifecycle.
-- Clinical content (title, goal descriptions, progress notes) is AEA-encrypted
-- with a per-plan DEK, following the clinical_records pattern (ADR-002).

-- Clean up artifacts from an abandoned manual experiment: a treatment_plans
-- table and treatment_plan_status type were created outside the migration
-- chain. Verified empty in dev and prod on 2026-06-10.
DROP TABLE IF EXISTS treatment_plans CASCADE;
DROP TYPE IF EXISTS treatment_plan_status;

CREATE TYPE plan_status AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');
CREATE TYPE goal_status AS ENUM ('PENDING', 'IN_PROGRESS', 'ACHIEVED', 'ABANDONED');

CREATE TABLE treatment_plans (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    patient_id      UUID        NOT NULL REFERENCES patients(id),
    staff_id        UUID        NOT NULL REFERENCES users(id), -- [SOFT_FK] BC-1
    dek_id          UUID        NOT NULL REFERENCES encryption_keys(id),
    status          plan_status NOT NULL DEFAULT 'ACTIVE',
    title_enc       BYTEA       NOT NULL, -- [AEA]
    start_date      DATE        NOT NULL,
    end_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business rule enforced at the DB level: one active plan per patient.
CREATE UNIQUE INDEX uq_treatment_plans_one_active
    ON treatment_plans (patient_id) WHERE status = 'ACTIVE';

CREATE INDEX idx_treatment_plans_org_patient
    ON treatment_plans (organization_id, patient_id);

CREATE TABLE treatment_goals (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id            UUID        NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    description_enc    BYTEA       NOT NULL, -- [AEA] sealed with the parent plan's DEK
    progress_notes_enc BYTEA,                -- [AEA]
    status             goal_status NOT NULL DEFAULT 'PENDING',
    target_date        DATE,
    sort_order         SMALLINT    NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treatment_goals_plan ON treatment_goals (plan_id);

-- Permissions: treatment_plans:read/create/update already exist since
-- migration 000001 and are assigned to CLINIC_ADMIN/PROFESSIONAL (and
-- read to INTERN) since 000005 — no new permissions needed.
