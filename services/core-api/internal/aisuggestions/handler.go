package aisuggestions

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc *Service
}

func New(db *pgxpool.Pool, km *crypto.KeyManager, rdb *redis.Client) *Handler {
	return &Handler{svc: NewService(NewRepository(db), km, rdb)}
}

// PatientRoutes is mounted at /api/v1/patients/{patient_id}/ai (JWT + tenant
// scope applied by the parent group).
func (h *Handler) PatientRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:read")).Post("/{kind}", h.request)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/{kind}", h.latest)
	return r
}

// POST /{kind} — enqueue an AI suggestion (recap | treatment_plan) for the patient.
func (h *Handler) request(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")
	kind := chi.URLParam(r, "kind")
	if !ValidKind(kind) {
		httputil.WriteError(w, http.StatusNotFound, "tipo de sugerencia desconocido")
		return
	}
	id, err := h.svc.Request(r.Context(), claims.OrganizationID, patientID, kind)
	if err != nil {
		if errors.Is(err, ErrInvalidInput) {
			httputil.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo generar la sugerencia")
		return
	}
	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"id": id, "status": "PENDING"})
}

// GET /{kind} — latest suggestion for the patient (PENDING until the worker fills it).
func (h *Handler) latest(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")
	kind := chi.URLParam(r, "kind")
	if !ValidKind(kind) {
		httputil.WriteError(w, http.StatusNotFound, "tipo de sugerencia desconocido")
		return
	}
	s, err := h.svc.GetLatest(r.Context(), claims.OrganizationID, patientID, kind)
	if errors.Is(err, ErrNotFound) {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"status": "NONE"})
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}
