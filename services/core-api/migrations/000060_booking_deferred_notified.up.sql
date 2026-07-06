-- 000060_booking_deferred_notified.up.sql
--
-- Idempotency guard for deferred-payment (Efecty/cash voucher) notifications:
-- MercadoPago retries "pending"/"in_process" webhook notifications for the
-- same payment, and holdDeferred used to re-send both emails on every retry.
ALTER TABLE bookings ADD COLUMN deferred_notified_at TIMESTAMPTZ;

-- Make the checkout hold atomic: two concurrent checkouts for the same slot
-- must not both succeed (previously a plain check-then-insert race that could
-- create two bookings — with possibly different modality — for one slot).
-- Replaces idx_bookings_hold (same columns/predicate, but non-unique).
DROP INDEX idx_bookings_hold;
CREATE UNIQUE INDEX uq_bookings_active_slot ON bookings(staff_id, scheduled_at)
    WHERE status = 'PENDING_PAYMENT';
