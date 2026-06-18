package invoicing

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// colombia is Colombia's fixed civil offset. The country has never observed DST,
// so a fixed -05:00 is always correct — and avoids depending on tzdata being
// present in the binary's image.
var colombia = time.FixedZone("COT", -5*3600)

// MonthBucket is one month of income split by channel (decimal strings).
type MonthBucket struct {
	Month  string `json:"month"` // YYYY-MM
	Online string `json:"online"`
	Direct string `json:"direct"`
}

// MethodStat is collected income broken down by how it was paid.
type MethodStat struct {
	Label   string `json:"label"`
	Channel string `json:"channel"` // "online" | "direct"
	Count   int    `json:"count"`
	Amount  string `json:"amount"`
}

// BillingOverview is the clinic-wide financial picture for a selected period.
// Income figures are scoped to the period; the cartera (pending/overdue) and the
// collected ratio are point-in-time; the 12-month series is always the last 12.
type BillingOverview struct {
	Currency string `json:"currency"`
	Period   string `json:"period"` // week | month | year | all

	Income        string `json:"income"`        // collected in period (online + direct)
	IncomeOnline  string `json:"income_online"` // MercadoPago, in period
	IncomeDirect  string `json:"income_direct"` // manual payments, in period
	IncomePrev    string `json:"income_prev"`   // same-elapsed previous period
	HasDelta      bool   `json:"has_delta"`
	PaymentsCount int    `json:"payments_count"`

	// Point-in-time cartera.
	Pending      string `json:"pending"`
	Overdue      string `json:"overdue"`
	OverdueCount int    `json:"overdue_count"`
	Invoiced     string `json:"invoiced"`      // all-time, non-cancelled
	Collected    string `json:"collected"`     // all-time invoice payments
	CollectedPct int    `json:"collected_pct"` // collected / invoiced

	Methods []MethodStat  `json:"methods"` // in period
	Monthly []MonthBucket `json:"monthly"` // last 12 months
}

// periodRange resolves a period name into its [from, to) bounds and the matching
// same-elapsed previous window (for deltas). "all" has no delta and spans
// everything.
func periodRange(period string, now time.Time) (from, to, prevFrom, prevTo time.Time, hasDelta bool) {
	now = now.In(colombia)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, colombia)
	switch period {
	case "week":
		mo := (int(now.Weekday()) + 6) % 7 // Monday = 0
		from = day.AddDate(0, 0, -mo)
		to = now
		prevFrom = from.AddDate(0, 0, -7)
		prevTo = prevFrom.Add(now.Sub(from))
		hasDelta = true
	case "year":
		from = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, colombia)
		to = now
		prevFrom = from.AddDate(-1, 0, 0)
		prevTo = prevFrom.Add(now.Sub(from))
		hasDelta = true
	case "all":
		from = time.Time{}
		to = now.AddDate(100, 0, 0)
	default: // month
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, colombia)
		to = now
		prevFrom = from.AddDate(0, -1, 0)
		prevTo = prevFrom.Add(now.Sub(from))
		hasDelta = true
	}
	return
}

// Overview composes the financial overview for the given period.
func (s *Service) Overview(ctx context.Context, orgID, period string) (BillingOverview, error) {
	switch period {
	case "week", "month", "year", "all":
	default:
		period = "month"
	}
	from, to, pFrom, pTo, hasDelta := periodRange(period, time.Now())

	online, direct, count, err := s.repo.IncomeByChannelBetween(ctx, orgID, from, to)
	if err != nil {
		return BillingOverview{}, err
	}
	ov := BillingOverview{
		Currency: "COP", Period: period,
		Income: addMoney(online, direct), IncomeOnline: online, IncomeDirect: direct,
		PaymentsCount: count, HasDelta: hasDelta,
	}
	if cur, err := s.repo.CurrencyHint(ctx, orgID); err == nil && cur != "" {
		ov.Currency = cur
	}
	if hasDelta {
		if ov.IncomePrev, err = s.repo.IncomeBetween(ctx, orgID, pFrom, pTo); err != nil {
			return BillingOverview{}, err
		}
	}

	cart, err := s.repo.Cartera(ctx, orgID)
	if err != nil {
		return BillingOverview{}, err
	}
	ov.Pending, ov.Overdue, ov.OverdueCount = cart.Pending, cart.Overdue, cart.OverdueCount
	ov.Invoiced, ov.Collected = cart.Invoiced, cart.Collected
	if iv := cents(cart.Invoiced); iv > 0 {
		pct := cents(cart.Collected) * 100 / iv
		if pct > 100 {
			pct = 100
		}
		ov.CollectedPct = int(pct)
	}

	if ov.Methods, err = s.methodBreakdown(ctx, orgID, from, to); err != nil {
		return BillingOverview{}, err
	}

	since := time.Date(time.Now().In(colombia).Year(), time.Now().In(colombia).Month(), 1, 0, 0, 0, 0, colombia).AddDate(0, -11, 0)
	rows, err := s.repo.MonthlyIncome(ctx, orgID, since)
	if err != nil {
		return BillingOverview{}, err
	}
	ov.Monthly = fillMonths(since, rows)
	return ov, nil
}

func (s *Service) methodBreakdown(ctx context.Context, orgID string, from, to time.Time) ([]MethodStat, error) {
	online, err := s.repo.OnlineMethods(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}
	direct, err := s.repo.DirectMethods(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}
	out := make([]MethodStat, 0, len(online)+len(direct))
	for _, m := range online {
		out = append(out, MethodStat{Label: mpMethodLabel(m.Type, m.Method), Channel: "online", Count: m.Count, Amount: m.Amount})
	}
	for _, m := range direct {
		out = append(out, MethodStat{Label: methodES(m.Method), Channel: "direct", Count: m.Count, Amount: m.Amount})
	}
	sort.SliceStable(out, func(i, j int) bool { return cents(out[i].Amount) > cents(out[j].Amount) })
	return out, nil
}

func mpMethodLabel(ptype, pmethod string) string {
	switch ptype {
	case "credit_card":
		return "Tarjeta de crédito"
	case "debit_card":
		return "Tarjeta débito"
	case "account_money":
		return "Dinero en MercadoPago"
	case "prepaid_card":
		return "Tarjeta prepago"
	case "atm":
		return "Cajero / corresponsal"
	case "bank_transfer":
		if pmethod == "pse" {
			return "PSE"
		}
		return "Transferencia bancaria"
	case "ticket":
		switch pmethod {
		case "efecty":
			return "Efecty"
		case "baloto":
			return "Baloto"
		default:
			return "Efectivo en punto"
		}
	case "":
		return "Online (sin detalle)"
	default:
		return ptype
	}
}

func fillMonths(since time.Time, rows map[string]MonthBucket) []MonthBucket {
	out := make([]MonthBucket, 0, 12)
	m := time.Date(since.Year(), since.Month(), 1, 0, 0, 0, 0, colombia)
	for i := 0; i < 12; i++ {
		key := m.Format("2006-01")
		b := MonthBucket{Month: key, Online: "0", Direct: "0"}
		if got, ok := rows[key]; ok {
			if got.Online != "" {
				b.Online = got.Online
			}
			if got.Direct != "" {
				b.Direct = got.Direct
			}
		}
		out = append(out, b)
		m = m.AddDate(0, 1, 0)
	}
	return out
}

func addMoney(a, b string) string {
	v := cents(a) + cents(b)
	neg := v < 0
	if neg {
		v = -v
	}
	s := itoaCents(v)
	if neg {
		s = "-" + s
	}
	return s
}

// PatientBalance is one patient's billing relationship in the selected window.
type PatientBalance struct {
	PatientID string `json:"patient_id"`
	Name      string `json:"name"`
	Sessions  int    `json:"sessions"`
	Invoiced  string `json:"invoiced"`
	Collected string `json:"collected"`
	Pending   string `json:"pending"`
	PaidPct   int    `json:"paid_pct"`
}

// PatientsBalance aggregates, per patient, the sessions and billing totals in
// [from, to) (nil bounds = all-time). Names are resolved by the caller. Sorted
// by outstanding balance, then invoiced, descending.
func (s *Service) PatientsBalance(ctx context.Context, orgID string, from, to *time.Time) ([]PatientBalance, error) {
	aggs, err := s.repo.PatientsInvoiceAgg(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}
	sessions, err := s.repo.PatientsSessionCount(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}

	byID := map[string]*PatientBalance{}
	order := []string{}
	get := func(id string) *PatientBalance {
		if b, ok := byID[id]; ok {
			return b
		}
		b := &PatientBalance{PatientID: id, Invoiced: "0", Collected: "0", Pending: "0"}
		byID[id] = b
		order = append(order, id)
		return b
	}
	for _, a := range aggs {
		b := get(a.PatientID)
		b.Invoiced, b.Collected = a.Invoiced, a.Collected
		b.Pending = itoaCents(maxZero(cents(a.Invoiced) - cents(a.Collected)))
		if iv := cents(a.Invoiced); iv > 0 {
			pct := cents(a.Collected) * 100 / iv
			if pct > 100 {
				pct = 100
			}
			b.PaidPct = int(pct)
		}
	}
	for id, n := range sessions {
		get(id).Sessions = n
	}

	out := make([]PatientBalance, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}
	sort.SliceStable(out, func(i, j int) bool {
		if pi, pj := cents(out[i].Pending), cents(out[j].Pending); pi != pj {
			return pi > pj
		}
		return cents(out[i].Invoiced) > cents(out[j].Invoiced)
	})
	return out, nil
}

func maxZero(v int64) int64 {
	if v < 0 {
		return 0
	}
	return v
}

// ── repository ──────────────────────────────────────────────────────────────

type patientAgg struct {
	PatientID string
	Invoiced  string
	Collected string
}

// PatientsInvoiceAgg sums invoiced/collected per patient over non-cancelled
// invoices issued in [from, to) (nil bounds disable the window).
func (r *Repository) PatientsInvoiceAgg(ctx context.Context, orgID string, from, to *time.Time) ([]patientAgg, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT patient_id::text, SUM(total_due)::text, SUM(total_paid)::text
		FROM invoices
		WHERE organization_id = $1 AND status <> 'CANCELLED'
		  AND ($2::timestamptz IS NULL OR COALESCE(issued_at, created_at) >= $2)
		  AND ($3::timestamptz IS NULL OR COALESCE(issued_at, created_at) <  $3)
		GROUP BY patient_id
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("patients invoice agg: %w", err)
	}
	defer rows.Close()
	out := []patientAgg{}
	for rows.Next() {
		var a patientAgg
		if err := rows.Scan(&a.PatientID, &a.Invoiced, &a.Collected); err != nil {
			return nil, fmt.Errorf("scan patient agg: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// PatientsSessionCount counts non-cancelled sessions per patient in [from, to).
func (r *Repository) PatientsSessionCount(ctx context.Context, orgID string, from, to *time.Time) (map[string]int, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT patient_id::text, COUNT(*)
		FROM appointments
		WHERE organization_id = $1 AND patient_id IS NOT NULL
		  AND status IN ('SCHEDULED','CONFIRMED','COMPLETED')
		  AND ($2::timestamptz IS NULL OR scheduled_at >= $2)
		  AND ($3::timestamptz IS NULL OR scheduled_at <  $3)
		GROUP BY patient_id
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("patients session count: %w", err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("scan session count: %w", err)
		}
		out[id] = n
	}
	return out, rows.Err()
}

// CurrencyHint returns the currency of the most recent invoice (single-currency
// assumption), defaulting to COP.
func (r *Repository) CurrencyHint(ctx context.Context, orgID string) (string, error) {
	var c string
	err := r.q(ctx).QueryRow(ctx,
		`SELECT COALESCE((SELECT currency FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1), 'COP')`,
		orgID).Scan(&c)
	return c, err
}

// IncomeByChannelBetween returns online (paid bookings) and direct (recorded
// payments) income in [from, to), plus the total number of payment events.
func (r *Repository) IncomeByChannelBetween(ctx context.Context, orgID string, from, to time.Time) (online, direct string, count int, err error) {
	err = r.q(ctx).QueryRow(ctx, `
		SELECT
			(SELECT COALESCE(SUM(amount), 0)::numeric::text FROM bookings WHERE organization_id = $1 AND status = 'PAID' AND updated_at >= $2 AND updated_at < $3),
			(SELECT COALESCE(SUM(amount), 0)::text          FROM payments WHERE organization_id = $1 AND paid_at    >= $2 AND paid_at    < $3),
			(SELECT COUNT(*) FROM bookings WHERE organization_id = $1 AND status = 'PAID' AND updated_at >= $2 AND updated_at < $3)
			+ (SELECT COUNT(*) FROM payments WHERE organization_id = $1 AND paid_at >= $2 AND paid_at < $3)
	`, orgID, from, to).Scan(&online, &direct, &count)
	if err != nil {
		return "", "", 0, fmt.Errorf("income by channel: %w", err)
	}
	return online, direct, count, nil
}

// IncomeBetween sums collected income from both channels in [from, to).
func (r *Repository) IncomeBetween(ctx context.Context, orgID string, from, to time.Time) (string, error) {
	var v string
	err := r.q(ctx).QueryRow(ctx, `
		SELECT (
			(SELECT COALESCE(SUM(amount), 0)::numeric FROM payments WHERE organization_id = $1 AND paid_at    >= $2 AND paid_at    < $3) +
			(SELECT COALESCE(SUM(amount), 0)::numeric FROM bookings WHERE organization_id = $1 AND status = 'PAID' AND updated_at >= $2 AND updated_at < $3)
		)::text
	`, orgID, from, to).Scan(&v)
	if err != nil {
		return "", fmt.Errorf("income between: %w", err)
	}
	return v, nil
}

type carteraRow struct {
	Pending      string
	Overdue      string
	OverdueCount int
	Invoiced     string
	Collected    string
}

// Cartera returns the current outstanding balance, the overdue slice of it, and
// the all-time invoiced/collected totals (non-cancelled).
func (r *Repository) Cartera(ctx context.Context, orgID string) (carteraRow, error) {
	var c carteraRow
	err := r.q(ctx).QueryRow(ctx, `
		SELECT
			COALESCE(SUM(total_due - total_paid) FILTER (WHERE status IN ('ISSUED','PARTIAL')), 0)::text,
			COALESCE(SUM(total_due - total_paid) FILTER (WHERE status IN ('ISSUED','PARTIAL') AND due_at IS NOT NULL AND due_at < NOW()), 0)::text,
			COUNT(*) FILTER (WHERE status IN ('ISSUED','PARTIAL') AND due_at IS NOT NULL AND due_at < NOW()),
			COALESCE(SUM(total_due)  FILTER (WHERE status <> 'CANCELLED'), 0)::text,
			COALESCE(SUM(total_paid) FILTER (WHERE status <> 'CANCELLED'), 0)::text
		FROM invoices WHERE organization_id = $1
	`, orgID).Scan(&c.Pending, &c.Overdue, &c.OverdueCount, &c.Invoiced, &c.Collected)
	if err != nil {
		return carteraRow{}, fmt.Errorf("cartera: %w", err)
	}
	return c, nil
}

type rawOnlineMethod struct {
	Type   string
	Method string
	Count  int
	Amount string
}

type rawDirectMethod struct {
	Method string
	Count  int
	Amount string
}

func (r *Repository) OnlineMethods(ctx context.Context, orgID string, from, to time.Time) ([]rawOnlineMethod, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT COALESCE(mp_payment_type, ''), COALESCE(mp_payment_method, ''), COUNT(*), SUM(amount)::numeric::text
		FROM bookings WHERE organization_id = $1 AND status = 'PAID' AND updated_at >= $2 AND updated_at < $3
		GROUP BY 1, 2
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("online methods: %w", err)
	}
	defer rows.Close()
	out := []rawOnlineMethod{}
	for rows.Next() {
		var m rawOnlineMethod
		if err := rows.Scan(&m.Type, &m.Method, &m.Count, &m.Amount); err != nil {
			return nil, fmt.Errorf("scan online method: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *Repository) DirectMethods(ctx context.Context, orgID string, from, to time.Time) ([]rawDirectMethod, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT payment_method, COUNT(*), SUM(amount)::text
		FROM payments WHERE organization_id = $1 AND paid_at >= $2 AND paid_at < $3
		GROUP BY 1
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("direct methods: %w", err)
	}
	defer rows.Close()
	out := []rawDirectMethod{}
	for rows.Next() {
		var m rawDirectMethod
		if err := rows.Scan(&m.Method, &m.Count, &m.Amount); err != nil {
			return nil, fmt.Errorf("scan direct method: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MonthlyIncome buckets income by calendar month (Colombia time) and channel,
// from `since` onward, keyed by YYYY-MM.
func (r *Repository) MonthlyIncome(ctx context.Context, orgID string, since time.Time) (map[string]MonthBucket, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT to_char(date_trunc('month', ts AT TIME ZONE 'America/Bogota'), 'YYYY-MM') AS m, src, SUM(amt)::text
		FROM (
			SELECT paid_at    AS ts, amount::numeric AS amt, 'd' AS src FROM payments WHERE organization_id = $1 AND paid_at    >= $2
			UNION ALL
			SELECT updated_at AS ts, amount::numeric AS amt, 'o' AS src FROM bookings WHERE organization_id = $1 AND status = 'PAID' AND updated_at >= $2
		) x
		GROUP BY 1, 2
	`, orgID, since)
	if err != nil {
		return nil, fmt.Errorf("monthly income: %w", err)
	}
	defer rows.Close()
	out := map[string]MonthBucket{}
	for rows.Next() {
		var month, src, amount string
		if err := rows.Scan(&month, &src, &amount); err != nil {
			return nil, fmt.Errorf("scan monthly income: %w", err)
		}
		b := out[month]
		b.Month = month
		if src == "o" {
			b.Online = amount
		} else {
			b.Direct = amount
		}
		out[month] = b
	}
	return out, rows.Err()
}
