package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/auditlog"
	"sghcp/core-api/internal/shared/dbctx"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }

// List reads the trail for one organization.
//
// audit_log carries no RLS policy of its own — it is written on paths where a
// tenant context does not always exist yet, such as a failed login — so the
// organization filter here is the isolation, not a convenience. The users join
// is scoped the same way for the same reason.
func (r *Repository) List(ctx context.Context, f auditlog.Filter) ([]auditlog.Entry, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT al.id, al.occurred_at, al.action, al.resource_type,
		       al.resource_id::text, al.success, al.error_code,
		       al.user_id::text, COALESCE(u.display_name, ''),
		       COALESCE(al.user_roles_snapshot, '{}'::text[]),
		       COALESCE(u.email, ''),
		       host(al.ip_address),
		       COALESCE(al.metadata->>'reason', ''),
		       cr.patient_id::text,
		       cr.session_date
		FROM audit_log al
		LEFT JOIN users u
		       ON u.id = al.user_id
		      AND u.organization_id = al.organization_id
		LEFT JOIN clinical_records cr
		       ON al.resource_type = 'clinical_record'
		      AND cr.id = al.resource_id
		WHERE al.organization_id = $1
		  -- Own actions are always visible; only_mine ($9) stops there, for an
		  -- administrator too. Beyond that: the whole org for an admin, or the
		  -- caller's own treatment team for a professional.
		  AND (al.user_id = $3::uuid OR (NOT $9 AND (
		        $2
		     OR (al.resource_type = 'patient' AND EXISTS (
		           SELECT 1 FROM patient_staff_rel psr
		           WHERE psr.patient_id = al.resource_id
		             AND psr.staff_id   = $3::uuid
		             AND psr.ended_at IS NULL))
		     OR (al.resource_type = 'clinical_record' AND EXISTS (
		           SELECT 1 FROM patient_staff_rel psr
		           WHERE psr.patient_id = cr.patient_id
		             AND psr.staff_id   = $3::uuid
		             AND psr.ended_at IS NULL))
		  )))
		  AND ($4 = '' OR al.action        = $4)
		  AND ($5 = '' OR al.resource_type = $5)
		  AND ($6 = '' OR al.occurred_at >= $6::date)
		  AND ($7 = '' OR al.occurred_at <  ($7::date + INTERVAL '1 day'))
		  AND ($8 = '' OR al.resource_id = $8::uuid OR cr.patient_id = $8::uuid)
		ORDER BY al.occurred_at DESC, al.id DESC
		LIMIT $10 OFFSET $11
	`,
		f.OrganizationID, f.OrgWide, f.UserID,
		f.Action, f.ResourceType, f.From, f.To, f.PatientID, f.OnlyMine,
		f.Limit, f.Offset,
	)
	if err != nil {
		return nil, fmt.Errorf("list audit_log: %w", err)
	}
	defer rows.Close()

	items := make([]auditlog.Entry, 0, f.Limit)
	for rows.Next() {
		var e auditlog.Entry
		if err := rows.Scan(
			&e.ID, &e.OccurredAt, &e.Action, &e.ResourceType,
			&e.ResourceID, &e.Success, &e.ErrorCode,
			&e.ActorID, &e.ActorName, &e.ActorRoles, &e.ActorEmail,
			&e.IPAddress, &e.Reason, &e.PatientID, &e.SessionDate,
		); err != nil {
			return nil, fmt.Errorf("scan audit_log entry: %w", err)
		}
		e.IsSelf = e.ActorID != nil && *e.ActorID == f.UserID
		items = append(items, e)
	}
	return items, rows.Err()
}
