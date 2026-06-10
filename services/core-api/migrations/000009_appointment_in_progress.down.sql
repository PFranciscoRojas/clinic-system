-- PostgreSQL cannot remove a value from an ENUM type.
-- Intentional no-op: rolling back would require recreating the type and
-- rewriting the appointments table.
SELECT 1;
