-- seed_marcela_chapues.sql — production seed for Marcela Chapués' organization
-- Run AFTER all migrations (000001..000004) and the initial reference-data seed.
--
-- Creates the organization that the public booking widget on marcelachapues.com
-- posts to via org_slug = 'marcela-chapues'.
-- A CLINIC_ADMIN user for Marcela must be created separately via the admin API.

BEGIN;

INSERT INTO organizations (name, slug, nit, plan, is_active, features)
VALUES (
    'Marcela Chapués · Psicóloga Clínica',
    'marcela-chapues',
    NULL,
    'PROFESSIONAL',
    TRUE,
    '{"clinical_records": true, "ai_drafts": false, "billing": false, "booking": true}'
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
