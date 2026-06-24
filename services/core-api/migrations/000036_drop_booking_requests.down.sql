CREATE TABLE IF NOT EXISTS booking_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT,
    modality        TEXT NOT NULL DEFAULT 'IN_PERSON',
    preferred_date  DATE,
    preferred_time  TEXT,
    notes           TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    staff_note      TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
