-- Restores the plain index the unique one replaced, so down/up is a round trip
-- and not a slow degradation of the schema.
DROP INDEX IF EXISTS idx_appt_staff_slot_unique;

CREATE INDEX idx_appt_daily
    ON appointments (staff_id, scheduled_at)
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED');
