package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

func (r *Repository) FindByID(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error) {
	var d aidrafts.AIDraft
	var clinicalRecordID, resolvedBy, errorMessage *string
	err := dbctx.From(ctx, r.db).QueryRow(ctx, `
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
		&d.Status, &errorMessage, &d.ProcessedAt, &d.ResolvedAt, &resolvedBy,
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
	if errorMessage != nil {
		d.ErrorMessage = *errorMessage
	}
	return &d, nil
}

func (r *Repository) ListByOrg(ctx context.Context, orgID, status string) ([]*aidrafts.DraftMeta, error) {
	rows, err := dbctx.From(ctx, r.db).Query(ctx, `
		SELECT d.id, d.status, d.patient_id, p.patient_code,
		       COALESCE(d.clinical_record_id::text, ''), d.created_at
		FROM ai_drafts d
		LEFT JOIN patients p ON p.id = d.patient_id
		WHERE d.organization_id = $1
		  AND ($2 = '' OR d.status::text = $2)
		ORDER BY d.created_at DESC
		LIMIT 100
	`, orgID, status)
	if err != nil {
		return nil, fmt.Errorf("list ai_drafts: %w", err)
	}
	defer rows.Close()

	var result []*aidrafts.DraftMeta
	for rows.Next() {
		var m aidrafts.DraftMeta
		if err := rows.Scan(&m.ID, &m.Status, &m.PatientID, &m.PatientCode, &m.ClinicalRecordID, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan draft_meta: %w", err)
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*aidrafts.EncKeyRow, error) {
	var k aidrafts.EncKeyRow
	err := dbctx.From(ctx, r.db).QueryRow(ctx,
		`SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1`,
		dekID,
	).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find enc_key for ai_draft: %w", err)
	}
	return &k, nil
}
