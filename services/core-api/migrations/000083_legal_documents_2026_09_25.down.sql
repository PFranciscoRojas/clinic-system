DELETE FROM legal_documents
WHERE doc_type IN ('privacy', 'terms', 'dpa') AND version = '2026-09-25';

-- Restore the latest remaining version of each document as current.
UPDATE legal_documents d SET is_current = true
WHERE d.id IN (
    SELECT DISTINCT ON (doc_type) id FROM legal_documents
    WHERE doc_type IN ('privacy', 'terms', 'dpa')
    ORDER BY doc_type, published_at DESC, id DESC
);
