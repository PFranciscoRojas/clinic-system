-- Links a paid public booking to the Chapni invoice generated from it, so the
-- patient can get a provider-issued receipt (insurance reimbursement etc.)
-- even though MercadoPago collected the money. One invoice per booking.
ALTER TABLE bookings ADD COLUMN invoice_id UUID REFERENCES invoices(id);

CREATE UNIQUE INDEX idx_bookings_invoice
    ON bookings (invoice_id)
    WHERE invoice_id IS NOT NULL;
