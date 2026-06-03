CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');
CREATE TYPE booking_modality AS ENUM ('IN_PERSON', 'VIRTUAL');

CREATE TABLE booking_requests (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations(id),
    first_name      TEXT         NOT NULL,
    last_name       TEXT         NOT NULL,
    email           TEXT         NOT NULL,
    phone           TEXT,
    modality        booking_modality NOT NULL DEFAULT 'IN_PERSON',
    preferred_date  DATE,
    preferred_time  TEXT,
    notes           TEXT,
    status          booking_status NOT NULL DEFAULT 'PENDING',
    staff_note      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID         REFERENCES users(id)
);

CREATE INDEX idx_booking_requests_org_status ON booking_requests(organization_id, status);
CREATE INDEX idx_booking_requests_created    ON booking_requests(created_at DESC);
