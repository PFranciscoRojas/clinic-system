ALTER TABLE professional_profiles
    DROP COLUMN IF EXISTS signature_enc,
    DROP COLUMN IF EXISTS signature_dek_id;
