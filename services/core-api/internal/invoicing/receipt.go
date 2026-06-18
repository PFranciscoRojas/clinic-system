package invoicing

import (
	"io"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// OrgLetterhead is the clinic identification printed at the top of the receipt.
type OrgLetterhead struct {
	Name    string
	NIT     string
	Address string
	Phone   string
	Email   string
}

// ReceiptData is everything the payment receipt needs (money already decrypted
// and formatted upstream as decimal strings).
type ReceiptData struct {
	Org         OrgLetterhead
	PatientName string
	PatientDoc  string
	Invoice     Invoice
	GeneratedAt time.Time
}

const (
	rcptLeft  = 18.0
	rcptRight = 192.0
)

var statusLabelsES = map[string]string{
	"DRAFT": "Borrador", "ISSUED": "Emitida", "PARTIAL": "Pago parcial",
	"PAID": "Pagada", "INSURED": "Por seguro", "CANCELLED": "Anulada",
}

var methodLabelsES = map[string]string{
	"CASH": "Efectivo", "DEBIT_CARD": "Tarjeta débito", "CREDIT_CARD": "Tarjeta crédito",
	"BANK_TRANSFER": "Transferencia", "NEQUI": "Nequi", "DAVIPLATA": "Daviplata",
	"PSE": "PSE", "INSURANCE_EPS": "EPS", "INSURANCE_PRIVATE": "Seguro privado", "OTHER": "Otro",
}

// formatMoney renders a decimal string ("80000.00") grouped, dropping a trailing
// ",00", mirroring the frontend formatter.
func formatMoney(amount, currency string) string {
	if amount == "" {
		amount = "0"
	}
	neg := strings.HasPrefix(amount, "-")
	amount = strings.TrimPrefix(amount, "-")
	intPart, frac, _ := strings.Cut(amount, ".")
	frac = strings.TrimRight(frac, "0")

	var b strings.Builder
	for i, n := 0, len(intPart); i < n; i++ {
		if i > 0 && (n-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteByte(intPart[i])
	}
	grouped := b.String()
	out := grouped
	if frac != "" {
		out += "," + frac
	}
	sym := ""
	if currency == "COP" {
		sym = "$"
	}
	res := sym + out + " " + currency
	if neg {
		res = "-" + res
	}
	return res
}

// RenderReceipt writes a one-page payment receipt PDF for an invoice.
func RenderReceipt(w io.Writer, d ReceiptData) error {
	doc := fpdf.New("P", "mm", "A4", "")
	doc.SetMargins(rcptLeft, 16, 210-rcptRight)
	doc.SetAutoPageBreak(true, 24)
	tr := doc.UnicodeTranslatorFromDescriptor("")
	cur := d.Invoice.Currency

	doc.SetFooterFunc(func() {
		doc.SetY(-18)
		doc.SetFont("Helvetica", "I", 7.5)
		doc.SetTextColor(120, 120, 120)
		doc.MultiCell(rcptRight-rcptLeft, 3.4, tr(
			"Este documento es un comprobante interno de pago y no constituye factura electrónica conforme a la normativa DIAN. "+
				"Generado el "+d.GeneratedAt.Format("2006-01-02 15:04")), "", "C", false)
	})

	doc.AddPage()

	// ── Letterhead ──
	doc.SetTextColor(15, 23, 42)
	doc.SetFont("Helvetica", "B", 15)
	doc.CellFormat(0, 8, tr(orDash(d.Org.Name)), "", 1, "L", false, 0, "")
	doc.SetFont("Helvetica", "", 9)
	doc.SetTextColor(100, 116, 139)
	var contact []string
	if d.Org.NIT != "" {
		contact = append(contact, "NIT "+d.Org.NIT)
	}
	for _, v := range []string{d.Org.Address, d.Org.Phone, d.Org.Email} {
		if strings.TrimSpace(v) != "" {
			contact = append(contact, v)
		}
	}
	if len(contact) > 0 {
		doc.CellFormat(0, 5, tr(strings.Join(contact, "  ·  ")), "", 1, "L", false, 0, "")
	}

	doc.Ln(4)
	doc.SetDrawColor(16, 185, 129)
	doc.SetLineWidth(0.6)
	y := doc.GetY()
	doc.Line(rcptLeft, y, rcptRight, y)
	doc.Ln(6)

	// ── Title + meta ──
	doc.SetTextColor(15, 23, 42)
	doc.SetFont("Helvetica", "B", 13)
	doc.CellFormat(0, 7, tr("Comprobante de pago"), "", 1, "L", false, 0, "")
	doc.SetFont("Helvetica", "", 9)
	doc.SetTextColor(100, 116, 139)
	doc.CellFormat(0, 5, tr("N.º "+shortID(d.Invoice.ID)+"   ·   Estado: "+statusES(d.Invoice.Status)), "", 1, "L", false, 0, "")
	doc.CellFormat(0, 5, tr("Fecha de emisión: "+fmtDateOr(d.Invoice.IssuedAt, d.Invoice.CreatedAt)), "", 1, "L", false, 0, "")
	doc.Ln(3)

	// ── Patient ──
	doc.SetTextColor(15, 23, 42)
	doc.SetFont("Helvetica", "B", 10)
	doc.CellFormat(0, 6, tr("Paciente"), "", 1, "L", false, 0, "")
	doc.SetFont("Helvetica", "", 10)
	doc.SetTextColor(51, 65, 85)
	name := orDash(d.PatientName)
	if d.PatientDoc != "" {
		name += "   ·   Doc. " + d.PatientDoc
	}
	doc.CellFormat(0, 5.5, tr(name), "", 1, "L", false, 0, "")
	doc.Ln(4)

	// ── Amount breakdown ──
	row := func(label, value string, bold bool) {
		style := ""
		if bold {
			style = "B"
		}
		doc.SetFont("Helvetica", style, 10)
		doc.SetTextColor(51, 65, 85)
		doc.CellFormat(110, 6.5, tr(label), "", 0, "L", false, 0, "")
		doc.CellFormat(rcptRight-rcptLeft-110, 6.5, tr(value), "", 1, "R", false, 0, "")
	}
	doc.SetFillColor(241, 245, 249)
	doc.SetTextColor(71, 85, 105)
	doc.SetFont("Helvetica", "B", 8.5)
	doc.CellFormat(0, 6, tr("DETALLE"), "", 1, "L", false, 0, "")
	row("Subtotal", formatMoney(d.Invoice.Subtotal, cur), false)
	if !isZeroAmount(d.Invoice.Discount) {
		row("Descuento", "- "+formatMoney(d.Invoice.Discount, cur), false)
	}
	if !isZeroAmount(d.Invoice.InsuranceCovered) {
		row("Cubierto por seguro", "- "+formatMoney(d.Invoice.InsuranceCovered, cur), false)
	}
	y = doc.GetY()
	doc.SetDrawColor(203, 213, 225)
	doc.SetLineWidth(0.2)
	doc.Line(rcptLeft, y, rcptRight, y)
	doc.Ln(1)
	row("Total", formatMoney(d.Invoice.TotalDue, cur), true)
	row("Pagado", formatMoney(d.Invoice.TotalPaid, cur), false)
	row("Saldo pendiente", formatMoney(balance(d.Invoice), cur), true)
	doc.Ln(5)

	// ── Payments ──
	if len(d.Invoice.Payments) > 0 {
		doc.SetFont("Helvetica", "B", 8.5)
		doc.SetTextColor(71, 85, 105)
		doc.CellFormat(0, 6, tr("PAGOS REGISTRADOS"), "", 1, "L", false, 0, "")
		doc.SetFont("Helvetica", "B", 9)
		doc.SetFillColor(248, 250, 252)
		doc.CellFormat(34, 6.5, tr("Fecha"), "1", 0, "L", true, 0, "")
		doc.CellFormat(42, 6.5, tr("Medio"), "1", 0, "L", true, 0, "")
		doc.CellFormat(58, 6.5, tr("Referencia"), "1", 0, "L", true, 0, "")
		doc.CellFormat(rcptRight-rcptLeft-134, 6.5, tr("Monto"), "1", 1, "R", true, 0, "")
		doc.SetFont("Helvetica", "", 9)
		doc.SetTextColor(51, 65, 85)
		for _, p := range d.Invoice.Payments {
			doc.CellFormat(34, 6, tr(p.PaidAt.Format("2006-01-02")), "1", 0, "L", false, 0, "")
			doc.CellFormat(42, 6, tr(methodES(p.PaymentMethod)), "1", 0, "L", false, 0, "")
			doc.CellFormat(58, 6, tr(orDash(p.Reference)), "1", 0, "L", false, 0, "")
			doc.CellFormat(rcptRight-rcptLeft-134, 6, tr(formatMoney(p.Amount, p.Currency)), "1", 1, "R", false, 0, "")
		}
	}

	return doc.Output(w)
}

func statusES(s string) string {
	if v, ok := statusLabelsES[s]; ok {
		return v
	}
	return s
}
func methodES(s string) string {
	if v, ok := methodLabelsES[s]; ok {
		return v
	}
	return s
}
func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}
func shortID(id string) string {
	if len(id) >= 8 {
		return strings.ToUpper(id[:8])
	}
	return strings.ToUpper(id)
}
func fmtDateOr(primary *time.Time, fallback time.Time) string {
	if primary != nil {
		return primary.Format("2006-01-02")
	}
	return fallback.Format("2006-01-02")
}

// balance returns total_due − total_paid as a decimal string (cents-based, no float).
func balance(inv Invoice) string {
	due := cents(inv.TotalDue)
	paid := cents(inv.TotalPaid)
	v := due - paid
	neg := v < 0
	if neg {
		v = -v
	}
	s := ""
	if neg {
		s = "-"
	}
	return s + itoaCents(v)
}

// itoaCents formats integer cents back to a "N.cc" decimal string.
func itoaCents(c int64) string {
	whole := c / 100
	frac := c % 100
	d := [2]byte{byte('0' + frac/10), byte('0' + frac%10)}
	return itoa(whole) + "." + string(d[:])
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
