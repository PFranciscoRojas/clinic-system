-- Per-professional service rates (B2B): a rate may target one professional;
-- NULL keeps today's org-wide behaviour. Invoices keep their rate_id snapshot,
-- so retargeting a rate never rewrites history.
ALTER TABLE service_rates ADD COLUMN staff_id UUID REFERENCES users(id);

CREATE INDEX idx_rates_staff
    ON service_rates(organization_id, staff_id)
    WHERE staff_id IS NOT NULL;
