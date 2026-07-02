-- 000049_rls_staff_relations.up.sql
--
-- Close the last two tenant-scoped tables that carried an organization_id but
-- no tenant_isolation policy (found by the RLS coverage integration test):
--
--   patient_staff_rel — who treats whom; leaks the care relationship graph
--   supervision_rel   — supervisor/supervisee links (no Go access paths yet)
--
-- Every access path is already on the request-scoped querier: the
-- appointments repository INSERTs via r.q(ctx), the admin wipe runs on
-- dbctx.From, and clinicalperm.IsAssignedToPatient was moved to dbctx.From in
-- the same change that ships this migration.
--
-- Same policy shape as 000018: FORCE because the app may connect as the table
-- owner in dev; NULLIF(...,'')::uuid fails closed on a blank GUC.

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'patient_staff_rel',
        'supervision_rel'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
                WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
        $f$, tbl);
    END LOOP;
END $$;
