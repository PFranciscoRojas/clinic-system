DROP INDEX uq_bookings_active_slot;
CREATE INDEX idx_bookings_hold ON bookings(staff_id, scheduled_at)
    WHERE status = 'PENDING_PAYMENT';
ALTER TABLE bookings DROP COLUMN deferred_notified_at;
