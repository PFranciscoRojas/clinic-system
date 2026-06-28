-- 000046_record_templates.up.sql
--
-- Clinical-record templates: professionals write or upload templates in
-- markdown (with typed-field annotations) and the system renders a
-- data-driven form and uses them to drive the AI auto-fill prompt.
--
-- Design decisions:
--   * Templates are org-scoped and shared within the clinic (no per-user
--     visibility toggle; created_by is for auditing only).
--   * Templates are ARCHIVED, never deleted: a signed record must be able to
--     re-render with its original field labels (template_id stored on the row).
--   * source_markdown stores the raw author input; schema (JSONB) stores the
--     parsed, machine-readable section list used at runtime.
--   * clinical_records.template_id = NULL means "integrated format" (hardcoded
--     Go/React behaviour, unchanged).

CREATE TYPE template_status AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE clinical_record_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    record_type     record_type NOT NULL,   -- drives open-process rules and risk validation
    source_markdown TEXT NOT NULL,          -- original markdown the author wrote/uploaded
    schema          JSONB NOT NULL,         -- [{key,label,hint,required,type,options?,scale_min?,scale_max?,widget?}]
    version         INT  NOT NULL DEFAULT 1,
    status          template_status NOT NULL DEFAULT 'ACTIVE',
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one default per (org, record_type) at a time.
CREATE UNIQUE INDEX idx_crt_one_default
    ON clinical_record_templates (organization_id, record_type)
    WHERE is_default AND status = 'ACTIVE';

-- Lookup index for list queries.
CREATE INDEX idx_crt_org_type_status
    ON clinical_record_templates (organization_id, record_type, status);

ALTER TABLE clinical_record_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_record_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clinical_record_templates
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

-- Link each clinical record to the template used when creating it.
-- NULL = integrated format (existing hardcoded behaviour, unchanged).
ALTER TABLE clinical_records
    ADD COLUMN template_id UUID REFERENCES clinical_record_templates(id);

-- Permissions: every professional can read templates; only admins and
-- the owning professional can create/update/archive.
INSERT INTO permissions (code, description, module) VALUES
    ('record_templates:read',    'Ver plantillas de registro clínico', 'core'),
    ('record_templates:create',  'Crear plantillas de registro clínico', 'core'),
    ('record_templates:update',  'Editar plantillas de registro clínico', 'core'),
    ('record_templates:archive', 'Archivar plantillas de registro clínico', 'core')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('PROFESSIONAL', 'CLINIC_ADMIN')
  AND p.code IN ('record_templates:read', 'record_templates:create',
                 'record_templates:update', 'record_templates:archive')
ON CONFLICT DO NOTHING;
