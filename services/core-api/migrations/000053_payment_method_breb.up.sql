-- Bre-B (Banco de la República's instant-payment rails, "llaves") as a manual
-- payment method: patients pay the professional directly via their Bre-B key
-- and the payment is recorded against the invoice like Nequi or cash.
ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'BREB';
