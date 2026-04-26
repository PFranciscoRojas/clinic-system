package handler

import (
	"context"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/patients"
	patientsrepo "sghcp/core-api/internal/patients/repository"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/middleware"
)

// svcPort is the contract the handler requires from the service layer.
// Defined here (not in the service package) so the handler owns its dependency — DIP.
type svcPort interface {
	Create(ctx context.Context, in patientssvc.CreateInput) (string, error)
	Get(ctx context.Context, orgID, patientID string) (*patients.Patient, error)
	Search(ctx context.Context, in patientssvc.SearchInput) ([]*patients.Patient, error)
	Update(ctx context.Context, in patientssvc.UpdateInput) error
	Deactivate(ctx context.Context, orgID, patientID string) error
}

// compile-time guard: *patientssvc.Service must satisfy svcPort.
var _ svcPort = (*patientssvc.Service)(nil)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	repo := patientsrepo.New(db)
	return &Handler{svc: patientssvc.New(repo, km)}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(middleware.RequirePermission("patients:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("patients:read")).Get("/", h.search)
	r.With(middleware.RequirePermission("patients:read")).Get("/{id}", h.get)
	r.With(middleware.RequirePermission("patients:update")).Put("/{id}", h.update)
	r.With(middleware.RequirePermission("patients:delete")).Delete("/{id}", h.deactivate)

	return r
}
