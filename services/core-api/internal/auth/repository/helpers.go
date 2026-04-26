package repository

import "sghcp/core-api/internal/auth"

// hashEmail delegates to the domain function so the hash is computed identically
// whether called from the service layer or directly from a repository query.
func hashEmail(email string) string {
	return auth.HashEmail(email)
}

func nullableUUID(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func nullableText(s string) any {
	if s == "" {
		return nil
	}
	return s
}
