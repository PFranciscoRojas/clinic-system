package service

import (
	"context"

	"sghcp/core-api/internal/appointments"
)

func (s *Service) Get(ctx context.Context, orgID, appointmentID string) (*appointments.Appointment, error) {
	return s.repo.FindByID(ctx, orgID, appointmentID)
}

// PendingNotes lists the professional's COMPLETED sessions without a
// finalized clinical record (last 30 days) — the "don't forget the note" list.
func (s *Service) PendingNotes(ctx context.Context, orgID, staffID string) ([]appointments.PendingNote, error) {
	return s.repo.PendingNotes(ctx, orgID, staffID)
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
