package integration

import (
	"context"
	"testing"

	"sghcp/core-api/internal/auditlog"
	auditrepo "sghcp/core-api/internal/auditlog/repository"
	"sghcp/core-api/internal/clinicalrecords"
	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
)

// TestBulkExportScope covers the archive the professional downloads to exercise
// their duty of custody (Res. 1995/1999). It is the widest read in the product,
// so the two things that must hold are: only approved records go in, and a
// professional never sweeps up a patient they do not treat.
func TestBulkExportScope(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "bulkexp") // patient + PRIMARY_THERAPIST rel for tn.UserID
	ctx := scopedCtx(t, tn.OrgID)
	repo := crrrepo.New(appPool)

	bg := context.Background()

	// The seeded record is a DRAFT; approve it so there is something to export.
	if _, err := adminPool.Exec(bg,
		`UPDATE clinical_records SET status = 'APPROVED', session_number = 1 WHERE id = $1`,
		tn.RecordID); err != nil {
		t.Fatal(err)
	}

	// A second patient in the same org that this professional does NOT treat,
	// with an approved record of their own.
	var otherPatient, otherRecord, otherStaff string
	if err := adminPool.QueryRow(bg,
		`INSERT INTO users (organization_id, email, email_hash, password_hash)
		 VALUES ($1, 'other@test.local', 'emailhash-bulkexp-other', 'x') RETURNING id`,
		tn.OrgID).Scan(&otherStaff); err != nil {
		t.Fatal(err)
	}
	if err := adminPool.QueryRow(bg,
		`INSERT INTO patients (
		    organization_id, document_type_code, dek_id,
		    first_name_enc, paternal_last_name_enc, paternal_last_name_hash,
		    full_name_search_hash, document_number_enc, doc_search_hash, birth_date
		 ) VALUES ($1, 'CC', $2, $3, $3, $4, $4, $3, $4, '1990-01-01') RETURNING id`,
		tn.OrgID, tn.DekID, []byte("enc-bulkexp-other"), "hash-bulkexp-other",
	).Scan(&otherPatient); err != nil {
		t.Fatal(err)
	}
	if err := adminPool.QueryRow(bg,
		`INSERT INTO clinical_records (
		    organization_id, patient_id, responsible_staff_id, created_by,
		    dek_id, record_type, session_date, status
		 ) VALUES ($1, $2, $3, $3, $4, 'EVOLUTION', CURRENT_DATE, 'APPROVED') RETURNING id`,
		tn.OrgID, otherPatient, otherStaff, tn.DekID,
	).Scan(&otherRecord); err != nil {
		t.Fatal(err)
	}
	if _, err := adminPool.Exec(bg,
		`INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
		 VALUES ($1, $2, $3, 'PRIMARY_THERAPIST')`,
		tn.OrgID, otherPatient, otherStaff); err != nil {
		t.Fatal(err)
	}

	base := clinicalrecords.ExportFilter{
		OrganizationID: tn.OrgID,
		StaffID:        tn.UserID,
		Limit:          100,
	}

	t.Run("professional gets only their own treatment team", func(t *testing.T) {
		got, err := repo.ListApprovedForExport(ctx, base)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 || got[0].ID != tn.RecordID {
			t.Fatalf("expected only the assigned patient's record, got %+v", got)
		}
		if got[0].SessionNumber == nil || *got[0].SessionNumber != 1 {
			t.Fatalf("session_number not carried from the selection query: %+v", got[0])
		}
	})

	t.Run("see-all sweeps the whole organization", func(t *testing.T) {
		f := base
		f.SeeAll = true
		got, err := repo.ListApprovedForExport(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 {
			t.Fatalf("expected both approved records, got %d", len(got))
		}
	})

	t.Run("a cosign supervisor reaches the record they must sign", func(t *testing.T) {
		if _, err := adminPool.Exec(bg,
			`UPDATE clinical_records SET requires_cosign = TRUE, supervisor_id = $1 WHERE id = $2`,
			tn.UserID, otherRecord); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = adminPool.Exec(bg,
				`UPDATE clinical_records SET requires_cosign = FALSE, supervisor_id = NULL WHERE id = $1`,
				otherRecord)
		})

		got, err := repo.ListApprovedForExport(ctx, base)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 {
			t.Fatalf("supervisor did not reach the record they cosign: got %d", len(got))
		}
	})

	t.Run("drafts never enter a custody copy", func(t *testing.T) {
		if _, err := adminPool.Exec(bg,
			`UPDATE clinical_records SET status = 'DRAFT' WHERE id = $1`, tn.RecordID); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = adminPool.Exec(bg,
				`UPDATE clinical_records SET status = 'APPROVED' WHERE id = $1`, tn.RecordID)
		})

		got, err := repo.ListApprovedForExport(ctx, base)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("an unsigned draft was selected for export: %+v", got)
		}
	})

	t.Run("another tenant's records are invisible", func(t *testing.T) {
		other := seedTenant(t, "bulkexp2")
		if _, err := adminPool.Exec(bg,
			`UPDATE clinical_records SET status = 'APPROVED' WHERE id = $1`, other.RecordID); err != nil {
			t.Fatal(err)
		}

		f := base
		f.SeeAll = true
		got, err := repo.ListApprovedForExport(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range got {
			if e.ID == other.RecordID {
				t.Fatal("bulk export crossed the tenant boundary")
			}
		}
	})
}

// TestAuditLogScope covers the read side of the trail. audit_log has no RLS
// policy of its own, so the organization filter in the query is the only thing
// standing between two tenants — and a professional must not be able to use the
// log to learn about patients they do not treat.
func TestAuditLogScope(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "auditrd")
	ctx := scopedCtx(t, tn.OrgID)
	repo := auditrepo.New(appPool)
	bg := context.Background()

	// A colleague in the same org, treating a patient of their own.
	var colleague, theirPatient, theirRecord string
	if err := adminPool.QueryRow(bg,
		`INSERT INTO users (organization_id, email, email_hash, password_hash)
		 VALUES ($1, 'colleague@test.local', 'emailhash-auditrd-colleague', 'x') RETURNING id`,
		tn.OrgID).Scan(&colleague); err != nil {
		t.Fatal(err)
	}
	if err := adminPool.QueryRow(bg,
		`INSERT INTO patients (
		    organization_id, document_type_code, dek_id,
		    first_name_enc, paternal_last_name_enc, paternal_last_name_hash,
		    full_name_search_hash, document_number_enc, doc_search_hash, birth_date
		 ) VALUES ($1, 'CC', $2, $3, $3, $4, $4, $3, $4, '1990-01-01') RETURNING id`,
		tn.OrgID, tn.DekID, []byte("enc-auditrd-their"), "hash-auditrd-their",
	).Scan(&theirPatient); err != nil {
		t.Fatal(err)
	}
	if err := adminPool.QueryRow(bg,
		`INSERT INTO clinical_records (
		    organization_id, patient_id, responsible_staff_id, created_by,
		    dek_id, record_type, session_date
		 ) VALUES ($1, $2, $3, $3, $4, 'EVOLUTION', CURRENT_DATE) RETURNING id`,
		tn.OrgID, theirPatient, colleague, tn.DekID,
	).Scan(&theirRecord); err != nil {
		t.Fatal(err)
	}
	if _, err := adminPool.Exec(bg,
		`INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
		 VALUES ($1, $2, $3, 'PRIMARY_THERAPIST')`,
		tn.OrgID, theirPatient, colleague); err != nil {
		t.Fatal(err)
	}

	// Three entries: the colleague reading our patient's record (visible to us),
	// the colleague reading their own patient's record (not ours to see), and
	// our own action (always visible).
	writeEntry := func(userID, action, resourceType, resourceID string) {
		t.Helper()
		if _, err := adminPool.Exec(bg, `
			INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, success)
			VALUES ($1, $2, $3, $4, $5::uuid, TRUE)`,
			tn.OrgID, userID, action, resourceType, resourceID); err != nil {
			t.Fatal(err)
		}
	}
	writeEntry(colleague, "CLINICAL_RECORD_READ", "clinical_record", tn.RecordID)
	writeEntry(colleague, "CLINICAL_RECORD_READ", "clinical_record", theirRecord)
	writeEntry(tn.UserID, "CLINICAL_RECORD_EXPORT", "clinical_record", tn.RecordID)

	base := auditlog.Filter{
		OrganizationID: tn.OrgID,
		UserID:         tn.UserID,
		Limit:          100,
	}

	has := func(items []auditlog.Entry, resourceID string) bool {
		for _, e := range items {
			if e.ResourceID != nil && *e.ResourceID == resourceID {
				return true
			}
		}
		return false
	}

	t.Run("professional sees their team but not a colleague's patient", func(t *testing.T) {
		items, err := repo.List(ctx, base)
		if err != nil {
			t.Fatal(err)
		}
		if !has(items, tn.RecordID) {
			t.Fatal("professional cannot see an access to their own patient's record")
		}
		if has(items, theirRecord) {
			t.Fatal("professional saw an access to a patient they do not treat")
		}
	})

	t.Run("only_mine drops everyone else, admin included", func(t *testing.T) {
		f := base
		f.OnlyMine = true
		f.OrgWide = true
		items, err := repo.List(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range items {
			if !e.IsSelf {
				t.Fatalf("only_mine returned another user's entry: %+v", e)
			}
		}
		if len(items) == 0 {
			t.Fatal("only_mine hid the caller's own entry")
		}
	})

	t.Run("admin sees the whole organization", func(t *testing.T) {
		f := base
		f.OrgWide = true
		items, err := repo.List(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		if !has(items, theirRecord) {
			t.Fatal("org-wide read missed a colleague's entry")
		}
	})

	t.Run("another tenant's trail is invisible", func(t *testing.T) {
		other := seedTenant(t, "auditrd2")
		if _, err := adminPool.Exec(bg, `
			INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, success)
			VALUES ($1, $2, 'CLINICAL_RECORD_READ', 'clinical_record', $3::uuid, TRUE)`,
			other.OrgID, other.UserID, other.RecordID); err != nil {
			t.Fatal(err)
		}

		f := base
		f.OrgWide = true
		items, err := repo.List(ctx, f)
		if err != nil {
			t.Fatal(err)
		}
		if has(items, other.RecordID) {
			t.Fatal("audit read crossed the tenant boundary")
		}
	})
}
