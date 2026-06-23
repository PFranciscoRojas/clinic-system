-- Per-tenant WhatsApp Cloud API (Meta) configuration. Each clinic brings its own
-- WhatsApp Business Account (WABA), phone number and System User token, so the
-- credentials live per organization. The access token is a secret, sealed with
-- the master key (AES-256-GCM) like the rest of [AEA] material — never plaintext.
--
-- Proactive messages (24h/2h reminders, booking confirmations) require Meta
-- pre-approved message templates; their names are stored here per kind. The
-- WhatsApp sender is a no-op when enabled = false or the config is absent.
CREATE TABLE org_whatsapp_config (
    organization_id  UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    enabled          BOOLEAN NOT NULL DEFAULT false,
    phone_number_id  TEXT,            -- Meta Phone Number ID (not secret)
    waba_id          TEXT,            -- WhatsApp Business Account id (optional)
    access_token_enc BYTEA,           -- System User token, sealed with MASTER_KEY
    key_source       TEXT,            -- "env:MASTER_KEY"
    tpl_reminder_24h TEXT,            -- approved template name for the 24h reminder
    tpl_reminder_2h  TEXT,            -- approved template name for the 2h reminder
    tpl_booking      TEXT,            -- approved template name for booking confirmation
    lang             TEXT NOT NULL DEFAULT 'es',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant isolation: core-api (sghcp_app) sets app.current_org per request.
-- No FORCE, mirroring the convention of the other tenant-scoped tables.
ALTER TABLE org_whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org_whatsapp_config
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
