-- 000020_bookings.up.sql
--
-- Paid public bookings. A booking holds a slot while the patient pays through
-- MercadoPago's hosted checkout; the payment webhook then confirms it by
-- creating the real appointment. Unlike booking_requests (the manual
-- request → admin-confirms lead), a booking is auto-confirmed on payment.
--
-- No RLS: this is a public, pre-patient flow (like booking_requests). The hold
-- (status PENDING_PAYMENT + hold_expires_at) reserves the slot so concurrent
-- patients can't double-book during checkout; the availability endpoint
-- excludes unexpired holds.

CREATE TABLE bookings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    staff_id         UUID NOT NULL REFERENCES users(id),
    scheduled_at     TIMESTAMPTZ NOT NULL,
    duration_min     INTEGER NOT NULL DEFAULT 50,
    modality         appointment_modality NOT NULL,
    guest_name       TEXT NOT NULL,
    email            TEXT NOT NULL,
    phone            TEXT,
    amount           INTEGER NOT NULL,            -- whole COP
    currency         TEXT NOT NULL DEFAULT 'COP',
    status           TEXT NOT NULL DEFAULT 'PENDING_PAYMENT', -- PENDING_PAYMENT|PAID|EXPIRED|CANCELLED
    mp_preference_id TEXT,
    mp_payment_id    TEXT,
    appointment_id   UUID REFERENCES appointments(id),
    hold_expires_at  TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active holds for slot exclusion in availability.
CREATE INDEX idx_bookings_hold ON bookings(staff_id, scheduled_at)
    WHERE status = 'PENDING_PAYMENT';
