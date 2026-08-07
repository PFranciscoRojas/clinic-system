-- One professional cannot be in two places at the same hour.
--
-- Until now nothing stopped it. The service checked nothing and the database
-- had only a plain index on (staff_id, scheduled_at), so two browser tabs
-- saving at once — or one tab saving twice on a slow connection — produced two
-- patients booked into the same slot, and the professional found out when both
-- of them arrived.
--
-- The guarantee has to live here and not in Go: two requests can both read "the
-- slot is free" before either of them writes. Only the database sees both
-- writers, so only the database can decide the race.
--
-- Partial, on the same predicate the existing idx_appt_daily already used:
-- cancelling frees the hour. Without the WHERE, an appointment cancelled at
-- 10:00 would block that hour forever.
--
-- Per staff_id, not per organization: two psychologists both seeing a patient
-- at 10:00 is a clinic with two consulting rooms, not a conflict.
--
-- Note this catches the exact same instant, which is the collision that
-- actually happens (the agenda offers discrete slots). A partial overlap —
-- 10:00 for 50 minutes against 10:30 — is a different question and is checked
-- in the service, where the duration is known.

-- The old non-unique index is redundant once the unique one exists: it has the
-- same columns and the same predicate, and a unique index serves reads just as
-- well. Dropping it also means there is exactly one place to look.
DROP INDEX IF EXISTS idx_appt_daily;

-- Deliberately NOT CONCURRENTLY: golang-migrate wraps each migration in a
-- transaction and CREATE INDEX CONCURRENTLY cannot run inside one. The table is
-- small (one row per consultation) and the lock is measured in milliseconds.
CREATE UNIQUE INDEX idx_appt_staff_slot_unique
    ON appointments (staff_id, scheduled_at)
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED');
