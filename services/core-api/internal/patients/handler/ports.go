package handler

import (
	"context"

	"sghcp/core-api/internal/patients"
	patientssvc "sghcp/core-api/internal/patients/service"
)

// svcPort is the contract the handler requires from the service layer.
// Defined here so the handler owns its dependency boundary — DIP.
type svcPort interface {
	Create(ctx context.Context, in patientssvc.CreateInput) (string, error)
	Get(ctx context.Context, orgID, patientID string) (*patients.Patient, error)
	Search(ctx context.Context, in patientssvc.SearchInput) ([]*patients.Patient, error)
	Update(ctx context.Context, in patientssvc.UpdateInput) error
	Deactivate(ctx context.Context, orgID, patientID string) error
}

// compile-time guard: *patientssvc.Service must satisfy svcPort.
var _ svcPort = (*patientssvc.Service)(nil)
