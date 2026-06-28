-- 000046_record_templates.down.sql
ALTER TABLE clinical_records DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS clinical_record_templates;
DROP TYPE IF EXISTS template_status;

DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions
    WHERE code IN ('record_templates:read','record_templates:create',
                   'record_templates:update','record_templates:archive')
);
DELETE FROM permissions
WHERE code IN ('record_templates:read','record_templates:create',
               'record_templates:update','record_templates:archive');
