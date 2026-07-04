DROP INDEX IF EXISTS idx_rates_staff;
ALTER TABLE service_rates DROP COLUMN IF EXISTS staff_id;
