package handler

import (
	"context"

	"sghcp/core-api/internal/aidrafts"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
)

type svcPort interface {
	UploadAudio(ctx context.Context, in aidraftssvc.UploadAudioInput) (string, error)
	GetDraft(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error)
}

var _ svcPort = (*aidraftssvc.Service)(nil)
