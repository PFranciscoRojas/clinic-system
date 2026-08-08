-- The funnel counted every 'active' tenant as "activó el pago", which put a
-- clinic the operator switched on by hand from the console in the same bucket
-- as one that actually paid. With a cohort this small that is the difference
-- between "we have a paying customer" and "we have one we comped".
--
-- The evidence is already in organizations, written by two different paths:
--   provider_customer_id     — set when the tenant goes through MercadoPago
--                              checkout (subscription or annual prepay).
--   last_billing_payment_id  — set only when a payment webhook actually
--                              charged, and used as the idempotency guard.
-- A manual activation from the operator console writes neither.
--
-- Booleans, not the identifiers: the console needs to know a charge exists,
-- not the provider's id for it, and this function is granted to sghcp_app.
--
-- The return type changes, so the function is dropped and recreated rather
-- than replaced. golang-migrate runs this in one transaction, so the running
-- binary never observes a moment without it.
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
