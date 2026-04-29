package handler

import "sghcp/core-api/internal/patients"

// patientResponse is the JSON representation of a decrypted patient record.
type patientResponse struct {
	ID               string `json:"id"`
	DocumentTypeCode string `json:"document_type_code"`
	FirstName        string `json:"first_name"`
	MiddleName       string `json:"middle_name,omitempty"`
	PaternalLastName string `json:"paternal_last_name"`
	MaternalLastName string `json:"maternal_last_name,omitempty"`
	DocumentNumber   string `json:"document_number"`
	Phone            string `json:"phone,omitempty"`
	Email            string `json:"email,omitempty"`
	Address          string `json:"address,omitempty"`
	BirthDate        string `json:"birth_date"`
	Gender           string `json:"gender,omitempty"`
	IsActive         bool   `json:"is_active"`
}

func toResponse(p *patients.Patient) patientResponse {
	return patientResponse{
		ID:               p.ID,
		DocumentTypeCode: p.DocumentTypeCode,
		FirstName:        p.FirstName,
		MiddleName:       p.MiddleName,
		PaternalLastName: p.PaternalLastName,
		MaternalLastName: p.MaternalLastName,
		DocumentNumber:   p.DocumentNumber,
		Phone:            p.Phone,
		Email:            p.Email,
		Address:          p.Address,
		BirthDate:        p.BirthDate.Format("2006-01-02"),
		Gender:           p.Gender,
		IsActive:         p.IsActive,
	}
}
