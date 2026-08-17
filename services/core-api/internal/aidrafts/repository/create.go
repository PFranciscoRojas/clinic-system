package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := dbctx.From(ctx, r.db).QueryRow(ctx,
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
		       (organization_id, appointment_id, patient_id, requested_by, dek_id,
		        audio_path_enc, ai_model_version, whisper_model, template_id,
		        upload_ms, audio_bytes, upload_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id`

	var id string
	err := dbctx.From(ctx, r.db).QueryRow(ctx, q,
		p.OrganizationID,
		nullableStr(p.AppointmentID),
		p.PatientID,
		p.RequestedBy,
		p.DEKID,
		p.AudioPathEnc,
		p.AIModelVersion,
		p.WhisperModel,
		nullableStr(p.TemplateID),
		p.UploadMS,
		p.AudioBytes,
		nullableStr(p.UploadID),
	).Scan(&id)
	return id, err
}

func nullableStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
