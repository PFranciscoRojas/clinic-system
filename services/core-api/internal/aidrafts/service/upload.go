package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

// UploadAudio stores the audio file, creates an ai_draft (PENDING), and enqueues the job.
// Returns the new ai_draft ID.
func (s *Service) UploadAudio(ctx context.Context, in UploadAudioInput) (string, error) {
	if in.OrganizationID == "" || in.PatientID == "" || in.RequestedBy == "" {
		return "", fmt.Errorf("%w: organization_id, patient_id and requested_by are required", aidrafts.ErrInvalidInput)
	}
	if in.Audio == nil {
		return "", fmt.Errorf("%w: audio file is required", aidrafts.ErrInvalidInput)
	}

	// Block upload when the appointment already has an APPROVED clinical record.
	if in.AppointmentID != "" {
		var hasApproved bool
		_ = s.db.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM clinical_records
				WHERE appointment_id = $1 AND status = 'APPROVED'
			)
		`, in.AppointmentID).Scan(&hasApproved)
		if hasApproved {
			return "", fmt.Errorf("%w: la cita ya tiene un registro clínico aprobado", aidrafts.ErrConflict)
		}
	}

	audioPath, err := s.saveAudio(in)
	if err != nil {
		return "", fmt.Errorf("save audio: %w", err)
	}

	plainDEK, encDEK, keySource, err := s.km.GenerateDEK()
	if err != nil {
		return "", err
	}
	defer crypto.Zeroize(plainDEK)

	dekID, err := s.repo.CreateEncKey(ctx, encDEK, keySource)
	if err != nil {
		return "", err
	}

	audioPathEnc, err := crypto.Seal(plainDEK, []byte(audioPath))
	if err != nil {
		return "", fmt.Errorf("encrypt audio path: %w", err)
	}

	draftID, err := s.repo.Create(ctx, aidrafts.CreateParams{
		OrganizationID: in.OrganizationID,
		AppointmentID:  in.AppointmentID,
		PatientID:      in.PatientID,
		RequestedBy:    in.RequestedBy,
		DEKID:          dekID,
		AudioPathEnc:   audioPathEnc,
		AIModelVersion: aiModelVer,
		WhisperModel:   whisperModel,
		TemplateID:     in.TemplateID,
	})
	if err != nil {
		return "", err
	}

	if err := s.enqueue(ctx, draftID, audioPath, in.RecordType, in.TemplateID, in.NoteStyle, in.Tone); err != nil {
		// Non-fatal: the outbox publisher will not pick this up, but the draft
		// can be re-enqueued manually. Log-worthy but don't fail the upload.
		_ = err
	}

	return draftID, nil
}

func (s *Service) saveAudio(in UploadAudioInput) (string, error) {
	dir := filepath.Join(s.audioDir, in.OrganizationID, in.AppointmentID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create audio dir: %w", err)
	}

	dest := filepath.Join(dir, in.Filename)
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return "", fmt.Errorf("create audio file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, in.Audio); err != nil {
		return "", fmt.Errorf("write audio file: %w", err)
	}
	return dest, nil
}

func (s *Service) enqueue(ctx context.Context, draftID, audioPath, recordType, templateID, noteStyle, tone string) error {
	if noteStyle == "" {
		noteStyle = "structured"
	}
	if tone == "" {
		tone = "formal"
	}
	values := map[string]any{
		"draft_id":    draftID,
		"audio_path":  audioPath,
		"record_type": recordType,
		"note_style":  noteStyle,
		"tone":        tone,
	}
	if templateID != "" {
		values["template_id"] = templateID
	} else if schema, ok := aidrafts.IntegratedPromptSchema[recordType]; ok {
		// Integrated format: ship the section schema with the job so the
		// worker prompts for exactly what the review page renders — the
		// worker's own hardcoded fallback only covers legacy queued jobs.
		if b, err := json.Marshal(schema); err == nil {
			values["sections_schema"] = string(b)
		}
	}
	return s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: aiStream,
		ID:     "*",
		Values: values,
	}).Err()
}
