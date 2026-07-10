package handler

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// setOrgTestFlag marks a tenant as a test organization (or back to real).
// Test orgs stay visible in the Tenants view but are excluded from metrics
// and become eligible for immediate hard deletion.
//
// PATCH /api/v1/admin/orgs/{id}/test-flag  body: {"is_test": true}
func (h *Handler) setOrgTestFlag(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := chi.URLParam(r, "id")
	if orgID == claims.OrganizationID {
		httputil.WriteError(w, http.StatusForbidden, "no puedes marcar tu propia organización")
		return
	}

	var body struct {
		IsTest bool `json:"is_test"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tag, err := h.pool.Exec(r.Context(), `
		UPDATE organizations
		SET is_test = $2, updated_at = now()
		WHERE id = $1 AND NOT is_internal
	`, orgID, body.IsTest)
	if err != nil {
		slog.Error("admin.set-test-flag", "org_id", orgID, "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo actualizar la organización")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "organización no encontrada")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"is_test": body.IsTest})
}

// deleteOrg hard-deletes an entire tenant: every row in every org-scoped
// table, the users, the encryption keys and the audio files on disk — no
// trace left. Guards, all mandatory:
//   - SYSTEM_ADMIN role (route middleware)
//   - never an internal fixture, never the caller's own org
//   - the request body must repeat the org's exact slug
//   - a real (non-test) org with any activity in the last 7 days is refused;
//     test-flagged orgs can be deleted immediately
//
// DELETE /api/v1/admin/orgs/{id}  body: {"confirmation": "<slug>"}
func (h *Handler) deleteOrg(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := chi.URLParam(r, "id")
	if orgID == claims.OrganizationID {
		httputil.WriteError(w, http.StatusForbidden, "no puedes eliminar tu propia organización")
		return
	}

	var body struct {
		Confirmation string `json:"confirmation"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var slug string
	var isInternal, isTest bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT slug, is_internal, is_test FROM organizations WHERE id = $1`, orgID,
	).Scan(&slug, &isInternal, &isTest)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "organización no encontrada")
		return
	}
	if isInternal {
		httputil.WriteError(w, http.StatusForbidden, "las organizaciones internas no se pueden eliminar")
		return
	}
	if body.Confirmation != slug {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "escribe el slug exacto de la organización para confirmar")
		return
	}

	// Real orgs get a 7-day activity brake: any recent appointment, note,
	// patient, invoice, audit entry or login means someone may be using it.
	if !isTest {
		var lastActivity *time.Time
		err := h.pool.QueryRow(r.Context(), `
			SELECT GREATEST(
				(SELECT max(created_at)    FROM appointments     WHERE organization_id = $1),
				(SELECT max(created_at)    FROM clinical_records WHERE organization_id = $1),
				(SELECT max(created_at)    FROM patients         WHERE organization_id = $1),
				(SELECT max(created_at)    FROM invoices         WHERE organization_id = $1),
				(SELECT max(created_at)    FROM audit_log        WHERE organization_id = $1),
				(SELECT max(last_login_at) FROM users            WHERE organization_id = $1)
			)
		`, orgID).Scan(&lastActivity)
		if err != nil {
			slog.Error("admin.delete-org activity check", "org_id", orgID, "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "no se pudo verificar la actividad reciente")
			return
		}
		if lastActivity != nil && time.Since(*lastActivity) < 7*24*time.Hour {
			httputil.WriteError(w, http.StatusConflict,
				"la organización tuvo movimientos en los últimos 7 días — márcala como prueba si aun así quieres eliminarla")
			return
		}
	}

	deleted, err := h.deleteOrgCascade(r.Context(), orgID)
	if err != nil {
		slog.Error("admin.delete-org failed", "org_id", orgID, "slug", slug, "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo eliminar la organización")
		return
	}

	// The org's own audit trail is gone with it; the record of the deletion
	// lives in the operator's org.
	h.pool.Exec(r.Context(), `
		INSERT INTO audit_log
			(organization_id, user_id, user_email_hash, action, resource_type, resource_id,
			 ip_address, user_agent, success, error_code)
		VALUES ($1::uuid, $2::uuid, '', 'ORG_DELETED', 'organization', $3::uuid, NULL, $4, TRUE, '')
	`, claims.OrganizationID, claims.UserID, orgID, slug)

	// Audio recordings live under <audioDir>/<orgID>/… — best-effort cleanup
	// after the transaction committed (a leftover file is recoverable noise;
	// a half-deleted org is not).
	if h.cfg.AudioDir != "" {
		if err := os.RemoveAll(filepath.Join(h.cfg.AudioDir, orgID)); err != nil {
			slog.Warn("admin.delete-org audio cleanup", "org_id", orgID, "err", err)
		}
	}

	slog.Info("admin.delete-org done", "org_id", orgID, "slug", slug, "by", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"slug":    slug,
		"deleted": deleted,
	})
}

// deleteOrgCascade removes every row belonging to the org in FK-dependency
// order inside one transaction. Clinical tables are RLS-protected, so the
// transaction adopts the target org's tenant scope via set_config — the
// explicit organization_id filters stay as belt-and-suspenders.
func (h *Handler) deleteOrgCascade(ctx context.Context, orgID string) (map[string]int64, error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.current_org', $1, true)`, orgID); err != nil {
		return nil, err
	}

	// Every DEK the org owns — per-record keys plus the professionals'
	// signature keys — collected before their referencing rows disappear.
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE doomed_deks ON COMMIT DROP AS
		  SELECT dek_id AS id FROM patients            WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM clinical_records    WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM consents            WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM ai_drafts           WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM treatment_plans     WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM patient_assessments WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM invoices            WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT pp.signature_dek_id FROM professional_profiles pp
		        JOIN users u ON u.id = pp.user_id
		        WHERE u.organization_id = $1 AND pp.signature_dek_id IS NOT NULL
	`, orgID); err != nil {
		return nil, err
	}

	// Leaves first, then their parents.
	steps := []struct {
		table string
		sql   string
	}{
		{"clinical_record_addenda", `DELETE FROM clinical_record_addenda WHERE organization_id = $1`},
		{"patient_assessments", `DELETE FROM patient_assessments WHERE organization_id = $1`},
		{"patient_diagnoses", `DELETE FROM patient_diagnoses WHERE organization_id = $1`},
		{"ai_suggestions", `DELETE FROM ai_suggestions WHERE organization_id = $1`},
		{"ai_drafts", `DELETE FROM ai_drafts WHERE organization_id = $1`},
		{"consent_sign_tokens", `DELETE FROM consent_sign_tokens WHERE organization_id = $1`},
		{"consents", `DELETE FROM consents WHERE organization_id = $1`},
		{"patient_staff_rel", `DELETE FROM patient_staff_rel WHERE organization_id = $1`},
		{"treatment_goals", `DELETE FROM treatment_goals WHERE plan_id IN (SELECT id FROM treatment_plans WHERE organization_id = $1)`},
		{"treatment_plans", `DELETE FROM treatment_plans WHERE organization_id = $1`},
		{"clinical_records", `DELETE FROM clinical_records WHERE organization_id = $1`},
		{"payments", `DELETE FROM payments WHERE organization_id = $1`},
		{"invoices", `DELETE FROM invoices WHERE organization_id = $1`},
		{"patient_billing_profiles", `DELETE FROM patient_billing_profiles WHERE organization_id = $1`},
		{"bookings", `DELETE FROM bookings WHERE organization_id = $1`},
		{"appointment_gcal_events", `DELETE FROM appointment_gcal_events WHERE staff_id IN (SELECT id FROM users WHERE organization_id = $1)`},
		// Null out the self-referential rescheduled_to before deleting appointments.
		{"appointments_unlink", `UPDATE appointments SET rescheduled_to = NULL WHERE organization_id = $1`},
		{"appointments", `DELETE FROM appointments WHERE organization_id = $1`},
		{"patients", `DELETE FROM patients WHERE organization_id = $1`},
		{"notifications", `DELETE FROM notifications WHERE organization_id = $1`},
		{"domain_events", `DELETE FROM domain_events WHERE organization_id = $1`},
		{"service_rates", `DELETE FROM service_rates WHERE organization_id = $1`},
		{"supervision_rel", `DELETE FROM supervision_rel WHERE organization_id = $1`},
		{"professional_google_calendar", `DELETE FROM professional_google_calendar WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`},
		{"professional_profiles", `DELETE FROM professional_profiles WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`},
		{"consent_templates", `DELETE FROM consent_templates WHERE organization_id = $1`},
		{"clinical_record_templates", `DELETE FROM clinical_record_templates WHERE organization_id = $1`},
		{"org_payment_config", `DELETE FROM org_payment_config WHERE organization_id = $1`},
		{"org_whatsapp_config", `DELETE FROM org_whatsapp_config WHERE organization_id = $1`},
		{"encryption_keys", `DELETE FROM encryption_keys WHERE id IN (SELECT id FROM doomed_deks)`},
		{"user_roles", `DELETE FROM user_roles WHERE organization_id = $1`},
		{"users", `DELETE FROM users WHERE organization_id = $1`},
		{"roles", `DELETE FROM roles WHERE organization_id = $1`},
		{"audit_log", `DELETE FROM audit_log WHERE organization_id = $1`},
		{"organizations", `DELETE FROM organizations WHERE id = $1`},
	}

	deleted := make(map[string]int64, len(steps))
	for _, s := range steps {
		args := []any{orgID}
		if s.table == "encryption_keys" { // reads only the temp table
			args = nil
		}
		tag, err := tx.Exec(ctx, s.sql, args...)
		if err != nil {
			return nil, err
		}
		deleted[s.table] = tag.RowsAffected()
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return deleted, nil
}
