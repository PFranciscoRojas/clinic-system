package handler

import (
	"context"
	"net/http"

	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// resetClinicalData wipes all clinical/transactional data for the caller's
// organization — patients, appointments, records, drafts, consents, plans —
// while preserving users, the professional profile + signature, consent
// templates and reference catalogs. Used only during the testing phase.
//
// POST /api/v1/admin/reset-clinical-data  body: {"confirmation":"ELIMINAR"}
func (h *Handler) resetClinicalData(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Role re-check on top of the permission gate — this is irreversible.
	isAdmin := false
	for _, role := range claims.Roles {
		if role == "CLINIC_ADMIN" {
			isAdmin = true
			break
		}
	}
	if !isAdmin {
		httputil.WriteError(w, http.StatusForbidden, "only a clinic admin can reset data")
		return
	}

	var body struct {
		Confirmation string `json:"confirmation"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil || body.Confirmation != "ELIMINAR" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, `escribe "ELIMINAR" para confirmar`)
		return
	}

	deleted, err := h.wipeOrg(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo limpiar los datos")
		return
	}

	// Best-effort audit trail of who triggered the wipe.
	h.pool.Exec(r.Context(), `
		INSERT INTO audit_log
			(organization_id, user_id, user_email_hash, action, resource_type,
			 ip_address, user_agent, success, error_code)
		VALUES ($1::uuid, $2::uuid, '', 'DATA_RESET', 'organization', NULL, '', TRUE, '')
	`, claims.OrganizationID, claims.UserID)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"deleted": deleted,
	})
}

// wipeOrg deletes the org's clinical data in FK-dependency order inside a
// single transaction, then drops the now-orphaned per-record DEKs (never the
// professional signature DEK). Returns row counts per table.
func (h *Handler) wipeOrg(ctx context.Context, orgID string) (map[string]int64, error) {
	// Use the request-scoped tenant connection so the deletes run under the
	// org's RLS scope (belt-and-suspenders with the explicit org filters).
	tx, err := dbctx.From(ctx, h.pool).Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Collect DEKs owned by this org's clinical data before deleting their rows.
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE doomed_deks ON COMMIT DROP AS
		  SELECT dek_id AS id FROM patients            WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM clinical_records    WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM consents            WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM ai_drafts           WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM treatment_plans     WHERE organization_id = $1 AND dek_id IS NOT NULL
		  UNION SELECT dek_id FROM patient_assessments WHERE organization_id = $1 AND dek_id IS NOT NULL
	`, orgID); err != nil {
		return nil, err
	}

	// Deletion order: leaves first, then their parents.
	steps := []struct {
		table string
		sql   string
	}{
		{"clinical_record_addenda", `DELETE FROM clinical_record_addenda WHERE record_id IN (SELECT id FROM clinical_records WHERE organization_id = $1)`},
		{"patient_assessments", `DELETE FROM patient_assessments WHERE organization_id = $1`},
		{"patient_diagnoses", `DELETE FROM patient_diagnoses WHERE patient_id IN (SELECT id FROM patients WHERE organization_id = $1)`},
		{"ai_drafts", `DELETE FROM ai_drafts WHERE organization_id = $1`},
		{"consent_sign_tokens", `DELETE FROM consent_sign_tokens WHERE patient_id IN (SELECT id FROM patients WHERE organization_id = $1)`},
		{"consents", `DELETE FROM consents WHERE organization_id = $1`},
		{"patient_staff_rel", `DELETE FROM patient_staff_rel WHERE patient_id IN (SELECT id FROM patients WHERE organization_id = $1)`},
		{"treatment_goals", `DELETE FROM treatment_goals WHERE plan_id IN (SELECT id FROM treatment_plans WHERE organization_id = $1)`},
		{"treatment_plans", `DELETE FROM treatment_plans WHERE organization_id = $1`},
		{"clinical_records", `DELETE FROM clinical_records WHERE organization_id = $1`},
		{"appointments", `DELETE FROM appointments WHERE organization_id = $1`},
		{"patients", `DELETE FROM patients WHERE organization_id = $1`},
	}

	deleted := make(map[string]int64, len(steps)+1)
	for _, s := range steps {
		tag, err := tx.Exec(ctx, s.sql, orgID)
		if err != nil {
			return nil, err
		}
		deleted[s.table] = tag.RowsAffected()
	}

	// Drop orphaned per-record DEKs, never the professional signature DEK.
	tag, err := tx.Exec(ctx, `
		DELETE FROM encryption_keys k
		WHERE k.id IN (SELECT id FROM doomed_deks)
		  AND NOT EXISTS (SELECT 1 FROM professional_profiles p WHERE p.signature_dek_id = k.id)
	`)
	if err != nil {
		return nil, err
	}
	deleted["encryption_keys"] = tag.RowsAffected()

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return deleted, nil
}
