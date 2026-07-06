-- seed_marketing_demo.sql — fictional organization for marketing screenshots/clips
-- Separate from seed_dev.sql's "demo-clinica" (used by the CI smoke test, which
-- resets its data on every core-api deploy — unsafe for anything you need to
-- stay stable while you capture screenshots).
--
-- Run locally only (see GETTING_STARTED.md). Creates the organization, one
-- CLINIC_ADMIN + PROFESSIONAL user, and wires up permissions. Patients,
-- appointments, clinical records, and invoices are NOT seeded here — their PII
-- is app-encrypted per patient (BYTEA + per-patient DEK), so they must be
-- created by actually using the running app (UI or API), never raw SQL.
--
-- Login credentials:
--   Organization slug : consultorio-aurora
--   Email             : admin@consultorio-aurora.demo
--   Password          : Marketing1234!
--
-- After running this file, if login fails, recompute the email hash:
--   cd services/core-api && go run ./cmd/rehash

BEGIN;

-- ── Organization ──────────────────────────────────────────────────────────────
-- Fictional practice name — this is what shows up client-facing (booking page,
-- invoices), so it should NOT reference SGHCP/Chapni internals.
INSERT INTO organizations (id, name, slug, nit, plan, is_active, features)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'Consultorio Aurora',
    'consultorio-aurora',
    '900987654-3',
    'PROFESSIONAL',
    TRUE,
    '{"clinical_records": true, "ai_drafts": true, "billing": true, "booking": true}'
)
ON CONFLICT (slug) DO NOTHING;

-- ── CLINIC_ADMIN + PROFESSIONAL user ─────────────────────────────────────────
-- Fictional psychologist identity — distinct from any real professional using
-- the product, so it reads clearly as a demo persona in marketing material.
INSERT INTO users (
    id, organization_id,
    email, email_hash,
    password_hash,
    display_name,
    is_active
)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'admin@consultorio-aurora.demo',
    encode(sha256('admin@consultorio-aurora.demo'::bytea), 'hex'),
    crypt('Marketing1234!', gen_salt('bf', 10)),
    'Daniela Ruiz Peña',
    TRUE
)
ON CONFLICT (organization_id, email_hash) DO NOTHING;

-- ── Professional profile (required to create appointments / records) ──────────
INSERT INTO professional_profiles (
    user_id,
    specialty_id,
    first_name,
    paternal_last_name,
    license_number,
    license_state
)
SELECT
    'd0000000-0000-0000-0000-000000000001',
    id,
    'Daniela',
    'Ruiz Peña',
    'PSI-990001',
    'ACTIVE'
FROM specialties WHERE code = 'PSI_CLI'
ON CONFLICT (user_id) DO NOTHING;

-- ── Assign CLINIC_ADMIN role ──────────────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id, organization_id)
SELECT
    'd0000000-0000-0000-0000-000000000001',
    r.id,
    'c0000000-0000-0000-0000-000000000001'
FROM roles r
WHERE r.name = 'CLINIC_ADMIN'
ON CONFLICT DO NOTHING;

-- ── Wire all permissions to CLINIC_ADMIN ──────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CLINIC_ADMIN'
ON CONFLICT DO NOTHING;

COMMIT;
