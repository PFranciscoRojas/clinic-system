-- Lead (sales) bookings — the superadmin's public "book a call" agenda. Global,
-- non-tenant (a lead belongs to no organization), mirroring the gcal tables in
-- 000035 which also carry neither RLS nor an organization scope.

-- One row per booked discovery call. The unique partial index on scheduled_at
-- prevents two leads from grabbing the same slot (only BOOKED rows compete;
-- cancelled ones free the time again).
CREATE TABLE lead_bookings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT,
    message       TEXT,
    scheduled_at  TIMESTAMPTZ NOT NULL,
    duration_min  INT NOT NULL DEFAULT 30,
    status        TEXT NOT NULL DEFAULT 'BOOKED',  -- BOOKED | CANCELLED
    gcal_event_id TEXT,
    meet_url      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX lead_bookings_slot_unique
    ON lead_bookings (scheduled_at) WHERE status = 'BOOKED';

-- Working-hours configuration for the lead agenda. Single row (singleton): the
-- superadmin edits these from the operator console; the public availability
-- endpoint reads them to compute free slots.
CREATE TABLE lead_booking_settings (
    singleton     BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    active_days   TEXT[] NOT NULL DEFAULT '{Lun,Mar,Mié,Jue,Vie}',
    start_hour    TEXT   NOT NULL DEFAULT '09:00',
    end_hour      TEXT   NOT NULL DEFAULT '17:00',
    slot_step_min INT    NOT NULL DEFAULT 30,
    duration_min  INT    NOT NULL DEFAULT 30,
    timezone      TEXT   NOT NULL DEFAULT 'America/Bogota',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lead_booking_settings (singleton) VALUES (TRUE);
