-- Restores booking_requests to the shape it had immediately before 000036,
-- which is 000004's table plus 000007's consent columns plus 000032's RLS.
--
-- The previous version of this file recreated an approximation: TEXT columns
-- where the schema had the booking_modality/booking_status enums, no
-- resolved_by, no indexes, neither consent column and no RLS. That made a full
-- rollback impossible — 000007's down then failed on a column that no longer
-- existed — and it silently dropped the Ley 1581/2012 consent evidence on the
-- way past. Found by TestMigrationsAreReversible.
--
-- The enums are still present at this point: 000004's down drops them, and it
-- runs after this file in a rollback.

CREATE TABLE IF NOT EXISTS booking_requests (
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
    resolved_by     UUID         REFERENCES users(id),

    -- 000007: evidence of data-processing consent.
    consent_accepted_at    TIMESTAMPTZ,
    consent_policy_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_org_status ON booking_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_created    ON booking_requests(created_at DESC);

-- 000032: per-tenant RLS. Its own down drops the policy and disables RLS, so
-- this has to put both back for the rollback to be symmetric.
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON booking_requests;
CREATE POLICY tenant_isolation ON booking_requests
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
