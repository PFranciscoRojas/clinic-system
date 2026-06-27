-- Platform-wide operator settings (non-tenant). Used by SYSTEM_ADMIN to
-- configure platform-level MercadoPago credentials and plan details at runtime
-- without requiring a server restart or SSH access.
CREATE TABLE IF NOT EXISTS platform_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,        -- plain-text value (for non-secret settings)
    value_enc  BYTEA,       -- AES-256-GCM ciphertext (for secrets)
    key_source TEXT,        -- key derivation source passed to KeyManager
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON platform_settings TO sghcp_app;
