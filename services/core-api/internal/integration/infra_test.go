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
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/testinfra"
)

// The bootstrap itself lives in internal/testinfra so the acceptance suite in
// cmd/api can boot the identical database. Two copies of it would drift, and
// the day they drift one of these suites is testing a schema production does
// not have.
const (
	adminUser = testinfra.AdminUser
	adminPass = testinfra.AdminPass
	appUser   = testinfra.AppUser
	dbName    = testinfra.DBName
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

	db, err := testinfra.Start(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration: %v\n", err)
		os.Exit(1)
	}
	adminPool, appPool = db.Admin, db.App

	code := m.Run()
	db.Close()
	os.Exit(code)
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
