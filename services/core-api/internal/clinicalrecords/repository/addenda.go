package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

func (r *Repository) CreateAddendum(ctx context.Context, orgID, recordID, createdBy string, contentEnc []byte) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO clinical_record_addenda (record_id, organization_id, created_by, content_enc)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, recordID, orgID, createdBy, contentEnc).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert addendum: %w", err)
	}
	return id, nil
}

func (r *Repository) ListAddenda(ctx context.Context, orgID, recordID string) ([]*clinicalrecords.RawAddendum, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.record_id, a.created_by, COALESCE(u.display_name, ''), a.content_enc, a.created_at
		FROM clinical_record_addenda a
		JOIN users u ON u.id = a.created_by
		WHERE a.record_id = $1 AND a.organization_id = $2
		ORDER BY a.created_at
	`, recordID, orgID)
	if err != nil {
		return nil, fmt.Errorf("list addenda: %w", err)
	}
	defer rows.Close()

	var result []*clinicalrecords.RawAddendum
	for rows.Next() {
		var a clinicalrecords.RawAddendum
		if err := rows.Scan(&a.ID, &a.RecordID, &a.CreatedBy, &a.AuthorName, &a.ContentEnc, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan addendum: %w", err)
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}
