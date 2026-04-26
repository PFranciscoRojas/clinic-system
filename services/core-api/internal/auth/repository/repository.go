package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/auth"
)

// Repository implements auth.Repository using pgx.
type Repository struct {
	db *pgxpool.Pool
}

// compile-time check that Repository satisfies the domain interface.
var _ auth.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}
