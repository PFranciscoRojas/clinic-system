// Package testinfra boots a throwaway Postgres 16 with every migration applied,
// in the same topology as production: migrations run as the owner
// (sghcp_admin), the app connects as the NOSUPERUSER non-owner sghcp_app, so
// FORCE ROW LEVEL SECURITY applies exactly like it does on the VPS. A harness
// that let the app role bypass RLS would make every tenant-isolation test a lie.
//
// This is test-only code in a non-test file on purpose: Go cannot import
// identifiers from another package's _test.go files, and both internal/integration
// and the acceptance suite in cmd/api need the same database. Duplicating the
// bootstrap would let the two drift, and the day they drift is the day one of
// them is testing a schema production does not have.
package testinfra

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const (
	AdminUser = "sghcp_admin" // owner: runs migrations, bypasses RLS (superuser)
	AdminPass = "admin-test-pw"
	AppUser   = "sghcp_app" // least-privilege role the services use in prod
	AppPass   = "app-test-pw"
	DBName    = "sghcp"
)

// DB is a running container plus the two pools that talk to it.
type DB struct {
	Container *postgres.PostgresContainer
	// Admin sees everything: use it to seed fixtures and to assert on rows the
	// tenant under test must NOT be able to read.
	Admin *pgxpool.Pool
	// App is the role under test. RLS is enforced on it.
	App *pgxpool.Pool
	// AppURL is the connection string for the app role, for code that builds its
	// own pool (the acceptance suite hands it to the real app wiring).
	AppURL string
}

// Start boots the container and applies every migration. The caller must call
// Close; on any error nothing is left running.
func Start(ctx context.Context) (*DB, error) {
	keepReaperAlive()

	scripts, err := initScripts()
	if err != nil {
		return nil, err
	}

	ctr, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase(DBName),
		postgres.WithUsername(AdminUser),
		postgres.WithPassword(AdminPass),
		postgres.WithInitScripts(scripts...),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(3*time.Minute),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("start postgres: %w", err)
	}

	db, err := connect(ctx, ctr)
	if err != nil {
		_ = testcontainers.TerminateContainer(ctr)
		return nil, err
	}
	return db, nil
}

// keepReaperAlive stops the packages from killing each other's databases.
//
// testcontainers derives its session ID from the parent pid, so every package
// in one `go test ./...` shares a single reaper (ryuk) container. Ryuk counts
// open connections and, ten seconds after the count reaches zero, destroys
// every container labelled with that session. Two packages own a database here
// (internal/integration and the acceptance suite in cmd/api), and the moment
// the faster one's binary exits the counter briefly hits zero — so ryuk tore
// down the slower one's Postgres mid-run and its remaining tests failed with
// "connection refused" on a port nothing was listening to any more.
//
// Stretching the grace period past the runtime of the whole suite makes that
// window irrelevant. Cleanup still happens, just later; nothing leaks. Setting
// it here rather than in the Makefile or the workflow means a new package that
// calls Start inherits the fix instead of rediscovering the bug.
func keepReaperAlive() {
	const env = "TESTCONTAINERS_RYUK_RECONNECTION_TIMEOUT"
	if os.Getenv(env) == "" {
		_ = os.Setenv(env, "10m")
	}
}

func connect(ctx context.Context, ctr *postgres.PostgresContainer) (*DB, error) {
	adminURL, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return nil, err
	}
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		return nil, fmt.Errorf("admin pool: %w", err)
	}

	// setup_app_role.sql creates sghcp_app without a password (it is provided
	// out-of-band in real environments); set one so the app pool can log in.
	if _, err := admin.Exec(ctx,
		fmt.Sprintf("ALTER ROLE %s WITH LOGIN PASSWORD '%s'", AppUser, AppPass)); err != nil {
		admin.Close()
		return nil, fmt.Errorf("app role password (did setup_app_role.sql run?): %w", err)
	}

	u, err := url.Parse(adminURL)
	if err != nil {
		admin.Close()
		return nil, err
	}
	u.User = url.UserPassword(AppUser, AppPass)
	appURL := u.String()

	app, err := pgxpool.New(ctx, appURL)
	if err != nil {
		admin.Close()
		return nil, fmt.Errorf("app pool: %w", err)
	}

	return &DB{Container: ctr, Admin: admin, App: app, AppURL: appURL}, nil
}

// Close releases the pools and terminates the container.
func (d *DB) Close() {
	if d == nil {
		return
	}
	if d.App != nil {
		d.App.Close()
	}
	if d.Admin != nil {
		d.Admin.Close()
	}
	if d.Container != nil {
		_ = testcontainers.TerminateContainer(d.Container)
	}
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
		[]byte("CREATE ROLE "+AppUser+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\n"),
		0o644); err != nil {
		return nil, err
	}

	roleScript := filepath.Join(coreAPI, "..", "..", "scripts", "setup_app_role.sql")
	if _, err := os.Stat(roleScript); err != nil {
		return nil, fmt.Errorf("setup_app_role.sql: %w", err)
	}
	return append(append([]string{bootstrap}, ups...), roleScript), nil
}
