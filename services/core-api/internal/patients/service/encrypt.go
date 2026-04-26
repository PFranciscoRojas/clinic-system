package service

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/crypto"
)

// newDEK generates a fresh DEK, stores its encrypted form in the DB,
// and returns the plaintext DEK and its DB row ID.
func (s *Service) newDEK(ctx context.Context) (dek []byte, dekID string, err error) {
	plainDEK, encDEK, keySource, err := s.km.GenerateDEK()
	if err != nil {
		return nil, "", err
	}
	dekID, err = s.repo.CreateEncKey(ctx, encDEK, keySource)
	if err != nil {
		return nil, "", err
	}
	return plainDEK, dekID, nil
}

// loadDEK fetches the encrypted DEK by ID and decrypts it.
func (s *Service) loadDEK(ctx context.Context, dekID string) ([]byte, error) {
	row, err := s.repo.FindEncKey(ctx, dekID)
	if err != nil {
		return nil, fmt.Errorf("load DEK: %w", err)
	}
	return s.km.DecryptDEK(row.KeySource, row.EncryptedDEK)
}

// sealField encrypts a plain-text string with the DEK; returns nil for empty input.
func sealField(dek []byte, plaintext string) ([]byte, error) {
	if plaintext == "" {
		return nil, nil
	}
	return crypto.Seal(dek, []byte(plaintext))
}

// openField decrypts a ciphertext back to string; returns "" for nil input.
func openField(dek, ciphertext []byte) (string, error) {
	if len(ciphertext) == 0 {
		return "", nil
	}
	b, err := crypto.Open(dek, ciphertext)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// hashField lower-cases, trims, and SHA-256 hashes a string for indexed lookups.
func hashField(s string) string {
	normalized := strings.ToLower(strings.TrimSpace(s))
	h := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("%x", h)
}

// decryptRaw decrypts all PII fields of a RawPatient into a plain Patient.
func decryptRaw(dek []byte, r *patients.RawPatient) (*patients.Patient, error) {
	p := &patients.Patient{
		ID:               r.ID,
		OrganizationID:   r.OrganizationID,
		DocumentTypeCode: r.DocumentTypeCode,
		BirthDate:        r.BirthDate,
		Gender:           r.Gender,
		IsActive:         r.IsActive,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
	}

	fields := []struct {
		dst  *string
		src  []byte
		name string
	}{
		{&p.FirstName, r.FirstNameEnc, "first_name"},
		{&p.MiddleName, r.MiddleNameEnc, "middle_name"},
		{&p.PaternalLastName, r.PaternalLastNameEnc, "paternal_last_name"},
		{&p.MaternalLastName, r.MaternalLastNameEnc, "maternal_last_name"},
		{&p.DocumentNumber, r.DocumentNumberEnc, "document_number"},
		{&p.Phone, r.PhoneEnc, "phone"},
		{&p.Email, r.EmailEnc, "email"},
		{&p.Address, r.AddressEnc, "address"},
	}
	var err error
	for _, f := range fields {
		if *f.dst, err = openField(dek, f.src); err != nil {
			return nil, fmt.Errorf("decrypt %s: %w", f.name, err)
		}
	}
	return p, nil
}
