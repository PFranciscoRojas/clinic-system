package booking

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The public booking page collects name, email and phone, and booking with a
// psychologist is itself health data (dato sensible, Ley 1581 art. 5). The
// patient has to authorise that processing before anything is stored, and the
// burden of proving the authorisation sits with whoever holds the data (art. 9).
//
// Until this test, the checkout only required the refund-policy checkbox: the
// data-processing consent that booking_requests recorded (migration 000007)
// went away with that table in 000036 and nothing replaced it. These cases pin
// the validation that must reject a checkout before it reaches the database.

func postCheckout(t *testing.T, body string) (code int, proceeded bool) {
	t.Helper()
	h := &Handler{} // no pool, no resolver: validation must fail before either is touched
	req := httptest.NewRequest(http.MethodPost, "/checkout", strings.NewReader(body))
	rec := httptest.NewRecorder()
	defer func() {
		// Reaching the resolver with a nil Handler panics. That means the
		// request got past validation, which is the failure being tested.
		if recover() != nil {
			code, proceeded = 0, true
		}
	}()
	h.checkout(rec, req)
	return rec.Code, false
}

func TestCheckoutRejectsMissingDataConsent(t *testing.T) {
	code, proceeded := postCheckout(t, `{
		"org_slug":"x","date":"2099-01-01","time":"10:00",
		"name":"Ana","email":"ana@example.com","phone":"+57 3000000000",
		"policy_accepted":true
	}`)
	if proceeded {
		t.Fatal("checkout went past validation without data-processing consent")
	}
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

func TestCheckoutRejectsExplicitlyDeniedDataConsent(t *testing.T) {
	code, proceeded := postCheckout(t, `{
		"org_slug":"x","date":"2099-01-01","time":"10:00",
		"name":"Ana","email":"ana@example.com","phone":"+57 3000000000",
		"policy_accepted":true,"data_consent_accepted":false
	}`)
	if proceeded {
		t.Fatal("checkout went past validation with data-processing consent denied")
	}
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

// Consent to data processing does not stand in for the refund policy: both
// are separate acceptances and both are required.
func TestCheckoutStillRequiresRefundPolicy(t *testing.T) {
	code, proceeded := postCheckout(t, `{
		"org_slug":"x","date":"2099-01-01","time":"10:00",
		"name":"Ana","email":"ana@example.com","phone":"+57 3000000000",
		"data_consent_accepted":true
	}`)
	if proceeded {
		t.Fatal("checkout went past validation without the refund policy")
	}
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}
