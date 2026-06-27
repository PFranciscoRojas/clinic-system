ALTER TABLE org_payment_config
  ADD COLUMN IF NOT EXISTS mp_webhook_secret_enc      BYTEA,
  ADD COLUMN IF NOT EXISTS mp_webhook_secret_key_src  TEXT;
