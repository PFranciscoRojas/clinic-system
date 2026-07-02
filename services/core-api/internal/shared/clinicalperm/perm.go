// Package clinicalperm provides access-control helpers for clinical data.
// Enforces the "need-to-know" principle required by Res. 1995/1999 Art. 14
// (historia clínica accessible only to the treating team).
package clinicalperm

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
)

// IsAssignedToPatient returns true when the staff user is either (a) in an
// active patient_staff_rel row for the patient, or (b) the assigned supervisor
// on any clinical record for that patient that requires co-sign.
//
// It must run on the request-scoped tenant connection: both tables carry a
// FORCE RLS tenant policy, so a raw pool connection (no app.current_org GUC)
// would silently see zero rows and deny every caller.
func IsAssignedToPatient(ctx context.Context, db *pgxpool.Pool, orgID, userID, patientID string) (bool, error) {
	var exists bool
	err := dbctx.From(ctx, db).QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM patient_staff_rel
			WHERE organization_id = $1
			  AND staff_id         = $2
			  AND patient_id       = $3
			  AND ended_at IS NULL
			UNION ALL
			SELECT 1 FROM clinical_records
			WHERE organization_id = $1
			  AND patient_id       = $3
			  AND supervisor_id    = $2
			  AND requires_cosign  = TRUE
		)
	`, orgID, userID, patientID).Scan(&exists)
	return exists, err
}

// HasClinicalRole reports whether roles contains PROFESSIONAL or INTERN.
func HasClinicalRole(roles []string) bool {
	for _, r := range roles {
		if r == "PROFESSIONAL" || r == "INTERN" {
			return true
		}
	}
	return false
}

// IsSysAdmin reports whether roles contains SYSTEM_ADMIN.
func IsSysAdmin(roles []string) bool {
	for _, r := range roles {
		if r == "SYSTEM_ADMIN" {
			return true
		}
	}
	return false
}
