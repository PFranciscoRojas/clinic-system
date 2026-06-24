package service

import "context"

func (s *Service) AcceptDPA(ctx context.Context, userID string) error {
	return s.repo.AcceptDPA(ctx, userID)
}

func (s *Service) DPAAccepted(ctx context.Context, userID string) (bool, error) {
	return s.repo.DPAAccepted(ctx, userID)
}
