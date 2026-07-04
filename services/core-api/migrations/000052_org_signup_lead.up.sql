-- Lead-tracking fields captured on self-serve signup: the owner's contact
-- phone (WhatsApp) and how they heard about the product. Both optional.
-- This is the professional's business contact (like users.email), not patient
-- PII, so it is stored in plaintext.
ALTER TABLE organizations
  ADD COLUMN signup_phone  TEXT,
  ADD COLUMN signup_source TEXT;
