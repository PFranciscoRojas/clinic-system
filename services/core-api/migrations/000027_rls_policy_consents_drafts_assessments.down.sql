-- Reverts 000027: drop the tenant-isolation policies (RLS stays enabled, as it
-- was before this migration — that is the original 000001 state).

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'consents',
        'ai_drafts',
        'patient_assessments'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    END LOOP;
END $$;
