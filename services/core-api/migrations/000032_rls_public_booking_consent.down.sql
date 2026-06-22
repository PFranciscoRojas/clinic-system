DROP FUNCTION IF EXISTS consent_token_org(text);
DROP FUNCTION IF EXISTS booking_org(uuid);

DO $$
DECLARE tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'bookings',
        'booking_requests',
        'consent_sign_tokens',
        'consent_templates'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;
