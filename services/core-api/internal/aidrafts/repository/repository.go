package repository

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/aidrafts"
)

type Repository struct {
	db *pgxpool.Pool
}

var _ aidrafts.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}
