package service

import "context"

// Logout invalidates the refresh token so it cannot be reused.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.rdb.Del(ctx, refreshTokenPrefix+refreshToken).Err()
}
