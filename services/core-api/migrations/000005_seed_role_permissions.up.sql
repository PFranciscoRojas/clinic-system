-- Seeds default role permissions for CLINIC_ADMIN, PROFESSIONAL, INTERN, and RECEPTIONIST.
-- Idempotent: ON CONFLICT DO NOTHING.

-- CLINIC_ADMIN: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CLINIC_ADMIN'
ON CONFLICT DO NOTHING;

-- PROFESSIONAL: clinical + booking + scheduling permissions
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

-- INTERN: supervised clinical access (read-heavy, no approvals)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'INTERN'
  AND p.code IN (
    'patients:read',
    'clinical_records:read', 'clinical_records:create',
    'appointments:read',
    'consents:read',
    'ai_drafts:request',
    'assessments:read', 'assessments:create',
    'treatment_plans:read'
  )
ON CONFLICT DO NOTHING;

-- RECEPTIONIST: scheduling + patient intake, no clinical data
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'RECEPTIONIST'
  AND p.code IN (
    'patients:read', 'patients:create',
    'appointments:read', 'appointments:create', 'appointments:update', 'appointments:cancel',
    'billing:read'
  )
ON CONFLICT DO NOTHING;
