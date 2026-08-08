-- Back to the 000073 shape, without the two billing-evidence columns.
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
  total_ai_drafts      integer
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
         (SELECT MIN(COALESCE(cr.finalized_at, cr.approved_at)) FROM clinical_records cr
           WHERE cr.organization_id = o.id
             AND (cr.finalized_at IS NOT NULL OR cr.approved_at IS NOT NULL)),
         (SELECT MIN(d.created_at)  FROM ai_drafts d     WHERE d.organization_id = o.id),
         (SELECT MAX(u.last_login_at) FROM users u WHERE u.organization_id = o.id),
         (SELECT COUNT(*) FROM patients p         WHERE p.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM appointments a     WHERE a.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM clinical_records c WHERE c.organization_id  = o.id)::int,
         (SELECT COUNT(*) FROM ai_drafts d        WHERE d.organization_id  = o.id)::int
  FROM organizations o
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION platform_org_activation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_org_activation() TO sghcp_app;
