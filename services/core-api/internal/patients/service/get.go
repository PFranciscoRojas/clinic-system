package service

import (
	"context"

	"sghcp/core-api/internal/patients"
)

func (s *Service) Get(ctx context.Context, orgID, patientID string) (*patients.Patient, error) {
	raw, err := s.repo.FindByID(ctx, orgID, patientID)
	if err != nil {
		return nil, err
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return nil, err
	}

	return decryptRaw(dek, raw)
}
