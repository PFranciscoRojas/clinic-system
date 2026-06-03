package handler

import (
	"context"

	"sghcp/core-api/internal/appointments"
	apptssvc "sghcp/core-api/internal/appointments/service"
)

type svcPort interface {
	Create(ctx context.Context, in apptssvc.CreateInput) (string, error)
	Get(ctx context.Context, orgID, appointmentID string) (*appointments.Appointment, error)
	List(ctx context.Context, in apptssvc.ListInput) ([]*appointments.Appointment, error)
	Cancel(ctx context.Context, in apptssvc.CancelInput) error
	UpdateStatus(ctx context.Context, orgID, appointmentID, status string) error
}

var _ svcPort = (*apptssvc.Service)(nil)
