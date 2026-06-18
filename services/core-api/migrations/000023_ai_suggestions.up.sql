-- Generic AI suggestions over a patient's encrypted history: the pre-session
-- recap and the (CBT) treatment-plan proposal — and room for future kinds.
-- The result JSON is sealed with a per-suggestion DEK, like ai_drafts.
-- Read-only assistance: the professional reviews/edits before anything becomes
-- a clinical artifact.
CREATE TABLE ai_suggestions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    dek_id          UUID NOT NULL REFERENCES encryption_keys(id),
    kind            TEXT NOT NULL,                       -- 'recap' | 'treatment_plan'
    status          TEXT NOT NULL DEFAULT 'PENDING',     -- PENDING | READY | FAILED
    content_enc     BYTEA,                               -- sealed JSON result (null until READY)
    source_hash     TEXT,                                -- fingerprint of the source records (staleness)
    model           TEXT,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The read path always wants the newest suggestion for a (patient, kind).
CREATE INDEX idx_ai_suggestions_patient_kind ON ai_suggestions (patient_id, kind, created_at DESC);

-- Tenant isolation: core-api (sghcp_app) sets app.current_org per request; the
-- ai-service worker connects as a bypass-RLS role and filters by org explicitly.
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_suggestions
    USING (organization_id = (NULLIF(current_setting('app.current_org', true), ''))::uuid)
    WITH CHECK (organization_id = (NULLIF(current_setting('app.current_org', true), ''))::uuid);
