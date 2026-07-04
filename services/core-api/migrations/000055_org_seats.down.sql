ALTER TABLE organizations
    DROP COLUMN IF EXISTS seat_limit,
    DROP COLUMN IF EXISTS pending_seats;
