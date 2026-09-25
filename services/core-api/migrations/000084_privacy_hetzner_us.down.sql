DELETE FROM legal_documents WHERE doc_type = 'privacy' AND version = '2026-09-25.1';

UPDATE legal_documents SET is_current = true
WHERE id = (
    SELECT id FROM legal_documents WHERE doc_type = 'privacy'
    ORDER BY published_at DESC, id DESC LIMIT 1
);
