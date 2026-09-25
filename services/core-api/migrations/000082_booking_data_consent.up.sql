-- Evidence of the patient's authorisation to process their personal data when
-- booking from the public page (Ley 1581/2012 art. 9: the holder of the data
-- carries the burden of proving the authorisation).
--
-- booking_requests carried this (000007) until it was dropped in 000036, and
-- policy_accepted_at (000031) only records the refund/cancellation policy.
-- NULL on rows created before this migration.
ALTER TABLE bookings
    ADD COLUMN data_consent_at      TIMESTAMPTZ,
    ADD COLUMN data_consent_version TEXT;
