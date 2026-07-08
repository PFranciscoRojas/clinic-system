-- Annual prepay is a one-time Checkout Pro payment (not a recurring
-- preapproval charge), so its webhook can arrive more than once for the same
-- payment. last_billing_payment_id guards subscription-period extension
-- against double-counting a duplicate webhook delivery.
ALTER TABLE organizations
    ADD COLUMN last_billing_payment_id TEXT;
