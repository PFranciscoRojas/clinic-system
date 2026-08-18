package mercadopago

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Found in production on 2026-08-18. A tenant paid — MercadoPago had the
// subscription "authorized" with $2.000 charged — and the organization stayed
// in "trialing" because our side never learned about it.
//
// The webhook could not arrive (the preapproval's notification_url was null),
// and the only thing that patches that url is reconcile(), which first has to
// find the preapproval. That search sent "sort=date_created&criteria=desc",
// which is the /v1/payments/search convention. /preapproval/search answers it
// with 400 "Invalid sorting value format." — verified against the live API the
// same day, where "sort=date_created:desc" answers 200.
//
// So the search had never once succeeded, and with it neither had activation
// nor the webhook wiring. Nobody had ever been recorded as charged.
func TestThePreapprovalSearchSortsTheWayMercadoPagoAccepts(t *testing.T) {
	var query string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"results":[{"id":"pre-1","status":"authorized"}]}`))
	}))
	defer srv.Close()

	c := newAt("token", srv.URL)
	if _, err := c.FindPreapprovalByPlan(context.Background(), "plan-1"); err != nil {
		t.Fatalf("search failed: %v", err)
	}

	if !strings.Contains(query, "sort=date_created%3Adesc") && !strings.Contains(query, "sort=date_created:desc") {
		t.Errorf("sort is not field:direction, so MercadoPago answers 400: %q", query)
	}
	// criteria is what made it a 400. Sending it alongside a valid sort would
	// be harmless today and is still the shape of the bug.
	if strings.Contains(query, "criteria=") {
		t.Errorf("criteria= belongs to /v1/payments/search, not here: %q", query)
	}
	if !strings.Contains(query, "preapproval_plan_id=plan-1") {
		t.Errorf("the plan id did not travel: %q", query)
	}
}

// The 400 above was reported as "preapproval not found", which reads as "this
// tenant never paid" and sent the investigation the wrong way for weeks. A
// refusal by MercadoPago and an empty result are different facts.
func TestARefusalIsNotReportedAsAnEmptyResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"Invalid sorting value format.","status":400}`))
	}))
	defer srv.Close()

	_, err := newAt("token", srv.URL).FindPreapprovalByPlan(context.Background(), "plan-1")
	if err == nil {
		t.Fatal("a 400 was not reported as an error")
	}
	if strings.Contains(err.Error(), "no preapproval found") {
		t.Errorf("a refusal is being reported as an absence: %v", err)
	}
}
