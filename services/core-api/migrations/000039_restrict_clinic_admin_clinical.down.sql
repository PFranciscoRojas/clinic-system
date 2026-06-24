-- Restore the original CROSS JOIN assignment (CLINIC_ADMIN had all permissions).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CLINIC_ADMIN'
  AND p.code IN (
    'clinical_records:create',
    'clinical_records:update',
    'clinical_records:approve',
    'clinical_records:cosign',
    'ai_drafts:request',
    'ai_drafts:review',
    'assessments:create',
    'treatment_plans:create',
    'treatment_plans:update'
  )
ON CONFLICT DO NOTHING;
