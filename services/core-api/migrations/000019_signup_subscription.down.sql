-- 000019_signup_subscription.down.sql

DROP INDEX IF EXISTS users_email_hash_global_uq;

ALTER TABLE users
    DROP COLUMN IF EXISTS email_verified_at;

ALTER TABLE organizations
    DROP COLUMN IF EXISTS subscription_status,
    DROP COLUMN IF EXISTS trial_ends_at,
    DROP COLUMN IF EXISTS provider_customer_id,
    DROP COLUMN IF EXISTS current_period_end;
