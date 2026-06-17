-- Tracks which patient reminders have already been sent for an appointment, so
-- the reminder engine never double-sends. One row per (appointment, offset).
-- Internal bookkeeping, not patient data → no RLS.
CREATE TABLE appointment_reminders_sent (
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,            -- '24h' | '2h'
    sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (appointment_id, kind)
);

-- Per-org reminder preferences live in organizations.settings.notifications
-- (JSONB, no migration). Default when absent: 24h reminder on, 2h off.
