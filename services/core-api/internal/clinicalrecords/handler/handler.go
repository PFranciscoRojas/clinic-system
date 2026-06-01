package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	repo := crrrepo.New(db)
	return &Handler{svc: crrsvc.New(repo, km)}
}
