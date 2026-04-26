package service

import (
	"context"
	"fmt"
	"time"

	"sghcp/core-api/internal/patients"
)

// CreateInput carries plain-text patient data submitted by the handler.
type CreateInput struct {
	OrganizationID   string
	DocumentTypeCode string
	FirstName        string
	MiddleName       string
	PaternalLastName string
	MaternalLastName string
	DocumentNumber   string
	Phone            string
	Email            string
	Address          string
	BirthDate        time.Time
	Gender           string // free-text per Decreto 1227/2015
}

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.FirstName == "" || in.PaternalLastName == "" || in.DocumentNumber == "" {
		return "", patients.ErrInvalidInput
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

	docEnc, err := sealField(dek, in.DocumentNumber)
	if err != nil {
		return "", fmt.Errorf("encrypt document_number: %w", err)
	}

	fullName := in.FirstName + " " + in.PaternalLastName
	if in.MaternalLastName != "" {
		fullName += " " + in.MaternalLastName
	}

	return s.repo.Create(ctx, patients.CreateParams{
		OrganizationID:       in.OrganizationID,
		DocumentTypeCode:     in.DocumentTypeCode,
		DEKID:                dekID,
		FirstNameEnc:         sealed.FirstNameEnc,
		MiddleNameEnc:        sealed.MiddleNameEnc,
		PaternalLastNameEnc:  sealed.PaternalLastNameEnc,
		MaternalLastNameEnc:  sealed.MaternalLastNameEnc,
		PaternalLastNameHash: hashField(in.PaternalLastName),
		FullNameSearchHash:   hashField(fullName),
		DocumentNumberEnc:    docEnc,
		DocSearchHash:        hashField(in.DocumentNumber),
		PhoneEnc:             sealed.PhoneEnc,
		EmailEnc:             sealed.EmailEnc,
		AddressEnc:           sealed.AddressEnc,
		BirthDate:            in.BirthDate,
		Gender:               in.Gender,
	})
}
