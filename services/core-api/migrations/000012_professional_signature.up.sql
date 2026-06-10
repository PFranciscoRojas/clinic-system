-- Professional handwritten signature stamp, printed on exported clinical
-- documents. Stored AEA-encrypted with its own DEK (forgery-sensitive).

ALTER TABLE professional_profiles
    ADD COLUMN signature_enc    BYTEA,
    ADD COLUMN signature_dek_id UUID REFERENCES encryption_keys(id);
