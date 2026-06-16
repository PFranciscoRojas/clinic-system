-- seed_marcela_branding.sql — backfills the branding block into Marcela's org
-- settings so her patient-facing emails (booking, consent) keep the exact
-- contact details and accent after the move to per-tenant branding (MT1).
-- Idempotent: re-running just overwrites the branding object.
--
-- DisplayName is read from organizations.name; only the optional fields live here.

BEGIN;

UPDATE organizations
SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{branding}',
    '{
        "public_name": "Marcela",
        "reply_to":    "hola@marcelachapues.com",
        "website":     "https://marcelachapues.com",
        "location":    "Bogotá, Colombia",
        "brand_color": "#5e8265"
    }'::jsonb,
    true
)
WHERE slug = 'marcela-chapues';

COMMIT;
