-- Accent-insensitive, any-word, prefix-typing patient search — without ever
-- indexing plaintext. Each row is the peppered HMAC of one normalized token:
-- every prefix (>= 2 chars) of every word of the patient's names, lowercased
-- and with diacritics stripped. The query side hashes the typed words the
-- same way and intersects. LIKE over ciphertext stays impossible by design;
-- this is the encrypted-search equivalent of a prefix index.
CREATE TABLE patient_search_tokens (
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    PRIMARY KEY (organization_id, token_hash, patient_id)
);

-- Rebuilds delete by patient; the PK already serves (org, token) lookups.
CREATE INDEX idx_pst_patient ON patient_search_tokens (patient_id);

ALTER TABLE patient_search_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_search_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patient_search_tokens
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
