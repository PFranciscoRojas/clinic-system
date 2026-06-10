package profiles

import (
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("professional profile not found")
	ErrInvalidInput = errors.New("invalid input")
)

// Profile is the professional identification that appears on signed
// clinical documents (BC-2). license_number is the tarjeta profesional
// (Ley 1090/2006 for psychologists).
type Profile struct {
	UserID           string
	SpecialtyID      string
	SpecialtyName    string
	FirstName        string
	MiddleName       string
	PaternalLastName string
	MaternalLastName string
	LicenseNumber    string
	Phone            string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Specialty is one row of the public reference catalog.
type Specialty struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}
