package integration

import (
	"context"
	"errors"
	"testing"

	"sghcp/core-api/internal/aidrafts"
	adrepo "sghcp/core-api/internal/aidrafts/repository"
	"sghcp/core-api/internal/shared/dbctx"
)

func seedDraft(t *testing.T, tn tenant, status string) string {
	t.Helper()
	var id string
	err := adminPool.QueryRow(context.Background(),
		`INSERT INTO ai_drafts (organization_id, patient_id, requested_by, dek_id,
		                        ai_model_version, whisper_model, status)
		 VALUES ($1, $2, $3, $4, 'test-model', 'test-whisper', $5) RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, status,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed ai_draft: %v", err)
	}
	return id
}

// TestAIDraftResolve is the regression test for the double-approval bug: the
// approve endpoint created the clinical record but Resolve ran on the raw
// pool — no app.current_org GUC, so the RLS policy on ai_drafts matched zero
// rows and the draft silently stayed DRAFT_READY, letting the professional
// approve it again and again (n records, n diagnoses).
func TestAIDraftResolve(t *testing.T) {
	skipIfShort(t)
	repo := adrepo.New(appPool)
	tn := seedTenant(t, "drafts-a")
	draftID := seedDraft(t, tn, "DRAFT_READY")

	// Tenant-scoped context — what TenantScope puts there per request.
	ctx := dbctx.WithQuerier(context.Background(), asOrg(t, tn.OrgID))

	if err := repo.Resolve(ctx, tn.OrgID, draftID, tn.RecordID, tn.UserID); err != nil {
		t.Fatalf("resolve on tenant-scoped ctx: %v", err)
	}

	var status string
	var recordID *string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT status, clinical_record_id::text FROM ai_drafts WHERE id = $1`, draftID,
	).Scan(&status, &recordID); err != nil {
		t.Fatalf("read back draft: %v", err)
	}
	if status != "APPROVED" {
		t.Fatalf("draft status = %q, want APPROVED", status)
	}
	if recordID == nil || *recordID != tn.RecordID {
		t.Fatalf("draft clinical_record_id = %v, want %s", recordID, tn.RecordID)
	}

	// A second resolve must fail: the draft is no longer DRAFT_READY.
	if err := repo.Resolve(ctx, tn.OrgID, draftID, tn.RecordID, tn.UserID); !errors.Is(err, aidrafts.ErrNotFound) {
		t.Fatalf("second resolve: got %v, want ErrNotFound", err)
	}
}

// TestAIDraftTemplateRoundtrip pins the fix for the "draft ignores the custom
// format" bug: template_id used to travel only in the Redis job, so the review
// endpoint could never tell the SPA which format to render and it always fell
// back to the hardcoded integrated sections.
func TestAIDraftTemplateRoundtrip(t *testing.T) {
	skipIfShort(t)
	repo := adrepo.New(appPool)
	tn := seedTenant(t, "drafts-c")

	var templateID string
	if err := adminPool.QueryRow(context.Background(),
		`INSERT INTO clinical_record_templates
		        (organization_id, name, record_type, source_markdown, schema, created_by)
		 VALUES ($1, 'Formato test', 'EVOLUTION', '# t', '[{"key":"estado","label":"Estado","type":"text"}]', $2)
		 RETURNING id`,
		tn.OrgID, tn.UserID,
	).Scan(&templateID); err != nil {
		t.Fatalf("seed template: %v", err)
	}

	ctx := dbctx.WithQuerier(context.Background(), asOrg(t, tn.OrgID))
	draftID, err := repo.Create(ctx, aidrafts.CreateParams{
		OrganizationID: tn.OrgID,
		PatientID:      tn.PatientID,
		RequestedBy:    tn.UserID,
		DEKID:          tn.DekID,
		AIModelVersion: "test-model",
		WhisperModel:   "test-whisper",
		TemplateID:     templateID,
	})
	if err != nil {
		t.Fatalf("create draft with template: %v", err)
	}

	draft, err := repo.FindByID(ctx, tn.OrgID, draftID)
	if err != nil {
		t.Fatalf("find draft: %v", err)
	}
	if draft.TemplateID != templateID {
		t.Fatalf("draft.TemplateID = %q, want %q", draft.TemplateID, templateID)
	}

	// Integrated-format drafts keep NULL → empty string, never an error.
	plainID, err := repo.Create(ctx, aidrafts.CreateParams{
		OrganizationID: tn.OrgID,
		PatientID:      tn.PatientID,
		RequestedBy:    tn.UserID,
		DEKID:          tn.DekID,
		AIModelVersion: "test-model",
		WhisperModel:   "test-whisper",
	})
	if err != nil {
		t.Fatalf("create draft without template: %v", err)
	}
	plain, err := repo.FindByID(ctx, tn.OrgID, plainID)
	if err != nil {
		t.Fatalf("find plain draft: %v", err)
	}
	if plain.TemplateID != "" {
		t.Fatalf("plain draft TemplateID = %q, want empty", plain.TemplateID)
	}
}

// Without a tenant-scoped querier the repository falls back to the raw pool,
// where the GUC is unset and RLS fails closed — Resolve must report the
// failure (ErrNotFound), never pretend the draft was consumed.
func TestAIDraftResolveFailsClosedWithoutTenantScope(t *testing.T) {
	skipIfShort(t)
	repo := adrepo.New(appPool)
	tn := seedTenant(t, "drafts-b")
	draftID := seedDraft(t, tn, "DRAFT_READY")

	err := repo.Resolve(context.Background(), tn.OrgID, draftID, tn.RecordID, tn.UserID)
	if !errors.Is(err, aidrafts.ErrNotFound) {
		t.Fatalf("resolve without tenant scope: got %v, want ErrNotFound", err)
	}

	var status string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT status FROM ai_drafts WHERE id = $1`, draftID,
	).Scan(&status); err != nil {
		t.Fatalf("read back draft: %v", err)
	}
	if status != "DRAFT_READY" {
		t.Fatalf("draft status = %q, want DRAFT_READY (unchanged)", status)
	}
}
