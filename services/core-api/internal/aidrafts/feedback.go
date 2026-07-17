package aidrafts

import "time"

// Field-change classifications stored in draft_feedback.field_detail. The
// payload holds template section keys and numbers only — clinical text never
// leaves the encrypted draft/record, so this table stays outside the DEK model.
const (
	ChangeUnchanged = "unchanged"
	ChangeMinor     = "minor"     // similarity >= 0.7
	ChangeRewritten = "rewritten" // similarity < 0.7
	ChangeAdded     = "added"     // only in the final version
	ChangeRemoved   = "removed"   // only in the AI draft
)

type FieldFeedback struct {
	Key        string  `json:"key"`
	Change     string  `json:"change"`
	Similarity float64 `json:"similarity"`
	LenBefore  int     `json:"len_before"`
	LenAfter   int     `json:"len_after"`
}

// DraftFeedback is one row of draft_feedback: how much the professional edited
// the AI draft before approving it into a clinical record.
type DraftFeedback struct {
	OrganizationID   string
	DraftID          string
	ClinicalRecordID string
	ProfessionalID   string
	TemplateID       string // "" = integrated format
	RecordType       string
	FieldsTotal      int
	FieldsUnchanged  int
	FieldsMinor      int
	FieldsRewritten  int
	FieldsAdded      int
	FieldsRemoved    int
	FieldDetail      []FieldFeedback
}

// FeedbackStats is the tenant-scoped aggregate served by
// GET /ai-drafts/feedback/stats.
type FeedbackStats struct {
	DraftsApproved    int                     `json:"drafts_approved"`
	DraftsRejected    int                     `json:"drafts_rejected"`
	FeedbackCount     int                     `json:"feedback_count"`
	CleanApprovals    int                     `json:"clean_approvals"` // approved without any edit
	AvgUnchangedRatio float64                 `json:"avg_unchanged_ratio"`
	TopEditedFields   []FieldEditStat         `json:"top_edited_fields"`
	ByProfessional    []ProfessionalEditStats `json:"by_professional"`
}

type FieldEditStat struct {
	Key       string `json:"key"`
	Rewritten int    `json:"rewritten"`
	Minor     int    `json:"minor"`
}

type ProfessionalEditStats struct {
	ProfessionalID    string  `json:"professional_id"`
	Drafts            int     `json:"drafts"`
	AvgUnchangedRatio float64 `json:"avg_unchanged_ratio"`
}

// StatsRange bounds a stats query; zero values mean unbounded.
type StatsRange struct {
	From time.Time
	To   time.Time
}
