-- The operator console counts across every tenant, which is exactly what the
-- tenant_isolation policy forbids: core-api connects as sghcp_app, and the
-- admin endpoints query on a raw pool connection with no app.current_org, so
-- FORCE RLS answered "zero rows" for patients, appointments, clinical_records
-- and ai_drafts. The console has been showing every clinic with 0 patients
-- since RLS landed (000018), and the same blind spot would have made an
-- activation funnel report that nobody ever does anything.
--
-- Loosening the policy for an "admin" GUC would put the exception in the hot
-- path of every tenant query. This function is the alternative: one SECURITY
-- DEFINER read, owned by the migration role, that returns aggregates only —
-- counts and first-occurrence timestamps per organization. No patient row, no
-- clinical content, nothing encrypted, so a caller learns how much a clinic
-- uses the product and nothing about who it treats.
--
-- Granting it to sghcp_app adds no reachable privilege: anyone already running
-- SQL as sghcp_app can set app.current_org to any organization and read the
-- rows themselves. The HTTP layer restricts every caller to SYSTEM_ADMIN.
CREATE OR REPLACE FUNCTION platform_org_activation()
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
         (SELECT COUNT(*) FROM ai_drafts d        WHERE d.organization_id  = o.id)::int
  FROM organizations o
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION platform_org_activation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_org_activation() TO sghcp_app;

-- The health console's "cola IA" panel had the same blind spot: it groups
-- ai_drafts by status on the unscoped pool, so it has been reporting an empty
-- queue no matter how many jobs were stuck. Same treatment, same reasoning —
-- a count per status carries no clinical content.
CREATE OR REPLACE FUNCTION platform_ai_draft_status()
RETURNS TABLE (status text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.status::text, COUNT(*) FROM ai_drafts d GROUP BY d.status;
$$;

REVOKE ALL ON FUNCTION platform_ai_draft_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_ai_draft_status() TO sghcp_app;
