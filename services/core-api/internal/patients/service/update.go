package service

import (
	"context"
	"fmt"
	"time"

	"sghcp/core-api/internal/patients"
)

// UpdateInput carries plain-text fields for a full patient update.
// All name/contact fields are required; optional fields may be empty.
type UpdateInput struct {
	OrganizationID   string
	PatientID        string
	FirstName        string
	MiddleName       string
	PaternalLastName string
	MaternalLastName string
	Phone            string
	Email            string
	Address          string
	BirthDate        time.Time
	Gender           string
}

func (s *Service) Update(ctx context.Context, in UpdateInput) error {
	if in.FirstName == "" || in.PaternalLastName == "" {
		return patients.ErrInvalidInput
	}

	// Load the patient's existing DEK — we re-use it, no rotation on update.
	raw, err := s.repo.FindByID(ctx, in.OrganizationID, in.PatientID)
	if err != nil {
		return err
	}
	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return err
	}

	firstNameEnc, err := sealField(dek, in.FirstName)
	if err != nil {
		return fmt.Errorf("encrypt first_name: %w", err)
	}
	pLastNameEnc, err := sealField(dek, in.PaternalLastName)
	if err != nil {
		return fmt.Errorf("encrypt paternal_last_name: %w", err)
	}
	midEnc, err := sealField(dek, in.MiddleName)
	if err != nil {
		return fmt.Errorf("encrypt middle_name: %w", err)
	}
	matEnc, err := sealField(dek, in.MaternalLastName)
	if err != nil {
		return fmt.Errorf("encrypt maternal_last_name: %w", err)
	}
	phoneEnc, err := sealField(dek, in.Phone)
	if err != nil {
		return fmt.Errorf("encrypt phone: %w", err)
	}
	emailEnc, err := sealField(dek, in.Email)
	if err != nil {
		return fmt.Errorf("encrypt email: %w", err)
	}
	addrEnc, err := sealField(dek, in.Address)
	if err != nil {
		return fmt.Errorf("encrypt address: %w", err)
	}

	fullName := in.FirstName + " " + in.PaternalLastName
	if in.MaternalLastName != "" {
		fullName += " " + in.MaternalLastName
	}

	return s.repo.Update(ctx, patients.UpdateParams{
		PatientID:            in.PatientID,
		OrganizationID:       in.OrganizationID,
		FirstNameEnc:         firstNameEnc,
		MiddleNameEnc:        midEnc,
		PaternalLastNameEnc:  pLastNameEnc,
		MaternalLastNameEnc:  matEnc,
		PaternalLastNameHash: hashField(in.PaternalLastName),
		FullNameSearchHash:   hashField(fullName),
		PhoneEnc:             phoneEnc,
		EmailEnc:             emailEnc,
		AddressEnc:           addrEnc,
		Gender:               in.Gender,
	})
}

func (s *Service) Deactivate(ctx context.Context, orgID, patientID string) error {
	// Verify the patient exists and belongs to this org before deactivating.
	if _, err := s.repo.FindByID(ctx, orgID, patientID); err != nil {
		return err
	}
	return s.repo.Deactivate(ctx, orgID, patientID)
}
