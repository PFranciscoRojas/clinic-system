package leadbooking

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/gcal"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/httputil"
)

type Handler struct {
	svc *Service
	tz  *time.Location
}

// NewHandler wires the lead-agenda handler. ownerUserID is the Google Calendar
// owner (config.LeadsCalendarUserID); adminEmail receives the new-lead alert
// (config.SignupNotifyEmail).
func NewHandler(repo *Repository, g *gcal.Syncer, n notify.Notifier, ownerUserID, adminEmail string) *Handler {
	return &Handler{
		svc: NewService(repo, g, n, ownerUserID, adminEmail),
		tz:  loadTZ("America/Bogota"),
	}
}

// PublicRoutes is mounted at /api/v1/public/agenda — no JWT.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/availability", h.availability)
	r.Post("/book", h.book)
	return r
}

// AdminRoutes is mounted under SYSTEM_ADMIN (settings + booking list).
func (h *Handler) AdminRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/settings", h.getSettings)
	r.Put("/settings", h.putSettings)
	r.Get("/", h.list)
	return r
}

func (h *Handler) availability(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	now := time.Now().In(h.tz)
	if from == "" {
		from = now.Format("2006-01-02")
	}
	if to == "" {
		to = now.AddDate(0, 0, 21).Format("2006-01-02")
	}
	days, err := h.svc.Availability(r.Context(), from, to)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "parámetros inválidos")
		return
	}
	// The booking page shows how long the call lasts and in which timezone the
	// slots are expressed, so both travel with the availability.
	out := map[string]any{"days": days, "duration_min": 30, "timezone": "America/Bogota"}
	if cfg, err := h.svc.GetSettings(r.Context()); err == nil {
		out["duration_min"] = cfg.DurationMin
		out["timezone"] = cfg.Timezone
	}
	httputil.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) book(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Phone   string `json:"phone"`
		Message string `json:"message"`
		Date    string `json:"date"`
		Time    string `json:"time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.TrimSpace(body.Email)
	if body.Name == "" || body.Email == "" || body.Date == "" || body.Time == "" {
		httputil.WriteError(w, http.StatusBadRequest, "faltan datos")
		return
	}

	res, err := h.svc.Book(r.Context(), BookRequest{
		Name: body.Name, Email: body.Email, Phone: strings.TrimSpace(body.Phone),
		Message: strings.TrimSpace(body.Message), Date: body.Date, Time: body.Time,
	})
	switch {
	case errors.Is(err, ErrSlotTaken):
		httputil.WriteError(w, http.StatusConflict, "ese horario ya no está disponible")
		return
	case errors.Is(err, ErrNotOffered):
		httputil.WriteError(w, http.StatusBadRequest, "horario no disponible")
		return
	case err != nil:
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo agendar")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.GetSettings(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) putSettings(w http.ResponseWriter, r *http.Request) {
	var s Settings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(s.ActiveDays) == 0 || toMinutes(s.StartHour) < 0 || toMinutes(s.EndHour) < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "configuración inválida")
		return
	}
	if s.SlotStepMin <= 0 {
		s.SlotStepMin = 30
	}
	if s.DurationMin <= 0 {
		s.DurationMin = s.SlotStepMin
	}
	if strings.TrimSpace(s.Timezone) == "" {
		s.Timezone = "America/Bogota"
	}
	if err := h.svc.UpdateSettings(r.Context(), s); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.List(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	if items == nil {
		items = []LeadBooking{}
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"bookings": items})
}
