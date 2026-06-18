-- 000024_rls_billing_tables.up.sql
--
-- The BC-6 billing tables (service_rates, invoices, payments,
-- patient_billing_profiles) were created in 000001, BEFORE per-tenant RLS
-- existed (000018), and were never wired into the application. Activating the
-- invoicing module now would otherwise let sghcp_app read/write across tenants,
-- since a table WITHOUT RLS is fully visible to the app role.
--
-- This migration brings them under the same `tenant_isolation` policy as the
-- clinical tables: every statement is scoped to the org id the application sets
-- per request through the `app.current_org` GUC (TenantScope middleware).
--
-- FORCE applies the policy even to the table owner (defense-in-depth, matching
-- 000018). NULLIF(...,'')::uuid makes an unset/blank GUC fail closed (zero rows)
-- instead of raising on an invalid-uuid cast.

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'service_rates',
        'invoices',
        'payments',
        'patient_billing_profiles'
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
