package aisuggestions

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/shared/crypto"
)

const (
	// Suggestions go on their own stream, away from the audio.
	//
	// A recap is three seconds of waiting on the Claude API; a draft is minutes
	// of Whisper on two shared cores. On one stream the worker's consumer group
	// hands out whatever entry is next and cannot tell the two apart, so a recap
	// requested during a session waited for the session's audio to finish
	// transcribing. The worker reads both streams with a slot budget each, and
	// the only place the two kinds can be told apart before they are read is
	// here, where they are written.
	aiStream = "ai_jobs_fast"
	aiModel  = "claude-sonnet-4-6"
)

// validKinds are the suggestion kinds the worker knows how to generate.
var validKinds = map[string]bool{"recap": true, "treatment_plan": true, "risk_detection": true}

func ValidKind(kind string) bool { return validKinds[kind] }

type Service struct {
	repo *Repository
	km   *crypto.KeyManager
	rdb  *redis.Client
}

func NewService(repo *Repository, km *crypto.KeyManager, rdb *redis.Client) *Service {
	return &Service{repo: repo, km: km, rdb: rdb}
}

// Suggestion is the decrypted, API-facing view.
type Suggestion struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	Status    string         `json:"status"` // PENDING | READY | FAILED
	Content   map[string]any `json:"content,omitempty"`
	Error     string         `json:"error,omitempty"`
	CreatedAt string         `json:"created_at"`
}

// Request creates a PENDING suggestion (with its own DEK) and enqueues the AI
// job. The worker resolves the patient's history, anonymizes it, calls Claude,
// and writes the encrypted result back. requestedBy is the professional asking
// — their therapeutic approach (ai_prefs) orients recap and treatment-plan
// wording (risk detection stays approach-agnostic by design).
func (s *Service) Request(ctx context.Context, orgID, patientID, kind, requestedBy string) (string, error) {
	if !validKinds[kind] {
		return "", fmt.Errorf("%w: unknown suggestion kind", ErrInvalidInput)
	}
	if orgID == "" || patientID == "" {
		return "", fmt.Errorf("%w: organization_id and patient_id are required", ErrInvalidInput)
	}

	_, encDEK, keySource, err := s.km.GenerateDEK()
	if err != nil {
		return "", err
	}
	dekID, err := s.repo.CreateEncKey(ctx, encDEK, keySource)
	if err != nil {
		return "", err
	}

	id, err := s.repo.Create(ctx, CreateParams{
		OrganizationID: orgID,
		PatientID:      patientID,
		DEKID:          dekID,
		Kind:           kind,
		Model:          aiModel,
	})
	if err != nil {
		return "", err
	}

	values := map[string]any{
		"kind":          kind,
		"suggestion_id": id,
		"patient_id":    patientID,
		"org_id":        orgID,
	}
	if requestedBy != "" && kind != "risk_detection" {
		if approach := s.repo.ApproachFor(ctx, requestedBy); approach != "" {
			values["approach"] = approach
		}
	}

	if err := s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: aiStream,
		ID:     "*",
		Values: values,
	}).Err(); err != nil {
		return "", fmt.Errorf("enqueue ai job: %w", err)
	}
	return id, nil
}

// GetLatest returns the newest suggestion for a (patient, kind), decrypting the
// content once it's READY.
func (s *Service) GetLatest(ctx context.Context, orgID, patientID, kind string) (*Suggestion, error) {
	raw, err := s.repo.FindLatest(ctx, orgID, patientID, kind)
	if err != nil {
		return nil, err
	}
	out := &Suggestion{
		ID:        raw.ID,
		Kind:      raw.Kind,
		Status:    raw.Status,
		Error:     raw.Error,
		CreatedAt: raw.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if raw.Status != "READY" || len(raw.ContentEnc) == 0 {
		return out, nil
	}

	enc, err := s.repo.FindEncKey(ctx, raw.DEKID)
	if err != nil {
		return nil, err
	}
	dek, err := s.km.DecryptDEK(enc.KeySource, enc.EncryptedDEK)
	if err != nil {
		return nil, fmt.Errorf("decrypt DEK: %w", err)
	}
	defer crypto.Zeroize(dek)

	plain, err := crypto.Open(dek, raw.ContentEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt suggestion: %w", err)
	}
	if err := json.Unmarshal(plain, &out.Content); err != nil {
		return nil, fmt.Errorf("parse suggestion: %w", err)
	}
	return out, nil
}
