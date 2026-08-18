package handler

import (
	"context"
	"flag"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/billing/mercadopago"
	"sghcp/core-api/internal/testinfra"
)

var billingPool *pgxpool.Pool

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}
	db, err := testinfra.Start(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "billing handler suite: %v\n", err)
		os.Exit(1)
	}
	billingPool = db.Admin
	code := m.Run()
	db.Close()
	os.Exit(code)
}

func skipIfShort(t *testing.T) {
	t.Helper()
	if testing.Short() {
		t.Skip("needs Docker")
	}
}

func seedOrg(t *testing.T, planID string) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := billingPool.QueryRow(ctx, `
		INSERT INTO organizations (name, slug, plan, subscription_status, provider_customer_id)
		VALUES ($1, $2, 'STARTER', 'trialing', $2)
		RETURNING id`, "Consultorio "+planID, planID).Scan(&id)
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return id
}

func statusOf(t *testing.T, orgID string) string {
	t.Helper()
	var status string
	if err := billingPool.QueryRow(context.Background(),
		`SELECT subscription_status FROM organizations WHERE id = $1`, orgID).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	return status
}

// Found in production on 2026-08-18. A tenant paid, MercadoPago held the
// subscription as "authorized", and the organization stayed in "trialing".
//
// A preapproval created from a preapproval_plan does not inherit the plan's
// external_reference — the live API returns it as null. applyPreapproval used
// it as the primary key of the row to update, so the UPDATE matched nothing,
// and both of its return values were discarded, so nothing said so. reconcile
// then read the status back, found "trialing", and answered 200.
//
// What does link the two is the plan id: it is what the org row already stores
// in provider_customer_id, from the moment checkout was created.
func TestAPreapprovalWithNoExternalReferenceStillActivatesItsOrg(t *testing.T) {
	skipIfShort(t)
	orgID := seedOrg(t, "plan-no-extref")
	h := &Handler{pool: billingPool}

	h.applyPreapproval(context.Background(), orgID, &mercadopago.Preapproval{
		ID:                "pre-1",
		Status:            "authorized",
		ExternalReference: "", // what MercadoPago actually sends
		PreapprovalPlanID: "plan-no-extref",
		NextPaymentDate:   "2026-09-18T16:58:26.000-04:00",
	})

	if got := statusOf(t, orgID); got != "active" {
		t.Fatalf("the tenant paid and is still %q", got)
	}
}

// The org is resolved from the plan id the checkout wrote, which is the only
// link that survives when external_reference does not.
func TestTheOrgIsFoundByThePlanTheCheckoutWrote(t *testing.T) {
	skipIfShort(t)
	orgID := seedOrg(t, "plan-lookup")
	h := &Handler{pool: billingPool}

	got, err := h.orgForPreapproval(context.Background(), &mercadopago.Preapproval{
		PreapprovalPlanID: "plan-lookup",
	})
	if err != nil {
		t.Fatalf("could not resolve the org: %v", err)
	}
	if got != orgID {
		t.Fatalf("resolved %q, want %q", got, orgID)
	}
}

// A subscription that belongs to nobody must be loud, not silent. The silence
// is what let this run for months.
func TestAPreapprovalThatMatchesNoOrgIsAnError(t *testing.T) {
	skipIfShort(t)
	h := &Handler{pool: billingPool}

	if _, err := h.orgForPreapproval(context.Background(), &mercadopago.Preapproval{
		PreapprovalPlanID: "plan-that-belongs-to-nobody",
	}); err == nil {
		t.Fatal("an unknown subscription resolved to some organization")
	}
}
