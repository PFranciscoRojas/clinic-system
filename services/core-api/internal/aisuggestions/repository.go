// Package aisuggestions stores AI-generated, read-only assistance over a
// patient's encrypted history: the pre-session recap and the (CBT) treatment-plan
// proposal. The professional reviews/edits before anything becomes a clinical
// artifact. The result JSON is sealed with a per-suggestion DEK, like ai_drafts.
package aisuggestions

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
)

var (
	ErrNotFound     = errors.New("ai suggestion not found")
	ErrInvalidInput = errors.New("invalid input")
)

// RawSuggestion is the DB row — content still encrypted.
type RawSuggestion struct {
	ID         string
	DEKID      string
	Kind       string
	Status     string
	ContentEnc []byte
	Error      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// CreateParams carries the metadata for a new PENDING suggestion.
type CreateParams struct {
	OrganizationID string
	PatientID      string
	DEKID          string
	Kind           string
	Model          string
}

// EncKeyRow is the encrypted DEK row fetched for decryption.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }

// ApproachFor returns the requesting professional's therapeutic approach
// (ai_prefs.approach). Best-effort: a missing profile or unset key returns ""
// — the worker then uses its approach-neutral prompts.
func (r *Repository) ApproachFor(ctx context.Context, userID string) string {
	var approach *string
	err := r.q(ctx).QueryRow(ctx,
		`SELECT ai_prefs->>'approach' FROM professional_profiles WHERE user_id = $1`,
		userID,
	).Scan(&approach)
	if err != nil || approach == nil {
		return ""
	}
	return *approach
}

func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM') RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

func (r *Repository) Create(ctx context.Context, p CreateParams) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO ai_suggestions (organization_id, patient_id, dek_id, kind, model, status)
		VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id
	`, p.OrganizationID, p.PatientID, p.DEKID, p.Kind, p.Model).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert ai_suggestion: %w", err)
	}
	return id, nil
}

// FindLatest returns the newest suggestion for a (patient, kind), or ErrNotFound.
func (r *Repository) FindLatest(ctx context.Context, orgID, patientID, kind string) (*RawSuggestion, error) {
	var s RawSuggestion
	err := r.q(ctx).QueryRow(ctx, `
		SELECT id, dek_id, kind, status, content_enc, COALESCE(error, ''), created_at, updated_at
		FROM ai_suggestions
		WHERE organization_id = $1 AND patient_id = $2 AND kind = $3
		ORDER BY created_at DESC LIMIT 1
	`, orgID, patientID, kind).Scan(&s.ID, &s.DEKID, &s.Kind, &s.Status, &s.ContentEnc, &s.Error, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find latest ai_suggestion: %w", err)
	}
	return &s, nil
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error) {
	var k EncKeyRow
	err := r.q(ctx).QueryRow(ctx, `
		SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1
	`, dekID).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find encryption_key: %w", err)
	}
	return &k, nil
}
