-- Only safe to run when every row already has non-null values in these columns.
ALTER TABLE patients
  ALTER COLUMN document_type_code SET NOT NULL,
  ALTER COLUMN document_number_enc SET NOT NULL,
  ALTER COLUMN doc_search_hash    SET NOT NULL,
  ALTER COLUMN birth_date         SET NOT NULL;
