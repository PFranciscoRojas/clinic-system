-- Human-friendly consecutive invoice number, assigned per organization when an
-- invoice is issued (drafts don't consume a number, so the sequence has no gaps
-- from discarded drafts). Stored as a plain integer and rendered as F-000001 in
-- the UI. Distinct from dian_invoice_number (electronic invoicing, out of scope).
ALTER TABLE invoices ADD COLUMN invoice_number  INTEGER;
ALTER TABLE invoices ADD COLUMN receipt_sent_at TIMESTAMPTZ;

-- No two issued invoices in the same org may share a number.
CREATE UNIQUE INDEX idx_invoice_number_per_org
    ON invoices (organization_id, invoice_number)
    WHERE invoice_number IS NOT NULL;
