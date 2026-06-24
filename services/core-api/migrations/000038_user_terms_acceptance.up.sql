-- 000038: terms acceptance audit trail + DPA acceptance flag.
-- terms_accepted_at / terms_version: recorded at signup when the org owner accepts
--   the Terms of Service and Privacy Policy (Ley 1581/2012 consent requirement).
-- dpa_accepted_at: set the first time a CLINIC_ADMIN/PROFESSIONAL explicitly accepts
--   the Data Processing Agreement (Encargado-Responsable under Ley 1581/2012).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS dpa_accepted_at   timestamptz;
