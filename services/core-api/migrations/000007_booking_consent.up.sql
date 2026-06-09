-- Evidence of data-processing consent for public booking submissions
-- (Ley 1581/2012 — burden of proof of consent lies with the data controller).
ALTER TABLE booking_requests
    ADD COLUMN consent_accepted_at     TIMESTAMPTZ,
    ADD COLUMN consent_policy_version  TEXT;
