package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log/slog"
)

// ExportCSV decrypts all active patients in the org and returns a UTF-8 CSV
// with BOM so Excel opens it correctly with accented characters.
func (s *Service) ExportCSV(ctx context.Context, orgID string) ([]byte, error) {
	rows, err := s.repo.ListAll(ctx, orgID)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	// BOM so Excel on Windows detects UTF-8 correctly.
	buf.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(&buf)
	_ = w.Write([]string{
		"Nº HC", "Primer apellido", "Segundo apellido",
		"Primer nombre", "Segundo nombre",
		"Tipo doc.", "Nº documento",
		"Teléfono", "Correo", "Fecha nacimiento",
		"Género", "Fecha apertura",
	})

	for _, raw := range rows {
		dek, err := s.loadDEK(ctx, raw.DEKID)
		if err != nil {
			slog.Default().Error("patients.export: skipping undecryptable patient", "id", raw.ID, "err", err)
			continue
		}
		p, err := decryptRaw(dek, raw)
		if err != nil {
			slog.Default().Error("patients.export: skipping undecryptable patient", "id", raw.ID, "err", err)
			continue
		}

		hc := ""
		if p.PatientCode > 0 {
			hc = fmt.Sprintf("HC-%06d", p.PatientCode)
		}
		dob := ""
		if !p.BirthDate.IsZero() {
			dob = p.BirthDate.Format("2006-01-02")
		}
		opened := p.CreatedAt.Format("2006-01-02")

		_ = w.Write([]string{
			hc,
			p.PaternalLastName, p.MaternalLastName,
			p.FirstName, p.MiddleName,
			p.DocumentTypeCode, p.DocumentNumber,
			p.Phone, p.Email, dob,
			p.Gender, opened,
		})
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
