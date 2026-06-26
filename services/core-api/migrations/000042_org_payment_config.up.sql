-- Per-tenant MercadoPago configuration for the public booking flow.
-- Each clinic brings its own MP Access Token so booking payments go directly
-- to their account, separate from the SaaS subscription (platform token).
-- The access token is sealed with the master key (AES-256-GCM).
CREATE TABLE org_payment_config (
    organization_id     UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    enabled             BOOLEAN      NOT NULL DEFAULT false,
    mp_access_token_enc BYTEA,                               -- sealed with MASTER_KEY
    key_source          TEXT,                                -- "env:MASTER_KEY"
    session_price       INTEGER      NOT NULL DEFAULT 180000, -- whole COP per appointment
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tenant isolation: core-api sets app.current_org per request.
ALTER TABLE org_payment_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org_payment_config
    USING  (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON org_payment_config TO sghcp_app;
