package repository

import (
	"context"
	"fmt"
)

// ReplaceSearchTokens rebuilds the patient's encrypted-search index rows in
// one transaction: drop everything, insert the current token hashes. Called
// after every create/update so the index always mirrors the latest names.
func (r *Repository) ReplaceSearchTokens(ctx context.Context, orgID, patientID string, tokenHashes []string) error {
	tx, err := r.q(ctx).Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM patient_search_tokens WHERE organization_id = $1 AND patient_id = $2`,
		orgID, patientID); err != nil {
		return fmt.Errorf("clear search tokens: %w", err)
	}
	if len(tokenHashes) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO patient_search_tokens (organization_id, patient_id, token_hash)
			SELECT $1, $2, unnest($3::text[])
			ON CONFLICT DO NOTHING
		`, orgID, patientID, tokenHashes); err != nil {
			return fmt.Errorf("insert search tokens: %w", err)
		}
	}
	return tx.Commit(ctx)
}
