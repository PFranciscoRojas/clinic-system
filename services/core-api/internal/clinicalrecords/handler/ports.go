package handler

import (
	"context"

	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/patients"
	patsvc "sghcp/core-api/internal/patients/service"
)

type svcPort interface {
	Create(ctx context.Context, in crrsvc.CreateInput) (string, error)
	Get(ctx context.Context, orgID, recordID string) (*clinicalrecords.ClinicalRecord, error)
	List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error)
	Update(ctx context.Context, in crrsvc.UpdateInput) error
	Approve(ctx context.Context, orgID, recordID string, callerRoles []string) (string, error)
	Cosign(ctx context.Context, orgID, recordID, supervisorID string) error
	AddAddendum(ctx context.Context, orgID, recordID, createdBy, content string) (string, error)
	ListAddenda(ctx context.Context, orgID, recordID string) ([]*clinicalrecords.Addendum, error)
}

var _ svcPort = (*crrsvc.Service)(nil)

type patientGetterPort interface {
	Get(ctx context.Context, orgID, patientID string) (*patients.Patient, error)
}

var _ patientGetterPort = (*patsvc.Service)(nil)
