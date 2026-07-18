-- audit_log is append-only for sghcp_app by design (no DELETE grant): the
-- audit trail must be immutable even if the app role is compromised. The admin
-- hard-delete of a TEST org still needs to wipe that org's audit rows, so this
-- SECURITY DEFINER function is the single sanctioned purge path — and it
-- refuses anything that is not a test org, enforcing in the database itself
-- that a real tenant's audit trail can never be deleted through the app.
CREATE OR REPLACE FUNCTION admin_purge_org_audit(target_org uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purgeable boolean;
  n bigint;
BEGIN
  SELECT is_test AND NOT is_internal INTO purgeable
  FROM organizations WHERE id = target_org;
  IF purgeable IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'audit purge only allowed for test organizations';
  END IF;
  DELETE FROM audit_log WHERE organization_id = target_org;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION admin_purge_org_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_purge_org_audit(uuid) TO sghcp_app;
