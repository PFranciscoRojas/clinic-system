-- Remove clinical write permissions from CLINIC_ADMIN.
-- A pure admin (without PROFESSIONAL role) may only read clinical records via
-- the break-the-glass flow; writing, approving, and AI actions require PROFESSIONAL.
-- Note: dual-role accounts (CLINIC_ADMIN + PROFESSIONAL) retain write access
-- through the PROFESSIONAL role.

DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'CLINIC_ADMIN')
  AND permission_id IN (
    SELECT id FROM permissions WHERE code IN (
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
  );
