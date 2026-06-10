package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/treatmentplans"
)

// Service implements all treatment plan use cases.
type Service struct {
	repo treatmentplans.Repository
	km   *crypto.KeyManager
}

func New(repo treatmentplans.Repository, km *crypto.KeyManager) *Service {
	return &Service{repo: repo, km: km}
}

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
