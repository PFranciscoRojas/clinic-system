-- B2B seats: the subscription price is per active clinical professional
-- (PROFESSIONAL / INTERN). seat_limit is how many seats the org has paid for;
-- pending_seats carries the seat count chosen at checkout until MercadoPago
-- confirms the subscription (then it is promoted to seat_limit).
ALTER TABLE organizations
    ADD COLUMN seat_limit    INT NOT NULL DEFAULT 1 CHECK (seat_limit >= 1),
    ADD COLUMN pending_seats INT;

-- Existing orgs keep their current clinical headcount as paid seats so nobody
-- is over-limit the moment this deploys.
UPDATE organizations o
SET seat_limit = GREATEST(1, (
    SELECT COUNT(DISTINCT u.id)
    FROM   users u
    JOIN   user_roles ur ON ur.user_id = u.id AND ur.organization_id = o.id
    JOIN   roles ro      ON ro.id = ur.role_id AND ro.name IN ('PROFESSIONAL', 'INTERN')
    WHERE  u.organization_id = o.id AND u.is_active
));
