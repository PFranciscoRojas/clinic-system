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
	var clinicalRecordID, appointmentID, resolvedBy, errorMessage, templateID *string
	err := dbctx.From(ctx, r.db).QueryRow(ctx, `
		SELECT id, organization_id, clinical_record_id, appointment_id, patient_id,
		       requested_by, dek_id, audio_path_enc, transcription_enc,
		       draft_content_enc, ai_model_version, whisper_model, template_id,
		       status, error_message, processed_at, resolved_at, resolved_by,
		       created_at, delete_after
		FROM ai_drafts
		WHERE id = $1 AND organization_id = $2
	`, draftID, orgID).Scan(
		&d.ID, &d.OrganizationID, &clinicalRecordID, &appointmentID, &d.PatientID,
		&d.RequestedBy, &d.DEKID, &d.AudioPathEnc, &d.TranscriptionEnc,
		&d.DraftContentEnc, &d.AIModelVersion, &d.WhisperModel, &templateID,
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
	if appointmentID != nil {
		d.AppointmentID = *appointmentID
	}
	if resolvedBy != nil {
		d.ResolvedBy = *resolvedBy
	}
	if errorMessage != nil {
		d.ErrorMessage = *errorMessage
	}
	if templateID != nil {
		d.TemplateID = *templateID
	}
	return &d, nil
}

func (r *Repository) ListByOrg(ctx context.Context, orgID, status string) ([]*aidrafts.DraftMeta, error) {
	rows, err := dbctx.From(ctx, r.db).Query(ctx, `
		SELECT d.id, d.status, d.patient_id, p.patient_code,
		       COALESCE(d.appointment_id::text, ''),
		       COALESCE(d.clinical_record_id::text, ''), d.created_at
		FROM ai_drafts d
		LEFT JOIN patients p ON p.id = d.patient_id
		WHERE d.organization_id = $1
		  AND ($2 = '' OR d.status::text = $2)
		  -- hide orphan drafts superseded by an approved record or draft on the same appointment
		  AND NOT (
		    d.appointment_id IS NOT NULL
		    AND d.status NOT IN ('APPROVED', 'REJECTED')
		    AND (
		      EXISTS (
		        SELECT 1 FROM ai_drafts d2
		        WHERE d2.appointment_id = d.appointment_id
		          AND d2.organization_id = $1
		          AND d2.status = 'APPROVED'
		          AND d2.id <> d.id
		      )
		      OR EXISTS (
		        SELECT 1 FROM clinical_records cr
		        WHERE cr.appointment_id = d.appointment_id
		          AND cr.organization_id = $1
		          AND cr.status = 'APPROVED'
		      )
		    )
		  )
		  -- hide empty stubs (no audio, no content) left by interrupted uploads
		  AND NOT (
		    d.audio_path_enc IS NULL
		    AND d.draft_content_enc IS NULL
		    AND d.status IN ('PENDING', 'ERROR')
		  )
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
		if err := rows.Scan(&m.ID, &m.Status, &m.PatientID, &m.PatientCode,
			&m.AppointmentID, &m.ClinicalRecordID, &m.CreatedAt); err != nil {
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
