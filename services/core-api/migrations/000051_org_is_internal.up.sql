-- Some organizations are operational fixtures, not real tenants: the SaaS
-- operator's own org (SYSTEM_ADMIN) and the demo org the CI smoke test seeds
-- and resets on every deploy. They must not appear in the Tenants admin view
-- or count toward its metrics (active/trial counts, total users, total
-- patients) — an operator scanning that screen needs it to reflect real
-- paying clinics only.
ALTER TABLE organizations
    ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE organizations
SET is_internal = TRUE
WHERE slug IN ('sghcp-operador', 'demo-clinica');
