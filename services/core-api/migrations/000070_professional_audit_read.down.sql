DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'PROFESSIONAL')
  AND permission_id = (SELECT id FROM permissions WHERE code = 'audit_log:read');
