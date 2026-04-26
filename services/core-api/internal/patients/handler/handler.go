package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	patientsrepo "sghcp/core-api/internal/patients/repository"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc *patientssvc.Service
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	repo := patientsrepo.New(db)
	svc := patientssvc.New(repo, km)
	return &Handler{svc: svc}
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
