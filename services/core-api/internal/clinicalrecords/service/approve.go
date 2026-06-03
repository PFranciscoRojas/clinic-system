package service

import (
	"context"
	"slices"

	"sghcp/core-api/internal/clinicalrecords"
)

// Approve transitions a DRAFT record to APPROVED.
// Enforces: caller is not INTERN; cosign completed if required.
func (s *Service) Approve(ctx context.Context, orgID, recordID string, callerRoles []string) error {
	if slices.Contains(callerRoles, "INTERN") {
		return clinicalrecords.ErrInternCannotApprove
	}

	raw, err := s.repo.FindByID(ctx, orgID, recordID)
	if err != nil {
		return err
	}
	if raw.Status != clinicalrecords.StatusDraft {
		return clinicalrecords.ErrNotDraft
	}
	if raw.RequiresCosign && raw.SupervisorCosignedAt == nil {
		return clinicalrecords.ErrCosignRequired
	}

	return s.repo.Approve(ctx, orgID, recordID, "")
}

// Cosign records supervisor co-signature on a record that requires it.
func (s *Service) Cosign(ctx context.Context, orgID, recordID, supervisorID string) error {
	raw, err := s.repo.FindByID(ctx, orgID, recordID)
	if err != nil {
		return err
	}
	if raw.Status != clinicalrecords.StatusDraft {
		return clinicalrecords.ErrNotDraft
	}
	if !raw.RequiresCosign {
		return clinicalrecords.ErrInvalidInput
	}

	return s.repo.Cosign(ctx, orgID, recordID, supervisorID)
}
