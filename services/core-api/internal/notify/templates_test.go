package notify

import (
	"strings"
	"testing"
)

func sampleBranding() Branding {
	return Branding{
		PublicName:  "Marcela",
		DisplayName: "Marcela Chapués · Psicóloga Clínica",
		ReplyTo:     "hola@marcelachapues.com",
		Website:     "https://marcelachapues.com",
		Location:    "Bogotá, Colombia",
		BrandColor:  "#5e8265",
	}
}

// TestPatientTemplatesRenderWithBranding ensures the tenant-branded templates
// parse, execute, and actually stamp the resolved branding (name + accent)
// instead of a hardcoded clinic.
func TestPatientTemplatesRenderWithBranding(t *testing.T) {
	brand := sampleBranding()
	booking := BookingDetails{FirstName: "Ana", Modality: "Virtual", StaffNote: "Nos vemos pronto"}
	consent := ConsentLinkDetails{PatientFirstName: "Ana", ConsentTitle: "Tratamiento", Link: "https://app/sign/x"}

	cases := map[string]func() (string, error){
		"received":  func() (string, error) { return renderReceived(brand, booking) },
		"confirmed": func() (string, error) { return renderConfirmed(brand, booking) },
		"rejected":  func() (string, error) { return renderRejected(brand, booking) },
		"consent":   func() (string, error) { return renderConsentSignLink(brand, consent) },
	}
	for name, render := range cases {
		html, err := render()
		if err != nil {
			t.Fatalf("%s: render error: %v", name, err)
		}
		if !strings.Contains(html, brand.DisplayName) {
			t.Errorf("%s: missing tenant display name", name)
		}
		if !strings.Contains(html, brand.BrandColor) {
			t.Errorf("%s: missing tenant brand color (CSS context dropped it)", name)
		}
	}
}

// TestAccountEmailsRender checks the product-branded account emails parse,
// execute, and embed the one-time link.
func TestAccountEmailsRender(t *testing.T) {
	reset, err := renderPasswordReset(PasswordResetDetails{Name: "Marcela", Link: "https://app/reset-password?token=abc"})
	if err != nil {
		t.Fatalf("password-reset render error: %v", err)
	}
	if !strings.Contains(reset, "https://app/reset-password?token=abc") {
		t.Error("password-reset: missing link")
	}

	verify, err := renderVerification(VerificationDetails{Name: "Marcela", Link: "https://app/verify-email?token=xyz"})
	if err != nil {
		t.Fatalf("verification render error: %v", err)
	}
	if !strings.Contains(verify, "https://app/verify-email?token=xyz") {
		t.Error("verification: missing link")
	}
	if !strings.Contains(verify, "Marcela") {
		t.Error("verification: missing greeting name")
	}
}

// TestRejectedOmitsEmptyContact verifies optional contact lines disappear when
// a tenant hasn't configured reply-to / website (e.g. a fresh signup).
func TestRejectedOmitsEmptyContact(t *testing.T) {
	brand := Branding{PublicName: "Clínica", DisplayName: "Clínica", BrandColor: DefaultBrandColor}
	html, err := renderRejected(brand, BookingDetails{FirstName: "Ana"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "mailto:") || strings.Contains(html, "nuestro sitio") {
		t.Error("expected no contact links when reply-to/website are empty")
	}
}
