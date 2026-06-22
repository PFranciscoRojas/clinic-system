-- Bring the remaining tenant-scoped tables reached by public flows under
-- per-tenant RLS, closing the last isolation gap. core-api connects as the
-- non-owner, non-superuser sghcp_app role, so the tenant_isolation policy is
-- enforced against it (same as 000018/000024/000027).
--
-- Access patterns:
--   * booking_requests, consent_templates — reached in authenticated contexts
--     (TenantScope sets app.current_org) and in org-resolvable public contexts
--     (the handler sets the scope after resolving the org by slug).
--   * bookings, consent_sign_tokens — looked up by an unguessable id/token in
--     unauthenticated webhook/sign flows where the org is not known up front.
--     The SECURITY DEFINER resolvers below map id/token -> org (bypassing RLS,
--     since they are owned by the superuser migration role); the handler then
--     pins app.current_org and runs everything else under RLS.
--
-- No FORCE: mirrors the public/worker-reachable convention of 000027. The
-- SECURITY DEFINER resolvers bypass RLS regardless (superuser-owned).

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
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
                WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
        $f$, tbl);
    END LOOP;
END $$;

-- id/token -> org resolvers for the unauthenticated lookups. STABLE + SECURITY
-- DEFINER; they expose only the org id for a caller that already holds the
-- unguessable key, so default PUBLIC execute is acceptable.
CREATE OR REPLACE FUNCTION booking_org(p_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT organization_id FROM bookings WHERE id = p_id
    $$;

CREATE OR REPLACE FUNCTION consent_token_org(p_token_hash text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT organization_id FROM consent_sign_tokens WHERE token_hash = p_token_hash
    $$;
