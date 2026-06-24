package service

import (
	"context"

	"sghcp/core-api/internal/aidrafts"
)

func (s *Service) GetDraft(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, error) {
	return s.repo.FindByID(ctx, orgID, draftID)
}

func (s *Service) ListDrafts(ctx context.Context, orgID, status string) ([]*aidrafts.DraftMeta, error) {
	return s.repo.ListByOrg(ctx, orgID, status)
}
