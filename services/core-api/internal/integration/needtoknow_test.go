package integration

import (
	"context"
	"testing"

	"sghcp/core-api/internal/shared/clinicalperm"
)

// TestNeedToKnow covers Res. 1995/1999 Art. 14: clinical data is only visible
// to the treating team. It runs on the tenant-scoped connection because both
// tables involved carry FORCE RLS — which is also the regression guard for the
// bug this suite found: IsAssignedToPatient used to query the raw pool (no
// GUC), silently disabling the supervisor arm.
func TestNeedToKnow(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "ntk") // seeds patient + PRIMARY_THERAPIST rel for tn.UserID
	ctx := scopedCtx(t, tn.OrgID)

	var outsider string
	if err := adminPool.QueryRow(context.Background(),
		`INSERT INTO users (organization_id, email, email_hash, password_hash)
		 VALUES ($1, 'outsider@test.local', 'emailhash-ntk-outsider', 'x') RETURNING id`,
		tn.OrgID,
	).Scan(&outsider); err != nil {
		t.Fatal(err)
	}

	t.Run("assigned therapist is allowed", func(t *testing.T) {
		ok, err := clinicalperm.IsAssignedToPatient(ctx, appPool, tn.OrgID, tn.UserID, tn.PatientID)
		if err != nil {
			t.Fatal(err)
		}
		if !ok {
			t.Fatal("PRIMARY_THERAPIST denied access to their own patient")
		}
	})

	t.Run("same-org professional without a relation is denied", func(t *testing.T) {
		ok, err := clinicalperm.IsAssignedToPatient(ctx, appPool, tn.OrgID, outsider, tn.PatientID)
		if err != nil {
			t.Fatal(err)
		}
		if ok {
			t.Fatal("professional with no patient_staff_rel got access")
		}
	})

	t.Run("cosign supervisor is allowed via the record arm", func(t *testing.T) {
		if _, err := adminPool.Exec(context.Background(),
			`UPDATE clinical_records SET requires_cosign = TRUE, supervisor_id = $1 WHERE id = $2`,
			outsider, tn.RecordID); err != nil {
			t.Fatal(err)
		}
		ok, err := clinicalperm.IsAssignedToPatient(ctx, appPool, tn.OrgID, outsider, tn.PatientID)
		if err != nil {
			t.Fatal(err)
		}
		if !ok {
			t.Fatal("assigned cosign supervisor was denied (raw-pool regression?)")
		}
	})

	t.Run("without the tenant scope everything fails closed", func(t *testing.T) {
		ok, err := clinicalperm.IsAssignedToPatient(context.Background(), appPool, tn.OrgID, tn.UserID, tn.PatientID)
		if err != nil {
			t.Fatal(err)
		}
		if ok {
			t.Fatal("unscoped connection saw tenant rows — RLS should fail closed")
		}
	})
}
