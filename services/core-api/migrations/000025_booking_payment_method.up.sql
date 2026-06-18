-- Capture how each online (MercadoPago) booking was paid, so the billing
-- overview can break income down by payment method (credit card, PSE, Efecty,
-- Nequi, …). MercadoPago reports two fields on a payment:
--   payment_type_id   — coarse category: credit_card | debit_card | ticket
--                       (cash voucher) | bank_transfer (PSE) | account_money | atm
--   payment_method_id — the specific brand: visa | master | pse | efecty | nequi | …
-- Both are nullable: they're only known for payments confirmed after this ships.

ALTER TABLE bookings ADD COLUMN mp_payment_type   TEXT;
ALTER TABLE bookings ADD COLUMN mp_payment_method TEXT;
