-- 000057_notifications.up.sql
--
-- In-app notification inbox (the bell in the topbar). Each row targets one
-- recipient user inside a tenant. Unlike patient-facing emails (internal/notify),
-- these live in the app so a professional/admin sees what needs attention:
-- a new AI draft is ready, a paid public booking arrived, a booking conflicts.
--
-- PII CONSTRAINT: this table is NOT encrypted, so title/body must never contain
-- patient PII (names, document, phone). They carry generic copy plus a `link`
-- to the in-app route where the (encrypted) detail is loaded under RLS.

CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind              TEXT NOT NULL,          -- AI_DRAFT_READY | NEW_PATIENT | BOOKING_NEW | BOOKING_CONFLICT
    title             TEXT NOT NULL,
    body              TEXT NOT NULL DEFAULT '',
    link              TEXT,                   -- frontend route to open on click (e.g. "/ai-drafts/<id>")
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The inbox query: newest-first for one recipient (RLS already pins the org).
CREATE INDEX idx_notif_recipient ON notifications (organization_id, recipient_user_id, created_at DESC);
-- The unread-count query and badge.
CREATE INDEX idx_notif_unread ON notifications (organization_id, recipient_user_id) WHERE read_at IS NULL;

-- Same tenant-isolation shape as the other RLS tables (see 000049): FORCE so the
-- policy applies even when the app connects as the table owner in dev; the
-- NULLIF(...)::uuid fails closed on a blank GUC.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
