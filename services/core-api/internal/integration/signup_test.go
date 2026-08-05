package integration

import (
	"context"
	"errors"
	"strings"
	"testing"

	"sghcp/core-api/internal/auth"
	authrepo "sghcp/core-api/internal/auth/repository"
	"sghcp/core-api/internal/shared/hash"
)

// CreateOrgWithOwner hashes the owner's email, which panics if the pepper was
// never loaded. newAuthService owns the same sync.Once; these tests do not go
// through it.
func initPepperOnce(t *testing.T) {
	t.Helper()
	initPepper.Do(func() {
		if err := hash.Init(strings.Repeat("ab", 32)); err != nil {
			t.Fatalf("hash.Init: %v", err)
		}
	})
}

// Two clinics called the same thing is not an edge case, it is Tuesday:
// "Consultorio Psicológico", "Centro de Psicología", a therapist's own name.
// Their slugs collide, and CreateOrgWithOwner is supposed to walk base, base-2,
// base-3 until one is free.
//
// It could not. Postgres aborts the entire transaction on any statement error,
// so the retry after a unique violation issued its INSERT into an already-dead
// transaction and got 25P02 forever. The loop was unreachable code protecting a
// case it always failed, and the second clinic to try that name was told
// "could not create account" (HTTP 500) with no path forward — a signup lost at
// the very last step, silently, on the one metric that matters most.
//
// The acceptance scenarios found it by signing two clinics up under the same
// name. This is the same guarantee stated directly, so the cause stays pinned
// even if those scenarios are rewritten.
func TestSignupSurvivesASlugCollision(t *testing.T) {
	skipIfShort(t)
	initPepperOnce(t)
	ctx := context.Background()
	repo := authrepo.New(appPool)

	base := "clinica-homonima"
	params := func(email string) auth.CreateOrgParams {
		return auth.CreateOrgParams{
			OrgName:      "Clínica Homónima",
			BaseSlug:     base,
			Email:        email,
			PasswordHash: "$2a$04$notarealhashbutlongenoughxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			DisplayName:  "Titular",
			TrialDays:    14,
			TermsVersion: "v1",
		}
	}

	_, slug1, _, err := repo.CreateOrgWithOwner(ctx, params("homonima-1@test.local"))
	if err != nil {
		t.Fatalf("first signup: %v", err)
	}
	if slug1 != base {
		t.Errorf("the first clinic got the slug %q, want %q", slug1, base)
	}

	_, slug2, _, err := repo.CreateOrgWithOwner(ctx, params("homonima-2@test.local"))
	if err != nil {
		t.Fatalf("second signup with the same name: %v — a clinic whose name is "+
			"already taken cannot register at all", err)
	}
	if slug2 == slug1 {
		t.Fatalf("both clinics got the slug %q", slug1)
	}
	if slug2 != base+"-2" {
		t.Errorf("the second clinic got the slug %q, want %q", slug2, base+"-2")
	}

	// A third proves the loop keeps walking rather than only surviving one retry.
	_, slug3, _, err := repo.CreateOrgWithOwner(ctx, params("homonima-3@test.local"))
	if err != nil {
		t.Fatalf("third signup with the same name: %v", err)
	}
	if slug3 != base+"-3" {
		t.Errorf("the third clinic got the slug %q, want %q", slug3, base+"-3")
	}
}

// A slug collision must not be confused with the case that really is a refusal:
// the same person signing up twice. That one has a specific error the handler
// turns into 409 with a message the user can act on, and it must survive the
// savepoint handling around it.
func TestSignupStillRejectsADuplicateEmail(t *testing.T) {
	skipIfShort(t)
	initPepperOnce(t)
	ctx := context.Background()
	repo := authrepo.New(appPool)

	p := auth.CreateOrgParams{
		OrgName:      "Consultorio Único",
		BaseSlug:     "consultorio-unico",
		Email:        "duplicada@test.local",
		PasswordHash: "$2a$04$notarealhashbutlongenoughxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		DisplayName:  "Titular",
		TrialDays:    14,
		TermsVersion: "v1",
	}

	if _, _, _, err := repo.CreateOrgWithOwner(ctx, p); err != nil {
		t.Fatalf("first signup: %v", err)
	}

	// A different clinic name, so the slug is free and the email is the only
	// thing standing in the way.
	p.OrgName = "Otro Consultorio"
	p.BaseSlug = "otro-consultorio"
	_, _, _, err := repo.CreateOrgWithOwner(ctx, p)
	if !errors.Is(err, auth.ErrEmailAlreadyExists) {
		t.Fatalf("second signup with the same email returned %v, want ErrEmailAlreadyExists — "+
			"the user gets an opaque 500 instead of being told the account exists", err)
	}
}
