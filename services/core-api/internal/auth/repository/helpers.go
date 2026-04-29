package repository

import "sghcp/core-api/internal/shared/hash"

func hashEmail(email string) string {
	return hash.Normalize(email)
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
