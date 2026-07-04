package invoicing

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// TeamMemberStats is one professional's operational and revenue picture in the
// selected window — the owner-dashboard row (B2B-3).
type TeamMemberStats struct {
	StaffID  string `json:"staff_id"`
	Name     string `json:"name"`
	RoleName string `json:"role_name"` // PROFESSIONAL | INTERN | "" for the unassigned row

	Scheduled     int `json:"scheduled"`      // appointments in window, excluding cancelled/rescheduled
	Completed     int `json:"completed"`      // status COMPLETED
	NoShow        int `json:"no_show"`        // status NO_SHOW
	Cancelled     int `json:"cancelled"`      // status CANCELLED, excluding reagendas
	Rescheduled   int `json:"rescheduled"`    // cancelled with reason "Reagendado" or status RESCHEDULED
	BookedMinutes int `json:"booked_minutes"` // sum of duration over non-cancelled, non-no-show sessions

	Collected string `json:"collected"` // money collected in window attributed to this professional
}

// TeamStats aggregates, per active clinical professional, the appointment
// outcomes and collected income in [from, to) (nil bounds = all-time). Money
// collected on invoices without an appointment gets an "unassigned" row
// (empty staff_id) so the clinic total always matches Facturación.
func (s *Service) TeamStats(ctx context.Context, orgID string, from, to *time.Time) ([]TeamMemberStats, error) {
	staff, err := s.repo.ClinicalStaff(ctx, orgID)
	if err != nil {
		return nil, err
	}
	appts, err := s.repo.TeamAppointmentAgg(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}
	money, err := s.repo.TeamCollectedAgg(ctx, orgID, from, to)
	if err != nil {
		return nil, err
	}

	out := make([]TeamMemberStats, 0, len(staff)+1)
	for _, m := range staff {
		row := TeamMemberStats{StaffID: m.ID, Name: m.Name, RoleName: m.RoleName, Collected: "0"}
		if a, ok := appts[m.ID]; ok {
			row.Scheduled, row.Completed, row.NoShow = a.Scheduled, a.Completed, a.NoShow
			row.Cancelled, row.Rescheduled, row.BookedMinutes = a.Cancelled, a.Rescheduled, a.BookedMinutes
		}
		if v, ok := money[m.ID]; ok {
			row.Collected = v
		}
		out = append(out, row)
		delete(appts, m.ID)
		delete(money, m.ID)
	}

	// Leftovers: money or appointments attributed to nobody active (unlinked
	// invoices, deactivated staff). Fold them into a single catch-all row so
	// totals still reconcile with the financial overview.
	other := TeamMemberStats{Name: "Sin asignar", Collected: "0"}
	var otherCents int64
	for _, a := range appts {
		other.Scheduled += a.Scheduled
		other.Completed += a.Completed
		other.NoShow += a.NoShow
		other.Cancelled += a.Cancelled
		other.Rescheduled += a.Rescheduled
		other.BookedMinutes += a.BookedMinutes
	}
	for _, v := range money {
		otherCents += cents(v)
	}
	if otherCents > 0 || other.Scheduled > 0 {
		other.Collected = itoaCents(otherCents)
		out = append(out, other)
	}

	sort.SliceStable(out, func(i, j int) bool {
		// Unassigned row always last; otherwise most sessions first.
		if (out[i].StaffID == "") != (out[j].StaffID == "") {
			return out[i].StaffID != ""
		}
		if out[i].Scheduled != out[j].Scheduled {
			return out[i].Scheduled > out[j].Scheduled
		}
		return cents(out[i].Collected) > cents(out[j].Collected)
	})
	return out, nil
}

// ── repository ──────────────────────────────────────────────────────────────

type clinicalStaffRow struct {
	ID       string
	Name     string
	RoleName string
}

// ClinicalStaff lists the org's active PROFESSIONAL/INTERN users, preferring
// the professional-profile name (staff names are plaintext by design).
func (r *Repository) ClinicalStaff(ctx context.Context, orgID string) ([]clinicalStaffRow, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT u.id::text,
		       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pp.first_name, pp.paternal_last_name)), ''),
		                NULLIF(u.display_name, ''), u.email),
		       ro.name
		FROM   users u
		JOIN   user_roles ur ON ur.user_id = u.id AND ur.organization_id = $1
		JOIN   roles ro      ON ro.id = ur.role_id AND ro.name IN ('PROFESSIONAL', 'INTERN')
		LEFT JOIN professional_profiles pp ON pp.user_id = u.id
		WHERE  u.organization_id = $1 AND u.is_active
		ORDER  BY u.created_at
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("clinical staff: %w", err)
	}
	defer rows.Close()
	out := []clinicalStaffRow{}
	for rows.Next() {
		var m clinicalStaffRow
		if err := rows.Scan(&m.ID, &m.Name, &m.RoleName); err != nil {
			return nil, fmt.Errorf("scan clinical staff: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type teamApptAgg struct {
	Scheduled     int
	Completed     int
	NoShow        int
	Cancelled     int
	Rescheduled   int
	BookedMinutes int
}

// TeamAppointmentAgg buckets appointment outcomes per staff member in [from, to).
// Reagendas are cancellations with the UI's "Reagendado" reason (plus the legacy
// RESCHEDULED status); they are excluded from the cancellation count.
func (r *Repository) TeamAppointmentAgg(ctx context.Context, orgID string, from, to *time.Time) (map[string]teamApptAgg, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT staff_id::text,
		       COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RESCHEDULED')),
		       COUNT(*) FILTER (WHERE status = 'COMPLETED'),
		       COUNT(*) FILTER (WHERE status = 'NO_SHOW'),
		       COUNT(*) FILTER (WHERE status = 'CANCELLED' AND COALESCE(cancel_reason, '') <> 'Reagendado'),
		       COUNT(*) FILTER (WHERE status = 'RESCHEDULED' OR (status = 'CANCELLED' AND cancel_reason = 'Reagendado')),
		       COALESCE(SUM(duration_min) FILTER (WHERE status NOT IN ('CANCELLED', 'RESCHEDULED', 'NO_SHOW')), 0)
		FROM   appointments
		WHERE  organization_id = $1
		  AND  ($2::timestamptz IS NULL OR scheduled_at >= $2)
		  AND  ($3::timestamptz IS NULL OR scheduled_at <  $3)
		GROUP  BY staff_id
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("team appointment agg: %w", err)
	}
	defer rows.Close()
	out := map[string]teamApptAgg{}
	for rows.Next() {
		var id string
		var a teamApptAgg
		if err := rows.Scan(&id, &a.Scheduled, &a.Completed, &a.NoShow, &a.Cancelled, &a.Rescheduled, &a.BookedMinutes); err != nil {
			return nil, fmt.Errorf("scan team appointment agg: %w", err)
		}
		out[id] = a
	}
	return out, rows.Err()
}

// TeamCollectedAgg sums money collected in [from, to) per staff member:
// invoice payments attributed through the invoice's appointment, plus paid
// online bookings that have no invoice yet (once invoiced, CreateFromBooking
// records a payment, so counting both would double-count). Payments whose
// invoice has no appointment land under the empty key ("unassigned").
func (r *Repository) TeamCollectedAgg(ctx context.Context, orgID string, from, to *time.Time) (map[string]string, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT COALESCE(staff, ''), SUM(amt)::text
		FROM (
			SELECT a.staff_id::text AS staff, p.amount AS amt
			FROM   payments p
			JOIN   invoices i ON i.id = p.invoice_id
			LEFT JOIN appointments a ON a.id = i.appointment_id
			WHERE  p.organization_id = $1
			  AND  ($2::timestamptz IS NULL OR p.paid_at >= $2)
			  AND  ($3::timestamptz IS NULL OR p.paid_at <  $3)
			UNION ALL
			SELECT b.staff_id::text, b.amount::numeric
			FROM   bookings b
			WHERE  b.organization_id = $1 AND b.status = 'PAID' AND b.invoice_id IS NULL
			  AND  ($2::timestamptz IS NULL OR b.updated_at >= $2)
			  AND  ($3::timestamptz IS NULL OR b.updated_at <  $3)
		) x
		GROUP BY 1
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("team collected agg: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, amount string
		if err := rows.Scan(&id, &amount); err != nil {
			return nil, fmt.Errorf("scan team collected agg: %w", err)
		}
		out[id] = amount
	}
	return out, rows.Err()
}
