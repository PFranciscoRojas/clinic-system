package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/dbctx"
)

// Repository implements patients.Repository using pgx.
type Repository struct {
	db *pgxpool.Pool
}

// compile-time check that Repository satisfies the domain interface.
var _ patients.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// q returns the request-scoped querier (tenant connection with the org GUC
// set) when present, falling back to the pool otherwise.
func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }
