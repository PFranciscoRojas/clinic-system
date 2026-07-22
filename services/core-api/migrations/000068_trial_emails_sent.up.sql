-- Tracks which trial-lifecycle emails have already been sent to a tenant, so
-- the trial engine never double-sends. One row per (organization, kind).
-- Internal bookkeeping, not tenant data → no RLS (same rationale as
-- appointment_reminders_sent in 000021).
CREATE TABLE trial_emails_sent (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,            -- 'nudge_day3' | 'ending_3d' | 'ended'
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, kind)
);
