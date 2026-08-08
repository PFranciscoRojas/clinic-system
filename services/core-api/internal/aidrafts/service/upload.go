package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"

	"github.com/google/uuid"
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

	if err := s.enqueue(ctx, draftID, audioPath, in.RecordType, in.TemplateID, in.NoteStyle, in.Tone, in.Approach); err != nil {
		// Non-fatal: the outbox publisher will not pick this up, but the draft
		// can be re-enqueued manually. Log-worthy but don't fail the upload.
		_ = err
	}

	return draftID, nil
}

// audioExtRe is defence in depth: the handler already rejects anything outside
// its allowlist, but saveAudio builds a filesystem path and must never take an
// extension on faith.
var audioExtRe = regexp.MustCompile(`^\.[a-z0-9]{2,4}$`)

// saveAudio writes the upload under <audioDir>/<org>/<appointment>/<take>.<ext>.
//
// The take id is minted here and is the whole point. The path used to be built
// from the appointment id alone and opened with O_TRUNC, so a session recorded
// in several takes — which the worker explicitly supports and consolidates —
// had every take writing the same file: the second upload truncated the audio
// the worker was still transcribing for the first draft, and then lost itself
// when that draft finished and unlinked the file.
//
// The write goes to a sibling `.part` and is renamed into place, so a failed or
// abandoned body never leaves half-written PHI where the worker can find it.
func (s *Service) saveAudio(in UploadAudioInput) (string, error) {
	if !audioExtRe.MatchString(in.Ext) {
		return "", fmt.Errorf("%w: unsupported audio extension", aidrafts.ErrInvalidInput)
	}

	dir := filepath.Join(s.audioDir, in.OrganizationID, in.AppointmentID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create audio dir: %w", err)
	}

	dest := filepath.Join(dir, uuid.NewString()+in.Ext)
	tmp := dest + ".part"

	// O_EXCL: a take id that already exists is a bug, never something to
	// silently overwrite.
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", fmt.Errorf("create audio file: %w", err)
	}
	if _, err := io.Copy(f, in.Audio); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return "", fmt.Errorf("write audio file: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("close audio file: %w", err)
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("finalize audio file: %w", err)
	}
	return dest, nil
}

func (s *Service) enqueue(ctx context.Context, draftID, audioPath, recordType, templateID, noteStyle, tone, approach string) error {
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
	if approach != "" {
		values["approach"] = approach
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
