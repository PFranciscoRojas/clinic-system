-- Test tenants: organizations the operator creates to try things out. They
-- are visible in the Tenants admin view (unlike is_internal fixtures) but
-- flagged so metrics can exclude them and so they can be hard-deleted from
-- the admin console. Every new org is real (FALSE) by default — fail-closed:
-- nothing becomes deletable without the operator explicitly marking it.
ALTER TABLE organizations
    ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE;
