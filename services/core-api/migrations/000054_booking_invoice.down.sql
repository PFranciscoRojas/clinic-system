DROP INDEX IF EXISTS idx_bookings_invoice;
ALTER TABLE bookings DROP COLUMN IF EXISTS invoice_id;
