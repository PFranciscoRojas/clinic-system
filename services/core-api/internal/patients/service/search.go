package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/hash"
)

func (s *Service) Search(ctx context.Context, in SearchInput) ([]*patients.Patient, error) {
	if in.Query == "" && in.PaternalLastName == "" && in.DocumentNumber == "" {
		return nil, fmt.Errorf("%w: provide q, paternal_last_name or document_number", patients.ErrInvalidInput)
	}
	if in.Limit <= 0 || in.Limit > 100 {
		in.Limit = 20
	}

	filter := patients.SearchFilter{Limit: in.Limit, Offset: in.Offset}
	if in.DocumentNumber != "" {
		filter.DocSearchHash = hash.Normalize(in.DocumentNumber)
	} else {
		// Name search goes through the token index: accent-insensitive, any
		// name word, prefix matching. last_name rides the same path — its old
		// exact-hash behavior was the "only finds the exact surname" complaint.
		filter.TokenHashes = hash.SearchQueryHashes(in.Query + " " + in.PaternalLastName)
		if len(filter.TokenHashes) == 0 {
			// Too short to index (single character) — nothing can match.
			return []*patients.Patient{}, nil
		}
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
