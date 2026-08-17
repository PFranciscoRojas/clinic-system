package integration

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
)

// These tests turn the strict rules in CLAUDE.md into executable constraints.
// They are deliberately self-discovering: instead of listing the tables and
// columns that exist today, they walk the live schema and fail on any
// violation. A table added next month is covered without anyone remembering
// to update a list — which is the whole point, since the code is increasingly
// written by agents.
//
// Each test carries an explicit allowlist. Adding an entry is the escape
// hatch, and it forces the exception to be named, justified in a comment and
// reviewed, rather than slipping through unnoticed.

// floatColumnAllowlist holds columns that may legitimately be floating point:
// values where a rounding error is harmless and NUMERIC would be overkill.
// Money must never appear here (CLAUDE.md rule 3).
var floatColumnAllowlist = map[string]string{}

// TestNoFloatingPointColumns enforces CLAUDE.md rule 3: every financial
// calculation happens in PostgreSQL using NUMERIC, never floats. Rather than
// guessing which columns hold money by name, this rejects floating point
// across the whole schema and makes each exception explicit.
func TestNoFloatingPointColumns(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	rows, err := adminPool.Query(ctx, `
		SELECT c.table_name, c.column_name, c.data_type
		  FROM information_schema.columns c
		  JOIN information_schema.tables t
		    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		 WHERE c.table_schema = 'public'
		   AND t.table_type = 'BASE TABLE'
		   AND c.data_type IN ('real', 'double precision')
		 ORDER BY c.table_name, c.column_name`)
	if err != nil {
		t.Fatalf("query information_schema: %v", err)
	}
	defer rows.Close()

	var offenders []string
	for rows.Next() {
		var table, column, dataType string
		if err := rows.Scan(&table, &column, &dataType); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if _, allowed := floatColumnAllowlist[table+"."+column]; allowed {
			continue
		}
		offenders = append(offenders, fmt.Sprintf("%s.%s is %s", table, column, dataType))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate: %v", err)
	}

	if len(offenders) > 0 {
		t.Errorf("floating point columns found — money must be NUMERIC (CLAUDE.md rule 3).\n"+
			"If one of these genuinely is not money, add it to floatColumnAllowlist with a reason:\n  %s",
			strings.Join(offenders, "\n  "))
	}

	// A clean result is only meaningful if the introspection actually sees the
	// schema. Without this, a query that silently stopped matching would make
	// the test pass for the wrong reason forever.
	var numericColumns int
	if err := adminPool.QueryRow(ctx, `
		SELECT count(*)
		  FROM information_schema.columns
		 WHERE table_schema = 'public' AND data_type = 'numeric'`).Scan(&numericColumns); err != nil {
		t.Fatalf("count numeric columns: %v", err)
	}
	if numericColumns == 0 {
		t.Fatal("no NUMERIC columns found at all — the money columns are missing or this query is broken")
	}
	t.Logf("no floating point columns; %d NUMERIC columns present", numericColumns)
}

// TestEncryptedColumnsAreBytea enforces CLAUDE.md rule 4: PII and clinical data
// live in BYTEA columns encrypted with a per-patient DEK. A column named *_enc
// that is text would mean plaintext PII sitting in the database.
func TestEncryptedColumnsAreBytea(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	rows, err := adminPool.Query(ctx, `
		SELECT c.table_name, c.column_name, c.data_type
		  FROM information_schema.columns c
		  JOIN information_schema.tables t
		    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		 WHERE c.table_schema = 'public'
		   AND t.table_type = 'BASE TABLE'
		   AND c.column_name LIKE '%\_enc'
		 ORDER BY c.table_name, c.column_name`)
	if err != nil {
		t.Fatalf("query information_schema: %v", err)
	}
	defer rows.Close()

	var offenders []string
	var checked int
	for rows.Next() {
		var table, column, dataType string
		if err := rows.Scan(&table, &column, &dataType); err != nil {
			t.Fatalf("scan: %v", err)
		}
		checked++
		if dataType != "bytea" {
			offenders = append(offenders, fmt.Sprintf("%s.%s is %s, want bytea", table, column, dataType))
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate: %v", err)
	}

	// A zero count would mean the query silently stopped matching anything,
	// making this test pass for the wrong reason.
	if checked == 0 {
		t.Fatal("no *_enc columns found at all — the encrypted-column convention or this query is broken")
	}
	if len(offenders) > 0 {
		t.Errorf("encrypted columns must be BYTEA (CLAUDE.md rule 4):\n  %s", strings.Join(offenders, "\n  "))
	}
	t.Logf("verified %d encrypted columns", checked)
}

// TestSearchHashColumnsAreNotEncrypted is the other half of rule 4: search
// happens only over SHA-256 hashes, never with LIKE over ciphertext. A *_hash
// column has to be readable and indexable, so bytea here would mean somebody
// encrypted the search key and made lookups impossible.
func TestSearchHashColumnsAreNotEncrypted(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	rows, err := adminPool.Query(ctx, `
		SELECT c.table_name, c.column_name, c.data_type
		  FROM information_schema.columns c
		  JOIN information_schema.tables t
		    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		 WHERE c.table_schema = 'public'
		   AND t.table_type = 'BASE TABLE'
		   AND c.column_name LIKE '%\_hash'
		 ORDER BY c.table_name, c.column_name`)
	if err != nil {
		t.Fatalf("query information_schema: %v", err)
	}
	defer rows.Close()

	var offenders []string
	var checked int
	for rows.Next() {
		var table, column, dataType string
		if err := rows.Scan(&table, &column, &dataType); err != nil {
			t.Fatalf("scan: %v", err)
		}
		checked++
		switch dataType {
		case "text", "character varying", "character":
		default:
			offenders = append(offenders, fmt.Sprintf("%s.%s is %s", table, column, dataType))
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate: %v", err)
	}

	if checked == 0 {
		t.Fatal("no *_hash columns found at all — the search-hash convention or this query is broken")
	}
	if len(offenders) > 0 {
		t.Errorf("search hash columns must be textual so they can be indexed and compared:\n  %s",
			strings.Join(offenders, "\n  "))
	}
	t.Logf("verified %d search hash columns", checked)
}

// rlsExemptTables carry an organization_id but deliberately have no RLS policy,
// relying on explicit org filters in application code instead. This is a ledger
// of known, accepted debt — not a list of things that are fine. Every entry
// needs a reason, and the point of the test is that the list cannot grow
// without someone writing one.
var rlsExemptTables = map[string]string{
	"users":      "read during login, before app.current_org can be known — the lookup is by email hash",
	"roles":      "resolved together with users during authentication, same ordering problem",
	"user_roles": "resolved together with users during authentication, same ordering problem",
	"audit_log":  "append-only, written from contexts that span tenants (including failed logins)",

	"trial_emails_sent": "written by the trial worker outside any request scope",

	// RLS enabled with zero policies denies every row to a non-owner, so this
	// is already stricter than a tenant policy, not looser.
	"domain_events": "RLS enabled with no policy — the app role sees no rows at all",
}

// forceRLSExemptTables have RLS enabled with a working policy but no FORCE.
// FORCE only matters for the table owner: production runs the app as
// sghcp_app, a NOSUPERUSER non-owner, so the policy already applies to every
// application query. These entries are defense-in-depth debt, staged
// deliberately by migration 000018, whose header explains that public-token
// flows (consents, booking) and the Python ai-service worker (ai_drafts) were
// left for a separately-validated migration.
var forceRLSExemptTables = map[string]string{
	"ai_drafts":           "000018: reached by the Python ai-service worker, deferred",
	"ai_suggestions":      "000018: reached by the Python ai-service worker, deferred",
	"bookings":            "000018: public-token booking flow, deferred",
	"consents":            "000018: public-token consent flow, deferred",
	"consent_templates":   "000018: public-token consent flow, deferred",
	"consent_sign_tokens": "000018: public-token consent flow, deferred",
	"patient_assessments": "000018: deferred alongside the consent flow",
	"org_payment_config":  "org-level config, reached outside the request-scoped querier",
	"org_whatsapp_config": "org-level config, reached outside the request-scoped querier",
}

// TestTenantScopedTablesHaveRLSPolicy enforces CLAUDE.md rule 2 structurally.
// rls_test.go proves isolation behaves correctly for a fixed list of tables;
// this proves nobody can add a tenant-scoped table without a policy, which is
// how that fixed list would silently fall behind.
func TestTenantScopedTablesHaveRLSPolicy(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	rows, err := adminPool.Query(ctx, `
		SELECT c.relname,
		       c.relrowsecurity,
		       c.relforcerowsecurity,
		       (SELECT count(*) FROM pg_policies p
		         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = 'public'
		   AND c.relkind = 'r'
		   AND EXISTS (
		         SELECT 1 FROM information_schema.columns ic
		          WHERE ic.table_schema = 'public'
		            AND ic.table_name = c.relname
		            AND ic.column_name = 'organization_id')
		 ORDER BY c.relname`)
	if err != nil {
		t.Fatalf("query pg_class: %v", err)
	}
	defer rows.Close()

	var missingPolicy, missingForce []string
	var checked, staleExemptions []string
	for rows.Next() {
		var table string
		var rowSecurity, forceRowSecurity bool
		var policies int
		if err := rows.Scan(&table, &rowSecurity, &forceRowSecurity, &policies); err != nil {
			t.Fatalf("scan: %v", err)
		}

		_, policyExempt := rlsExemptTables[table]
		_, forceExempt := forceRLSExemptTables[table]

		// An exemption that is no longer needed must be deleted, or the ledger
		// slowly turns into a list of things nobody has looked at in a year.
		if policyExempt && rowSecurity && policies > 0 {
			staleExemptions = append(staleExemptions,
				fmt.Sprintf("%s is in rlsExemptTables but now has RLS and %d policies", table, policies))
		}
		if forceExempt && forceRowSecurity {
			staleExemptions = append(staleExemptions,
				fmt.Sprintf("%s is in forceRLSExemptTables but now has FORCE set", table))
		}

		if policyExempt {
			continue
		}
		checked = append(checked, table)

		if !rowSecurity || policies == 0 {
			missingPolicy = append(missingPolicy,
				fmt.Sprintf("%s (rls_enabled=%v, policies=%d)", table, rowSecurity, policies))
			continue
		}
		if !forceRowSecurity && !forceExempt {
			missingForce = append(missingForce, table)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate: %v", err)
	}

	if len(checked) == 0 {
		t.Fatal("no tenant-scoped tables found at all — this query is broken")
	}

	if len(missingPolicy) > 0 {
		sort.Strings(missingPolicy)
		t.Errorf("tables with organization_id must have ROW LEVEL SECURITY and at least one policy (CLAUDE.md rule 2).\n"+
			"If a table genuinely cannot be tenant-scoped, add it to rlsExemptTables with a reason:\n  %s",
			strings.Join(missingPolicy, "\n  "))
	}
	if len(missingForce) > 0 {
		sort.Strings(missingForce)
		t.Errorf("tables with a tenant policy should also have FORCE ROW LEVEL SECURITY, so the policy survives "+
			"the app ever connecting as the table owner.\nAdd to forceRLSExemptTables with a reason if deliberate:\n  %s",
			strings.Join(missingForce, "\n  "))
	}
	if len(staleExemptions) > 0 {
		sort.Strings(staleExemptions)
		t.Errorf("these exemptions are no longer needed and must be removed from the ledger:\n  %s",
			strings.Join(staleExemptions, "\n  "))
	}

	t.Logf("verified %d tenant-scoped tables (%d exempt from policy, %d exempt from FORCE)",
		len(checked), len(rlsExemptTables), len(forceRLSExemptTables))
}

// TestEveryTableHoldingADEKIsInBothPurgePaths is the guard for the mistake this
// migration nearly shipped: partial_transcripts names an encryption_keys row,
// and the admin purge decides which keys to drop by listing, by hand, the
// tables that reference one. A table missing from that list leaves a wrapped
// key behind for every row it ever held, in an organization that is supposed to
// be gone.
//
// Self-discovering rather than a list, for the same reason as the rest of
// schema_invariants_test.go: the next table to hold a dek_id is covered without
// anyone remembering this file exists.
func TestEveryTableHoldingADEKIsInBothPurgePaths(t *testing.T) {
	skipIfShort(t)

	rows, err := adminPool.Query(context.Background(), `
		SELECT c.table_name
		  FROM information_schema.columns c
		  JOIN information_schema.tables t
		    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		 WHERE c.table_schema = 'public'
		   AND t.table_type = 'BASE TABLE'
		   AND c.column_name LIKE '%dek_id'
		 ORDER BY c.table_name`)
	if err != nil {
		t.Fatalf("query information_schema: %v", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	if len(tables) < 5 {
		t.Fatalf("only found %d tables with a dek_id; the query is wrong", len(tables))
	}

	// reset.go wipes a test org's clinical data; orgdelete.go removes the org
	// entirely. Both build the doomed_deks list themselves, so both can be
	// wrong independently.
	for _, path := range []string{
		"../admin/handler/orgdelete.go",
		"../admin/handler/reset.go",
	} {
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		doomed := between(string(src), "CREATE TEMP TABLE doomed_deks", "`, orgID)")
		if doomed == "" {
			t.Fatalf("%s: could not find the doomed_deks query", path)
		}
		for _, table := range tables {
			// Only tables this path actually empties. reset.go leaves users and
			// their professional_profiles alone on purpose — it wipes a test
			// org's clinical data, not the org — so its signature DEK is a key
			// somebody still needs, not one left behind.
			if !strings.Contains(string(src), "DELETE FROM "+table+" ") {
				continue
			}
			if !strings.Contains(doomed, " "+table+" ") {
				t.Errorf("%s: rows are deleted from %q, which holds a DEK, but the "+
					"table is not in doomed_deks: the wrapped keys survive the purge", path, table)
			}
		}
	}
}

func between(s, start, end string) string {
	i := strings.Index(s, start)
	if i < 0 {
		return ""
	}
	rest := s[i:]
	j := strings.Index(rest, end)
	if j < 0 {
		return ""
	}
	return rest[:j]
}
