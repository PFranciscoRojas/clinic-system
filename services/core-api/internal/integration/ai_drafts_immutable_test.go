package integration

import (
	"context"
	"strings"
	"testing"
)

// CLAUDE.md rule 5: AI drafts are immutable — the professional approves
// explicitly, and what they approved has to stay exactly what they approved.
// These tests prove the guarantee lives in the database, not in the good
// intentions of whoever writes the next UPDATE.
//
// The trigger (migration 000071) deliberately only guards the APPROVED state:
// a draft is legitimately rewritten while the worker is still transcribing it.
// The tests below cover both halves — what must be frozen, and what must keep
// working — because a constraint that also blocks the happy path is worse than
// no constraint at all.

// seedDraftWithContent inserts an ai_draft for an existing tenant and drives it to the
// requested status through the same column writes the worker performs.
func seedDraftWithContent(t *testing.T, tn tenant, status string) string {
	t.Helper()
	ctx := context.Background()

	var draftID string
	err := adminPool.QueryRow(ctx, `
		INSERT INTO ai_drafts (
		    organization_id, patient_id, requested_by, dek_id,
		    ai_model_version, whisper_model, status,
		    transcription_enc, draft_content_enc
		) VALUES ($1, $2, $3, $4, 'test-model', 'base', $5, $6, $7)
		RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, status,
		[]byte("transcription-ciphertext"), []byte("draft-ciphertext"),
	).Scan(&draftID)
	if err != nil {
		t.Fatalf("seed ai_draft (%s): %v", status, err)
	}
	return draftID
}

func TestApprovedDraftContentIsImmutable(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	tn := seedTenant(t, "draft-immutable-content")

	draftID := seedDraftWithContent(t, tn, "APPROVED")

	cases := []struct {
		name   string
		update string
		arg    any
	}{
		{"rewrite draft content", `UPDATE ai_drafts SET draft_content_enc = $2 WHERE id = $1`, []byte("tampered")},
		{"erase draft content", `UPDATE ai_drafts SET draft_content_enc = NULL WHERE id = $1`, nil},
		{"rewrite transcription", `UPDATE ai_drafts SET transcription_enc = $2 WHERE id = $1`, []byte("tampered")},
		{"erase transcription", `UPDATE ai_drafts SET transcription_enc = NULL WHERE id = $1`, nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var err error
			if tc.arg == nil {
				_, err = adminPool.Exec(ctx, tc.update, draftID)
			} else {
				_, err = adminPool.Exec(ctx, tc.update, draftID, tc.arg)
			}
			if err == nil {
				t.Fatal("the UPDATE succeeded — an approved draft was rewritten")
			}
			if !strings.Contains(err.Error(), "immutable once APPROVED") {
				t.Errorf("rejected for the wrong reason: %v", err)
			}
		})
	}

	// The row must be untouched after all those attempts.
	var content, transcription []byte
	if err := adminPool.QueryRow(ctx,
		`SELECT draft_content_enc, transcription_enc FROM ai_drafts WHERE id = $1`, draftID,
	).Scan(&content, &transcription); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(content) != "draft-ciphertext" || string(transcription) != "transcription-ciphertext" {
		t.Error("draft content changed despite every UPDATE being rejected")
	}
}

// TestApprovedDraftCannotChangeStatus stops the subtler attack: leaving the
// content alone but re-pointing or re-opening the approval itself.
func TestApprovedDraftCannotChangeStatus(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	tn := seedTenant(t, "draft-immutable-status")

	draftID := seedDraftWithContent(t, tn, "APPROVED")

	for _, status := range []string{"DRAFT_READY", "PENDING", "SUPERSEDED", "ERROR"} {
		t.Run(status, func(t *testing.T) {
			_, err := adminPool.Exec(ctx,
				`UPDATE ai_drafts SET status = $2 WHERE id = $1`, draftID, status)
			if err == nil {
				t.Fatalf("an APPROVED draft was moved to %s", status)
			}
			if !strings.Contains(err.Error(), "status cannot change once APPROVED") {
				t.Errorf("rejected for the wrong reason: %v", err)
			}
		})
	}
}

func TestApprovedDraftCannotBeRelinked(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	tn := seedTenant(t, "draft-immutable-link")

	draftID := seedDraftWithContent(t, tn, "APPROVED")

	_, err := adminPool.Exec(ctx,
		`UPDATE ai_drafts SET clinical_record_id = $2 WHERE id = $1`, draftID, tn.RecordID)
	if err == nil {
		t.Fatal("an APPROVED draft was re-pointed at a different clinical record")
	}
	if !strings.Contains(err.Error(), "clinical_record_id is immutable once APPROVED") {
		t.Errorf("rejected for the wrong reason: %v", err)
	}
}

// TestPreApprovalWritesStillWork is the other half of the constraint. Each of
// these mirrors a real write path; if any breaks, the AI pipeline stops
// producing drafts at all.
func TestPreApprovalWritesStillWork(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	tn := seedTenant(t, "draft-pre-approval")

	t.Run("worker fills content while PROCESSING", func(t *testing.T) {
		draftID := seedDraftWithContent(t, tn, "PROCESSING")
		if _, err := adminPool.Exec(ctx, `
			UPDATE ai_drafts
			SET transcription_enc = $2, draft_content_enc = $3,
			    status = 'DRAFT_READY', processed_at = NOW()
			WHERE id = $1`,
			draftID, []byte("new-transcription"), []byte("new-content"),
		); err != nil {
			t.Fatalf("worker write path blocked: %v", err)
		}
	})

	t.Run("worker marks a silent recording EMPTY", func(t *testing.T) {
		draftID := seedDraftWithContent(t, tn, "PROCESSING")
		if _, err := adminPool.Exec(ctx,
			`UPDATE ai_drafts SET status = 'EMPTY', processed_at = NOW() WHERE id = $1`, draftID,
		); err != nil {
			t.Fatalf("EMPTY path blocked: %v", err)
		}
	})

	t.Run("worker records an ERROR", func(t *testing.T) {
		draftID := seedDraftWithContent(t, tn, "PROCESSING")
		if _, err := adminPool.Exec(ctx,
			`UPDATE ai_drafts SET status = 'ERROR', error_message = 'boom' WHERE id = $1`, draftID,
		); err != nil {
			t.Fatalf("ERROR path blocked: %v", err)
		}
	})

	t.Run("consolidation supersedes an earlier take", func(t *testing.T) {
		draftID := seedDraftWithContent(t, tn, "DRAFT_READY")
		if _, err := adminPool.Exec(ctx, `
			UPDATE ai_drafts
			SET status = 'SUPERSEDED', transcription_enc = NULL, draft_content_enc = NULL
			WHERE id = $1`, draftID,
		); err != nil {
			t.Fatalf("supersede path blocked: %v", err)
		}
	})

	t.Run("professional approves a ready draft", func(t *testing.T) {
		draftID := seedDraftWithContent(t, tn, "DRAFT_READY")
		if _, err := adminPool.Exec(ctx, `
			UPDATE ai_drafts
			SET status = 'APPROVED', clinical_record_id = $2,
			    resolved_at = NOW(), resolved_by = $3
			WHERE id = $1`, draftID, tn.RecordID, tn.UserID,
		); err != nil {
			t.Fatalf("approval path blocked: %v", err)
		}
	})
}

// TestApprovedDraftCanStillBeDeleted keeps the retention sweep working: the
// trigger guards UPDATE only, so delete_after can still purge old PII.
func TestApprovedDraftCanStillBeDeleted(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	tn := seedTenant(t, "draft-retention")

	draftID := seedDraftWithContent(t, tn, "APPROVED")

	tag, err := adminPool.Exec(ctx, `DELETE FROM ai_drafts WHERE id = $1`, draftID)
	if err != nil {
		t.Fatalf("retention delete blocked by the immutability trigger: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Errorf("deleted %d rows, want 1", tag.RowsAffected())
	}
}
