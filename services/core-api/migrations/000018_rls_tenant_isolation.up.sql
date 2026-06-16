-- 000018_rls_tenant_isolation.up.sql
--
-- Defense-in-depth tenant isolation via Postgres Row-Level Security. Even a
-- query that forgets its explicit `organization_id` filter cannot read or
-- write another tenant's rows: every statement is scoped to the org id the
-- application sets per request through the `app.current_org` GUC (see the
-- TenantScope middleware, which pins a connection and runs
-- `set_config('app.current_org', <org>, false)`).
--
-- Scope of THIS migration: the clinical tables that core-api fully owns and
-- whose every access path was migrated to the request-scoped querier
-- (patients, clinical_records, clinical_record_addenda, appointments,
-- treatment_plans, patient_diagnoses). Tables reached by public-token flows
-- (consents, booking) or by the Python ai-service worker (ai_drafts) are
-- intentionally left for a later, separately-validated migration and keep
-- their explicit org filters in the meantime.
--
-- FORCE is required because the application connects as the table owner, which
-- would otherwise bypass RLS. NULLIF(...,'')::uuid makes an unset/blank GUC
-- fail closed (zero rows) instead of raising on an invalid-uuid cast.

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'patients',
        'clinical_records',
        'clinical_record_addenda',
        'appointments',
        'treatment_plans',
        'patient_diagnoses'
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
