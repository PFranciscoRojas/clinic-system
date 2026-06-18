package invoicing

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"sghcp/core-api/internal/shared/crypto"
)

// amountPattern accepts a plain decimal with up to two fraction digits. Money is
// validated as text and stored as NUMERIC(10,2) — no floats anywhere.
var amountPattern = regexp.MustCompile(`^\d{1,8}(\.\d{1,2})?$`)

var validModalities = map[string]bool{"IN_PERSON": true, "VIRTUAL": true, "HYBRID": true}

type Service struct {
	repo *Repository
	km   *crypto.KeyManager
}

func NewService(repo *Repository, km *crypto.KeyManager) *Service {
	return &Service{repo: repo, km: km}
}

func (s *Service) List(ctx context.Context, orgID string, includeInactive bool) ([]Rate, error) {
	return s.repo.List(ctx, orgID, includeInactive)
}

func (s *Service) Create(ctx context.Context, orgID string, in RateInput) (Rate, error) {
	clean, err := s.validate(in)
	if err != nil {
		return Rate{}, err
	}
	return s.repo.Create(ctx, orgID, clean)
}

func (s *Service) Update(ctx context.Context, orgID, id string, in RateInput) (Rate, error) {
	clean, err := s.validate(in)
	if err != nil {
		return Rate{}, err
	}
	return s.repo.Update(ctx, orgID, id, clean)
}

func (s *Service) SetActive(ctx context.Context, orgID, id string, active bool) (Rate, error) {
	return s.repo.SetActive(ctx, orgID, id, active)
}

// validate normalizes and checks a rate input, returning the cleaned value.
func (s *Service) validate(in RateInput) (RateInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	in.Amount = strings.TrimSpace(in.Amount)

	if in.Name == "" {
		return RateInput{}, fmt.Errorf("%w: el nombre es obligatorio", ErrInvalidInput)
	}
	if !amountPattern.MatchString(in.Amount) {
		return RateInput{}, fmt.Errorf("%w: el monto debe ser un número con hasta dos decimales", ErrInvalidInput)
	}
	if isZeroAmount(in.Amount) {
		return RateInput{}, fmt.Errorf("%w: el monto debe ser mayor que cero", ErrInvalidInput)
	}

	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.Currency == "" {
		in.Currency = "COP"
	}
	if len(in.Currency) != 3 {
		return RateInput{}, fmt.Errorf("%w: la moneda debe tener 3 letras (ISO 4217)", ErrInvalidInput)
	}

	if in.Modality != nil {
		m := strings.ToUpper(strings.TrimSpace(*in.Modality))
		if m == "" {
			in.Modality = nil
		} else if !validModalities[m] {
			return RateInput{}, fmt.Errorf("%w: modalidad inválida", ErrInvalidInput)
		} else {
			in.Modality = &m
		}
	}
	return in, nil
}

// isZeroAmount reports whether a validated decimal string is exactly zero.
func isZeroAmount(s string) bool {
	for _, r := range s {
		if r >= '1' && r <= '9' {
			return false
		}
	}
	return true
}
