DROP INDEX IF EXISTS idx_invoice_number_per_org;
ALTER TABLE invoices DROP COLUMN IF EXISTS receipt_sent_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS invoice_number;
