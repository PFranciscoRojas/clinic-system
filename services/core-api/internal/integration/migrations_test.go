package integration

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Nobody runs the down migrations. They are written, reviewed and never
// executed — until the one night a deploy has to be rolled back, which is the
// worst possible moment to discover that 000043's down references a column
// 000041's down already dropped.
//
// This test is the only thing that exercises them: apply every up, then every
// down in reverse, then every up again, on a container of its own so the shared
// harness is untouched.

// migrationFiles returns the up and down files, both in ascending order.
func migrationFiles(t *testing.T) (ups, downs []string) {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(filepath.Dir(filepath.Dir(thisFile))), "migrations")

	var err error
	ups, err = filepath.Glob(filepath.Join(dir, "*.up.sql"))
	if err != nil || len(ups) == 0 {
		t.Fatalf("no up migrations in %s: %v", dir, err)
	}
	downs, err = filepath.Glob(filepath.Join(dir, "*.down.sql"))
	if err != nil {
		t.Fatalf("glob downs: %v", err)
	}
	sort.Strings(ups)
	sort.Strings(downs)
	return ups, downs
}

// TestEveryMigrationHasADown is the cheap half, and runs without Docker: a
// missing down file is a rollback that cannot happen at all.
func TestEveryMigrationHasADown(t *testing.T) {
	ups, downs := migrationFiles(t)

	have := make(map[string]bool, len(downs))
	for _, d := range downs {
		have[strings.TrimSuffix(filepath.Base(d), ".down.sql")] = true
	}

	var missing []string
	for _, u := range ups {
		name := strings.TrimSuffix(filepath.Base(u), ".up.sql")
		if !have[name] {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%d migrations have no .down.sql:\n  %s", len(missing), strings.Join(missing, "\n  "))
	}

	// And the reverse: a down with no up is a leftover.
	haveUp := make(map[string]bool, len(ups))
	for _, u := range ups {
		haveUp[strings.TrimSuffix(filepath.Base(u), ".up.sql")] = true
	}
	for _, d := range downs {
		name := strings.TrimSuffix(filepath.Base(d), ".down.sql")
		if !haveUp[name] {
			t.Errorf("%s.down.sql has no matching up migration", name)
		}
	}
}

// runSQLFile executes one migration file as a single batch, the way
// golang-migrate does.
func runSQLFile(ctx context.Context, conn *pgx.Conn, path string) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if _, err := conn.Exec(ctx, string(body)); err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	return nil
}

// schemaFingerprint is every column of every table in the public schema, in a
// stable order. Comparing it before and after a down/up cycle is what catches a
// down that only *mostly* undoes its up.
func schemaFingerprint(ctx context.Context, conn *pgx.Conn) (string, error) {
	rows, err := conn.Query(ctx, `
		SELECT table_name, column_name, data_type, is_nullable, COALESCE(column_default, '')
		FROM information_schema.columns
		WHERE table_schema = 'public'
		ORDER BY table_name, column_name`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var b strings.Builder
	for rows.Next() {
		var tbl, col, typ, nullable, def string
		if err := rows.Scan(&tbl, &col, &typ, &nullable, &def); err != nil {
			return "", err
		}
		fmt.Fprintf(&b, "%s.%s %s %s %s\n", tbl, col, typ, nullable, def)
	}
	return b.String(), rows.Err()
}

func TestMigrationsAreReversible(t *testing.T) {
	skipIfShort(t)

	ups, downs := migrationFiles(t)
	ctx := context.Background()

	// A container of its own: this test rewrites the whole schema twice, so it
	// must not share the harness every other test depends on.
	ctr, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase(dbName),
		postgres.WithUsername(adminUser),
		postgres.WithPassword(adminPass),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(3*time.Minute),
		),
	)
	if err != nil {
		t.Fatalf("start container: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("dsn: %v", err)
	}
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close(context.Background()) })

	// The app role predates the migrations everywhere it matters; several of
	// them GRANT to it directly.
	if _, err := conn.Exec(ctx,
		"CREATE ROLE "+appUser+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"); err != nil {
		t.Fatalf("bootstrap app role: %v", err)
	}

	applyAll := func(t *testing.T, files []string, label string) {
		t.Helper()
		for _, f := range files {
			if err := runSQLFile(ctx, conn, f); err != nil {
				t.Fatalf("%s: %v", label, err)
			}
		}
	}

	applyAll(t, ups, "first up")

	before, err := schemaFingerprint(ctx, conn)
	if err != nil {
		t.Fatalf("fingerprint after first up: %v", err)
	}
	if before == "" {
		t.Fatal("the schema is empty after applying every up migration")
	}

	// Down, newest first — the order a rollback actually runs in.
	reversed := make([]string, len(downs))
	for i, d := range downs {
		reversed[len(downs)-1-i] = d
	}
	applyAll(t, reversed, "down")

	// Everything the migrations created must be gone. A leftover table means
	// the next `up` runs against dirty state, which is how a rollback turns
	// into a two-hour incident.
	var leftovers []string
	rows, err := conn.Query(ctx,
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		leftovers = append(leftovers, name)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(leftovers) > 0 {
		t.Errorf("%d tables survived a full rollback: %s", len(leftovers), strings.Join(leftovers, ", "))
	}

	applyAll(t, ups, "second up")

	after, err := schemaFingerprint(ctx, conn)
	if err != nil {
		t.Fatalf("fingerprint after second up: %v", err)
	}

	if before != after {
		t.Errorf("the schema differs after up → down → up:\n%s", diffLines(before, after))
	}
}

// diffLines reports the lines present in one fingerprint but not the other,
// capped so a wholesale difference does not bury the output.
func diffLines(before, after string) string {
	inAfter := make(map[string]bool)
	for _, l := range strings.Split(after, "\n") {
		inAfter[l] = true
	}
	inBefore := make(map[string]bool)
	for _, l := range strings.Split(before, "\n") {
		inBefore[l] = true
	}

	var b strings.Builder
	var n int
	for _, l := range strings.Split(before, "\n") {
		if l != "" && !inAfter[l] && n < 20 {
			fmt.Fprintf(&b, "  lost:  %s\n", l)
			n++
		}
	}
	for _, l := range strings.Split(after, "\n") {
		if l != "" && !inBefore[l] && n < 40 {
			fmt.Fprintf(&b, "  extra: %s\n", l)
			n++
		}
	}
	return b.String()
}
