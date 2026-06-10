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
	apiKey string
	from   string
}

func NewResend(apiKey, from string) *ResendNotifier {
	return &ResendNotifier{apiKey: apiKey, from: from}
}

func (n *ResendNotifier) NewBooking(ctx context.Context, b BookingDetails, adminEmails []string) {
	if html, err := renderReceived(b); err == nil {
		if err := n.send(ctx, b.PatientEmail, "Recibimos tu solicitud de cita · Marcela Chapués", html); err != nil {
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
	html, err := renderConfirmed(b)
	if err != nil {
		return
	}
	if err := n.send(ctx, b.PatientEmail, "¡Tu cita fue confirmada! · Marcela Chapués", html); err != nil {
		slog.Default().Warn("notify: booking-confirmed email failed", "err", err)
	}
}

func (n *ResendNotifier) BookingRejected(ctx context.Context, b BookingDetails) {
	html, err := renderRejected(b)
	if err != nil {
		return
	}
	if err := n.send(ctx, b.PatientEmail, "Sobre tu solicitud de cita · Marcela Chapués", html); err != nil {
		slog.Default().Warn("notify: booking-rejected email failed", "err", err)
	}
}

func (n *ResendNotifier) ConsentSignLink(ctx context.Context, toEmail string, d ConsentLinkDetails) {
	html, err := renderConsentSignLink(d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "Documento de consentimiento para tu firma · Marcela Chapués", html); err != nil {
		slog.Default().Warn("notify: consent sign-link email failed", "err", err)
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
