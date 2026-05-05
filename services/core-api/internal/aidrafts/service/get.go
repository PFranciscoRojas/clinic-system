package service

import (
	"context"

	"sghcp/core-api/internal/aidrafts"
)

func (s *Service) GetDraft(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error) {
	return s.repo.FindByID(ctx, orgID, draftID)
}
