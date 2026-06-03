package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/clinicalrecords"
)

// Repository implements clinicalrecords.Repository using pgx.
type Repository struct {
	db *pgxpool.Pool
}

var _ clinicalrecords.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}
