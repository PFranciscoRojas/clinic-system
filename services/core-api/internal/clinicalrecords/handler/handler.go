package handler

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	diagrepo "sghcp/core-api/internal/diagnoses/repository"
	patsrepo "sghcp/core-api/internal/patients/repository"
	patssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/dbctx"
)

// riskEnqueuer enqueues an AI suggestion job (satisfied by aisuggestions.Service).
// Optional — when nil, approving a record simply skips the risk refresh.
type riskEnqueuer interface {
	Request(ctx context.Context, orgID, patientID, kind string) (string, error)
}

type Handler struct {
	svc      svcPort
	patients patientGetterPort
	diag     *diagrepo.Repository
	db       *pgxpool.Pool
	km       *crypto.KeyManager
	audit    *audit.Writer
	risk     riskEnqueuer
}

// q returns the request-scoped tenant querier (RLS-scoped) for the direct
// SQL the PDF exporter runs, falling back to the pool.
func (h *Handler) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, h.db) }

// New builds the handler. risk may be nil (e.g. in tests) — when set, approving
// a clinical record triggers an AI risk-detection refresh for the patient.
func New(db *pgxpool.Pool, km *crypto.KeyManager, risk riskEnqueuer) *Handler {
	crrRepo := crrrepo.New(db)
	patsRepo := patsrepo.New(db)
	return &Handler{
		svc:      crrsvc.New(crrRepo, km),
		patients: patssvc.New(patsRepo, km),
		diag:     diagrepo.New(db),
		db:       db,
		km:       km,
		audit:    audit.New(db),
		risk:     risk,
	}
}
