-- Fix a latent deny-all: consents, ai_drafts and patient_assessments had RLS
-- ENABLED since 000001 but never got a policy. While the app connected as the
-- table owner (pre-000018) the owner bypassed RLS and everything worked; once
-- the app switched to the non-owner sghcp_app role (000018/MT2), "RLS enabled +
-- no policy" became default-deny for these tables — reads returned empty and
-- writes failed (e.g. signing a consent returned 500). 000018 mirrored the
-- tenant_isolation policy onto the six core clinical tables but deliberately
-- skipped these (public-token / Python-worker reachable) without noticing they
-- already had RLS on.
--
-- Give them the same per-tenant policy as the rest. core-api (sghcp_app) sets
-- app.current_org per request via TenantScope; the ai-service worker connects as
-- a bypass-RLS superuser, so the policy doesn't affect it. NULLIF(...,'')::uuid
-- fails closed (zero rows) when the GUC is unset, instead of raising.
--
-- domain_events is intentionally left out: it is the outbox, read by a
-- background publisher that has no per-request org context, so it needs a
-- separate design (writer scoped, publisher exempt).

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
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
                WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
        $f$, tbl);
    END LOOP;
END $$;
