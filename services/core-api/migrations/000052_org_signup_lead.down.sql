ALTER TABLE organizations
  DROP COLUMN IF EXISTS signup_phone,
  DROP COLUMN IF EXISTS signup_source;
