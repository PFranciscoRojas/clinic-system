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
	MiddleName       string // optional
	PaternalLastName string
	MaternalLastName string // optional
	DocumentNumber   string
	Phone            string // optional
	Email            string // optional
	Address          string // optional
	BirthDate        time.Time
	Gender           string // optional free-text per Decreto 1227/2015
}

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.FirstName == "" || in.PaternalLastName == "" || in.DocumentNumber == "" || in.OrganizationID == "" {
		return "", patients.ErrInvalidInput
	}

	dek, dekID, err := s.newDEK(ctx)
	if err != nil {
		return "", err
	}

	firstNameEnc, err := sealField(dek, in.FirstName)
	if err != nil {
		return "", fmt.Errorf("encrypt first_name: %w", err)
	}
	pLastNameEnc, err := sealField(dek, in.PaternalLastName)
	if err != nil {
		return "", fmt.Errorf("encrypt paternal_last_name: %w", err)
	}
	docEnc, err := sealField(dek, in.DocumentNumber)
	if err != nil {
		return "", fmt.Errorf("encrypt document_number: %w", err)
	}
	midEnc, err := sealField(dek, in.MiddleName)
	if err != nil {
		return "", fmt.Errorf("encrypt middle_name: %w", err)
	}
	matEnc, err := sealField(dek, in.MaternalLastName)
	if err != nil {
		return "", fmt.Errorf("encrypt maternal_last_name: %w", err)
	}
	phoneEnc, err := sealField(dek, in.Phone)
	if err != nil {
		return "", fmt.Errorf("encrypt phone: %w", err)
	}
	emailEnc, err := sealField(dek, in.Email)
	if err != nil {
		return "", fmt.Errorf("encrypt email: %w", err)
	}
	addrEnc, err := sealField(dek, in.Address)
	if err != nil {
		return "", fmt.Errorf("encrypt address: %w", err)
	}

	fullName := in.FirstName + " " + in.PaternalLastName
	if in.MaternalLastName != "" {
		fullName += " " + in.MaternalLastName
	}

	id, err := s.repo.Create(ctx, patients.CreateParams{
		OrganizationID:       in.OrganizationID,
		DocumentTypeCode:     in.DocumentTypeCode,
		DEKID:                dekID,
		FirstNameEnc:         firstNameEnc,
		MiddleNameEnc:        midEnc,
		PaternalLastNameEnc:  pLastNameEnc,
		MaternalLastNameEnc:  matEnc,
		PaternalLastNameHash: hashField(in.PaternalLastName),
		FullNameSearchHash:   hashField(fullName),
		DocumentNumberEnc:    docEnc,
		DocSearchHash:        hashField(in.DocumentNumber),
		PhoneEnc:             phoneEnc,
		EmailEnc:             emailEnc,
		AddressEnc:           addrEnc,
		BirthDate:            in.BirthDate,
		Gender:               in.Gender,
	})
	return id, err
}
