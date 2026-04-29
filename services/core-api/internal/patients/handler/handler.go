package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	patientsrepo "sghcp/core-api/internal/patients/repository"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	repo := patientsrepo.New(db)
	return &Handler{svc: patientssvc.New(repo, km)}
}
