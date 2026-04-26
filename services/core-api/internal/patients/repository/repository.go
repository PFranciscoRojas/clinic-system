package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/patients"
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
