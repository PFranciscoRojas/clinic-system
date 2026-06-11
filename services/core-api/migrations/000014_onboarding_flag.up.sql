-- Onboarding completion must be server-side: the old localStorage-only flag
-- made the wizard reappear on every new browser/device.

ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- Backfill: every existing user already went through onboarding.
UPDATE users SET onboarding_completed_at = NOW();
