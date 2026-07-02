// Package integration holds the tests that run against a real Postgres 16
// with every migration applied — the same topology as production: migrations
// run as the owner (sghcp_admin) and the app connects as the NOSUPERUSER,
// non-owner sghcp_app role, so FORCE ROW LEVEL SECURITY applies exactly like
// it does on the VPS.
//
// Requires a local Docker daemon (testcontainers). Skipped with -short.
package integration

import (
	"context"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const (
	adminUser = "sghcp_admin" // owner: runs migrations, bypasses RLS (superuser)
	adminPass = "admin-test-pw"
	appUser   = "sghcp_app" // least-privilege role the services use in prod
	appPass   = "app-test-pw"
	dbName    = "sghcp"
)

var (
	adminPool *pgxpool.Pool // seeding/assertions that must see everything
	appPool   *pgxpool.Pool // the role under test — RLS enforced
)

// TestMain boots one shared container for the whole package: applying the ~50
// migrations takes seconds, so per-test containers would dominate runtime.
func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run()) // every test skips itself via skipIfShort
	}
	ctx := context.Background()

	ctr, err := startContainer(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration: could not start postgres container: %v\n", err)
		os.Exit(1)
	}

	code, err := setupPools(ctx, ctr, m)
	_ = testcontainers.TerminateContainer(ctr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration: %v\n", err)
		os.Exit(1)
	}
	os.Exit(code)
}

func startContainer(ctx context.Context) (*postgres.PostgresContainer, error) {
	scripts, err := initScripts()
	if err != nil {
		return nil, err
	}
	return postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase(dbName),
		postgres.WithUsername(adminUser),
		postgres.WithPassword(adminPass),
		postgres.WithInitScripts(scripts...),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(3*time.Minute),
		),
	)
}

func setupPools(ctx context.Context, ctr *postgres.PostgresContainer, m *testing.M) (int, error) {
	adminURL, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return 1, err
	}
	adminPool, err = pgxpool.New(ctx, adminURL)
	if err != nil {
		return 1, fmt.Errorf("admin pool: %w", err)
	}
	defer adminPool.Close()

	// setup_app_role.sql creates sghcp_app without a password (it is provided
	// out-of-band in real environments); set one so the app pool can log in.
	if _, err := adminPool.Exec(ctx,
		fmt.Sprintf("ALTER ROLE %s WITH LOGIN PASSWORD '%s'", appUser, appPass)); err != nil {
		return 1, fmt.Errorf("app role password (did setup_app_role.sql run?): %w", err)
	}

	u, err := url.Parse(adminURL)
	if err != nil {
		return 1, err
	}
	u.User = url.UserPassword(appUser, appPass)
	appPool, err = pgxpool.New(ctx, u.String())
	if err != nil {
		return 1, fmt.Errorf("app pool: %w", err)
	}
	defer appPool.Close()

	return m.Run(), nil
}

// initScripts returns every up-migration plus setup_app_role.sql. The postgres
// entrypoint executes /docker-entrypoint-initdb.d in lexical order, which is
// exactly migration order ("000001…" < "000048…" < "setup_app_role.sql").
//
// A generated "000000" bootstrap creates the sghcp_app role before anything
// else: in every real environment the role predates the migrations, and some
// of them (e.g. 000040) GRANT to it directly.
func initScripts() ([]string, error) {
	_, thisFile, _, _ := runtime.Caller(0)
	coreAPI := filepath.Dir(filepath.Dir(filepath.Dir(thisFile))) // …/services/core-api

	ups, err := filepath.Glob(filepath.Join(coreAPI, "migrations", "*.up.sql"))
	if err != nil || len(ups) == 0 {
		return nil, fmt.Errorf("no up migrations found: %w", err)
	}
	sort.Strings(ups)

	dir, err := os.MkdirTemp("", "sghcp-testinfra-*")
	if err != nil {
		return nil, err
	}
	bootstrap := filepath.Join(dir, "000000_bootstrap_app_role.sql")
	if err := os.WriteFile(bootstrap,
		[]byte("CREATE ROLE "+appUser+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\n"),
		0o644); err != nil {
		return nil, err
	}

	roleScript := filepath.Join(coreAPI, "..", "..", "scripts", "setup_app_role.sql")
	if _, err := os.Stat(roleScript); err != nil {
		return nil, fmt.Errorf("setup_app_role.sql: %w", err)
	}
	return append(append([]string{bootstrap}, ups...), roleScript), nil
}

func skipIfShort(t *testing.T) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test: requires Docker")
	}
}

// asOrg acquires a dedicated connection from the app pool with the tenant GUC
// set — the same thing the TenantScope middleware does per request. The
// connection is released (and the GUC cleared) on test cleanup.
func asOrg(t *testing.T, orgID string) *pgxpool.Conn {
	t.Helper()
	ctx := context.Background()
	conn, err := appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire app conn: %v", err)
	}
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		conn.Release()
		t.Fatalf("set app.current_org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`)
		conn.Release()
	})
	return conn
}
