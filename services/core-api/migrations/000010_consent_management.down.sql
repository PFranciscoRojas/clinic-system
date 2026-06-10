DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id AND p.code = 'consents:update';
DELETE FROM permissions WHERE code = 'consents:update';
ALTER TABLE consents DROP CONSTRAINT IF EXISTS chk_physical_has_scan;
ALTER TABLE consents ADD CONSTRAINT chk_physical_has_scan
    CHECK (signing_method <> 'PHYSICAL_SCAN' OR scan_path_enc IS NOT NULL);
ALTER TABLE consents DROP COLUMN IF EXISTS template_id;
ALTER TABLE consents DROP COLUMN IF EXISTS evidence_enc;
ALTER TABLE consents DROP COLUMN IF EXISTS scan_file_enc;
DROP TABLE IF EXISTS consent_sign_tokens;
DROP TABLE IF EXISTS consent_templates;
