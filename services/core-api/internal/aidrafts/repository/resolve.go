package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

// Resolve marks a draft as APPROVED, links the resulting clinical_record, and records who resolved it.
// Must run on the tenant-scoped connection: ai_drafts has a per-tenant RLS
// policy, so an UPDATE on the raw pool (no app.current_org GUC) matches zero
// rows and the draft silently stays DRAFT_READY — re-approvable forever.
func (r *Repository) Resolve(ctx context.Context, orgID, draftID, clinicalRecordID, resolvedBy string) error {
	tag, err := dbctx.From(ctx, r.db).Exec(ctx, `
		UPDATE ai_drafts
		SET status             = 'APPROVED',
		    clinical_record_id = $3,
		    resolved_at        = NOW(),
		    resolved_by        = $4
		WHERE id = $1 AND organization_id = $2
		  AND status IN ('DRAFT_READY', 'PENDING', 'PROCESSING')
	`, draftID, orgID, clinicalRecordID, resolvedBy)
	if err != nil {
		return fmt.Errorf("resolve ai_draft: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return aidrafts.ErrNotFound
	}

	// Retire the "AI draft ready" bell notification for this draft: it has been
	// approved, so it must no longer route back to the draft for approval. Mark
	// it read (drops it from the unread bell) and repoint it to the resulting
	// clinical record, so opening it from history lands on the finalized record.
	// Best-effort — a notification update must never fail an approval that has
	// already committed the record. Same tenant-scoped conn, so RLS matches.
	_, _ = dbctx.From(ctx, r.db).Exec(ctx, `
		UPDATE notifications
		SET read_at = COALESCE(read_at, NOW()),
		    link    = $3
		WHERE organization_id = $1
		  AND kind = 'AI_DRAFT_READY'
		  AND link = $2
	`, orgID, fmt.Sprintf("/ai-drafts/%s", draftID), fmt.Sprintf("/clinical-records/%s", clinicalRecordID))

	return nil
}
