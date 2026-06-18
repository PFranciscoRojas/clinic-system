// Package invoicing owns BC-6: the clinic's internal billing — the service-rate
// catalogue, patient invoices and recorded payments. It is INTERNAL billing
// (recibos/comprobantes), distinct from internal/billing, which is the SaaS
// subscription the clinic pays to the operator. No DIAN electronic invoicing.
//
// This first slice covers the service-rate catalogue (service_rates).
package invoicing

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
	ErrNotFound     = errors.New("rate not found")
	ErrInvalidInput = errors.New("invalid input")
)

// Rate is the API-facing view of a row in service_rates. Amount travels as a
// decimal string (never a float) to keep money exact end-to-end.
type Rate struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Amount      string    `json:"amount"`
	Currency    string    `json:"currency"`
	Modality    *string   `json:"modality,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

// RateInput carries the writable fields of a rate.
type RateInput struct {
	Name        string
	Description string
	Amount      string
	Currency    string
	Modality    *string
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }

const rateColumns = `id, name, COALESCE(description, ''), amount::text, currency, modality, is_active, created_at`

func scanRate(row pgx.Row) (Rate, error) {
	var rt Rate
	err := row.Scan(&rt.ID, &rt.Name, &rt.Description, &rt.Amount, &rt.Currency, &rt.Modality, &rt.IsActive, &rt.CreatedAt)
	return rt, err
}

// List returns the org's rates, newest first. Inactive rates are included only
// when includeInactive is set (the catalogue keeps history for past invoices).
func (r *Repository) List(ctx context.Context, orgID string, includeInactive bool) ([]Rate, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+rateColumns+`
		FROM service_rates
		WHERE organization_id = $1 AND ($2 OR is_active)
		ORDER BY is_active DESC, created_at DESC
	`, orgID, includeInactive)
	if err != nil {
		return nil, fmt.Errorf("list rates: %w", err)
	}
	defer rows.Close()

	out := make([]Rate, 0)
	for rows.Next() {
		rt, err := scanRate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan rate: %w", err)
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

func (r *Repository) Create(ctx context.Context, orgID string, in RateInput) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		INSERT INTO service_rates (organization_id, name, description, amount, currency, modality)
		VALUES ($1, $2, NULLIF($3, ''), $4::numeric, $5, $6)
		RETURNING `+rateColumns+`
	`, orgID, in.Name, in.Description, in.Amount, in.Currency, in.Modality)
	rt, err := scanRate(row)
	if err != nil {
		return Rate{}, fmt.Errorf("insert rate: %w", err)
	}
	return rt, nil
}

func (r *Repository) Update(ctx context.Context, orgID, id string, in RateInput) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE service_rates
		SET name = $3, description = NULLIF($4, ''), amount = $5::numeric,
		    currency = $6, modality = $7, updated_at = NOW()
		WHERE organization_id = $1 AND id = $2
		RETURNING `+rateColumns+`
	`, orgID, id, in.Name, in.Description, in.Amount, in.Currency, in.Modality)
	rt, err := scanRate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Rate{}, ErrNotFound
	}
	if err != nil {
		return Rate{}, fmt.Errorf("update rate: %w", err)
	}
	return rt, nil
}

// SetActive toggles a rate's availability without deleting it (past invoices
// keep their rate_id reference).
func (r *Repository) SetActive(ctx context.Context, orgID, id string, active bool) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE service_rates
		SET is_active = $3, updated_at = NOW()
		WHERE organization_id = $1 AND id = $2
		RETURNING `+rateColumns+`
	`, orgID, id, active)
	rt, err := scanRate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Rate{}, ErrNotFound
	}
	if err != nil {
		return Rate{}, fmt.Errorf("toggle rate: %w", err)
	}
	return rt, nil
}
