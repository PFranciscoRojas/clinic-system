package service

import (
	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/crypto"
)

// Service implements all patient use cases.
type Service struct {
	repo patients.Repository
	km   *crypto.KeyManager
}

func New(repo patients.Repository, km *crypto.KeyManager) *Service {
	return &Service{repo: repo, km: km}
}
