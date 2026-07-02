-- 000049_rls_staff_relations.down.sql

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'patient_staff_rel',
        'supervision_rel'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;
