package service

import (
	"context"
	"fmt"
	"strings"

	"sghcp/core-api/internal/appointments"
)

var validModalities = map[string]bool{
	"IN_PERSON": true,
	"VIRTUAL":   true,
	"HYBRID":    true,
}

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.StaffID == "" {
		return "", fmt.Errorf("%w: organization_id and staff_id are required", appointments.ErrInvalidInput)
	}
	// A slot can be reserved without a registered patient, but never anonymously.
	if in.PatientID == "" && strings.TrimSpace(in.GuestName) == "" {
		return "", fmt.Errorf("%w: patient_id or guest_name is required", appointments.ErrInvalidInput)
	}
	if in.ScheduledAt.IsZero() {
		return "", fmt.Errorf("%w: scheduled_at is required", appointments.ErrInvalidInput)
	}
	if in.Modality == "" {
		in.Modality = "IN_PERSON"
	}
	if !validModalities[in.Modality] {
		return "", fmt.Errorf("%w: modality must be IN_PERSON, VIRTUAL or HYBRID", appointments.ErrInvalidInput)
	}
	if in.DurationMin <= 0 {
		in.DurationMin = 60
	}

	return s.repo.Create(ctx, appointments.CreateParams{
		OrganizationID: in.OrganizationID,
		PatientID:      in.PatientID,
		GuestName:      strings.TrimSpace(in.GuestName),
		StaffID:        in.StaffID,
		ScheduledAt:    in.ScheduledAt,
		DurationMin:    in.DurationMin,
		Modality:       in.Modality,
	})
}
