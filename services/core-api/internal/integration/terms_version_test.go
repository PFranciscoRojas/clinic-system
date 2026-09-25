package integration

import (
	"context"
	"testing"

	"sghcp/core-api/internal/auth"
	authrepo "sghcp/core-api/internal/auth/repository"
)

// users.terms_version is the proof of which terms a clinic owner accepted at
// signup (Ley 1581 audit trail). It used to be whatever the browser sent, and
// the browser sent a constant: every signup since 2026-07-07 recorded
// "2026-06-24" while the page showed the 2026-07-07 text. The server knows
// which version is current, so the server records it.
func TestSignupRecordsTheCurrentTermsVersion(t *testing.T) {
	skipIfShort(t)
	initPepperOnce(t)
	ctx := context.Background()

	var current string
	if err := adminPool.QueryRow(ctx,
		`SELECT version FROM legal_documents WHERE doc_type = 'terms' AND is_current`,
	).Scan(&current); err != nil {
		t.Fatalf("read current terms version: %v", err)
	}

	_, _, userID, err := authrepo.New(appPool).CreateOrgWithOwner(ctx, auth.CreateOrgParams{
		OrgName:      "Clínica Versión",
		BaseSlug:     "clinica-version-terminos",
		Email:        "version-terminos@test.local",
		PasswordHash: "$2a$04$notarealhashbutlongenoughxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		DisplayName:  "Titular",
		TrialDays:    14,
		TermsVersion: "stale-client-constant",
	})
	if err != nil {
		t.Fatalf("signup: %v", err)
	}

	var recorded string
	if err := adminPool.QueryRow(ctx,
		`SELECT terms_version FROM users WHERE id = $1`, userID,
	).Scan(&recorded); err != nil {
		t.Fatalf("read recorded version: %v", err)
	}
	if recorded != current {
		t.Fatalf("signup recorded terms_version %q, want the current %q", recorded, current)
	}
}
