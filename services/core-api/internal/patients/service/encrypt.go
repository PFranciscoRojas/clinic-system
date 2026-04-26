package service

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/crypto"
)

// plainPII groups all encryptable PII string fields for batch processing.
// Adding a new PII field means one edit here and one in sealAll — nowhere else.
type plainPII struct {
	FirstName        string
	MiddleName       string
	PaternalLastName string
	MaternalLastName string
	Phone            string
	Email            string
	Address          string
}

// sealedPII is the encrypted counterpart of plainPII.
type sealedPII struct {
	FirstNameEnc        []byte
	MiddleNameEnc       []byte
	PaternalLastNameEnc []byte
	MaternalLastNameEnc []byte
	PhoneEnc            []byte
	EmailEnc            []byte
	AddressEnc          []byte
}

// sealAll encrypts every field of p in a single table-driven pass.
// Empty strings produce nil bytes (stored as SQL NULL).
func sealAll(dek []byte, p plainPII) (sealedPII, error) {
	type entry struct {
		name  string
		value string
		dest  *[]byte
	}
	var s sealedPII
	for _, e := range []entry{
		{"first_name", p.FirstName, &s.FirstNameEnc},
		{"middle_name", p.MiddleName, &s.MiddleNameEnc},
		{"paternal_last_name", p.PaternalLastName, &s.PaternalLastNameEnc},
		{"maternal_last_name", p.MaternalLastName, &s.MaternalLastNameEnc},
		{"phone", p.Phone, &s.PhoneEnc},
		{"email", p.Email, &s.EmailEnc},
		{"address", p.Address, &s.AddressEnc},
	} {
		enc, err := sealField(dek, e.value)
		if err != nil {
			return sealedPII{}, fmt.Errorf("encrypt %s: %w", e.name, err)
		}
		*e.dest = enc
	}
	return s, nil
}

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
	type field struct {
		dst  *string
		src  []byte
		name string
	}
	var err error
	for _, f := range []field{
		{&p.FirstName, r.FirstNameEnc, "first_name"},
		{&p.MiddleName, r.MiddleNameEnc, "middle_name"},
		{&p.PaternalLastName, r.PaternalLastNameEnc, "paternal_last_name"},
		{&p.MaternalLastName, r.MaternalLastNameEnc, "maternal_last_name"},
		{&p.DocumentNumber, r.DocumentNumberEnc, "document_number"},
		{&p.Phone, r.PhoneEnc, "phone"},
		{&p.Email, r.EmailEnc, "email"},
		{&p.Address, r.AddressEnc, "address"},
	} {
		if *f.dst, err = openField(dek, f.src); err != nil {
			return nil, fmt.Errorf("decrypt %s: %w", f.name, err)
		}
	}
	return p, nil
}
