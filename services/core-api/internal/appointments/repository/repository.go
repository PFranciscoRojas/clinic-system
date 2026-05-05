package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/appointments"
)

type Repository struct {
	db *pgxpool.Pool
}

var _ appointments.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}
