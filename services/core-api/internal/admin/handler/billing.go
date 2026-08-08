package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
)

type adminOrgUser struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name"`
	Email       string  `json:"email"`
	RoleName    string  `json:"role_name"`
	IsActive    bool    `json:"is_active"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

type orgRow struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	SubscriptionStatus string     `json:"subscription_status"`
	IsTest             bool       `json:"is_test"`
	TrialEndsAt        *time.Time `json:"trial_ends_at"`
	CurrentPeriodEnd   *time.Time `json:"current_period_end"`
	CreatedAt          time.Time  `json:"created_at"`
	TotalUsers         int        `json:"total_users"`
	TotalPatients      int        `json:"total_patients"`
	SignupPhone        *string    `json:"signup_phone"`
	SignupSource       *string    `json:"signup_source"`
	OwnerEmail         *string    `json:"owner_email"`
}

// GET /api/v1/admin/orgs — SYSTEM_ADMIN: every real tenant with its billing
// state, so the operator can see who to activate. Internal fixtures (the
// operator's own org, the CI smoke-test demo org) are excluded — they are
// never paying clinics and would just clutter the screen.
//
// The patient count comes from platform_org_activation() rather than a join on
// patients: this runs on a raw pool connection with no app.current_org, and
// under FORCE RLS that join returned zero for every tenant (000073).
func (h *Handler) listOrgs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT o.id, o.name, o.slug, o.subscription_status, o.is_test, o.trial_ends_at,
		       o.current_period_end, o.created_at,
		       COUNT(DISTINCT u.id)::int AS total_users,
		       COALESCE(MAX(m.total_patients), 0) AS total_patients,
		       o.signup_phone, o.signup_source,
		       (SELECT u2.email FROM users u2
		        WHERE u2.organization_id = o.id
		        ORDER BY u2.created_at ASC LIMIT 1) AS owner_email
		FROM organizations o
		LEFT JOIN users u ON u.organization_id = o.id
		LEFT JOIN platform_org_activation() m ON m.org_id = o.id
		WHERE NOT o.is_internal
		GROUP BY o.id
		ORDER BY o.created_at DESC
	`)
	if err != nil {
		slog.Error("admin.list-orgs", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not list organizations")
		return
	}
	defer rows.Close()

	orgs := []orgRow{}
	for rows.Next() {
		var o orgRow
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.SubscriptionStatus, &o.IsTest, &o.TrialEndsAt, &o.CurrentPeriodEnd, &o.CreatedAt, &o.TotalUsers, &o.TotalPatients, &o.SignupPhone, &o.SignupSource, &o.OwnerEmail); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "scan error")
			return
		}
		orgs = append(orgs, o)
	}
	httputil.WriteJSON(w, http.StatusOK, orgs)
}

// POST /api/v1/admin/orgs/{id}/activate — SYSTEM_ADMIN: manually mark a tenant
// paid for N months (cash, Nequi, transfer). Extends from the later of the
// current period end or now, so renewals never lose unused days.
func (h *Handler) activateOrg(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	var body struct {
		Months int `json:"months"`
		Seats  int `json:"seats"` // optional: paid clinical seats; 0 keeps the current limit
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Months < 1 || body.Months > 36 {
		httputil.WriteError(w, http.StatusBadRequest, "months must be between 1 and 36")
		return
	}
	if body.Seats < 0 || body.Seats > 100 {
		httputil.WriteError(w, http.StatusBadRequest, "seats must be between 1 and 100")
		return
	}

	var status string
	var periodEnd time.Time
	err := h.pool.QueryRow(r.Context(), `
		UPDATE organizations
		SET subscription_status = 'active',
		    current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(months => $2),
		    seat_limit = CASE WHEN $3 > 0 THEN $3 ELSE seat_limit END,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING subscription_status, current_period_end
	`, orgID, body.Months, body.Seats).Scan(&status, &periodEnd)
	if err != nil {
		slog.Error("admin.activate-org", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusNotFound, "organization not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"subscription_status": status,
		"current_period_end":  periodEnd.UTC().Format(time.RFC3339),
	})
}

// POST /api/v1/admin/orgs/{id}/suspend — bloquea temporalmente el acceso del
// tenant sin cancelar su cuenta. El SubscriptionGate rechaza cualquier status
// que no sea active/trialing, así que 'suspended' es suficiente.
func (h *Handler) suspendOrg(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var newStatus string
	err := h.pool.QueryRow(r.Context(), `
		UPDATE organizations SET subscription_status = 'suspended', updated_at = NOW()
		WHERE id = $1 AND subscription_status NOT IN ('canceled', 'suspended')
		RETURNING subscription_status
	`, orgID).Scan(&newStatus)
	if err != nil {
		slog.Error("admin.suspend-org", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusNotFound, "organization not found or already in that state")
		return
	}
	slog.Info("admin.suspend-org", "org", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"subscription_status": newStatus})
}

// POST /api/v1/admin/orgs/{id}/cancel — cancela permanentemente la cuenta.
func (h *Handler) cancelOrg(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var newStatus string
	err := h.pool.QueryRow(r.Context(), `
		UPDATE organizations SET subscription_status = 'canceled', updated_at = NOW()
		WHERE id = $1
		RETURNING subscription_status
	`, orgID).Scan(&newStatus)
	if err != nil {
		slog.Error("admin.cancel-org", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusNotFound, "organization not found")
		return
	}
	slog.Info("admin.cancel-org", "org", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"subscription_status": newStatus})
}

// POST /api/v1/admin/orgs/{id}/extend-trial — extiende el trial 30 días desde
// hoy (o desde el trial_ends_at actual si es futuro), y reactiva si estaba
// suspendido o past_due.
func (h *Handler) extendTrial(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body struct {
		Days int `json:"days"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil || body.Days < 1 {
		body.Days = 30
	}
	if body.Days > 365 {
		httputil.WriteError(w, http.StatusBadRequest, "days must be <= 365")
		return
	}

	var newStatus string
	var trialEnd time.Time
	err := h.pool.QueryRow(r.Context(), `
		UPDATE organizations
		SET trial_ends_at    = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + make_interval(days => $2),
		    subscription_status = CASE
		        WHEN subscription_status IN ('suspended','past_due','trialing') THEN 'trialing'
		        ELSE subscription_status
		    END,
		    updated_at = NOW()
		WHERE id = $1 AND subscription_status != 'active'
		RETURNING subscription_status, trial_ends_at
	`, orgID, body.Days).Scan(&newStatus, &trialEnd)
	if err != nil {
		slog.Error("admin.extend-trial", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusNotFound, "organization not found or is already on a paid plan")
		return
	}
	slog.Info("admin.extend-trial", "org", orgID, "days", body.Days)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"subscription_status": newStatus,
		"trial_ends_at":       trialEnd.UTC().Format(time.RFC3339),
	})
}

// GET /admin/orgs/{id}/users — SYSTEM_ADMIN: lista los usuarios de un tenant.
// Incluye inactivos para poder ver quién fue eliminado.
func (h *Handler) listOrgUsers(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	rows, err := h.pool.Query(r.Context(), `
		SELECT u.id, u.display_name, u.email, COALESCE(ro.name, 'sin rol') AS role_name,
		       u.is_active, u.last_login_at
		FROM   users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = $1
		LEFT JOIN roles ro      ON ro.id = ur.role_id
		WHERE  u.organization_id = $1
		ORDER  BY u.created_at
	`, orgID)
	if err != nil {
		slog.Error("admin.list-org-users", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusInternalServerError, "could not list users")
		return
	}
	defer rows.Close()
	users := []adminOrgUser{}
	for rows.Next() {
		var u adminOrgUser
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Email, &u.RoleName, &u.IsActive, &u.LastLoginAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "scan error")
			return
		}
		users = append(users, u)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": users})
}

// POST /admin/orgs/{id}/users/{user_id}/reactivate — SYSTEM_ADMIN: reactivates a
// previously deactivated user and assigns them a role.
func (h *Handler) reactivateOrgUser(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "user_id")

	var body struct {
		RoleName string `json:"role_name"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil || body.RoleName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "role_name is required")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck

	var roleID string
	if err := tx.QueryRow(r.Context(), `SELECT id FROM roles WHERE name = $1`, body.RoleName).Scan(&roleID); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "role not found")
		return
	}

	tag, err := tx.Exec(r.Context(), `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, userID, orgID)
	if err != nil || tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "user not found in this organization")
		return
	}

	if _, err = tx.Exec(r.Context(), `
		INSERT INTO user_roles (organization_id, user_id, role_id)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
	`, orgID, userID, roleID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not assign role")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "commit error")
		return
	}
	slog.Info("admin.reactivate-org-user", "org", orgID, "user", userID, "role", body.RoleName)
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /admin/orgs/{id}/users/{user_id} — SYSTEM_ADMIN: desactiva un usuario
// de cualquier tenant. Mismo soft-delete que el endpoint de equipo, sin guards
// de "último admin" (el operador puede necesitar forzar el acceso).
func (h *Handler) removeOrgUser(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "user_id")

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck

	tx.Exec(r.Context(), `DELETE FROM user_roles WHERE user_id = $1 AND organization_id = $2`, userID, orgID)           //nolint:errcheck
	tag, err := tx.Exec(r.Context(), `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, userID, orgID) //nolint:errcheck
	if err != nil || tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "user not found in this organization")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "commit error")
		return
	}
	slog.Info("admin.remove-org-user", "org", orgID, "user", userID)
	w.WriteHeader(http.StatusNoContent)
}
