ALTER TABLE patients
  ALTER COLUMN document_type_code DROP NOT NULL,
  ALTER COLUMN document_number_enc DROP NOT NULL,
  ALTER COLUMN doc_search_hash    DROP NOT NULL,
  ALTER COLUMN birth_date         DROP NOT NULL;
