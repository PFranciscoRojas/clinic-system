-- PostgreSQL cannot drop enum values; BREB stays in the type. Harmless: the
-- application layer simply stops offering it.
SELECT 1;
