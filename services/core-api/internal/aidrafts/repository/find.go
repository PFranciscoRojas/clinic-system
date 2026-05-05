package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/aidrafts"
)

func (r *Repository) FindByID(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error) {
	var d aidrafts.AIDraft
	var clinicalRecordID, resolvedBy *string
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, clinical_record_id, patient_id,
		       requested_by, dek_id, audio_path_enc, transcription_enc,
		       draft_content_enc, ai_model_version, whisper_model,
		       status, error_message, processed_at, resolved_at, resolved_by,
		       created_at, delete_after
		FROM ai_drafts
		WHERE id = $1 AND organization_id = $2
	`, draftID, orgID).Scan(
		&d.ID, &d.OrganizationID, &clinicalRecordID, &d.PatientID,
		&d.RequestedBy, &d.DEKID, &d.AudioPathEnc, &d.TranscriptionEnc,
		&d.DraftContentEnc, &d.AIModelVersion, &d.WhisperModel,
		&d.Status, &d.ErrorMessage, &d.ProcessedAt, &d.ResolvedAt, &resolvedBy,
		&d.CreatedAt, &d.DeleteAfter,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, aidrafts.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find ai_draft: %w", err)
	}
	if clinicalRecordID != nil {
		d.ClinicalRecordID = *clinicalRecordID
	}
	if resolvedBy != nil {
		d.ResolvedBy = *resolvedBy
	}
	return &d, nil
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*aidrafts.EncKeyRow, error) {
	var k aidrafts.EncKeyRow
	err := r.db.QueryRow(ctx,
		`SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1`,
		dekID,
	).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find enc_key for ai_draft: %w", err)
	}
	return &k, nil
}
