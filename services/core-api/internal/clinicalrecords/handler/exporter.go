package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/clinicalrecords/pdf"
	"sghcp/core-api/internal/diagnoses"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// Labels mirror RECORD_TYPE_LABELS in the frontend constants.
var recordTypeLabels = map[string]string{
	"INITIAL":           "Apertura",
	"EVOLUTION":         "Evolución",
	"DISCHARGE":         "Cierre",
	"INTERCONSULTATION": "Interconsulta",
}

var genderLabels = map[string]string{
	"F": "Femenino", "M": "Masculino",
}

// GET /api/v1/clinical-records/{id}/export
//
// Produces a printable copy of the electronic record that satisfies the
// Colombian clinical-history rules: full patient identification block
// (Res. 1995/1999 art. 6), professional identification with tarjeta
// profesional (Ley 1090/2006), electronic-signature representation
// (Ley 527/1999) and an integrity fingerprint.
func (h *Handler) exportPDF(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	recordID := chi.URLParam(r, "id")

	rec, err := h.svc.Get(ctx, claims.OrganizationID, recordID)
	if err != nil {
		writeErr(w, err)
		return
	}

	if rec.Status != clinicalrecords.StatusApproved {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "only approved records can be exported")
		return
	}

	patient, err := h.patients.Get(ctx, claims.OrganizationID, rec.PatientID)
	if err != nil {
		writeErr(w, err)
		return
	}

	age := yearsBetween(patient.BirthDate, rec.SessionDate)
	gender := patient.Gender
	if label, ok := genderLabels[strings.ToUpper(gender)]; ok {
		gender = label
	}
	patientInfo := pdf.PatientInfo{
		FullName:       joinNames(patient.FirstName, patient.MiddleName, patient.PaternalLastName, patient.MaternalLastName),
		DocumentType:   patient.DocumentTypeCode,
		DocumentNumber: patient.DocumentNumber,
		BirthDate:      patient.BirthDate,
		Age:            age,
		Gender:         gender,
		Phone:          patient.Phone,
		Email:          patient.Email,
		Address:        patient.Address,
	}

	// The PDF must credit the responsible professional, not whoever exports.
	prof := h.professionalInfo(ctx, rec.ResponsibleStaffID, claims.OrganizationID)
	signature := h.professionalSignature(ctx, rec.ResponsibleStaffID)

	org := h.orgInfo(ctx, claims.OrganizationID)

	// Supervisor name only when the record was actually cosigned.
	supervisorName := ""
	if rec.RequiresCosign && rec.SupervisorCosignedAt != nil && rec.SupervisorID != "" {
		sup := h.professionalInfo(ctx, rec.SupervisorID, claims.OrganizationID)
		supervisorName = sup.FullName
		if sup.License != "" {
			supervisorName += ", T.P. No. " + sup.License
		}
	}

	// Integrity fingerprint stored at write time (not exposed by the read API).
	var contentHash string
	h.db.QueryRow(ctx,
		`SELECT content_hash FROM clinical_records WHERE id = $1 AND organization_id = $2`,
		recordID, claims.OrganizationID,
	).Scan(&contentHash)

	var diagLines []pdf.DiagnosisLine
	if all, err := h.diag.ListByPatient(ctx, claims.OrganizationID, rec.PatientID); err == nil {
		for _, d := range all {
			if d.Status != diagnoses.StatusActive {
				continue
			}
			diagLines = append(diagLines, pdf.DiagnosisLine{
				Code:        d.ICD10Code,
				Description: d.Description,
				Type:        string(d.DiagnosisType),
			})
		}
	}

	recordTypeLabel := recordTypeLabels[string(rec.RecordType)]
	if recordTypeLabel == "" {
		recordTypeLabel = "Registro clínico"
	}

	// Addenda are part of the legal document.
	addenda, _ := h.svc.ListAddenda(ctx, claims.OrganizationID, recordID)

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="historia-clinica-%s-%s.pdf"`,
			patient.DocumentNumber, rec.SessionDate.Format("2006-01-02")))

	err = pdf.Render(w, pdf.RenderInput{
		Record:         rec,
		Org:            org,
		Patient:        patientInfo,
		Professional:   prof,
		SignaturePNG:   signature,
		SupervisorName: supervisorName,
		RecordType:     recordTypeLabel,
		Diagnoses:      diagLines,
		Addenda:        addenda,
		ContentHash:    contentHash,
	})
	if err != nil {
		// Headers already sent — nothing useful to return to the client.
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_EXPORT", "clinical_record", recordID)
}

// professionalInfo resolves the professional profile (full name, tarjeta
// profesional, specialty). Falls back to users.display_name when the user
// has no professional profile yet.
func (h *Handler) professionalInfo(ctx context.Context, userID, orgID string) pdf.ProfessionalInfo {
	var first, middle, paternal, maternal, license, specialty string
	err := h.db.QueryRow(ctx, `
		SELECT pp.first_name, COALESCE(pp.middle_name, ''), pp.paternal_last_name,
		       COALESCE(pp.maternal_last_name, ''), pp.license_number, s.name
		FROM professional_profiles pp
		JOIN specialties s ON s.id = pp.specialty_id
		JOIN users u ON u.id = pp.user_id
		WHERE pp.user_id = $1 AND u.organization_id = $2
	`, userID, orgID).Scan(&first, &middle, &paternal, &maternal, &license, &specialty)
	if err == nil {
		return pdf.ProfessionalInfo{
			FullName:  joinNames(first, middle, paternal, maternal),
			License:   license,
			Specialty: specialty,
		}
	}

	var displayName string
	if err := h.db.QueryRow(ctx,
		`SELECT COALESCE(display_name, '') FROM users WHERE id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&displayName); err != nil || displayName == "" {
		displayName = "—"
	}
	return pdf.ProfessionalInfo{FullName: displayName, License: "—"}
}

// professionalSignature decrypts the stored signature stamp; nil when absent
// or undecryptable (the PDF then falls back to the plain signature line).
func (h *Handler) professionalSignature(ctx context.Context, userID string) []byte {
	var sealed []byte
	var dekID *string
	if err := h.db.QueryRow(ctx, `
		SELECT signature_enc, signature_dek_id::text FROM professional_profiles WHERE user_id = $1
	`, userID).Scan(&sealed, &dekID); err != nil || len(sealed) == 0 || dekID == nil {
		return nil
	}

	var encDEK []byte
	var keySource string
	if err := h.db.QueryRow(ctx,
		`SELECT encrypted_dek, key_source FROM encryption_keys WHERE id = $1`, *dekID,
	).Scan(&encDEK, &keySource); err != nil {
		return nil
	}
	dek, err := h.km.DecryptDEK(keySource, encDEK)
	if err != nil {
		return nil
	}
	raw, err := crypto.Open(dek, sealed)
	if err != nil {
		return nil
	}
	return raw
}

// orgInfo builds the letterhead from organizations.name, nit and the
// optional contact keys (address, phone, email) in the settings JSONB.
func (h *Handler) orgInfo(ctx context.Context, orgID string) pdf.OrgInfo {
	var name, nit string
	var settingsRaw []byte
	if err := h.db.QueryRow(ctx,
		`SELECT name, COALESCE(nit, ''), settings FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&name, &nit, &settingsRaw); err != nil {
		return pdf.OrgInfo{Name: "—"}
	}

	info := pdf.OrgInfo{Name: name, NIT: nit}
	var settings map[string]any
	if json.Unmarshal(settingsRaw, &settings) == nil {
		if v, ok := settings["address"].(string); ok {
			info.Address = v
		}
		if v, ok := settings["phone"].(string); ok {
			info.Phone = v
		}
		if v, ok := settings["email"].(string); ok {
			info.Email = v
		}
	}
	return info
}

func joinNames(parts ...string) string {
	var nonEmpty []string
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			nonEmpty = append(nonEmpty, strings.TrimSpace(p))
		}
	}
	return strings.Join(nonEmpty, " ")
}

func yearsBetween(birth, at time.Time) int {
	years := at.Year() - birth.Year()
	if at.Month() < birth.Month() || (at.Month() == birth.Month() && at.Day() < birth.Day()) {
		years--
	}
	if years < 0 {
		return 0
	}
	return years
}
