package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"

	"sghcp/core-api/internal/shared/crypto"
)

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

func (s *Service) loadDEK(ctx context.Context, dekID string) ([]byte, error) {
	row, err := s.repo.FindEncKey(ctx, dekID)
	if err != nil {
		return nil, fmt.Errorf("load DEK: %w", err)
	}
	return s.km.DecryptDEK(row.KeySource, row.EncryptedDEK)
}

func sealField(dek []byte, plaintext string) ([]byte, error) {
	if plaintext == "" {
		return nil, nil
	}
	return crypto.Seal(dek, []byte(plaintext))
}

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

// sealSections marshals the section map once and encrypts the JSON; the
// marshaled bytes are also returned so the caller can hash exactly what
// was stored.
func sealSections(dek []byte, sections map[string]any) (enc []byte, plain []byte, err error) {
	plain, err = json.Marshal(sections)
	if err != nil {
		return nil, nil, err
	}
	enc, err = crypto.Seal(dek, plain)
	return enc, plain, err
}

func openSections(dek, ciphertext []byte) (map[string]any, error) {
	if len(ciphertext) == 0 {
		return nil, nil
	}
	b, err := crypto.Open(dek, ciphertext)
	if err != nil {
		return nil, err
	}
	var sections map[string]any
	if err := json.Unmarshal(b, &sections); err != nil {
		return nil, err
	}
	return sections, nil
}

// contentHashV2 fingerprints the stored sections JSON plus the structured
// fields that participate in the record's clinical meaning.
func contentHashV2(sectionsJSON []byte, risk, dischargeReason string) string {
	h := sha256.New()
	h.Write(sectionsJSON)
	h.Write([]byte("|" + risk + "|" + dischargeReason))
	return fmt.Sprintf("%x", h.Sum(nil))
}
