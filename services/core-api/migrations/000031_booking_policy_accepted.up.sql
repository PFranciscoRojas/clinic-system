-- Records the patient's acceptance of the refund/cancellation policy at booking
-- checkout (B6). Acceptance is required before payment and stored for audit
-- (Ley 1581/2012 — consentimiento informado del titular). NULL on legacy rows
-- created before this column existed.
ALTER TABLE bookings ADD COLUMN policy_accepted_at TIMESTAMPTZ;
