package service

import (
	"context"
	"log/slog"

	"sghcp/core-api/internal/patients"
)

type ListInput struct {
	OrganizationID string
	Limit          int
	Offset         int
}

func (s *Service) List(ctx context.Context, in ListInput) ([]*patients.Patient, error) {
	if in.Limit <= 0 || in.Limit > 100 {
		in.Limit = 40
	}

	rows, err := s.repo.List(ctx, in.OrganizationID, in.Limit, in.Offset)
	if err != nil {
		return nil, err
	}

	result := make([]*patients.Patient, 0, len(rows))
	for _, raw := range rows {
		dek, err := s.loadDEK(ctx, raw.DEKID)
		if err != nil {
			// A single corrupt row must not take the whole patient list
			// down with it — surface it in logs and keep serving the rest.
			slog.Default().Error("patients: skipping undecryptable patient", "patient_id", raw.ID, "err", err)
			continue
		}
		p, err := decryptRaw(dek, raw)
		if err != nil {
			slog.Default().Error("patients: skipping undecryptable patient", "patient_id", raw.ID, "err", err)
			continue
		}
		result = append(result, p)
	}
	return result, nil
}
