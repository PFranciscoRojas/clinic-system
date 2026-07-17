-- Edit-feedback metrics captured when a professional approves an AI draft.
-- Numbers and template section keys only — NEVER clinical text. The draft and
-- the final record are encrypted with different DEKs, so this is the only
-- durable record of how much the professional edited the AI's output.
CREATE TABLE draft_feedback (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organizations(id),
    draft_id           UUID NOT NULL REFERENCES ai_drafts(id),
    clinical_record_id UUID REFERENCES clinical_records(id),
    professional_id    UUID NOT NULL REFERENCES users(id),
    template_id        UUID,          -- NULL = integrated format
    record_type        TEXT NOT NULL,
    fields_total       INT NOT NULL,
    fields_unchanged   INT NOT NULL,
    fields_minor       INT NOT NULL,  -- similarity >= 0.7
    fields_rewritten   INT NOT NULL,  -- similarity < 0.7
    fields_added       INT NOT NULL,  -- only in the final version
    fields_removed     INT NOT NULL,  -- only in the AI draft
    field_detail       JSONB NOT NULL, -- [{"key","change","similarity","len_before","len_after"}]
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (draft_id)
);

CREATE INDEX idx_draft_feedback_org_created ON draft_feedback (organization_id, created_at);

ALTER TABLE draft_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON draft_feedback
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

GRANT SELECT, INSERT ON draft_feedback TO sghcp_app;
