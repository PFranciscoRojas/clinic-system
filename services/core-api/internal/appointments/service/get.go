package service

import (
	"context"

	"sghcp/core-api/internal/appointments"
)

func (s *Service) Get(ctx context.Context, orgID, appointmentID string) (*appointments.Appointment, error) {
	return s.repo.FindByID(ctx, orgID, appointmentID)
}

func (s *Service) List(ctx context.Context, in ListInput) ([]*appointments.Appointment, error) {
	return s.repo.List(ctx, in.OrganizationID, appointments.ListFilter{
		PatientID: in.PatientID,
		StaffID:   in.StaffID,
		DateFrom:  in.DateFrom,
		DateTo:    in.DateTo,
		Status:    in.Status,
		Limit:     in.Limit,
		Offset:    in.Offset,
	})
}
