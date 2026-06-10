-- Consent management: editable templates, remote-signature tokens,
-- in-DB encrypted scan storage and acceptance evidence.

-- Editable consent document text, versioned per type. Plain TEXT: templates
-- contain no PII. Signed consents snapshot the exact text into consents.document_enc,
-- so editing a template never alters an existing signature.
CREATE TABLE consent_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    consent_type    consent_type NOT NULL,
    version         INT  NOT NULL DEFAULT 1,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    updated_by      UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, consent_type, version)
);
CREATE UNIQUE INDEX idx_consent_templates_active
    ON consent_templates (organization_id, consent_type) WHERE is_active;

-- Single-use remote-signature links. Only the SHA-256 of the token is stored.
CREATE TABLE consent_sign_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    consent_type    consent_type NOT NULL,
    template_id     UUID NOT NULL REFERENCES consent_templates(id),
    token_hash      TEXT NOT NULL UNIQUE,
    created_by      UUID NOT NULL REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- scan_file_enc: uploaded signed PDF/photo, AES-256-GCM with the row DEK, stored
-- in-DB so the existing daily pg_dump backups cover it (low volume, single clinic).
-- evidence_enc: encrypted JSON {accepted_at, channel, ip, user_agent}.
ALTER TABLE consents ADD COLUMN scan_file_enc BYTEA;
ALTER TABLE consents ADD COLUMN evidence_enc  BYTEA;
ALTER TABLE consents ADD COLUMN template_id   UUID REFERENCES consent_templates(id);

-- The original constraint required scan_path_enc (filesystem path); scans now
-- live in-DB as scan_file_enc. Rows created before this feature carry the old
-- placeholder scan_path_enc, so either column satisfies the check.
ALTER TABLE consents DROP CONSTRAINT chk_physical_has_scan;
ALTER TABLE consents ADD CONSTRAINT chk_physical_has_scan
    CHECK (signing_method <> 'PHYSICAL_SCAN' OR scan_file_enc IS NOT NULL OR scan_path_enc IS NOT NULL);

-- Revoking consents and editing templates need their own permission.
INSERT INTO permissions (code, description, module) VALUES
    ('consents:update', 'Revocar consentimientos y editar plantillas', 'core')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('CLINIC_ADMIN', 'PROFESSIONAL')
  AND p.code = 'consents:update'
ON CONFLICT DO NOTHING;

-- Starter templates for every org (editable later in Settings).
INSERT INTO consent_templates (organization_id, consent_type, version, title, body, updated_by)
SELECT o.id, t.consent_type, 1, t.title, t.body, u.id
FROM organizations o
CROSS JOIN (VALUES
    ('TREATMENT'::consent_type, 'Consentimiento informado para atención psicológica',
     E'Declaro que he sido informado(a) sobre la naturaleza, objetivos y alcance de la atención psicológica que recibiré, conforme a la Ley 1090 de 2006.\n\nEntiendo que la información compartida en sesión es confidencial y está protegida por el secreto profesional, con las excepciones que la ley contempla (riesgo para la vida propia o de terceros, requerimiento judicial).\n\nAcepto voluntariamente iniciar este proceso de atención psicológica.'),
    ('DATA_PROCESSING'::consent_type, 'Autorización para el tratamiento de datos personales',
     E'Autorizo el tratamiento de mis datos personales, incluidos datos sensibles de salud, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013, con la finalidad exclusiva de la prestación del servicio de atención psicológica y la gestión de mi historia clínica.\n\nConozco mis derechos a conocer, actualizar, rectificar y suprimir mis datos, y a revocar esta autorización.'),
    ('RECORDING'::consent_type, 'Consentimiento para grabación de sesiones',
     E'Autorizo la grabación de audio de mis sesiones con fines exclusivos de apoyo a la elaboración de la nota clínica. El audio se procesa en la infraestructura del prestador, no se comparte con terceros y puedo revocar esta autorización en cualquier momento.'),
    ('INFORMATION_SHARING'::consent_type, 'Autorización para compartir información clínica',
     E'Autorizo compartir la información clínica estrictamente necesaria con los terceros que yo indique expresamente (otros profesionales de salud, EPS, familiares autorizados), conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999.')
) AS t(consent_type, title, body)
CROSS JOIN LATERAL (
    SELECT id FROM users
    WHERE organization_id = o.id
    ORDER BY created_at ASC LIMIT 1
) AS u;
