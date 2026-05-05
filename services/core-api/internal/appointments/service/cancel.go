package service

import (
	"context"

	"sghcp/core-api/internal/appointments"
)

func (s *Service) Cancel(ctx context.Context, in CancelInput) error {
	if _, err := s.repo.FindByID(ctx, in.OrganizationID, in.AppointmentID); err != nil {
		return err
	}
	return s.repo.Cancel(ctx, appointments.CancelParams{
		AppointmentID:  in.AppointmentID,
		OrganizationID: in.OrganizationID,
		CancelledBy:    in.RequestedBy,
		CancelReason:   in.Reason,
	})
}
