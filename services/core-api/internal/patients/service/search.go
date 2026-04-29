package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/patients"
)

func (s *Service) Search(ctx context.Context, in SearchInput) ([]*patients.Patient, error) {
	if in.PaternalLastName == "" && in.DocumentNumber == "" {
		return nil, fmt.Errorf("%w: provide paternal_last_name or document_number", patients.ErrInvalidInput)
	}
	if in.Limit <= 0 || in.Limit > 100 {
		in.Limit = 20
	}

	filter := patients.SearchFilter{Limit: in.Limit, Offset: in.Offset}
	if in.PaternalLastName != "" {
		filter.PaternalLastNameHash = hashField(in.PaternalLastName)
	}
	if in.DocumentNumber != "" {
		filter.DocSearchHash = hashField(in.DocumentNumber)
	}

	rows, err := s.repo.Search(ctx, in.OrganizationID, filter)
	if err != nil {
		return nil, err
	}

	result := make([]*patients.Patient, 0, len(rows))
	for _, raw := range rows {
		dek, err := s.loadDEK(ctx, raw.DEKID)
		if err != nil {
			return nil, err
		}
		p, err := decryptRaw(dek, raw)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, nil
}
