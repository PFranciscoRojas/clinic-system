package service

import (
	"context"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/hash"
)

func (s *Service) Update(ctx context.Context, in UpdateInput) error {
	if in.FirstName == "" || in.PaternalLastName == "" {
		return patients.ErrInvalidInput
	}

	raw, err := s.repo.FindByID(ctx, in.OrganizationID, in.PatientID)
	if err != nil {
		return err
	}
	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return err
	}

	sealed, err := sealAll(dek, plainPII{
		FirstName:        in.FirstName,
		MiddleName:       in.MiddleName,
		PaternalLastName: in.PaternalLastName,
		MaternalLastName: in.MaternalLastName,
		Phone:            in.Phone,
		Email:            in.Email,
		Address:          in.Address,
	})
	if err != nil {
		return err
	}

	fullName := in.FirstName + " " + in.PaternalLastName
	if in.MaternalLastName != "" {
		fullName += " " + in.MaternalLastName
	}

	return s.repo.Update(ctx, patients.UpdateParams{
		PatientID:            in.PatientID,
		OrganizationID:       in.OrganizationID,
		FirstNameEnc:         sealed.FirstNameEnc,
		MiddleNameEnc:        sealed.MiddleNameEnc,
		PaternalLastNameEnc:  sealed.PaternalLastNameEnc,
		MaternalLastNameEnc:  sealed.MaternalLastNameEnc,
		PaternalLastNameHash: hash.Normalize(in.PaternalLastName),
		FullNameSearchHash:   hash.Normalize(fullName),
		PhoneEnc:             sealed.PhoneEnc,
		EmailEnc:             sealed.EmailEnc,
		AddressEnc:           sealed.AddressEnc,
		Gender:               in.Gender,
	})
}

func (s *Service) Deactivate(ctx context.Context, orgID, patientID string) error {
	if _, err := s.repo.FindByID(ctx, orgID, patientID); err != nil {
		return err
	}
	return s.repo.Deactivate(ctx, orgID, patientID)
}
