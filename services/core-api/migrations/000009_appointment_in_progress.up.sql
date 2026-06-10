-- The Go service and the frontend already use IN_PROGRESS
-- (services/core-api/internal/appointments/service/update_status.go);
-- the ENUM was simply missing the value, causing a 500 on session start.
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS' AFTER 'CONFIRMED';
