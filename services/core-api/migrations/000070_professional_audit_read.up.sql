-- Let professionals read the audit trail.
--
-- audit_log:read existed since 000001 but only CLINIC_ADMIN ever held it (via
-- the "all permissions" seed). That left the independent professional — the
-- one who answers to the SIC for their own patients under Ley 1581 — unable to
-- see who opened their clinical histories, in a system that had been recording
-- it all along. The reader endpoint scopes what a professional sees to their
-- own actions plus their treatment team's patients; the permission alone never
-- grants an org-wide view.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'PROFESSIONAL'
  AND p.code = 'audit_log:read'
ON CONFLICT DO NOTHING;
