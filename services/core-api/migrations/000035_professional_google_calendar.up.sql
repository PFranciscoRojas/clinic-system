-- Per-professional Google Calendar OAuth connection.
-- Stores the encrypted refresh token so the backend can push appointment
-- events to the professional's calendar without re-prompting every time.
CREATE TABLE professional_google_calendar (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    google_email      TEXT,
    calendar_id       TEXT NOT NULL DEFAULT 'primary',
    refresh_token_enc BYTEA NOT NULL,
    key_source        TEXT NOT NULL DEFAULT 'env:MASTER_KEY',
    connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks the Google Calendar event ID for each synced appointment so that
-- cancellations can delete the matching event.
CREATE TABLE appointment_gcal_events (
    appointment_id UUID PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
    staff_id       UUID NOT NULL REFERENCES users(id),
    event_id       TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
