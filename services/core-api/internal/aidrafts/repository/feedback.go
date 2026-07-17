package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

func (r *Repository) InsertFeedback(ctx context.Context, fb aidrafts.DraftFeedback) error {
	detail, err := json.Marshal(fb.FieldDetail)
	if err != nil {
		return fmt.Errorf("marshal field_detail: %w", err)
	}
	var templateID, recordID *string
	if fb.TemplateID != "" {
		templateID = &fb.TemplateID
	}
	if fb.ClinicalRecordID != "" {
		recordID = &fb.ClinicalRecordID
	}
	// ON CONFLICT: a retried approve must not double-count the same draft.
	_, err = dbctx.From(ctx, r.db).Exec(ctx, `
		INSERT INTO draft_feedback (
			organization_id, draft_id, clinical_record_id, professional_id,
			template_id, record_type, fields_total, fields_unchanged,
			fields_minor, fields_rewritten, fields_added, fields_removed,
			field_detail
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (draft_id) DO NOTHING
	`, fb.OrganizationID, fb.DraftID, recordID, fb.ProfessionalID,
		templateID, fb.RecordType, fb.FieldsTotal, fb.FieldsUnchanged,
		fb.FieldsMinor, fb.FieldsRewritten, fb.FieldsAdded, fb.FieldsRemoved,
		detail)
	if err != nil {
		return fmt.Errorf("insert draft_feedback: %w", err)
	}
	return nil
}

func (r *Repository) FeedbackStats(ctx context.Context, orgID string, rng aidrafts.StatsRange) (*aidrafts.FeedbackStats, error) {
	from := rng.From
	to := rng.To
	if to.IsZero() {
		to = time.Now().Add(24 * time.Hour)
	}
	db := dbctx.From(ctx, r.db)
	stats := &aidrafts.FeedbackStats{
		TopEditedFields: []aidrafts.FieldEditStat{},
		ByProfessional:  []aidrafts.ProfessionalEditStats{},
	}

	err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END), 0)::int,
		       COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0)::int
		FROM ai_drafts
		WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
	`, orgID, from, to).Scan(&stats.DraftsApproved, &stats.DraftsRejected)
	if err != nil {
		return nil, fmt.Errorf("draft status counts: %w", err)
	}

	err = db.QueryRow(ctx, `
		SELECT COUNT(*)::int,
		       COALESCE(SUM(CASE WHEN fields_minor + fields_rewritten + fields_removed = 0 THEN 1 ELSE 0 END), 0)::int,
		       COALESCE(AVG(CASE WHEN fields_total > 0 THEN fields_unchanged::float / fields_total END), 0)
		FROM draft_feedback
		WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
	`, orgID, from, to).Scan(&stats.FeedbackCount, &stats.CleanApprovals, &stats.AvgUnchangedRatio)
	if err != nil {
		return nil, fmt.Errorf("feedback aggregates: %w", err)
	}

	rows, err := db.Query(ctx, `
		SELECT d->>'key',
		       SUM(CASE WHEN d->>'change' = 'rewritten' THEN 1 ELSE 0 END)::int,
		       SUM(CASE WHEN d->>'change' = 'minor' THEN 1 ELSE 0 END)::int
		FROM draft_feedback, jsonb_array_elements(field_detail) AS d
		WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
		  AND d->>'change' IN ('minor', 'rewritten')
		GROUP BY 1
		ORDER BY COUNT(*) DESC, 1
		LIMIT 5
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("top edited fields: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s aidrafts.FieldEditStat
		if err := rows.Scan(&s.Key, &s.Rewritten, &s.Minor); err != nil {
			return nil, fmt.Errorf("scan field stat: %w", err)
		}
		stats.TopEditedFields = append(stats.TopEditedFields, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = db.Query(ctx, `
		SELECT professional_id::text, COUNT(*)::int,
		       COALESCE(AVG(CASE WHEN fields_total > 0 THEN fields_unchanged::float / fields_total END), 0)
		FROM draft_feedback
		WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
		GROUP BY professional_id
		ORDER BY COUNT(*) DESC
	`, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("per-professional stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s aidrafts.ProfessionalEditStats
		if err := rows.Scan(&s.ProfessionalID, &s.Drafts, &s.AvgUnchangedRatio); err != nil {
			return nil, fmt.Errorf("scan professional stat: %w", err)
		}
		stats.ByProfessional = append(stats.ByProfessional, s)
	}
	return stats, rows.Err()
}
