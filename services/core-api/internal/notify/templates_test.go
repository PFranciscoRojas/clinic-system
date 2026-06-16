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
