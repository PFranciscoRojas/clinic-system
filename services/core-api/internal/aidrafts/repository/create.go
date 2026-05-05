package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/aidrafts"
)

func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx,
		`INSERT INTO encryption_keys (encrypted_dek, key_source) VALUES ($1, $2) RETURNING id`,
		encryptedDEK, keySource,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create enc_key for ai_draft: %w", err)
	}
	return id, nil
}

func (r *Repository) Create(ctx context.Context, p aidrafts.CreateParams) (string, error) {
	const q = `
		INSERT INTO ai_drafts
		       (organization_id, patient_id, requested_by, dek_id,
		        audio_path_enc, ai_model_version, whisper_model)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`

	var id string
	err := r.db.QueryRow(ctx, q,
		p.OrganizationID,
		p.PatientID,
		p.RequestedBy,
		p.DEKID,
		p.AudioPathEnc,
		p.AIModelVersion,
		p.WhisperModel,
	).Scan(&id)
	return id, err
}
