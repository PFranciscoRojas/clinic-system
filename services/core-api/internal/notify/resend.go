package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
)

// ResendNotifier sends transactional emails via the Resend HTTP API.
type ResendNotifier struct {
	apiKey  string
	from    string
	resolve BrandingResolver // per-tenant branding for patient-facing emails
}

// NewResend builds the notifier. resolve may be nil for callers that only send
// product-branded account emails (e.g. password reset); patient-facing emails
// then fall back to DefaultBranding.
func NewResend(apiKey, from string, resolve BrandingResolver) *ResendNotifier {
	return &ResendNotifier{apiKey: apiKey, from: from, resolve: resolve}
}

// brandFor resolves the tenant's branding, falling back to a neutral default.
func (n *ResendNotifier) brandFor(ctx context.Context, orgID string) Branding {
	if n.resolve == nil || orgID == "" {
		return DefaultBranding()
	}
	return n.resolve(ctx, orgID)
}

func (n *ResendNotifier) NewBooking(ctx context.Context, b BookingDetails, adminEmails []string) {
	brand := n.brandFor(ctx, b.OrgID)
	if html, err := renderReceived(brand, b); err == nil {
		subj := "Recibimos tu solicitud de cita · " + brand.PublicName
		if err := n.send(ctx, b.PatientEmail, subj, html); err != nil {
			slog.Default().Warn("notify: booking-received to patient failed", "err", err)
		}
	}
	if len(adminEmails) > 0 {
		if html, err := renderReceivedAdmin(b); err == nil {
			subj := fmt.Sprintf("Nueva solicitud: %s %s", b.FirstName, b.LastName)
			for _, adminEmail := range adminEmails {
				if err := n.send(ctx, adminEmail, subj, html); err != nil {
					slog.Default().Warn("notify: booking-received to admin failed", "to", adminEmail, "err", err)
				}
			}
		}
	}
}

func (n *ResendNotifier) BookingConfirmed(ctx context.Context, b BookingDetails) {
	brand := n.brandFor(ctx, b.OrgID)
	html, err := renderConfirmed(brand, b)
	if err != nil {
		return
	}
	if err := n.send(ctx, b.PatientEmail, "¡Tu cita fue confirmada! · "+brand.PublicName, html); err != nil {
		slog.Default().Warn("notify: booking-confirmed email failed", "err", err)
	}
}

func (n *ResendNotifier) BookingRejected(ctx context.Context, b BookingDetails) {
	brand := n.brandFor(ctx, b.OrgID)
	html, err := renderRejected(brand, b)
	if err != nil {
		return
	}
	if err := n.send(ctx, b.PatientEmail, "Sobre tu solicitud de cita · "+brand.PublicName, html); err != nil {
		slog.Default().Warn("notify: booking-rejected email failed", "err", err)
	}
}

func (n *ResendNotifier) ConsentSignLink(ctx context.Context, toEmail string, d ConsentLinkDetails) {
	brand := n.brandFor(ctx, d.OrgID)
	html, err := renderConsentSignLink(brand, d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "Documento de consentimiento para tu firma · "+brand.PublicName, html); err != nil {
		slog.Default().Warn("notify: consent sign-link email failed", "err", err)
	}
}

func (n *ResendNotifier) PasswordReset(ctx context.Context, toEmail string, d PasswordResetDetails) {
	html, err := renderPasswordReset(d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "Restablece tu contraseña · SGHCP", html); err != nil {
		slog.Default().Warn("notify: password-reset email failed", "err", err)
	}
}

func (n *ResendNotifier) send(ctx context.Context, to, subject, htmlBody string) error {
	payload, err := json.Marshal(map[string]any{
		"from":    n.from,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+n.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e struct {
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&e) //nolint:errcheck
		return fmt.Errorf("resend %d: %s", resp.StatusCode, e.Message)
	}
	return nil
}
