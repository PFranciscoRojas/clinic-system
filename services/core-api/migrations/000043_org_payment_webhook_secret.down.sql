ALTER TABLE org_payment_config
  DROP COLUMN IF EXISTS mp_webhook_secret_enc,
  DROP COLUMN IF EXISTS mp_webhook_secret_key_src;
