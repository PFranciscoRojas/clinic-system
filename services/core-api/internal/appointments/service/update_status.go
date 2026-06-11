package service

import (
	"context"
	"slices"

	"sghcp/core-api/internal/appointments"
)

var allowedStatuses = []string{"IN_PROGRESS", "COMPLETED", "NO_SHOW"}

func (s *Service) UpdateStatus(ctx context.Context, orgID, appointmentID, status string) error {
	if !slices.Contains(allowedStatuses, status) {
		return appointments.ErrInvalidInput
	}
	return s.repo.UpdateStatus(ctx, orgID, appointmentID, status)
}

func (s *Service) AssignPatient(ctx context.Context, orgID, appointmentID, patientID string) error {
	if orgID == "" || appointmentID == "" || patientID == "" {
		return appointments.ErrInvalidInput
	}
	return s.repo.AssignPatient(ctx, orgID, appointmentID, patientID)
}
