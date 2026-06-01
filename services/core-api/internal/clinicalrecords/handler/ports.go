package handler

import (
	"context"

	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
)

type svcPort interface {
	Create(ctx context.Context, in crrsvc.CreateInput) (string, error)
	Get(ctx context.Context, orgID, recordID string) (*clinicalrecords.ClinicalRecord, error)
	List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error)
	Update(ctx context.Context, in crrsvc.UpdateInput) error
	Approve(ctx context.Context, orgID, recordID string, callerRoles []string) error
	Cosign(ctx context.Context, orgID, recordID, supervisorID string) error
}

var _ svcPort = (*crrsvc.Service)(nil)
