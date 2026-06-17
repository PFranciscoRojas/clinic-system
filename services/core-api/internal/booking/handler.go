// Package booking handles paid public bookings: a checkout that holds a slot
// and hands the patient a MercadoPago hosted-checkout URL, and a webhook that
// confirms the booking (creating the appointment) once payment is approved.
package booking

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/availability"
	"sghcp/core-api/internal/billing/mercadopago"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/httputil"
)

var bogota = loadBogota()

func loadBogota() *time.Location {
	loc, err := time.LoadLocation("America/Bogota")
	if err != nil {
		return time.FixedZone("COT", -5*3600)
	}
	return loc
}

type Handler struct {
	pool     *pgxpool.Pool
	mp       *mercadopago.Client
	resolver *availability.Repository
	notifier notify.Notifier
	cfg      config.Config
}

func New(pool *pgxpool.Pool, notifier notify.Notifier, cfg config.Config) *Handler {
	return &Handler{
		pool:     pool,
		mp:       mercadopago.New(cfg.MPAccessToken),
		resolver: availability.New(pool),
		notifier: notifier,
		cfg:      cfg,
	}
}

// PublicRoutes is mounted at /api/v1/public/pay — no JWT.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/checkout", h.checkout)
	r.Post("/webhook", h.webhook)
	r.Get("/status", h.status)
	return r
}

// GET /status?id=<booking_id> — public lookup the return page uses to show the
// confirmed appointment + an add-to-calendar option once the webhook lands.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "id is required")
		return
	}
	var st, modality, clinic string
	var when time.Time
	err := h.pool.QueryRow(r.Context(), `
		SELECT b.status, b.modality, b.scheduled_at, COALESCE(o.name, '')
		FROM bookings b JOIN organizations o ON o.id = b.organization_id
		WHERE b.id = $1
	`, id).Scan(&st, &modality, &when, &clinic)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "reserva no encontrada")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"status":       st,
		"modality":     modality,
		"scheduled_at": when.UTC().Format(time.RFC3339),
		"clinic_name":  clinic,
	})
}

// POST /checkout — hold the slot and return a MercadoPago checkout URL.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	if !h.mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "el pago en línea no está disponible todavía")
		return
	}
	var body struct {
		OrgSlug  string `json:"org_slug"`
		Modality string `json:"modality"`
		Date     string `json:"date"` // YYYY-MM-DD
		Time     string `json:"time"` // HH:MM
		Name     string `json:"name"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Name, body.Email = strings.TrimSpace(body.Name), strings.TrimSpace(body.Email)
	if body.Name == "" || body.Email == "" || body.Date == "" || body.Time == "" {
		httputil.WriteError(w, http.StatusBadRequest, "faltan datos")
		return
	}
	modality := "VIRTUAL"
	if body.Modality == "IN_PERSON" {
		modality = "IN_PERSON"
	}

	prof, err := h.resolver.ResolveBySlug(r.Context(), body.OrgSlug)
	if errors.Is(err, availability.ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "consultorio no encontrado")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}

	when, err := time.ParseInLocation("2006-01-02T15:04", body.Date+"T"+body.Time, bogota)
	if err != nil || !when.After(time.Now()) {
		httputil.WriteError(w, http.StatusBadRequest, "horario inválido")
		return
	}
	scheduledAt := when.UTC()

	taken, err := h.slotTaken(r.Context(), prof.OrgID, prof.StaffID, scheduledAt)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	if taken {
		httputil.WriteError(w, http.StatusConflict, "ese horario ya no está disponible")
		return
	}

	amount := h.cfg.BookingSessionPrice
	var bookingID string
	err = h.pool.QueryRow(r.Context(), `
		INSERT INTO bookings (organization_id, staff_id, scheduled_at, modality, guest_name, email, phone, amount, hold_expires_at)
		VALUES ($1, $2, $3, $4::appointment_modality, $5, $6, $7, $8, NOW() + interval '15 minutes')
		RETURNING id
	`, prof.OrgID, prof.StaffID, scheduledAt, modality, body.Name, body.Email, body.Phone, amount).Scan(&bookingID)
	if err != nil {
		slog.Error("booking.checkout insert", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo crear la reserva")
		return
	}

	title := "Sesión psicológica · " + when.Format("02/01 03:04 pm") + " · " + modalityLabel(modality)
	prefID, initPoint, err := h.mp.CreatePreference(
		r.Context(), title, amount, bookingID, body.Email,
		h.cfg.AppBaseURL+"/book/return",
		h.cfg.AppBaseURL+"/api/v1/public/pay/webhook",
	)
	if err != nil {
		// Release the hold so a failed gateway call doesn't block the slot.
		_, _ = h.pool.Exec(r.Context(), `DELETE FROM bookings WHERE id = $1`, bookingID)
		slog.Error("booking.checkout preference", "err", err)
		httputil.WriteError(w, http.StatusBadGateway, "no se pudo iniciar el pago")
		return
	}
	_, _ = h.pool.Exec(r.Context(), `UPDATE bookings SET mp_preference_id = $2 WHERE id = $1`, bookingID, prefID)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"init_point": initPoint,
		"summary": map[string]any{
			"date": body.Date, "time": body.Time, "modality": modality,
			"amount": amount, "currency": "COP",
		},
	})
}

// slotTaken reports whether the slot already has an appointment (RLS-scoped) or
// an unexpired hold.
func (h *Handler) slotTaken(ctx context.Context, orgID, staffID string, at time.Time) (bool, error) {
	var holds int
	if err := h.pool.QueryRow(ctx, `
		SELECT count(*) FROM bookings
		WHERE staff_id = $1 AND scheduled_at = $2
		  AND status = 'PENDING_PAYMENT' AND hold_expires_at > NOW()
	`, staffID, at).Scan(&holds); err != nil {
		return false, err
	}
	if holds > 0 {
		return true, nil
	}
	busy, err := h.resolver.BusyAppointments(ctx, orgID, staffID, at.Add(-time.Second), at.Add(time.Second))
	if err != nil {
		return false, err
	}
	return len(busy) > 0, nil
}

// POST /webhook — MercadoPago payment notifications. Confirms the booking by
// creating the appointment when the payment is approved. Always answers 200.
func (h *Handler) webhook(w http.ResponseWriter, r *http.Request) {
	defer w.WriteHeader(http.StatusOK)
	if !h.mp.Enabled() {
		return
	}
	kind, id := notification(r)
	if id == "" || !strings.Contains(kind, "payment") {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pay, err := h.mp.GetPayment(ctx, id)
	if err != nil || pay.ExternalReference == "" || pay.Status != "approved" {
		return
	}
	h.confirm(ctx, pay.ExternalReference, id)
}

// confirm creates the appointment for a paid booking (idempotent on status).
func (h *Handler) confirm(ctx context.Context, bookingID, paymentID string) {
	var orgID, staffID, guest, modality string
	var scheduledAt time.Time
	var durationMin int
	err := h.pool.QueryRow(ctx, `
		SELECT organization_id, staff_id, scheduled_at, duration_min, modality, guest_name
		FROM bookings WHERE id = $1 AND status = 'PENDING_PAYMENT'
	`, bookingID).Scan(&orgID, &staffID, &scheduledAt, &durationMin, &modality, &guest)
	if errors.Is(err, pgx.ErrNoRows) {
		return // already confirmed or unknown
	}
	if err != nil {
		slog.Error("booking.confirm load", "err", err)
		return
	}

	// Create the appointment under the org's RLS scope.
	conn, err := h.pool.Acquire(ctx)
	if err != nil {
		return
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	var apptID string
	err = conn.QueryRow(ctx, `
		INSERT INTO appointments (organization_id, patient_id, staff_id, guest_name, scheduled_at, duration_min, modality, status)
		VALUES ($1, NULL, $2, $3, $4, $5, $6::appointment_modality, 'SCHEDULED')
		RETURNING id
	`, orgID, staffID, guest, scheduledAt, durationMin, modality).Scan(&apptID)
	if err != nil {
		slog.Error("booking.confirm appointment", "err", err)
		return
	}

	_, _ = h.pool.Exec(ctx, `
		UPDATE bookings SET status = 'PAID', mp_payment_id = $2, appointment_id = $3, updated_at = NOW()
		WHERE id = $1
	`, bookingID, paymentID, apptID)

	h.notifyConfirmed(ctx, orgID, bookingID)
}

func (h *Handler) notifyConfirmed(ctx context.Context, orgID, bookingID string) {
	var guest, email, modality string
	var when time.Time
	if err := h.pool.QueryRow(ctx, `
		SELECT guest_name, email, modality, scheduled_at FROM bookings WHERE id = $1
	`, bookingID).Scan(&guest, &email, &modality, &when); err != nil {
		return
	}
	local := when.In(bogota)
	d := notify.BookingDetails{
		OrgID:         orgID,
		FirstName:     guest,
		PatientEmail:  email,
		Modality:      modalityLabel(modality),
		PreferredDate: local.Format("2006-01-02"),
		PreferredTime: local.Format("15:04"),
	}
	// Patient: confirmed. Professional(s): a heads-up (patient email blanked so
	// only admins are mailed).
	h.notifier.BookingConfirmed(ctx, d)

	admins, _ := h.orgAdminEmails(ctx, orgID)
	if len(admins) > 0 {
		dAdmin := d
		dAdmin.PatientEmail = ""
		dAdmin.LastName = "(pagada)"
		h.notifier.NewBooking(ctx, dAdmin, admins)
	}
}

func (h *Handler) orgAdminEmails(ctx context.Context, orgID string) ([]string, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT u.email FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN roles r ON r.id = ur.role_id
		WHERE u.organization_id = $1 AND r.name = 'CLINIC_ADMIN' AND u.is_active
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var e string
		if rows.Scan(&e) == nil && e != "" {
			out = append(out, e)
		}
	}
	return out, nil
}

func modalityLabel(m string) string {
	if m == "VIRTUAL" {
		return "Virtual"
	}
	return "Presencial"
}

// notification extracts the resource kind and id from a MercadoPago webhook.
func notification(r *http.Request) (kind, id string) {
	q := r.URL.Query()
	kind = q.Get("type")
	if kind == "" {
		kind = q.Get("topic")
	}
	id = q.Get("data.id")
	if id == "" {
		id = q.Get("id")
	}
	var body struct {
		Type string `json:"type"`
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if json.NewDecoder(r.Body).Decode(&body) == nil {
		if kind == "" {
			kind = body.Type
		}
		if id == "" {
			id = body.Data.ID
		}
	}
	return strings.ToLower(kind), id
}
