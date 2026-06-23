-- 000033_booking_voucher.up.sql
--
-- Deferred (offline) payment support for public bookings. Cash/voucher methods
-- (Efecty, some bank transfers) return a "pending" MercadoPago payment plus a
-- printable voucher the patient pays later at a physical point. We keep the slot
-- held (hold_expires_at extended to the voucher's expiration) until the payment
-- is approved or the voucher expires, and surface the voucher URL on the
-- return page so the patient can reopen it.

ALTER TABLE bookings ADD COLUMN payment_voucher_url TEXT;
