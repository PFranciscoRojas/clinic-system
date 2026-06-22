package dto

import "sghcp/core-api/internal/patients"

// PatientResponse is the JSON representation of a decrypted patient record.
// Exported so it can be referenced by tests and any future handler within this BC.
type PatientResponse struct {
	ID               string `json:"id"`
	PatientCode      int    `json:"patient_code,omitempty"` // Nº de HC — omitted for legacy rows
	OpenedAt         string `json:"opened_at"`              // Fecha de apertura de la HC (created_at)
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
	EmergencyContactName         string `json:"emergency_contact_name,omitempty"`
	EmergencyContactPhone        string `json:"emergency_contact_phone,omitempty"`
	EmergencyContactRelationship string `json:"emergency_contact_relationship,omitempty"`
	MaritalStatus    string `json:"marital_status,omitempty"`
	Education        string `json:"education,omitempty"`
	Occupation       string `json:"occupation,omitempty"`
	IsActive         bool   `json:"is_active"`
}

// ToResponse maps a decrypted Patient domain entity to its HTTP response shape.
func ToResponse(p *patients.Patient) PatientResponse {
	return PatientResponse{
		ID:               p.ID,
		PatientCode:      p.PatientCode,
		OpenedAt:         p.CreatedAt.Format("2006-01-02"),
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
		EmergencyContactName:         p.EmergencyContactName,
		EmergencyContactPhone:        p.EmergencyContactPhone,
		EmergencyContactRelationship: p.EmergencyContactRelationship,
		MaritalStatus:    p.MaritalStatus,
		Education:        p.Education,
		Occupation:       p.Occupation,
		IsActive:         p.IsActive,
	}
}
