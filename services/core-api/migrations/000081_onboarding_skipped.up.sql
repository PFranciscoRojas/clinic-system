-- The funnel counted "Terminó la puesta en marcha" for anyone who closed the
-- onboarding wizard, and closing it has two very different meanings: filling in
-- the professional profile, schedule and PIN, or clicking "Omitir por ahora".
-- Both call POST /auth/onboarding-complete, so both stamped
-- onboarding_completed_at and both counted as activation.
--
-- Measured on the first organic signup (2026-08-25): the tenant reached the
-- step 26 seconds after logging in, which is the skip link, and the console
-- reported it as onboarding completed.
--
-- onboarding_skipped is NULLABLE on purpose, and NULL means "we did not
-- record it". Defaulting the existing rows to false would assert that every
-- tenant so far completed the wizard, which is exactly the claim this
-- migration exists to stop making. The three states are:
--   NULL  → signed up before this column existed; unknowable
--   true  → clicked the skip link
--   false → finished the wizard
ALTER TABLE users
  ADD COLUMN onboarding_skipped BOOLEAN;

COMMENT ON COLUMN users.onboarding_skipped IS
  'true = closed the onboarding wizard via "Omitir por ahora"; false = completed it; NULL = predates the distinction (000081).';

-- The function gains a column, so it is dropped and recreated rather than
-- replaced. golang-migrate runs this in one transaction, so the running binary
-- never observes a moment without it. Additive for blue/green: the old binary
-- ignores the new column, the new one reads it.
DROP FUNCTION IF EXISTS platform_org_activation();

CREATE FUNCTION platform_org_activation()
RETURNS TABLE (
  org_id               uuid,
  name                 text,
  slug                 text,
  subscription_status  text,
  signup_source        text,
  is_internal          boolean,
  is_test              boolean,
  created_at           timestamptz,
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  verified_at          timestamptz,
  onboarded_at         timestamptz,
  onboarding_skipped   boolean,
  first_patient_at     timestamptz,
  first_appointment_at timestamptz,
  first_record_at      timestamptz,
  first_ai_draft_at    timestamptz,
  last_login_at        timestamptz,
  total_patients       integer,
  total_appointments   integer,
  total_records        integer,
  total_ai_drafts      integer,
  has_billing_provider boolean,
  has_recorded_charge  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.subscription_status, o.signup_source,
         o.is_internal, o.is_test, o.created_at, o.trial_ends_at, o.current_period_end,
         (SELECT MIN(u.email_verified_at)       FROM users u WHERE u.organization_id = o.id),
         (SELECT MIN(u.onboarding_completed_at) FROM users u WHERE u.organization_id = o.id),
         -- Whoever reached the step first is the one who defines onboarded_at,
         -- so the outcome is read from that same row rather than aggregated:
         -- a second user skipping later says nothing about the milestone.
         (SELECT u.onboarding_skipped FROM users u
           WHERE u.organization_id = o.id AND u.onboarding_completed_at IS NOT NULL
           ORDER BY u.onboarding_completed_at ASC LIMIT 1),
         (SELECT MIN(p.created_at)  FROM patients p     WHERE p.organization_id = o.id),
         (SELECT MIN(a.created_at)  FROM appointments a WHERE a.organization_id = o.id),
         -- Signed, not merely written: an open draft is not a clinical record
         -- yet, and the milestone is the professional trusting the system
         -- enough to put their signature on a document. Signing (finalized_at)
         -- and closing (approved_at) are two acts in this product; the first is
         -- the one that shows activation. approved_at is the fallback for
         -- records signed before finalized_at existed (000048).
         (SELECT MIN(COALESCE(cr.finalized_at, cr.approved_at)) FROM clinical_records cr
           WHERE cr.organization_id = o.id
             AND (cr.finalized_at IS NOT NULL OR cr.approved_at IS NOT NULL)),
         (SELECT MIN(d.created_at)  FROM ai_drafts d     WHERE d.organization_id = o.id),
         (SELECT MAX(u.last_login_at) FROM users u WHERE u.organization_id = o.id),
         (SELECT COUNT(*) FROM patients p         WHERE p.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM appointments a     WHERE a.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM clinical_records c WHERE c.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM ai_drafts d        WHERE d.organization_id  = o.id)::int,
         o.provider_customer_id IS NOT NULL,
         o.last_billing_payment_id IS NOT NULL
  FROM organizations o
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION platform_org_activation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_org_activation() TO sghcp_app;
