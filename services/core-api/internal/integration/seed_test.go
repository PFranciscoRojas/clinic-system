package integration

import (
	"context"
	"testing"
	"time"
)

// tenant is one fully-populated organization: a row in every RLS-protected
// table the isolation test covers. All seeding goes through the admin pool
// (the owner bypasses RLS), mirroring how migrations/backfills work.
type tenant struct {
	OrgID     string
	UserID    string
	DekID     string
	PatientID string
	RecordID  string
	InvoiceID string
}

func seedTenant(t *testing.T, slug string) tenant {
	t.Helper()
	ctx := context.Background()
	var tn tenant

	err := adminPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"Org "+slug, slug,
	).Scan(&tn.OrgID)
	if err != nil {
		t.Fatalf("seed organization %s: %v", slug, err)
	}

	err = adminPool.QueryRow(ctx,
		`INSERT INTO users (organization_id, email, email_hash, password_hash, email_verified_at)
		 VALUES ($1, $2, $3, 'not-a-real-hash', NOW()) RETURNING id`,
		tn.OrgID, slug+"@test.local", "emailhash-"+slug,
	).Scan(&tn.UserID)
	if err != nil {
		t.Fatalf("seed user %s: %v", slug, err)
	}

	err = adminPool.QueryRow(ctx,
		`INSERT INTO encryption_keys (encrypted_dek, key_source)
		 VALUES ($1, 'env:MASTER_KEY') RETURNING id`,
		[]byte("fake-dek-"+slug),
	).Scan(&tn.DekID)
	if err != nil {
		t.Fatalf("seed dek %s: %v", slug, err)
	}

	err = adminPool.QueryRow(ctx,
		`INSERT INTO patients (
		    organization_id, document_type_code, dek_id,
		    first_name_enc, paternal_last_name_enc, paternal_last_name_hash,
		    full_name_search_hash, document_number_enc, doc_search_hash, birth_date
		 ) VALUES ($1, 'CC', $2, $3, $3, $4, $4, $3, $4, '1990-01-01')
		 RETURNING id`,
		tn.OrgID, tn.DekID, []byte("enc-"+slug), "hash-"+slug,
	).Scan(&tn.PatientID)
	if err != nil {
		t.Fatalf("seed patient %s: %v", slug, err)
	}

	var apptID string
	err = adminPool.QueryRow(ctx,
		`INSERT INTO appointments (organization_id, patient_id, staff_id, scheduled_at)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, time.Now().Add(24*time.Hour),
	).Scan(&apptID)
	if err != nil {
		t.Fatalf("seed appointment %s: %v", slug, err)
	}

	err = adminPool.QueryRow(ctx,
		`INSERT INTO clinical_records (
		    organization_id, patient_id, responsible_staff_id, created_by,
		    dek_id, record_type, session_date
		 ) VALUES ($1, $2, $3, $3, $4, 'EVOLUTION', CURRENT_DATE)
		 RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID,
	).Scan(&tn.RecordID)
	if err != nil {
		t.Fatalf("seed clinical_record %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO clinical_record_addenda (record_id, organization_id, created_by, content_enc)
		 VALUES ($1, $2, $3, $4)`,
		tn.RecordID, tn.OrgID, tn.UserID, []byte("addendum-"+slug),
	); err != nil {
		t.Fatalf("seed addendum %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO treatment_plans (organization_id, patient_id, staff_id, dek_id, title_enc, start_date)
		 VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, []byte("plan-"+slug),
	); err != nil {
		t.Fatalf("seed treatment_plan %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
		 VALUES ($1, $2, $3, 'PRIMARY_THERAPIST')`,
		tn.OrgID, tn.PatientID, tn.UserID,
	); err != nil {
		t.Fatalf("seed patient_staff_rel %s: %v", slug, err)
	}

	// icd10_codes is a shared catalog seeded by migrations; make the FK target
	// explicit so the test never depends on the catalog's exact contents.
	if _, err = adminPool.Exec(ctx,
		`INSERT INTO icd10_codes (code, description, chapter)
		 VALUES ('F41.1', 'Generalized anxiety disorder', 'F')
		 ON CONFLICT (code) DO NOTHING`,
	); err != nil {
		t.Fatalf("seed icd10 catalog: %v", err)
	}
	if _, err = adminPool.Exec(ctx,
		`INSERT INTO patient_diagnoses (organization_id, patient_id, staff_id, icd10_code)
		 VALUES ($1, $2, $3, 'F41.1')`,
		tn.OrgID, tn.PatientID, tn.UserID,
	); err != nil {
		t.Fatalf("seed diagnosis %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO consents (
		    organization_id, patient_id, staff_id, dek_id, consent_type,
		    signing_method, document_enc, document_template_hash, signature_enc, signed_at
		 ) VALUES ($1, $2, $3, $4, 'TREATMENT', 'DIGITAL', $5, 'tpl-hash', $5, NOW())`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, []byte("doc-"+slug),
	); err != nil {
		t.Fatalf("seed consent %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO ai_drafts (
		    organization_id, patient_id, requested_by, dek_id,
		    ai_model_version, whisper_model
		 ) VALUES ($1, $2, $3, $4, 'test-model', 'tiny')`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID,
	); err != nil {
		t.Fatalf("seed ai_draft %s: %v", slug, err)
	}

	err = adminPool.QueryRow(ctx,
		`INSERT INTO invoices (organization_id, patient_id, dek_id, subtotal, total_due, created_by)
		 VALUES ($1, $2, $3, 100000.00, 100000.00, $4) RETURNING id`,
		tn.OrgID, tn.PatientID, tn.DekID, tn.UserID,
	).Scan(&tn.InvoiceID)
	if err != nil {
		t.Fatalf("seed invoice %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO payments (organization_id, invoice_id, amount, payment_method, paid_at, recorded_by)
		 VALUES ($1, $2, 50000.00, 'CASH', NOW(), $3)`,
		tn.OrgID, tn.InvoiceID, tn.UserID,
	); err != nil {
		t.Fatalf("seed payment %s: %v", slug, err)
	}

	if _, err = adminPool.Exec(ctx,
		`INSERT INTO notifications (organization_id, recipient_user_id, kind, title)
		 VALUES ($1, $2, 'NEW_PATIENT', 'seed')`,
		tn.OrgID, tn.UserID,
	); err != nil {
		t.Fatalf("seed notification %s: %v", slug, err)
	}

	return tn
}
