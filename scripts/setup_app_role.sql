-- setup_app_role.sql — creates the least-privilege application role.
--
-- Run ONCE per environment as the owner/superuser (sghcp_admin):
--   psql "$ADMIN_DATABASE_URL" -v app_password="'<strong-password>'" -f setup_app_role.sql
--
-- Why: the app must connect as a NON-superuser role for Row-Level Security to
-- apply (a superuser bypasses RLS, FORCE included). Migrations keep running as
-- the owner (sghcp_admin); only the running services connect as sghcp_app via
-- DATABASE_URL.
--
-- Idempotent: safe to re-run (e.g. to refresh grants after new tables).

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sghcp_app') THEN
        CREATE ROLE sghcp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

-- Password is provided at run time so it never lives in the repo.
\if :{?app_password}
ALTER ROLE sghcp_app WITH PASSWORD :app_password;
\endif

-- Schema + DML on existing tables.
GRANT USAGE ON SCHEMA public TO sghcp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sghcp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sghcp_app;

-- audit_log is append-only for the application (Res. 1995/1999 integrity rule).
REVOKE UPDATE, DELETE ON audit_log FROM sghcp_app;

-- The admin data-reset builds a TEMP table; grant the capability on this DB.
DO $$
BEGIN
    EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO sghcp_app', current_database());
END $$;

-- Future tables/sequences created by the owner are auto-granted to the app role,
-- so new migrations don't require re-running this script.
ALTER DEFAULT PRIVILEGES FOR ROLE sghcp_admin IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sghcp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sghcp_admin IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO sghcp_app;
