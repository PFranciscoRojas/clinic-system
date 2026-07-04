package integration

import (
	"context"
	"fmt"
	"testing"
)

// rlsTables are the tenant-scoped tables whose tenant_isolation policy this
// test proves end-to-end (SELECT, UPDATE, DELETE, INSERT WITH CHECK) as the
// real sghcp_app role. This is the system's most important invariant: org A
// must never see or touch org B's rows, even if application code forgets its
// explicit organization_id filter.
var rlsTables = []string{
	"patients",
	"clinical_records",
	"clinical_record_addenda",
	"appointments",
	"treatment_plans",
	"patient_diagnoses",
	"patient_staff_rel",
	"consents",
	"ai_drafts",
	"invoices",
	"payments",
	"notifications",
}

func TestTenantIsolation(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	orgA := seedTenant(t, "iso-a")
	orgB := seedTenant(t, "iso-b")

	t.Run("select is scoped to the GUC org", func(t *testing.T) {
		conn := asOrg(t, orgA.OrgID)
		for _, tbl := range rlsTables {
			var got int
			q := fmt.Sprintf(
				`SELECT COUNT(*) FROM %s WHERE organization_id IN ($1, $2)`, tbl)
			if err := conn.QueryRow(ctx, q, orgA.OrgID, orgB.OrgID).Scan(&got); err != nil {
				t.Fatalf("%s: %v", tbl, err)
			}
			if got != 1 {
				t.Errorf("%s: org A sees %d rows across both orgs, want exactly its own 1", tbl, got)
			}

			var leaked int
			q = fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE organization_id = $1`, tbl)
			if err := conn.QueryRow(ctx, q, orgB.OrgID).Scan(&leaked); err != nil {
				t.Fatalf("%s: %v", tbl, err)
			}
			if leaked != 0 {
				t.Errorf("%s: org A can read %d of org B's rows", tbl, leaked)
			}
		}
	})

	t.Run("blank GUC fails closed", func(t *testing.T) {
		conn := asOrg(t, "") // what an unscoped request would look like
		for _, tbl := range rlsTables {
			var got int
			if err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM `+tbl).Scan(&got); err != nil {
				t.Fatalf("%s: %v", tbl, err)
			}
			if got != 0 {
				t.Errorf("%s: blank app.current_org sees %d rows, want 0 (fail closed)", tbl, got)
			}
		}
	})

	t.Run("cross-tenant update touches zero rows", func(t *testing.T) {
		conn := asOrg(t, orgA.OrgID)
		tag, err := conn.Exec(ctx,
			`UPDATE patients SET gender = 'X' WHERE id = $1`, orgB.PatientID)
		if err != nil {
			t.Fatalf("update: %v", err)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("org A updated %d of org B's patient rows", tag.RowsAffected())
		}
	})

	t.Run("cross-tenant delete touches zero rows", func(t *testing.T) {
		conn := asOrg(t, orgA.OrgID)
		tag, err := conn.Exec(ctx,
			`DELETE FROM payments WHERE organization_id = $1`, orgB.OrgID)
		if err != nil {
			t.Fatalf("delete: %v", err)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("org A deleted %d of org B's payment rows", tag.RowsAffected())
		}
	})

	t.Run("insert for another org is rejected by WITH CHECK", func(t *testing.T) {
		conn := asOrg(t, orgA.OrgID)
		_, err := conn.Exec(ctx,
			`INSERT INTO appointments (organization_id, patient_id, staff_id, scheduled_at)
			 VALUES ($1, $2, $3, NOW())`,
			orgB.OrgID, orgB.PatientID, orgB.UserID)
		if err == nil {
			t.Fatal("org A inserted a row tagged as org B — WITH CHECK did not fire")
		}
	})

	t.Run("update cannot move a row to another org", func(t *testing.T) {
		conn := asOrg(t, orgA.OrgID)
		_, err := conn.Exec(ctx,
			`UPDATE appointments SET organization_id = $1 WHERE organization_id = $2`,
			orgB.OrgID, orgA.OrgID)
		if err == nil {
			t.Fatal("org A re-tagged its row as org B — WITH CHECK did not fire")
		}
	})
}

// TestRLSCoverageComplete guards the *list* above: any future tenant table
// (has an organization_id column) that reaches production without a
// tenant_isolation policy makes this test fail, so RLS coverage can only grow.
func TestRLSCoverageComplete(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	rows, err := adminPool.Query(ctx, `
		SELECT c.table_name
		FROM information_schema.columns c
		JOIN pg_tables pt ON pt.tablename = c.table_name AND pt.schemaname = 'public'
		WHERE c.column_name = 'organization_id' AND c.table_schema = 'public'
		  AND NOT EXISTS (
		      SELECT 1 FROM pg_policies p
		      WHERE p.schemaname = 'public' AND p.tablename = c.table_name
		  )
		ORDER BY 1`)
	if err != nil {
		t.Fatalf("querying policy coverage: %v", err)
	}
	defer rows.Close()

	// Tables that intentionally have no per-tenant policy. Additions here must
	// be deliberate, reviewed decisions.
	allowed := map[string]string{
		"users":         "auth runs before a tenant is established (login by email)",
		"roles":         "system roles are global; org column is nullable",
		"user_roles":    "resolved during auth, before TenantScope",
		"audit_log":     "append-only audit trail written across scopes",
		"domain_events": "outbox is processed by an unscoped relay",
	}

	var unprotected []string
	for rows.Next() {
		var tbl string
		if err := rows.Scan(&tbl); err != nil {
			t.Fatal(err)
		}
		if _, ok := allowed[tbl]; !ok {
			unprotected = append(unprotected, tbl)
		}
	}
	if len(unprotected) > 0 {
		t.Errorf("tables with organization_id but no RLS policy (add the policy or allow-list deliberately): %v", unprotected)
	}
}
