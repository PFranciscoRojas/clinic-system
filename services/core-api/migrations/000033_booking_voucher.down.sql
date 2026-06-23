-- 000033_booking_voucher.down.sql
ALTER TABLE bookings DROP COLUMN IF EXISTS payment_voucher_url;
