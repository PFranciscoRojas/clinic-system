package notify

import (
	"bytes"
	"context"
	"encoding/base64"
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

// BookingPaidAdmin tells the clinic's admins that a public booking was paid and
// auto-confirmed. Distinct from NewBooking, which announces an unpaid request
// awaiting manual confirmation.
func (n *ResendNotifier) BookingPaidAdmin(ctx context.Context, b BookingDetails, adminEmails []string) {
	if len(adminEmails) == 0 {
		return
	}
	html, err := renderPaidAdmin(b)
	if err != nil {
		return
	}
	subj := fmt.Sprintf("Cita pagada: %s %s", b.FirstName, b.LastName)
	for _, adminEmail := range adminEmails {
		if err := n.send(ctx, adminEmail, subj, html); err != nil {
			slog.Default().Warn("notify: booking-paid to admin failed", "to", adminEmail, "err", err)
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

// BookingDeferredAdmin tells the clinic's admins that a slot has been held for a
// deferred (cash/voucher) payment awaiting collection by the patient.
func (n *ResendNotifier) BookingDeferredAdmin(ctx context.Context, d BookingVoucherDetails, adminEmails []string) {
	if len(adminEmails) == 0 {
		return
	}
	greeting := d.GuestName
	if greeting == "" {
		greeting = "Paciente sin nombre"
	}
	deadline := ""
	if d.Deadline != "" {
		deadline = fmt.Sprintf(` Límite de pago: <strong>%s</strong>.`, d.Deadline)
	}
	html := fmt.Sprintf(
		`<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">`+
			`<h2 style="margin:0 0 12px;font-size:18px">Reserva apartada — pago pendiente</h2>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px"><strong>%s</strong> apartó un horario mediante comprobante de pago diferido.</p>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px">Cita: <strong>%s</strong> · %s.%s</p>`+
			`<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:8px 0 0">El sistema confirmará la cita automáticamente al acreditarse el pago. Si el paciente no paga a tiempo, el horario se liberará solo.</p>`+
			`</div>`,
		greeting, d.AppointmentAt, d.Modality, deadline)

	subj := fmt.Sprintf("Reserva apartada (pago pendiente): %s", greeting)
	for _, adminEmail := range adminEmails {
		if err := n.send(ctx, adminEmail, subj, html); err != nil {
			slog.Default().Warn("notify: booking-deferred-admin email failed", "to", adminEmail, "err", err)
		}
	}
}

// BookingConflictAdmin alerts the clinic's admins that a deferred payment was
// credited but the slot is no longer available — manual resolution required.
func (n *ResendNotifier) BookingConflictAdmin(ctx context.Context, d BookingVoucherDetails, adminEmails []string) {
	if len(adminEmails) == 0 {
		return
	}
	greeting := d.GuestName
	if greeting == "" {
		greeting = "Paciente sin nombre"
	}
	html := fmt.Sprintf(
		`<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">`+
			`<h2 style="margin:0 0 12px;font-size:18px;color:#dc2626">⚠️ Pago acreditado — horario ya ocupado</h2>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px">El pago diferido de <strong>%s</strong> se acreditó, pero el horario <strong>%s</strong> (%s) ya está ocupado por otra cita.</p>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px"><strong>La cita NO fue creada.</strong> Es necesario contactar al paciente para reagendar o gestionar el reembolso manualmente.</p>`+
			`<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:8px 0 0">Correo del paciente: %s</p>`+
			`</div>`,
		greeting, d.AppointmentAt, d.Modality, d.PatientEmail)

	subj := fmt.Sprintf("⚠️ Conflicto de horario — requiere acción: %s", greeting)
	for _, adminEmail := range adminEmails {
		if err := n.send(ctx, adminEmail, subj, html); err != nil {
			slog.Default().Warn("notify: booking-conflict-admin email failed", "to", adminEmail, "err", err)
		}
	}
}

// BookingVoucher tells the patient their slot is held pending a cash/voucher
// payment (Efecty etc.) and gives them the deadline and link to pay.
func (n *ResendNotifier) BookingVoucher(ctx context.Context, d BookingVoucherDetails) {
	brand := n.brandFor(ctx, d.OrgID)
	greeting := "Hola"
	if d.GuestName != "" {
		greeting = "Hola " + d.GuestName
	}
	voucherBtn := ""
	if d.VoucherURL != "" {
		voucherBtn = fmt.Sprintf(
			`<p style="margin:18px 0 0"><a href="%s" style="display:inline-block;padding:11px 22px;background:%s;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Ver / pagar mi comprobante</a></p>`,
			d.VoucherURL, brand.BrandColor)
	}
	deadline := ""
	if d.Deadline != "" {
		deadline = fmt.Sprintf(` antes del <strong>%s</strong>`, d.Deadline)
	}
	html := fmt.Sprintf(
		`<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">`+
			`<p style="font-size:11px;color:%s;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin:0 0 6px">%s</p>`+
			`<h2 style="margin:0 0 12px;font-size:20px">Tu horario está apartado</h2>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px">%s, reservamos tu cita para el <strong>%s</strong> (%s).</p>`+
			`<p style="font-size:14px;line-height:1.6;margin:0 0 8px">Para confirmarla, paga tu comprobante%s. En cuanto se acredite el pago recibirás la confirmación de tu cita.</p>`+
			`<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 4px">Si no realizas el pago a tiempo, el horario se liberará automáticamente.</p>`+
			`%s`+
			`<p style="font-size:13px;color:#6b7280;margin:22px 0 0">%s</p></div>`,
		brand.BrandColor, brand.PublicName,
		greeting, d.AppointmentAt, d.Modality,
		deadline, voucherBtn, brand.PublicName)

	subj := "Tu horario está apartado — paga tu comprobante · " + brand.PublicName
	if err := n.send(ctx, d.PatientEmail, subj, html); err != nil {
		slog.Default().Warn("notify: booking-voucher email failed", "err", err)
	}
}

// AppointmentReminder nudges the patient ahead of their appointment (24h/2h).
func (n *ResendNotifier) AppointmentReminder(ctx context.Context, b BookingDetails, hoursBefore int) {
	brand := n.brandFor(ctx, b.OrgID)
	html, err := renderReminder(brand, b, hoursBefore)
	if err != nil {
		return
	}
	if err := n.send(ctx, b.PatientEmail, "Recordatorio de tu cita · "+brand.PublicName, html); err != nil {
		slog.Default().Warn("notify: appointment-reminder email failed", "err", err)
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
	if err := n.send(ctx, toEmail, "Restablece tu contraseña · Chapni", html); err != nil {
		slog.Default().Warn("notify: password-reset email failed", "err", err)
	}
}

func (n *ResendNotifier) AccountVerification(ctx context.Context, toEmail string, d VerificationDetails) {
	html, err := renderVerification(d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "Confirma tu correo · Chapni", html); err != nil {
		slog.Default().Warn("notify: account-verification email failed", "err", err)
	}
}

// TenantSignupAlert tells the platform operator that a tenant signed up (or
// confirmed their email), with the lead-tracking data from the signup form.
func (n *ResendNotifier) TenantSignupAlert(ctx context.Context, toEmail string, d TenantSignupDetails) {
	html, err := renderTenantSignupAlert(d)
	if err != nil {
		return
	}
	subj := fmt.Sprintf("Nuevo registro: %s (%s)", d.OrgName, d.Email)
	if d.Verified {
		subj = fmt.Sprintf("Correo verificado ✔ %s (%s)", d.OrgName, d.Email)
	}
	if err := n.send(ctx, toEmail, subj, html); err != nil {
		slog.Default().Warn("notify: tenant-signup alert failed", "err", err)
	}
}

// TenantWelcome greets the new tenant's owner once their email is confirmed.
func (n *ResendNotifier) TenantWelcome(ctx context.Context, toEmail string, d TenantWelcomeDetails) {
	html, err := renderTenantWelcome(d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "Tu consultorio está listo · Chapni", html); err != nil {
		slog.Default().Warn("notify: tenant-welcome email failed", "err", err)
	}
}

// TrialNudge checks in a few days into the trial (activation prompt).
func (n *ResendNotifier) TrialNudge(ctx context.Context, toEmail string, d TrialLifecycleDetails) {
	html, err := renderTrialNudge(d)
	if err != nil {
		return
	}
	if err := n.send(ctx, toEmail, "¿Cómo vas con Chapni?", html); err != nil {
		slog.Default().Warn("notify: trial-nudge email failed", "err", err)
	}
}

// TrialEnding warns the owner the trial is about to end or has just ended.
func (n *ResendNotifier) TrialEnding(ctx context.Context, toEmail string, d TrialLifecycleDetails) {
	html, err := renderTrialEnding(d)
	if err != nil {
		return
	}
	subj := fmt.Sprintf("Tu prueba de Chapni termina en %d días", d.DaysLeft)
	switch {
	case d.DaysLeft == 1:
		subj = "Tu prueba de Chapni termina mañana"
	case d.DaysLeft <= 0:
		subj = "Tu prueba de Chapni terminó · tus datos siguen seguros"
	}
	if err := n.send(ctx, toEmail, subj, html); err != nil {
		slog.Default().Warn("notify: trial-ending email failed", "err", err)
	}
}

// InvoiceReceipt emails the patient their payment receipt with the PDF attached.
func (n *ResendNotifier) InvoiceReceipt(ctx context.Context, to string, d InvoiceEmailDetails, pdf []byte) error {
	brand := n.brandFor(ctx, d.OrgID)
	greeting := "Hola"
	if d.PatientName != "" {
		greeting = "Hola " + d.PatientName
	}
	html := fmt.Sprintf(`<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">`+
		`<p style="font-size:11px;color:%s;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin:0 0 6px">%s</p>`+
		`<h2 style="margin:0 0 12px;font-size:18px">Comprobante de pago %s</h2>`+
		`<p style="font-size:14px;line-height:1.6;margin:0 0 12px">%s, adjuntamos el comprobante de tu pago por <strong>%s</strong> (estado: %s).</p>`+
		`<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 16px">El detalle está en el PDF adjunto. Este documento es un comprobante interno de pago y no constituye factura electrónica DIAN.</p>`+
		`<p style="font-size:13px;color:#6b7280;margin:16px 0 0">%s</p></div>`,
		brand.BrandColor, brand.PublicName, d.InvoiceNumber, greeting, d.Amount, d.StatusLabel, brand.PublicName)

	filename := "comprobante.pdf"
	if d.InvoiceNumber != "" {
		filename = "comprobante-" + d.InvoiceNumber + ".pdf"
	}
	subject := "Tu comprobante de pago " + d.InvoiceNumber + " · " + brand.PublicName
	return n.sendWith(ctx, to, subject, html, []map[string]any{{
		"filename": filename,
		"content":  base64.StdEncoding.EncodeToString(pdf),
	}})
}

// PaymentReminder nudges a patient about a pending balance.
func (n *ResendNotifier) PaymentReminder(ctx context.Context, to string, d PaymentReminderDetails) error {
	brand := n.brandFor(ctx, d.OrgID)
	greeting := "Hola"
	if d.PatientName != "" {
		greeting = "Hola " + d.PatientName
	}
	due := ""
	if d.DueDate != "" {
		due = fmt.Sprintf(` (con vencimiento el %s)`, d.DueDate)
	}
	html := fmt.Sprintf(`<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">`+
		`<p style="font-size:11px;color:%s;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin:0 0 6px">%s</p>`+
		`<h2 style="margin:0 0 12px;font-size:18px">Recordatorio de pago</h2>`+
		`<p style="font-size:14px;line-height:1.6;margin:0 0 12px">%s, te recordamos que tienes un saldo pendiente de <strong>%s</strong> en la factura %s%s.</p>`+
		`<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 16px">Si ya realizaste el pago, por favor ignora este mensaje. Cualquier duda, escríbenos.</p>`+
		`<p style="font-size:13px;color:#6b7280;margin:16px 0 0">%s</p></div>`,
		brand.BrandColor, brand.PublicName, greeting, d.Balance, d.InvoiceNumber, due, brand.PublicName)
	return n.send(ctx, to, "Recordatorio de pago "+d.InvoiceNumber+" · "+brand.PublicName, html)
}

func (n *ResendNotifier) send(ctx context.Context, to, subject, htmlBody string) error {
	return n.sendWith(ctx, to, subject, htmlBody, nil)
}

func (n *ResendNotifier) sendWith(ctx context.Context, to, subject, htmlBody string, attachments []map[string]any) error {
	body := map[string]any{
		"from":    n.from,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	}
	if len(attachments) > 0 {
		body["attachments"] = attachments
	}
	payload, err := json.Marshal(body)
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
