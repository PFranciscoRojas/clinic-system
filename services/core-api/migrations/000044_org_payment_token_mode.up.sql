ALTER TABLE org_payment_config
  ADD COLUMN IF NOT EXISTS mp_token_mode TEXT CHECK (mp_token_mode IN ('test', 'live'));
