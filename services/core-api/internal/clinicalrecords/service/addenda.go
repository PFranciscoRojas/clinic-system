package service

import (
	"context"
	"fmt"
	"strings"

	"sghcp/core-api/internal/clinicalrecords"
)

// AddAddendum appends an immutable supplementary note to an APPROVED record.
// The content is sealed with the parent record's DEK.
func (s *Service) AddAddendum(ctx context.Context, orgID, recordID, createdBy, content string) (string, error) {
	if strings.TrimSpace(content) == "" {
		return "", clinicalrecords.ErrInvalidInput
	}

	raw, err := s.repo.FindByID(ctx, orgID, recordID)
	if err != nil {
		return "", err
	}
	if raw.Status != clinicalrecords.StatusApproved {
		return "", clinicalrecords.ErrNotApproved
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return "", fmt.Errorf("load record DEK: %w", err)
	}
	contentEnc, err := sealField(dek, strings.TrimSpace(content))
	if err != nil {
		return "", fmt.Errorf("seal addendum: %w", err)
	}

	return s.repo.CreateAddendum(ctx, orgID, recordID, createdBy, contentEnc)
}

// ListAddenda returns the decrypted addenda of a record, oldest first.
func (s *Service) ListAddenda(ctx context.Context, orgID, recordID string) ([]*clinicalrecords.Addendum, error) {
	raw, err := s.repo.FindByID(ctx, orgID, recordID)
	if err != nil {
		return nil, err
	}

	raws, err := s.repo.ListAddenda(ctx, orgID, recordID)
	if err != nil {
		return nil, err
	}
	if len(raws) == 0 {
		return nil, nil
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return nil, fmt.Errorf("load record DEK: %w", err)
	}

	out := make([]*clinicalrecords.Addendum, 0, len(raws))
	for _, ra := range raws {
		content, err := openField(dek, ra.ContentEnc)
		if err != nil {
			return nil, fmt.Errorf("decrypt addendum: %w", err)
		}
		out = append(out, &clinicalrecords.Addendum{
			ID:         ra.ID,
			RecordID:   ra.RecordID,
			CreatedBy:  ra.CreatedBy,
			AuthorName: ra.AuthorName,
			Content:    content,
			CreatedAt:  ra.CreatedAt,
		})
	}
	return out, nil
}
