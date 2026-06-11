package service

import (
	"fmt"
	"time"

	"sghcp/core-api/internal/patients"
)

// validateBirthDate rejects implausible dates (e.g. year 0001 from a
// half-typed date input) that would otherwise show ages like "2025 años".
func validateBirthDate(d time.Time) error {
	if d.IsZero() {
		return nil // birth_date is optional
	}
	min := time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)
	if d.Before(min) || d.After(time.Now()) {
		return fmt.Errorf("%w: birth_date must be between 1900-01-01 and today", patients.ErrInvalidInput)
	}
	return nil
}
