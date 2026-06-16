-- 000019_signup_subscription.up.sql
--
-- Self-serve SaaS foundation (MT3). Three concerns:
--
--   1. Subscription lifecycle on organizations. A self-serve signup creates a
--      tenant in 'trialing' with a trial deadline; MT5 (billing) will flip these
--      columns from webhooks. `plan` and `is_active` already existed.
--
--   2. Email verification on users. Until now every user was born active and
--      implicitly trusted (seeded by hand). Self-serve signups must confirm they
--      own the address before they can log in. Existing users (Marcela) are
--      backfilled as verified so nothing breaks.
--
--   3. Global email uniqueness. Login moves from (org_slug + email) to email
--      alone — a new tenant owner should not need to know their slug. That only
--      works if an email resolves to exactly one account, so we add a global
--      unique index on email_hash (the per-org UNIQUE stays as a tighter guard).

ALTER TABLE organizations
    ADD COLUMN subscription_status  TEXT        NOT NULL DEFAULT 'trialing',  -- trialing|active|past_due|canceled
    ADD COLUMN trial_ends_at        TIMESTAMPTZ,
    ADD COLUMN provider_customer_id TEXT,                                     -- id in the payment provider (Wompi/MercadoPago)
    ADD COLUMN current_period_end   TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Existing accounts predate verification — trust them.
UPDATE users SET email_verified_at = NOW();

-- Email-global login requires one account per address across the whole system.
CREATE UNIQUE INDEX users_email_hash_global_uq ON users(email_hash);
