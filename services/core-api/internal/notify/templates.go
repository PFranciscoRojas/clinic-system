package notify

import (
	"bytes"
	"html/template"
)

var (
	tmplReceived      = template.Must(template.New("received").Parse(tmplReceivedSrc))
	tmplReceivedAdmin = template.Must(template.New("received-admin").Parse(tmplReceivedAdminSrc))
	tmplConfirmed     = template.Must(template.New("confirmed").Parse(tmplConfirmedSrc))
	tmplRejected      = template.Must(template.New("rejected").Parse(tmplRejectedSrc))
	tmplConsentLink   = template.Must(template.New("consent-link").Parse(tmplConsentLinkSrc))
)

func renderReceived(b BookingDetails) (string, error) {
	var buf bytes.Buffer
	if err := tmplReceived.Execute(&buf, b); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderReceivedAdmin(b BookingDetails) (string, error) {
	var buf bytes.Buffer
	if err := tmplReceivedAdmin.Execute(&buf, b); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderConfirmed(b BookingDetails) (string, error) {
	var buf bytes.Buffer
	if err := tmplConfirmed.Execute(&buf, b); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderRejected(b BookingDetails) (string, error) {
	var buf bytes.Buffer
	if err := tmplRejected.Execute(&buf, b); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderConsentSignLink(d ConsentLinkDetails) (string, error) {
	var buf bytes.Buffer
	if err := tmplConsentLink.Execute(&buf, d); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// ── Email templates ───────────────────────────────────────────────────────────

const tmplReceivedSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#5e8265;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Marcela Chapués · Psicóloga Clínica</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Recibimos tu solicitud de cita</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.FirstName}}</strong>, gracias por ponerte en contacto.<br>
            Recibimos tu solicitud y la estoy revisando. Te escribiré a la brevedad para confirmar disponibilidad.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Tu solicitud</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Modalidad:</strong> {{.Modality}}</p>
              {{if .PreferredDate}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Fecha preferida:</strong> {{.PreferredDate}}</p>{{end}}
              {{if .PreferredTime}}<p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Hora preferida:</strong> {{.PreferredTime}}</p>{{end}}
              {{if .Notes}}<p style="margin:0;font-size:14px;color:#333;"><strong>Notas:</strong> {{.Notes}}</p>{{end}}
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#777;line-height:1.6;">
            ¿Tienes alguna pregunta? Escríbeme a
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Marcela Chapués · Psicóloga Clínica · Bogotá, Colombia<br>
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const tmplReceivedAdminSrc = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#5e8265;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Nueva solicitud de cita</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;font-weight:600;">{{.FirstName}} {{.LastName}}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#888;">Solicitud recibida · pendiente de confirmación</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Datos del paciente</p>
              <p style="margin:0 0 6px;font-size:14px;color:#333;"><strong>Email:</strong> <a href="mailto:{{.PatientEmail}}" style="color:#5e8265;text-decoration:none;">{{.PatientEmail}}</a></p>
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
          <p style="margin:0;font-size:12px;color:#aaa;">Sistema de Gestión Clínica · SGHCP</p>
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
        <tr><td style="background:#5e8265;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Marcela Chapués · Psicóloga Clínica</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">¡Tu cita fue confirmada!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.FirstName}}</strong>, tu solicitud de cita ha sido confirmada.<br>
            Pronto recibirás los detalles de horario y lugar por este mismo medio o por WhatsApp.
          </p>
          {{if .StaffNote}}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5f1;border-left:3px solid #5e8265;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;color:#5e8265;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Mensaje de Marcela</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">{{.StaffNote}}</p>
            </td></tr>
          </table>
          {{end}}
          <p style="margin:0;font-size:14px;color:#777;line-height:1.6;">
            ¿Tienes preguntas? Escríbeme a
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Marcela Chapués · Psicóloga Clínica · Bogotá, Colombia<br>
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
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
        <tr><td style="background:#5e8265;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Marcela Chapués · Psicóloga Clínica</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Documento para tu lectura y firma</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.PatientFirstName}}</strong>,<br>
            tu psicóloga te envió el documento <strong>{{.ConsentTitle}}</strong> para que lo leas y lo firmes en línea.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background:#5e8265;">
              <a href="{{.Link}}" style="display:inline-block;padding:13px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Leer y firmar</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
            El enlace es personal, de un solo uso y vence en 7 días.<br>
            Si no esperabas este correo, puedes ignorarlo.
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Marcela Chapués · Psicóloga Clínica · Bogotá, Colombia<br>
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
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
        <tr><td style="background:#5e8265;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:600;letter-spacing:.02em;">Marcela Chapués · Psicóloga Clínica</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;font-weight:600;">Sobre tu solicitud de cita</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
            Hola <strong>{{.FirstName}}</strong>, gracias por tu interés.<br>
            Lamentablemente no puedo atenderte en el horario solicitado en este momento.
          </p>
          {{if .StaffNote}}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;border-left:3px solid #aaa;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Mensaje de Marcela</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">{{.StaffNote}}</p>
            </td></tr>
          </table>
          {{end}}
          <p style="margin:0 0 8px;font-size:15px;color:#555;line-height:1.7;">
            Si quieres intentarlo para otra fecha, puedes volver a enviar una solicitud desde
            <a href="https://marcelachapues.com" style="color:#5e8265;text-decoration:none;">marcelachapues.com</a>
            o escribirme directamente a
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 36px 24px;border-top:1px solid #ece9e3;">
          <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
            Marcela Chapués · Psicóloga Clínica · Bogotá, Colombia<br>
            <a href="mailto:hola@marcelachapues.com" style="color:#5e8265;text-decoration:none;">hola@marcelachapues.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
