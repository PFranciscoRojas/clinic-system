package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/shared/dbctx"
)

// Repository implements clinicalrecords.Repository using pgx.
type Repository struct {
	db *pgxpool.Pool
}

var _ clinicalrecords.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// q returns the request-scoped querier (tenant connection with the org GUC
// set) when present, falling back to the pool otherwise.
func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }
