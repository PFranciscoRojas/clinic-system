-- Section I "Datos de Identificación" of the clinical format requires marital
-- status, education level and current occupation, which the patient model never
-- captured. Stored as a single encrypted blob (AES-256-GCM with the patient DEK)
-- holding a JSON object {marital_status, education, occupation} — one column
-- keeps the read/scan paths simple and the data is PII, so it is encrypted like
-- every other patient field.
ALTER TABLE patients ADD COLUMN demographics_enc BYTEA;
