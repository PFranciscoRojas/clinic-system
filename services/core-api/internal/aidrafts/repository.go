package aidrafts

import (
	"context"
	"time"
)

type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, draftID string) (*AIDraft, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)
	Resolve(ctx context.Context, orgID, draftID, clinicalRecordID, resolvedBy string) error
	ListByOrg(ctx context.Context, orgID, status string) ([]*DraftMeta, error)
	QueueEstimate(ctx context.Context, draftID string) (*QueueEstimate, error)
	EnsurePartial(ctx context.Context, p EnsurePartialParams) error
	FindPartial(ctx context.Context, orgID, appointmentID, uploadID string) (*PartialTranscript, error)
	DeletePartial(ctx context.Context, orgID, appointmentID, uploadID string) error
	SweepPartials(ctx context.Context, olderThan time.Time) (int64, error)
	InsertFeedback(ctx context.Context, fb DraftFeedback) error
	FeedbackStats(ctx context.Context, orgID string, rng StatsRange) (*FeedbackStats, error)
}
