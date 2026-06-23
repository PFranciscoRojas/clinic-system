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
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/availability"
	"sghcp/core-api/internal/billing/mercadopago"
	notify "sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/httputil"
)

// Sentinel errors surfaced from the scoped checkout closure to map to HTTP.
var (
	errSlotTaken  = errors.New("slot taken")
	errPreference = errors.New("preference failed")
)

// bookingOrg maps a booking id to its organization via the SECURITY DEFINER
// resolver (bypassing RLS — the unguessable id is the credential), so the
// id-first webhook/status/release lookups can pin the org's RLS scope before
// touching the now-RLS-protected bookings table. Empty string when not found.
func (h *Handler) bookingOrg(ctx context.Context, id string) (string, error) {
	var org pgtype.Text
	if err := h.pool.QueryRow(ctx, `SELECT booking_org($1::uuid)::text`, id).Scan(&org); err != nil {
		return "", err
	}
	return org.String, nil
}

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
	r.Post("/release", h.release)
	return r
}

// POST /release {id} — frees a held slot right away when the patient abandons or
// cancels payment, instead of waiting for the 15-minute hold to expire. Only
// unpaid holds are released, so a confirmed (PAID) booking is never touched.
func (h *Handler) release(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "id is required")
		return
	}
	if org, err := h.bookingOrg(r.Context(), body.ID); err == nil && org != "" {
		_ = dbctx.WithOrgScope(r.Context(), h.pool, org, func(ctx context.Context) error {
			_, err := dbctx.From(ctx, h.pool).Exec(ctx,
				`DELETE FROM bookings WHERE id = $1 AND status = 'PENDING_PAYMENT'`, body.ID)
			return err
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /status?id=<booking_id> — public lookup the return page uses to show the
// confirmed appointment + an add-to-calendar option once the webhook lands.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "id is required")
		return
	}
	org, err := h.bookingOrg(r.Context(), id)
	if err != nil || org == "" {
		httputil.WriteError(w, http.StatusNotFound, "reserva no encontrada")
		return
	}
	var st, modality, clinic, slug string
	var website, paymentType, voucherURL *string
	var when time.Time
	var holdExpires time.Time
	err = dbctx.WithOrgScope(r.Context(), h.pool, org, func(ctx context.Context) error {
		return dbctx.From(ctx, h.pool).QueryRow(ctx, `
			SELECT b.status, b.modality, b.scheduled_at, COALESCE(o.name, ''), COALESCE(o.slug, ''),
			       o.settings->'branding'->>'website', b.mp_payment_type, b.payment_voucher_url,
			       b.hold_expires_at
			FROM bookings b JOIN organizations o ON o.id = b.organization_id
			WHERE b.id = $1
		`, id).Scan(&st, &modality, &when, &clinic, &slug, &website, &paymentType, &voucherURL, &holdExpires)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "reserva no encontrada")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	deref := func(p *string) string {
		if p != nil {
			return *p
		}
		return ""
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"status":          st,
		"modality":        modality,
		"scheduled_at":    when.UTC().Format(time.RFC3339),
		"clinic_name":     clinic,
		"org_slug":        slug,
		"website":         deref(website),
		"payment_type":    deref(paymentType),
		"voucher_url":     deref(voucherURL),
		"hold_expires_at": holdExpires.UTC().Format(time.RFC3339),
	})
}

// POST /checkout — hold the slot and return a MercadoPago checkout URL.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	if !h.mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "el pago en línea no está disponible todavía")
		return
	}
	var body struct {
		OrgSlug       string `json:"org_slug"`
		Modality      string `json:"modality"`
		Date          string `json:"date"` // YYYY-MM-DD
		Time          string `json:"time"` // HH:MM
		Name          string `json:"name"`
		Email         string `json:"email"`
		Phone         string `json:"phone"`
		PolicyAccepted bool  `json:"policy_accepted"` // refund/cancellation policy (B6)
		PrevBookingID string `json:"prev_booking_id"` // hold to release before re-checking out
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
	if !body.PolicyAccepted {
		httputil.WriteError(w, http.StatusBadRequest, "debes aceptar la política de reembolso y cancelación")
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

	amount := h.cfg.BookingSessionPrice
	title := "Sesión psicológica · " + when.Format("02/01 03:04 pm") + " · " + modalityLabel(modality)

	var bookingID, initPoint string

	// Public route: pin the resolved org's RLS scope for every bookings
	// statement (the table is now under RLS). slotTaken's appointments check
	// self-scopes on its own connection.
	scopeErr := dbctx.WithOrgScope(r.Context(), h.pool, prof.OrgID, func(ctx context.Context) error {
		q := dbctx.From(ctx, h.pool)

		// Release the patient's own prior unpaid holds before re-checking the
		// slot. Without this, going back to edit the summary and re-submitting
		// collides with the hold the same patient just created (a 409).
		if body.PrevBookingID != "" {
			_, _ = q.Exec(ctx, `DELETE FROM bookings WHERE id = $1 AND status = 'PENDING_PAYMENT'`, body.PrevBookingID)
		}
		_, _ = q.Exec(ctx,
			`DELETE FROM bookings WHERE email = $1 AND staff_id = $2 AND scheduled_at = $3 AND status = 'PENDING_PAYMENT'`,
			body.Email, prof.StaffID, scheduledAt)

		taken, err := h.slotTaken(ctx, prof.OrgID, prof.StaffID, scheduledAt)
		if err != nil {
			return err
		}
		if taken {
			return errSlotTaken
		}

		if err := q.QueryRow(ctx, `
			INSERT INTO bookings (organization_id, staff_id, scheduled_at, modality, guest_name, email, phone, amount, hold_expires_at, policy_accepted_at)
			VALUES ($1, $2, $3, $4::appointment_modality, $5, $6, $7, $8, NOW() + interval '15 minutes', NOW())
			RETURNING id
		`, prof.OrgID, prof.StaffID, scheduledAt, modality, body.Name, body.Email, body.Phone, amount).Scan(&bookingID); err != nil {
			return err
		}

		prefID, ip, err := h.mp.CreatePreference(
			ctx, title, amount, bookingID, body.Email,
			h.cfg.AppBaseURL+"/book/return?slug="+url.QueryEscape(body.OrgSlug),
			h.cfg.AppBaseURL+"/api/v1/public/pay/webhook",
		)
		if err != nil {
			// Release the hold so a failed gateway call doesn't block the slot.
			_, _ = q.Exec(ctx, `DELETE FROM bookings WHERE id = $1`, bookingID)
			slog.Error("booking.checkout preference", "err", err)
			return errPreference
		}
		_, _ = q.Exec(ctx, `UPDATE bookings SET mp_preference_id = $2 WHERE id = $1`, bookingID, prefID)
		initPoint = ip
		return nil
	})
	switch {
	case errors.Is(scopeErr, errSlotTaken):
		httputil.WriteError(w, http.StatusConflict, "ese horario ya no está disponible")
		return
	case errors.Is(scopeErr, errPreference):
		httputil.WriteError(w, http.StatusBadGateway, "no se pudo iniciar el pago")
		return
	case scopeErr != nil:
		slog.Error("booking.checkout", "err", scopeErr)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo crear la reserva")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"init_point": initPoint,
		"booking_id": bookingID,
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
	if err := dbctx.From(ctx, h.pool).QueryRow(ctx, `
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
	if ok, detail := mercadopago.VerifyWebhook(h.cfg.MPWebhookSecret,
		r.Header.Get("x-signature"), r.Header.Get("x-request-id"), r.URL.Query().Get("data.id")); !ok {
		slog.Warn("booking.webhook: signature check failed", "detail", detail, "enforce", h.cfg.MPWebhookEnforce)
		if h.cfg.MPWebhookEnforce {
			return
		}
	}
	kind, id := notification(r)
	if id == "" || !strings.Contains(kind, "payment") {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pay, err := h.mp.GetPayment(ctx, id)
	if err != nil || pay.ExternalReference == "" {
		return
	}
	switch pay.Status {
	case "approved":
		h.confirm(ctx, pay.ExternalReference, id, pay.PaymentTypeID, pay.PaymentMethodID)
	case "pending", "in_process":
		// Deferred (cash/voucher) payment: the patient pays the voucher later.
		// Keep the slot held until the voucher expires and store its URL so the
		// return page can show "reserva apartada, paga tu comprobante".
		h.holdDeferred(ctx, pay.ExternalReference, id, pay)
	case "rejected", "cancelled", "refunded", "charged_back":
		// Free the held slot immediately so it can be booked again.
		if org, e := h.bookingOrg(ctx, pay.ExternalReference); e == nil && org != "" {
			_ = dbctx.WithOrgScope(ctx, h.pool, org, func(ctx context.Context) error {
				_, err := dbctx.From(ctx, h.pool).Exec(ctx,
					`DELETE FROM bookings WHERE id = $1 AND status = 'PENDING_PAYMENT'`, pay.ExternalReference)
				return err
			})
		}
	}
}

// confirm creates the appointment for a paid booking (idempotent on status).
// paymentType/paymentMethod are MercadoPago's reported channel detail (may be
// empty) and are recorded for the income-by-method breakdown.
func (h *Handler) confirm(ctx context.Context, bookingID, paymentID, paymentType, paymentMethod string) {
	// Resolve the org from the unguessable booking id (bypassing RLS) so every
	// query below — including reading the booking itself — runs under the org's
	// RLS scope. Without this, the now-RLS-protected bookings read returns no
	// rows and the payment would never be confirmed.
	orgID, err := h.bookingOrg(ctx, bookingID)
	if err != nil || orgID == "" {
		return
	}

	scopeErr := dbctx.WithOrgScope(ctx, h.pool, orgID, func(ctx context.Context) error {
		q := dbctx.From(ctx, h.pool)
		var staffID, guest, modality string
		var scheduledAt time.Time
		var durationMin int
		err := q.QueryRow(ctx, `
			SELECT staff_id, scheduled_at, duration_min, modality, guest_name
			FROM bookings WHERE id = $1 AND status = 'PENDING_PAYMENT'
		`, bookingID).Scan(&staffID, &scheduledAt, &durationMin, &modality, &guest)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // already confirmed or unknown
		}
		if err != nil {
			return err
		}

		var apptID string
		if err := q.QueryRow(ctx, `
			INSERT INTO appointments (organization_id, patient_id, staff_id, guest_name, scheduled_at, duration_min, modality, status)
			VALUES ($1, NULL, $2, $3, $4, $5, $6::appointment_modality, 'SCHEDULED')
			RETURNING id
		`, orgID, staffID, guest, scheduledAt, durationMin, modality).Scan(&apptID); err != nil {
			return err
		}

		_, err = q.Exec(ctx, `
			UPDATE bookings
			SET status = 'PAID', mp_payment_id = $2, appointment_id = $3,
			    mp_payment_type = NULLIF($4, ''), mp_payment_method = NULLIF($5, ''),
			    updated_at = NOW()
			WHERE id = $1
		`, bookingID, paymentID, apptID, paymentType, paymentMethod)
		return err
	})
	if scopeErr != nil {
		slog.Error("booking.confirm", "err", scopeErr)
		return
	}

	// Fire-and-forget on its own context so a slow Resend call never delays the
	// 200 the MercadoPago webhook is waiting for (which would trigger retries).
	go h.notifyConfirmed(context.Background(), orgID, bookingID)
}

// holdDeferred extends the slot hold for a pending offline payment (Efecty,
// cash, some transfers): the patient gets a voucher and pays it later, so we
// keep the slot reserved until the voucher's own expiration instead of the
// 15-minute checkout hold, and record the voucher URL for the return page. The
// booking stays PENDING_PAYMENT — the later "approved" webhook confirms it, and
// "cancelled" (voucher expired) releases it (both already handled).
func (h *Handler) holdDeferred(ctx context.Context, bookingID, paymentID string, pay *mercadopago.Payment) {
	orgID, err := h.bookingOrg(ctx, bookingID)
	if err != nil || orgID == "" {
		return
	}
	// Hold until the voucher expires; fall back to 3 days if MP omits the date.
	expires := time.Now().Add(72 * time.Hour)
	if pay.DateOfExpiration != "" {
		if t, e := time.Parse(time.RFC3339, pay.DateOfExpiration); e == nil {
			expires = t
		}
	}
	var guest, email, modality string
	var scheduledAt time.Time
	var holdUntil time.Time
	scopeErr := dbctx.WithOrgScope(ctx, h.pool, orgID, func(ctx context.Context) error {
		q := dbctx.From(ctx, h.pool)
		if err := q.QueryRow(ctx, `
			UPDATE bookings
			SET mp_payment_id = $2,
			    mp_payment_type = NULLIF($3, ''), mp_payment_method = NULLIF($4, ''),
			    payment_voucher_url = NULLIF($5, ''),
			    -- Never hold past the appointment: cap the deadline at 2h before it.
			    hold_expires_at = LEAST($6, scheduled_at - interval '2 hours'),
			    updated_at = NOW()
			WHERE id = $1 AND status = 'PENDING_PAYMENT'
			RETURNING guest_name, email, modality, scheduled_at,
			          LEAST($6, scheduled_at - interval '2 hours')
		`, bookingID, paymentID, pay.PaymentTypeID, pay.PaymentMethodID,
			pay.TransactionDetails.ExternalResourceURL, expires).
			Scan(&guest, &email, &modality, &scheduledAt, &holdUntil); err != nil {
			return err
		}
		return nil
	})
	if scopeErr != nil {
		slog.Error("booking.holdDeferred", "err", scopeErr)
		return
	}

	go func() {
		local := scheduledAt.In(bogota)
		deadline := holdUntil.In(bogota)
		h.notifier.BookingVoucher(context.Background(), notify.BookingVoucherDetails{
			OrgID:         orgID,
			GuestName:     guest,
			PatientEmail:  email,
			Modality:      modalityLabel(modality),
			AppointmentAt: local.Format("Monday, 2 de January, 3:04 pm"),
			Deadline:      deadline.Format("Monday, 2 de January, 3:04 pm"),
			VoucherURL:    pay.TransactionDetails.ExternalResourceURL,
		})
	}()
}

func (h *Handler) notifyConfirmed(ctx context.Context, orgID, bookingID string) {
	var guest, email, modality string
	var when time.Time
	if err := dbctx.WithOrgScope(ctx, h.pool, orgID, func(ctx context.Context) error {
		return dbctx.From(ctx, h.pool).QueryRow(ctx, `
			SELECT guest_name, email, modality, scheduled_at FROM bookings WHERE id = $1
		`, bookingID).Scan(&guest, &email, &modality, &when)
	}); err != nil {
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
	// Patient gets the branded confirmation; admins get a paid-booking heads-up
	// with the patient's contact (a dedicated template, not the unpaid-request one).
	h.notifier.BookingConfirmed(ctx, d)

	admins, _ := h.orgAdminEmails(ctx, orgID)
	h.notifier.BookingPaidAdmin(ctx, d, admins)
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
