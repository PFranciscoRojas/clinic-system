package handler

import (
	"context"

	"sghcp/core-api/internal/aidrafts"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
)

type svcPort interface {
	UploadAudio(ctx context.Context, in aidraftssvc.UploadAudioInput) (string, error)
	AppendPart(ctx context.Context, in aidraftssvc.AppendPartInput) error
	GetDraft(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error)
	ListDrafts(ctx context.Context, orgID, status string) ([]*aidrafts.DraftMeta, error)
	EstimateWait(ctx context.Context, orgID, draftID, status string) (*aidraftssvc.QueueETA, error)
	DecryptDraftContent(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, string, error)
	DecryptForReview(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, string, string, error)
	ResolveDraft(ctx context.Context, orgID, draftID, clinicalRecordID, resolvedBy string) error
	SaveFeedback(ctx context.Context, fb aidrafts.DraftFeedback) error
	FeedbackStats(ctx context.Context, orgID string, rng aidrafts.StatsRange) (*aidrafts.FeedbackStats, error)
}

type crrPort interface {
	Create(ctx context.Context, in crrsvc.CreateInput) (string, error)
	List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error)
}

var _ svcPort = (*aidraftssvc.Service)(nil)
