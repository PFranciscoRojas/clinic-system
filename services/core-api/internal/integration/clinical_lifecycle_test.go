package integration

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"sghcp/core-api/internal/clinicalrecords"
	crrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crservice "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/shared/crypto"
)

func newClinicalService(t *testing.T) *crservice.Service {
	t.Helper()
	km, err := crypto.NewKeyManager(strings.Repeat("cd", 32))
	if err != nil {
		t.Fatalf("key manager: %v", err)
	}
	return crservice.New(crrepo.New(appPool), km)
}

// initialSections satisfies the INITIAL strict template (required:
// consultation_reason, current_problem, mental_exam).
func initialSections() map[string]any {
	return map[string]any{
		"consultation_reason": "ansiedad ante exámenes",
		"current_problem":     "insomnio y rumiación desde hace 3 meses",
		"mental_exam":         map[string]any{"appearance": map[string]any{"status": "NORMAL"}},
	}
}

// TestClinicalRecordLifecycle drives the exact path the SPA uses:
// autosave draft → incremental saves → finalize (strict validation) →
// approve → immutable → addenda. This is the ground the session 22–24
// content-loss bugs lived on.
func TestClinicalRecordLifecycle(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "lifecycle")
	ctx := scopedCtx(t, tn.OrgID)
	svc := newClinicalService(t)

	base := crservice.CreateInput{
		OrganizationID:     tn.OrgID,
		PatientID:          tn.PatientID,
		ResponsibleStaffID: tn.UserID,
		CreatedBy:          tn.UserID,
		RecordType:         clinicalrecords.RecordTypeInitial,
		SessionDate:        time.Now(),
	}

	t.Run("EVOLUTION before any INITIAL is rejected (no open process)", func(t *testing.T) {
		in := base
		in.RecordType = clinicalrecords.RecordTypeEvolution
		in.Sections = map[string]any{"session_development": "x"}
		if _, err := svc.CreateDraft(ctx, in); !errors.Is(err, clinicalrecords.ErrNoOpenProcess) {
			t.Fatalf("got %v, want ErrNoOpenProcess", err)
		}
	})

	// ── autosave draft with partial content ────────────────────────────────
	in := base
	in.Sections = map[string]any{"consultation_reason": "ansiedad"}
	recordID, err := svc.CreateDraft(ctx, in)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}

	t.Run("unknown section keys are rejected even on lenient autosave", func(t *testing.T) {
		err := svc.UpdateDraft(ctx, crservice.UpdateInput{
			ID: recordID, OrganizationID: tn.OrgID,
			Sections: map[string]any{"totally_made_up_key": "x"},
		})
		if !errors.Is(err, clinicalrecords.ErrInvalidInput) {
			t.Fatalf("got %v, want ErrInvalidInput", err)
		}
	})

	if err := svc.UpdateDraft(ctx, crservice.UpdateInput{
		ID: recordID, OrganizationID: tn.OrgID, Sections: initialSections(),
	}); err != nil {
		t.Fatalf("autosave tick: %v", err)
	}

	t.Run("finalize enforces the strict template", func(t *testing.T) {
		err := svc.Finalize(ctx, crservice.UpdateInput{
			ID: recordID, OrganizationID: tn.OrgID,
			Sections:  map[string]any{"consultation_reason": "solo esto"},
			RiskLevel: clinicalrecords.RiskNone,
		})
		if !errors.Is(err, clinicalrecords.ErrMissingSection) {
			t.Fatalf("got %v, want ErrMissingSection", err)
		}
	})

	if err := svc.Finalize(ctx, crservice.UpdateInput{
		ID: recordID, OrganizationID: tn.OrgID,
		Sections: initialSections(), RiskLevel: clinicalrecords.RiskNone,
	}); err != nil {
		t.Fatalf("finalize: %v", err)
	}

	t.Run("a second INITIAL is blocked while the process is open", func(t *testing.T) {
		in := base
		in.Sections = map[string]any{"consultation_reason": "otro proceso"}
		if _, err := svc.CreateDraft(ctx, in); !errors.Is(err, clinicalrecords.ErrOpenProcessExists) {
			t.Fatalf("got %v, want ErrOpenProcessExists", err)
		}
	})

	// ── approve ────────────────────────────────────────────────────────────
	t.Run("an intern cannot approve", func(t *testing.T) {
		if _, err := svc.Approve(ctx, tn.OrgID, recordID, []string{"INTERN"}); !errors.Is(err, clinicalrecords.ErrInternCannotApprove) {
			t.Fatalf("got %v, want ErrInternCannotApprove", err)
		}
	})

	patientID, err := svc.Approve(ctx, tn.OrgID, recordID, []string{"PROFESSIONAL"})
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	if patientID != tn.PatientID {
		t.Fatalf("approve returned patient %s, want %s", patientID, tn.PatientID)
	}

	// ── immutability ───────────────────────────────────────────────────────
	t.Run("an approved record is immutable", func(t *testing.T) {
		err := svc.UpdateDraft(ctx, crservice.UpdateInput{
			ID: recordID, OrganizationID: tn.OrgID, Sections: initialSections(),
		})
		if !errors.Is(err, clinicalrecords.ErrNotDraft) {
			t.Fatalf("update after approve: got %v, want ErrNotDraft", err)
		}
		if _, err := svc.Approve(ctx, tn.OrgID, recordID, []string{"PROFESSIONAL"}); !errors.Is(err, clinicalrecords.ErrNotDraft) {
			t.Fatalf("double approve: got %v, want ErrNotDraft", err)
		}
	})

	// ── addenda ────────────────────────────────────────────────────────────
	t.Run("addenda attach to approved records and round-trip through the DEK", func(t *testing.T) {
		const note = "el paciente reporta mejoría tras la sesión — nota posterior"
		if _, err := svc.AddAddendum(ctx, tn.OrgID, recordID, tn.UserID, note); err != nil {
			t.Fatalf("add addendum: %v", err)
		}

		addenda, err := svc.ListAddenda(ctx, tn.OrgID, recordID)
		if err != nil {
			t.Fatalf("list addenda: %v", err)
		}
		if len(addenda) != 1 || addenda[0].Content != note {
			t.Fatalf("addendum did not round-trip: %+v", addenda)
		}

		// And the DB never saw the plaintext.
		var raw []byte
		if err := adminPool.QueryRow(context.Background(),
			`SELECT content_enc FROM clinical_record_addenda WHERE id = $1`, addenda[0].ID,
		).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(raw), "mejoría") {
			t.Fatal("addendum stored in plaintext")
		}
	})

	t.Run("addenda are rejected on a DRAFT record", func(t *testing.T) {
		in := base
		in.RecordType = clinicalrecords.RecordTypeEvolution
		in.Sections = map[string]any{"session_development": "seguimiento"}
		draftID, err := svc.CreateDraft(ctx, in)
		if err != nil {
			t.Fatalf("create evolution draft: %v", err)
		}
		if _, err := svc.AddAddendum(ctx, tn.OrgID, draftID, tn.UserID, "nota"); !errors.Is(err, clinicalrecords.ErrNotApproved) {
			t.Fatalf("got %v, want ErrNotApproved", err)
		}
	})
}

// TestClinicalRecordCosign covers the supervised-intern path: a record that
// requires cosign cannot be approved until the supervisor signs.
func TestClinicalRecordCosign(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "cosign")
	ctx := scopedCtx(t, tn.OrgID)
	svc := newClinicalService(t)

	var supervisorID string
	if err := adminPool.QueryRow(context.Background(),
		`INSERT INTO users (organization_id, email, email_hash, password_hash)
		 VALUES ($1, 'supervisor@test.local', 'emailhash-cosign-sup', 'x') RETURNING id`,
		tn.OrgID,
	).Scan(&supervisorID); err != nil {
		t.Fatal(err)
	}

	recordID, err := svc.CreateDraft(ctx, crservice.CreateInput{
		OrganizationID:     tn.OrgID,
		PatientID:          tn.PatientID,
		ResponsibleStaffID: tn.UserID,
		CreatedBy:          tn.UserID,
		RecordType:         clinicalrecords.RecordTypeInitial,
		SessionDate:        time.Now(),
		Sections:           initialSections(),
		RequiresCosign:     true,
		SupervisorID:       supervisorID,
	})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if err := svc.Finalize(ctx, crservice.UpdateInput{
		ID: recordID, OrganizationID: tn.OrgID,
		Sections: initialSections(), RiskLevel: clinicalrecords.RiskNone,
	}); err != nil {
		t.Fatalf("finalize: %v", err)
	}

	if _, err := svc.Approve(ctx, tn.OrgID, recordID, []string{"PROFESSIONAL"}); !errors.Is(err, clinicalrecords.ErrCosignRequired) {
		t.Fatalf("approve before cosign: got %v, want ErrCosignRequired", err)
	}

	if err := svc.Cosign(ctx, tn.OrgID, recordID, supervisorID); err != nil {
		t.Fatalf("cosign: %v", err)
	}
	if _, err := svc.Approve(ctx, tn.OrgID, recordID, []string{"PROFESSIONAL"}); err != nil {
		t.Fatalf("approve after cosign: %v", err)
	}
}
