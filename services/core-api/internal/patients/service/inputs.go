package service

import "time"

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

// UpdateInput carries plain-text fields for a full patient update.
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

// SearchInput holds plain-text search terms; exactly one filter field must be set.
type SearchInput struct {
	OrganizationID   string
	PaternalLastName string
	DocumentNumber   string
	Limit            int
	Offset           int
}
