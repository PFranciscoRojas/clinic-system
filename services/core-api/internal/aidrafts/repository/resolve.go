package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/aidrafts"
)

// Resolve marks a draft as APPROVED, links the resulting clinical_record, and records who resolved it.
func (r *Repository) Resolve(ctx context.Context, orgID, draftID, clinicalRecordID, resolvedBy string) error {
	tag, err := r.db.Exec(ctx, `
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
	return nil
}

// GetDecryptedSOAP fetches and decrypts draft_content_enc for a DRAFT_READY draft.
// Returns the JSON string as stored by the AI worker.
func (r *Repository) GetDecryptedSOAP(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error) {
	draft, err := r.FindByID(ctx, orgID, draftID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, aidrafts.ErrNotFound
		}
		return nil, err
	}
	return draft, nil
}
