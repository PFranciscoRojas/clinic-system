package appointments

import "context"

type Repository interface {
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, appointmentID string) (*Appointment, error)
	List(ctx context.Context, orgID string, f ListFilter) ([]*Appointment, error)
	Cancel(ctx context.Context, p CancelParams) error
	UpdateStatus(ctx context.Context, orgID, appointmentID, status string) error
	AssignPatient(ctx context.Context, orgID, appointmentID, patientID string) error
}
