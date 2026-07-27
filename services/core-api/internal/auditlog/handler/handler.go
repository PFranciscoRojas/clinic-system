// Package handler exposes the audit trail to the tenant.
//
// audit_log has been written since day one but nothing ever read it back, so
// the trail existed only for whoever could reach the database. Putting it in
// front of the professional is what turns "queda registrado" from a claim into
// something they can check themselves.
package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	auditrepo "sghcp/core-api/internal/auditlog/repository"
	patsrepo "sghcp/core-api/internal/patients/repository"
	patssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	repo     *auditrepo.Repository
	patients *patssvc.Service
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	return &Handler{
		repo:     auditrepo.New(db),
		patients: patssvc.New(patsrepo.New(db), km),
	}
}
