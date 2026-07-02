-- seed_dev.sql — development seed data
-- Creates one organization, one CLINIC_ADMIN user, and wires up all permissions.
-- Run AFTER all migrations.
--
-- Login credentials:
--   Organization slug : demo-clinica
--   Email             : admin@demo.clinica.co
--   Password          : Admin1234!

BEGIN;

-- ── Organization ──────────────────────────────────────────────────────────────
INSERT INTO organizations (id, name, slug, nit, plan, is_active, features)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Clínica Demo SGHCP',
    'demo-clinica',
    '900123456-1',
    'PROFESSIONAL',
    TRUE,
    '{"clinical_records": true, "ai_drafts": true, "billing": true, "booking": true}'
)
ON CONFLICT (slug) DO NOTHING;

-- ── CLINIC_ADMIN user ─────────────────────────────────────────────────────────
-- email_hash  : placeholder — production hashes are HMAC-SHA256 keyed with
--               SEARCH_PEPPER, which SQL cannot compute. After seeding, run
--               `docker compose exec core-api ./rehash` (or `go run ./cmd/rehash`)
--               to recompute it from the plaintext email; login fails until then.
-- password    : Admin1234!  (bcrypt cost 10 via pgcrypto)
INSERT INTO users (
    id, organization_id,
    email, email_hash,
    password_hash,
    display_name,
    is_active
)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@demo.clinica.co',
    encode(sha256('admin@demo.clinica.co'::bytea), 'hex'),
    crypt('Admin1234!', gen_salt('bf', 10)),
    'Admin Demo',
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
    'b0000000-0000-0000-0000-000000000001',
    id,
    'Admin',
    'Demo',
    'PSI-000001',
    'ACTIVE'
FROM specialties WHERE code = 'PSI_CLI'
ON CONFLICT (user_id) DO NOTHING;

-- ── Assign CLINIC_ADMIN role ──────────────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id, organization_id)
SELECT
    'b0000000-0000-0000-0000-000000000001',
    r.id,
    'a0000000-0000-0000-0000-000000000001'
FROM roles r
WHERE r.name = 'CLINIC_ADMIN'
ON CONFLICT DO NOTHING;

-- ── Wire all permissions to CLINIC_ADMIN ──────────────────────────────────────
-- CLINIC_ADMIN gets every permission except SYSTEM_ADMIN-only ones.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CLINIC_ADMIN'
ON CONFLICT DO NOTHING;

-- ── Wire clinical permissions to PROFESSIONAL role ────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'PROFESSIONAL'
  AND p.code IN (
    'patients:read', 'patients:create', 'patients:update',
    'clinical_records:read', 'clinical_records:create',
    'clinical_records:update', 'clinical_records:approve',
    'appointments:read', 'appointments:create', 'appointments:update', 'appointments:cancel',
    'consents:read', 'consents:create',
    'ai_drafts:request', 'ai_drafts:review',
    'assessments:read', 'assessments:create',
    'treatment_plans:read', 'treatment_plans:create', 'treatment_plans:update',
    'billing:read'
  )
ON CONFLICT DO NOTHING;

COMMIT;
