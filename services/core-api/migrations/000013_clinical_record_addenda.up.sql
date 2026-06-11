-- Addenda: signed, immutable supplementary notes on APPROVED clinical
-- records (Res. 1995/1999: the original entry is never edited — corrections
-- and additions are appended). Content is sealed with the parent record's
-- DEK. No UPDATE/DELETE path exists by design.

CREATE TABLE clinical_record_addenda (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id       UUID        NOT NULL REFERENCES clinical_records(id) ON DELETE RESTRICT,
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    created_by      UUID        NOT NULL REFERENCES users(id), -- [SOFT_FK] BC-1
    content_enc     BYTEA       NOT NULL, -- [AEA] sealed with the record's DEK
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addenda_record ON clinical_record_addenda (record_id);
