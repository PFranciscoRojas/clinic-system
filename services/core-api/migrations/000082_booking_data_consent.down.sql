ALTER TABLE bookings
    DROP COLUMN IF EXISTS data_consent_version,
    DROP COLUMN IF EXISTS data_consent_at;
