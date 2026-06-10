package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	patsrepo "sghcp/core-api/internal/patients/repository"
	patssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	svc     svcPort
	patients patientGetterPort
	audit   *audit.Writer
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	crrRepo := crrrepo.New(db)
	patsRepo := patsrepo.New(db)
	return &Handler{
		svc:     crrsvc.New(crrRepo, km),
		patients: patssvc.New(patsRepo, km),
		audit:   audit.New(db),
	}
}
