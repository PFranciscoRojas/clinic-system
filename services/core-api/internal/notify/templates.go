package notify

import (
	"bytes"
	"html/template"
)

var (
	tmplReceived      = template.Must(template.New("received").Parse(tmplReceivedSrc))
	tmplReceivedAdmin = template.Must(template.New("received-admin").Parse(tmplReceivedAdminSrc))
	tmplPaidAdmin     = template.Must(template.New("paid-admin").Parse(tmplPaidAdminSrc))
	tmplReminder      = template.Must(template.New("reminder").Parse(tmplReminderSrc))
	tmplConfirmed     = template.Must(template.New("confirmed").Parse(tmplConfirmedSrc))
	tmplRejected      = template.Must(template.New("rejected").Parse(tmplRejectedSrc))
	tmplConsentLink   = template.Must(template.New("consent-link").Parse(tmplConsentLinkSrc))
	tmplPasswordReset = template.Must(template.New("password-reset").Parse(tmplPasswordResetSrc))
	tmplVerification  = template.Must(template.New("verification").Parse(tmplVerificationSrc))
	tmplSignupAlert   = template.Must(template.New("signup-alert").Parse(tmplSignupAlertSrc))
	tmplTenantWelcome = template.Must(template.New("tenant-welcome").Parse(tmplTenantWelcomeSrc))
	tmplTrialNudge    = template.Must(template.New("trial-nudge").Parse(tmplTrialNudgeSrc))
	tmplTrialEnding   = template.Must(template.New("trial-ending").Parse(tmplTrialEndingSrc))
)

// bookingView and consentView pair tenant branding with the email payload so
// patient-facing templates render under the right clinic's identity.
type bookingView struct {
	Brand Branding
	D     BookingDetails
}

type consentView struct {
	Brand Branding
	D     ConsentLinkDetails
}

// reminderView adds the human "in 24 hours / in 2 hours" lead time to the
// booking payload for the appointment-reminder template.
type reminderView struct {
	Brand Branding
	D     BookingDetails
	When  string // e.g. "mañana" / "en 2 horas"
}

func renderReminder(brand Branding, b BookingDetails, hoursBefore int) (string, error) {
	when := "pronto"
	switch hoursBefore {
	case 24:
		when = "mañana"
	case 2:
		when = "en 2 horas"
	}
	return execTemplate(tmplReminder, reminderView{Brand: brand, D: b, When: when})
}

func renderReceived(brand Branding, b BookingDetails) (string, error) {
	return execTemplate(tmplReceived, bookingView{Brand: brand, D: b})
}

func renderReceivedAdmin(b BookingDetails) (string, error) {
	return execTemplate(tmplReceivedAdmin, b)
}

func renderPaidAdmin(b BookingDetails) (string, error) {
	return execTemplate(tmplPaidAdmin, b)
}

func renderConfirmed(brand Branding, b BookingDetails) (string, error) {
	return execTemplate(tmplConfirmed, bookingView{Brand: brand, D: b})
}

func renderRejected(brand Branding, b BookingDetails) (string, error) {
	return execTemplate(tmplRejected, bookingView{Brand: brand, D: b})
}

func renderConsentSignLink(brand Branding, d ConsentLinkDetails) (string, error) {
	return execTemplate(tmplConsentLink, consentView{Brand: brand, D: d})
}

func renderPasswordReset(d PasswordResetDetails) (string, error) {
	return execTemplate(tmplPasswordReset, d)
}

func renderVerification(d VerificationDetails) (string, error) {
	return execTemplate(tmplVerification, d)
}

func renderTenantSignupAlert(d TenantSignupDetails) (string, error) {
	return execTemplate(tmplSignupAlert, d)
}

func renderTenantWelcome(d TenantWelcomeDetails) (string, error) {
	return execTemplate(tmplTenantWelcome, d)
}

func renderTrialNudge(d TrialLifecycleDetails) (string, error) {
	return execTemplate(tmplTrialNudge, d)
}

func renderTrialEnding(d TrialLifecycleDetails) (string, error) {
	return execTemplate(tmplTrialEnding, d)
}

func execTemplate(t *template.Template, data any) (string, error) {
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// ── Patient-facing templates (tenant-branded) ─────────────────────────────────

const tmplReceivedSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:{{.Brand.BrandColor}};padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{.Brand.DisplayName}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Recibimos tu solicitud de cita</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.D.FirstName}}</strong>, gracias por ponerte en contacto.<br>
            Recibimos tu solicitud y la estamos revisando. Te escribiremos a la brevedad para confirmar disponibilidad.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Tu solicitud</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Modalidad:</strong> {{.D.Modality}}</p>
              {{if .D.PreferredDate}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Fecha preferida:</strong> {{.D.PreferredDate}}</p>{{end}}
              {{if .D.PreferredTime}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Hora preferida:</strong> {{.D.PreferredTime}}</p>{{end}}
              {{if .D.Notes}}<p style="margin:0;font-size:14px;color:#333;"><strong>Notas:</strong> {{.D.Notes}}</p>{{end}}
            </td></tr>
          </table>
          {{if .Brand.ReplyTo}}<p style="margin:0;font-size:14px;color:#777;line-height:1.6;">
            ¿Tienes alguna pregunta? Escríbenos a
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>
          </p>{{end}}
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            {{.Brand.DisplayName}}{{if .Brand.Location}} · {{.Brand.Location}}{{end}}{{if .Brand.ReplyTo}}<br>
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplConfirmedSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:{{.Brand.BrandColor}};padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{.Brand.DisplayName}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">¡Tu cita fue confirmada!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.D.FirstName}}</strong>, tu solicitud de cita ha sido confirmada.<br>
            Pronto recibirás los detalles de horario y lugar por este mismo medio o por WhatsApp.
          </p>
          {{if .D.StaffNote}}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5f1;border-left:3px solid {{.Brand.BrandColor}};border-radius:0 8px 8px 0;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;color:{{.Brand.BrandColor}};text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Mensaje de {{.Brand.PublicName}}</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">{{.D.StaffNote}}</p>
            </td></tr>
          </table>
          {{end}}
          {{if .Brand.ReplyTo}}<p style="margin:0;font-size:14px;color:#777;line-height:1.6;">
            ¿Tienes preguntas? Escríbenos a
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>
          </p>{{end}}
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            {{.Brand.DisplayName}}{{if .Brand.Location}} · {{.Brand.Location}}{{end}}{{if .Brand.ReplyTo}}<br>
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplRejectedSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:{{.Brand.BrandColor}};padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{.Brand.DisplayName}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Sobre tu solicitud de cita</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.D.FirstName}}</strong>, gracias por tu interés.<br>
            Lamentablemente no podemos atenderte en el horario solicitado en este momento.
          </p>
          {{if .D.StaffNote}}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-left:3px solid #aaa;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Mensaje de {{.Brand.PublicName}}</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">{{.D.StaffNote}}</p>
            </td></tr>
          </table>
          {{end}}
          <p style="margin:0 0 8px;font-size:15px;color:#555;line-height:1.7;">
            Si quieres intentarlo para otra fecha, puedes volver a enviar una solicitud{{if .Brand.Website}} desde
            <a href="{{.Brand.Website}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">nuestro sitio</a>{{end}}{{if .Brand.ReplyTo}}
            o escribirnos directamente a
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            {{.Brand.DisplayName}}{{if .Brand.Location}} · {{.Brand.Location}}{{end}}{{if .Brand.ReplyTo}}<br>
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplConsentLinkSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:{{.Brand.BrandColor}};padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{.Brand.DisplayName}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Documento para tu lectura y firma</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.D.PatientFirstName}}</strong>,<br>
            {{.Brand.PublicName}} te compartió el documento <strong>{{.D.ConsentTitle}}</strong> para que lo leas y lo firmes en línea.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:{{.Brand.BrandColor}};">
              <a href="{{.D.Link}}" style="display:inline-block;padding:13px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Leer y firmar</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
            El enlace es personal, de un solo uso y vence en 7 días.<br>
            Si no esperabas este correo, puedes ignorarlo.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            {{.Brand.DisplayName}}{{if .Brand.Location}} · {{.Brand.Location}}{{end}}{{if .Brand.ReplyTo}}<br>
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplReminderSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:{{.Brand.BrandColor}};padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{.Brand.DisplayName}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Recordatorio de tu cita</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.D.FirstName}}</strong>, te recordamos que tienes una cita <strong>{{.When}}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              {{if .D.PreferredDate}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Fecha:</strong> {{.D.PreferredDate}}</p>{{end}}
              {{if .D.PreferredTime}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Hora:</strong> {{.D.PreferredTime}}</p>{{end}}
              <p style="margin:0;font-size:14px;color:#333;"><strong>Modalidad:</strong> {{.D.Modality}}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;line-height:1.6;">
            Si no puedes asistir, por favor avísanos con tiempo{{if .Brand.ReplyTo}} a
            <a href="mailto:{{.Brand.ReplyTo}}" style="color:{{.Brand.BrandColor}};text-decoration:none;">{{.Brand.ReplyTo}}</a>{{end}}.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            {{.Brand.DisplayName}}{{if .Brand.Location}} · {{.Brand.Location}}{{end}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

// ── Product-branded templates (account / system — not tenant-branded) ─────────

const tmplReceivedAdminSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Nueva solicitud de cita</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;font-weight:600;">{{.FirstName}} {{.LastName}}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#888;">Solicitud recibida · pendiente de confirmación</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Datos del paciente</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Email:</strong> <a href="mailto:{{.PatientEmail}}" style="color:#363285;text-decoration:none;">{{.PatientEmail}}</a></p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Modalidad:</strong> {{.Modality}}</p>
              {{if .PreferredDate}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Fecha preferida:</strong> {{.PreferredDate}}</p>{{end}}
              {{if .PreferredTime}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Hora preferida:</strong> {{.PreferredTime}}</p>{{end}}
              {{if .Notes}}<p style="margin:0;font-size:14px;color:#333;"><strong>Notas:</strong> {{.Notes}}</p>{{end}}
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;">
            Ingresa al sistema para confirmar o rechazar la solicitud.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;">Chapni · Historia clínica cifrada</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplPaidAdminSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Cita pagada y confirmada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;font-weight:600;">{{.FirstName}} {{.LastName}}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#363285;font-weight:600;">Pago confirmado · ya está en tu agenda</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Datos del paciente</p>
              {{if .PatientEmail}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Email:</strong> <a href="mailto:{{.PatientEmail}}" style="color:#363285;text-decoration:none;">{{.PatientEmail}}</a></p>{{end}}
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Modalidad:</strong> {{.Modality}}</p>
              {{if .PreferredDate}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Fecha:</strong> {{.PreferredDate}}</p>{{end}}
              {{if .PreferredTime}}<p style="margin:0;font-size:14px;color:#333;"><strong>Hora:</strong> {{.PreferredTime}}</p>{{end}}
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;">
            El paciente ya pagó la sesión; la cita quedó agendada automáticamente. No necesitas confirmarla.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;">Chapni · Historia clínica cifrada</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplPasswordResetSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Chapni · Historia clínica cifrada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Restablece tu contraseña</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#d9a038;">
              <a href="{{.Link}}" style="display:inline-block;padding:13px 28px;color:#3a2a06;font-size:15px;font-weight:600;text-decoration:none;">Crear nueva contraseña</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
            El enlace es personal, de un solo uso y vence en 1 hora.<br>
            Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue siendo válida.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Este es un mensaje automático del sistema de gestión clínica. No respondas a este correo.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplSignupAlertSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">{{if .Verified}}Correo verificado — lead activo{{else}}Nuevo registro en Chapni{{end}}</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;font-weight:600;">{{.OrgName}}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#888;">{{if .Verified}}El propietario confirmó su correo y ya puede ingresar.{{else}}Cuenta creada · verificación de correo pendiente.{{end}}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Datos del lead</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Nombre:</strong> {{.AdminName}}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Email:</strong> <a href="mailto:{{.Email}}" style="color:#363285;text-decoration:none;">{{.Email}}</a></p>
              {{if .Phone}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>WhatsApp:</strong> <a href="https://wa.me/{{.Phone}}" style="color:#363285;text-decoration:none;">{{.Phone}}</a></p>{{end}}
              {{if .Source}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Cómo nos conoció:</strong> {{.Source}}</p>{{end}}
              <p style="margin:0;font-size:14px;color:#333;"><strong>Slug:</strong> {{.Slug}}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;">
            {{if .Verified}}Buen momento para escribirle y ofrecerle un tour del sistema.{{else}}Recibirás otro aviso cuando confirme su correo.{{end}}
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;">Chapni · Alerta interna de registro</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplTenantWelcomeSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Chapni · Historia clínica cifrada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">¡Tu consultorio está listo!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            tu cuenta quedó activa y tienes 14 días para probar Chapni con calma: agenda, historias clínicas cifradas, consentimientos y cobros.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#d9a038;">
              <a href="{{.LoginURL}}" style="display:inline-block;padding:13px 28px;color:#3a2a06;font-size:15px;font-weight:600;text-decoration:none;">Entrar a mi consultorio</a>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Soy Francisco, el creador de Chapni. Si quieres, te acompaño personalmente en tus primeros pasos
            {{if .SupportWhatsApp}} — escríbeme por <a href="https://wa.me/{{.SupportWhatsApp}}?text=Hola%20Francisco%2C%20acabo%20de%20crear%20mi%20cuenta%20en%20Chapni" style="color:#363285;font-weight:600;text-decoration:none;">WhatsApp</a> y agendamos un tour de 15 minutos{{else}} — responde a este correo y agendamos un tour de 15 minutos{{end}}. Sin compromiso: la idea es que en tu prueba veas el sistema funcionando con tu forma de trabajar.
          </p>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
            Tus datos clínicos se cifran con una llave por paciente y cumplimos la Ley 1581 de 2012.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Chapni · Historia clínica cifrada
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplVerificationSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Chapni · Historia clínica cifrada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Confirma tu correo</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            ¡bienvenida! Creaste tu cuenta en Chapni. Confirma esta dirección para activarla y empezar a usar el sistema.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#d9a038;">
              <a href="{{.Link}}" style="display:inline-block;padding:13px 28px;color:#3a2a06;font-size:15px;font-weight:600;text-decoration:none;">Confirmar mi correo</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
            El enlace es personal, de un solo uso y vence en 24 horas.<br>
            Si no creaste esta cuenta, ignora este correo.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Este es un mensaje automático del sistema de gestión clínica. No respondas a este correo.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplTrialNudgeSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Chapni · Historia clínica cifrada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">¿Cómo vas con tu consultorio?</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            ya llevas unos días con Chapni y quería saber cómo te ha ido. Si aún no creas tu primer paciente, ese es el mejor punto de partida: toma menos de un minuto. Desde ahí puedes agendar la primera cita y escribir tu primera nota clínica, incluso dictándola por audio.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#d9a038;">
              <a href="{{.LoginURL}}" style="display:inline-block;padding:13px 28px;color:#3a2a06;font-size:15px;font-weight:600;text-decoration:none;">Entrar a mi consultorio</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
            {{if .SupportWhatsApp}}Si algo no te cuadra o tienes preguntas, escríbeme por <a href="https://wa.me/{{.SupportWhatsApp}}?text=Hola%20Francisco%2C%20estoy%20probando%20Chapni%20y%20tengo%20una%20pregunta" style="color:#363285;font-weight:600;text-decoration:none;">WhatsApp</a>. Respondo yo, no un bot.{{else}}Si algo no te cuadra o tienes preguntas, responde a este correo.{{end}}
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">Chapni · Historia clínica cifrada</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplTrialEndingSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#363285;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Chapni · Historia clínica cifrada</p>
        </td></tr>
        <tr><td style="padding:36px;">
          {{if gt .DaysLeft 0}}
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Tu prueba termina {{if eq .DaysLeft 1}}mañana{{else}}en {{.DaysLeft}} días{{end}}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            tu periodo de prueba está por terminar. Para seguir usando tu agenda, tus historias clínicas y los cobros sin interrupción, activa tu plan desde la sección de facturación. El pago es en línea y toma un par de minutos.
          </p>
          {{else}}
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Tu prueba terminó, tus datos siguen ahí</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.Name}}</strong>,<br>
            tu periodo de prueba terminó y la cuenta quedó en pausa. Nada se borró: tus pacientes, citas e historias clínicas siguen cifrados y esperándote. Activa tu plan cuando quieras y retomas exactamente donde ibas.
          </p>
          {{end}}
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#d9a038;">
              <a href="{{.BillingURL}}" style="display:inline-block;padding:13px 28px;color:#3a2a06;font-size:15px;font-weight:600;text-decoration:none;">Activar mi plan</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
            {{if .SupportWhatsApp}}¿Dudas sobre el plan o el pago? Escríbeme por <a href="https://wa.me/{{.SupportWhatsApp}}?text=Hola%20Francisco%2C%20tengo%20una%20pregunta%20sobre%20mi%20plan%20de%20Chapni" style="color:#363285;font-weight:600;text-decoration:none;">WhatsApp</a> y lo resolvemos.{{else}}¿Dudas sobre el plan o el pago? Responde a este correo y lo resolvemos.{{end}}
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">Chapni · Historia clínica cifrada</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
