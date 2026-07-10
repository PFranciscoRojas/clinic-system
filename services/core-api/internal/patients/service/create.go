package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/hash"
)

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.FirstName == "" || in.PaternalLastName == "" {
		return "", patients.ErrInvalidInput
	}
	if err := validateBirthDate(in.BirthDate); err != nil {
		return "", err
	}

	dek, dekID, err := s.newDEK(ctx)
	if err != nil {
		return "", err
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
		return "", err
	}

	var docEnc []byte
	var docHash string
	if in.DocumentNumber != "" {
		docEnc, err = sealField(dek, in.DocumentNumber)
		if err != nil {
			return "", fmt.Errorf("encrypt document_number: %w", err)
		}
		docHash = hash.Normalize(in.DocumentNumber)
	}

	ecEnc, err := sealEmergencyContact(dek, in.EmergencyContactName, in.EmergencyContactPhone, in.EmergencyContactRelationship)
	if err != nil {
		return "", err
	}

	demoEnc, err := sealDemographics(dek, in.MaritalStatus, in.Education, in.Occupation)
	if err != nil {
		return "", err
	}

	fullName := in.FirstName + " " + in.PaternalLastName
	if in.MaternalLastName != "" {
		fullName += " " + in.MaternalLastName
	}

	id, err := s.repo.Create(ctx, patients.CreateParams{
		OrganizationID:       in.OrganizationID,
		DocumentTypeCode:     in.DocumentTypeCode,
		DEKID:                dekID,
		FirstNameEnc:         sealed.FirstNameEnc,
		MiddleNameEnc:        sealed.MiddleNameEnc,
		PaternalLastNameEnc:  sealed.PaternalLastNameEnc,
		MaternalLastNameEnc:  sealed.MaternalLastNameEnc,
		PaternalLastNameHash: hash.Normalize(in.PaternalLastName),
		FullNameSearchHash:   hash.Normalize(fullName),
		DocumentNumberEnc:    docEnc,
		DocSearchHash:        docHash,
		PhoneEnc:             sealed.PhoneEnc,
		EmailEnc:             sealed.EmailEnc,
		AddressEnc:           sealed.AddressEnc,
		EmergencyContactEnc:  ecEnc,
		DemographicsEnc:      demoEnc,
		BirthDate:            in.BirthDate,
		Gender:               in.Gender,
	})
	if err != nil {
		return "", err
	}

	// Encrypted-search index: prefix hashes over every name word, so the
	// search box finds the patient by any name, accent-free, while typing.
	tokens := hash.SearchTokenHashes(in.FirstName, in.MiddleName, in.PaternalLastName, in.MaternalLastName)
	if err := s.repo.ReplaceSearchTokens(ctx, in.OrganizationID, id, tokens); err != nil {
		return "", fmt.Errorf("index search tokens: %w", err)
	}
	return id, nil
}
