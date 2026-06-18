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

// PeriodStat is income in a period and the same-elapsed slice of the previous
// one (for a fair "vs período anterior" delta).
type PeriodStat struct {
	Income string `json:"income"`
	Prev   string `json:"prev"`
}

// MonthBucket is one month of income split by channel (decimal strings).
type MonthBucket struct {
	Month  string `json:"month"` // YYYY-MM
	Online string `json:"online"`
	Direct string `json:"direct"`
}

// BillingOverview is the clinic-wide financial picture: collected income unified
// across both channels (MercadoPago bookings + manually recorded payments), the
// invoice-side cartera, per-status counts and a 12-month series.
type BillingOverview struct {
	Currency string `json:"currency"`

	IncomeTotal string `json:"income_total"` // online + direct, all-time collected
	OnlineTotal string `json:"online_total"` // MercadoPago bookings (PAID)
	DirectTotal string `json:"direct_total"` // manually recorded payments

	Invoiced string `json:"invoiced"` // manual invoices billed (non-cancelled)
	Pending  string `json:"pending"`  // manual outstanding (issued + partial)

	Count        int `json:"count"`
	Draft        int `json:"draft"`
	Issued       int `json:"issued"`
	Partial      int `json:"partial"`
	Paid         int `json:"paid"`
	Cancelled    int `json:"cancelled"`
	BookingsPaid int `json:"bookings_paid"`

	Week    PeriodStat    `json:"week"`
	Month   PeriodStat    `json:"month"`
	Year    PeriodStat    `json:"year"`
	Monthly []MonthBucket `json:"monthly"`
	Methods []MethodStat  `json:"methods"`
}

// MethodStat is collected income broken down by how it was paid.
type MethodStat struct {
	Label   string `json:"label"`
	Channel string `json:"channel"` // "online" | "direct"
	Count   int    `json:"count"`
	Amount  string `json:"amount"`
}

// Overview composes the unified financial overview for the org.
func (s *Service) Overview(ctx context.Context, orgID string) (BillingOverview, error) {
	base, err := s.repo.Summary(ctx, orgID)
	if err != nil {
		return BillingOverview{}, err
	}
	online, direct, bookingsPaid, err := s.repo.IncomeTotals(ctx, orgID)
	if err != nil {
		return BillingOverview{}, err
	}

	ov := BillingOverview{
		Currency:     base.Currency,
		OnlineTotal:  online,
		DirectTotal:  direct,
		IncomeTotal:  addMoney(online, direct),
		Invoiced:     base.Invoiced,
		Pending:      base.Pending,
		Count:        base.Count,
		Draft:        base.Draft,
		Issued:       base.Issued,
		Partial:      base.Partial,
		Paid:         base.Paid,
		Cancelled:    base.Cancelled,
		BookingsPaid: bookingsPaid,
	}

	now := time.Now().In(colombia)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, colombia)
	mondayOffset := (int(now.Weekday()) + 6) % 7 // Monday = 0
	startWeek := day.AddDate(0, 0, -mondayOffset)
	startMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, colombia)
	startYear := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, colombia)

	if ov.Week, err = s.periodStat(ctx, orgID, startWeek, startWeek.AddDate(0, 0, -7), now); err != nil {
		return BillingOverview{}, err
	}
	if ov.Month, err = s.periodStat(ctx, orgID, startMonth, startMonth.AddDate(0, -1, 0), now); err != nil {
		return BillingOverview{}, err
	}
	if ov.Year, err = s.periodStat(ctx, orgID, startYear, startYear.AddDate(-1, 0, 0), now); err != nil {
		return BillingOverview{}, err
	}

	// 12 months ending in the current one.
	since := startMonth.AddDate(0, -11, 0)
	rows, err := s.repo.MonthlyIncome(ctx, orgID, since)
	if err != nil {
		return BillingOverview{}, err
	}
	ov.Monthly = fillMonths(since, rows)

	if ov.Methods, err = s.methodBreakdown(ctx, orgID); err != nil {
		return BillingOverview{}, err
	}
	return ov, nil
}

// methodBreakdown lists collected income by payment method across both channels:
// online (MercadoPago, labeled from its reported type/method) and direct
// (manually recorded payments, labeled from the method enum). Sorted by amount.
func (s *Service) methodBreakdown(ctx context.Context, orgID string) ([]MethodStat, error) {
	online, err := s.repo.OnlineMethods(ctx, orgID)
	if err != nil {
		return nil, err
	}
	direct, err := s.repo.DirectMethods(ctx, orgID)
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

// mpMethodLabel turns MercadoPago's payment_type_id / payment_method_id into a
// Spanish label. The type is the coarse bucket; for vouchers and transfers the
// brand (method) is more precise.
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

// periodStat returns income in [start, now) and in the same-length slice of the
// previous period [prevStart, prevStart + (now-start)).
func (s *Service) periodStat(ctx context.Context, orgID string, start, prevStart, now time.Time) (PeriodStat, error) {
	cur, err := s.repo.IncomeBetween(ctx, orgID, start, now)
	if err != nil {
		return PeriodStat{}, err
	}
	prev, err := s.repo.IncomeBetween(ctx, orgID, prevStart, prevStart.Add(now.Sub(start)))
	if err != nil {
		return PeriodStat{}, err
	}
	return PeriodStat{Income: cur, Prev: prev}, nil
}

// fillMonths turns the sparse month→channel rows into a dense, ordered list of
// 12 buckets starting at `since`, zero-filling gaps.
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

// addMoney sums two validated decimal strings via integer cents.
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

// ── repository ──────────────────────────────────────────────────────────────

// IncomeTotals returns all-time online (paid MercadoPago bookings) and direct
// (manually recorded payments) income, plus the count of paid bookings.
func (r *Repository) IncomeTotals(ctx context.Context, orgID string) (online, direct string, bookingsPaid int, err error) {
	err = r.q(ctx).QueryRow(ctx, `
		SELECT
			(SELECT COALESCE(SUM(amount), 0)::numeric::text FROM bookings WHERE organization_id = $1 AND status = 'PAID'),
			(SELECT COALESCE(SUM(amount), 0)::text          FROM payments WHERE organization_id = $1),
			(SELECT COUNT(*)                                 FROM bookings WHERE organization_id = $1 AND status = 'PAID')
	`, orgID).Scan(&online, &direct, &bookingsPaid)
	if err != nil {
		return "", "", 0, fmt.Errorf("income totals: %w", err)
	}
	return online, direct, bookingsPaid, nil
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

// OnlineMethods groups paid MercadoPago bookings by their reported type/method.
func (r *Repository) OnlineMethods(ctx context.Context, orgID string) ([]rawOnlineMethod, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT COALESCE(mp_payment_type, ''), COALESCE(mp_payment_method, ''), COUNT(*), SUM(amount)::numeric::text
		FROM bookings WHERE organization_id = $1 AND status = 'PAID'
		GROUP BY 1, 2
	`, orgID)
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

// DirectMethods groups manually recorded payments by their method enum.
func (r *Repository) DirectMethods(ctx context.Context, orgID string) ([]rawDirectMethod, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT payment_method, COUNT(*), SUM(amount)::text
		FROM payments WHERE organization_id = $1
		GROUP BY 1
	`, orgID)
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
