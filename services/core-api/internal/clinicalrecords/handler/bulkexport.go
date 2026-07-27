package handler

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/clinicalrecords/pdf"
	clinperm "sghcp/core-api/internal/shared/clinicalperm"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// bulkExportMaxRecords caps one archive. Past this the export is refused
// rather than silently truncated: the professional treats this ZIP as their
// custody copy, and a short archive that looks complete is worse than an
// error telling them to narrow the date range.
const bulkExportMaxRecords = 2000

// bulkExportDeadline replaces the server's 15s write timeout for this route.
// Rendering hundreds of PDFs into a stream is not a JSON response.
const bulkExportDeadline = 30 * time.Minute

// GET /api/v1/clinical-records/export.zip?from=&to=&patient_id=
//
// Streams every approved record the caller may read as a legal PDF, grouped in
// one folder per patient, plus a CSV index. This is the professional exercising
// their own duty of custody (Res. 1995/1999): the archive is theirs, they are
// the responsable ante la SIC, and getting a full copy out must never depend on
// us answering an email. It grants no access the caller does not already have
// one record at a time.
func (h *Handler) exportZIP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)

	// A purely administrative account is not covered by that duty and pays a
	// break-the-glass justification for every single record it opens. A bulk
	// route would be the way around that gate, so it does not get one.
	if isAdminOnly(claims.Roles) {
		httputil.WriteError(w, http.StatusForbidden, "BULK_EXPORT_REQUIRES_CLINICAL_ROLE")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	patientID := strings.TrimSpace(r.URL.Query().Get("patient_id"))

	// Professionals and interns are limited to their treatment team, the same
	// need-to-know rule the single-record read enforces. Callers with no team
	// to match against (the operator, a non-clinical holder of the permission)
	// have nothing to filter by.
	ids, err := h.svc.ListApprovedForExport(ctx, clinicalrecords.ExportFilter{
		OrganizationID: claims.OrganizationID,
		StaffID:        claims.UserID,
		SeeAll:         clinperm.IsSysAdmin(claims.Roles) || !clinperm.HasClinicalRole(claims.Roles),
		PatientID:      patientID,
		From:           from,
		To:             to,
		Limit:          bulkExportMaxRecords + 1,
	})
	if err != nil {
		slog.Error("bulk export: listing records failed", "org", claims.OrganizationID, "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo preparar la exportación")
		return
	}
	if len(ids) == 0 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "no hay historias aprobadas en ese rango")
		return
	}
	if len(ids) > bulkExportMaxRecords {
		httputil.WriteError(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("son %d historias, más de las %d que se pueden exportar de una vez: filtra por rango de fechas",
				len(ids), bulkExportMaxRecords))
		return
	}

	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(bulkExportDeadline))

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="historias-clinicas-%s.zip"`, time.Now().Format("2006-01-02")))

	zw := zip.NewWriter(w)

	var indexBuf bytes.Buffer
	indexBuf.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM so Excel reads the accents
	index := csv.NewWriter(&indexBuf)
	_ = index.Write([]string{
		"Nº HC", "Paciente", "Tipo doc.", "Nº documento",
		"Fecha sesión", "Nº sesión", "Tipo de registro", "Profesional responsable", "Archivo",
	})

	written := 0
	for _, row := range ids {
		id := row.ID
		rec, err := h.svc.Get(ctx, claims.OrganizationID, id)
		if err != nil {
			// One unreadable record must not cost the professional the other
			// 300. It is left out of the index too, so the gap is visible.
			slog.Error("bulk export: skipping record", "record_id", id, "err", err)
			continue
		}

		in, patient, err := h.renderInput(ctx, claims.OrganizationID, rec)
		if err != nil {
			slog.Error("bulk export: skipping record", "record_id", id, "err", err)
			continue
		}

		// Render to memory first so a failure never leaves a truncated entry
		// inside the archive. One legal PDF is tens of kilobytes.
		var doc bytes.Buffer
		if err := pdf.Render(&doc, in); err != nil {
			slog.Error("bulk export: render failed", "record_id", id, "err", err)
			continue
		}

		entry := zipEntryName(patient.PatientCode, patient.DocumentNumber,
			joinNames(patient.FirstName, patient.PaternalLastName),
			rec.SessionDate, string(rec.RecordType), row.SessionNumber)

		f, err := zw.Create(entry)
		if err != nil {
			slog.Error("bulk export: zip entry failed", "record_id", id, "err", err)
			break
		}
		if _, err := f.Write(doc.Bytes()); err != nil {
			// The client hung up or the pipe broke: stop, the archive is lost.
			slog.Error("bulk export: write failed", "record_id", id, "err", err)
			return
		}

		sessionNo := ""
		if row.SessionNumber != nil {
			sessionNo = fmt.Sprint(*row.SessionNumber)
		}
		recordType := recordTypeLabels[string(rec.RecordType)]
		if recordType == "" {
			recordType = "Registro clínico"
		}
		prof := h.professionalInfo(ctx, rec.ResponsibleStaffID, claims.OrganizationID)
		_ = index.Write([]string{
			patientCode(patient.PatientCode),
			joinNames(patient.FirstName, patient.MiddleName, patient.PaternalLastName, patient.MaternalLastName),
			patient.DocumentTypeCode, patient.DocumentNumber,
			rec.SessionDate.Format("2006-01-02"), sessionNo,
			recordType, prof.FullName, entry,
		})
		written++
	}

	index.Flush()
	if f, err := zw.Create("indice.csv"); err == nil {
		_, _ = f.Write(indexBuf.Bytes())
	}
	if f, err := zw.Create("LEEME.txt"); err == nil {
		_, _ = f.Write([]byte(bulkExportReadme(written, time.Now())))
	}

	if err := zw.Close(); err != nil {
		slog.Error("bulk export: closing archive failed", "err", err)
		return
	}

	h.audit.RecordWithMetadata(r, "CLINICAL_RECORD_BULK_EXPORT", "organization",
		claims.OrganizationID, map[string]any{
			"records":  written,
			"selected": len(ids),
			"from":     from,
			"to":       to,
		})
}

// parseDateRange reads the optional from/to filters, returning them as
// empty strings when absent (the SQL treats ” as "no filter").
func parseDateRange(r *http.Request) (from, to string, err error) {
	for _, f := range []struct {
		name string
		dst  *string
	}{{"from", &from}, {"to", &to}} {
		v := strings.TrimSpace(r.URL.Query().Get(f.name))
		if v == "" {
			continue
		}
		if _, pErr := time.Parse("2006-01-02", v); pErr != nil {
			return "", "", fmt.Errorf("%s debe tener el formato AAAA-MM-DD", f.name)
		}
		*f.dst = v
	}
	return from, to, nil
}

// zipEntryName builds "HC-000012 CC 1020304050 Ana Gomez/2026-07-14 Evolucion s03.pdf".
// Names are folded to ASCII: Windows Explorer still mangles UTF-8 entry names
// in archives, and this file is going to land on the professional's desktop.
func zipEntryName(code int, docNumber, shortName string, session time.Time, recordType string, sessionNumber *int16) string {
	folder := strings.TrimSpace(strings.Join([]string{
		patientCode(code), docNumber, shortName,
	}, " "))
	if folder == "" {
		folder = "sin-identificar"
	}

	label := asciiRecordTypes[recordType]
	if label == "" {
		label = "Registro"
	}
	name := session.Format("2006-01-02") + " " + label
	if sessionNumber != nil {
		name += fmt.Sprintf(" s%02d", *sessionNumber)
	}

	return pathSafe(folder) + "/" + pathSafe(name) + ".pdf"
}

// asciiRecordTypes mirrors recordTypeLabels without the accents.
var asciiRecordTypes = map[string]string{
	"INITIAL":           "Apertura",
	"EVOLUTION":         "Evolucion",
	"DISCHARGE":         "Cierre",
	"INTERCONSULTATION": "Interconsulta",
}

func patientCode(code int) string {
	if code <= 0 {
		return ""
	}
	return fmt.Sprintf("HC-%06d", code)
}

// pathSafe folds accents away and drops anything that would upset a file
// system or let an entry name escape its folder.
func pathSafe(s string) string {
	folded, _, err := transform.String(
		transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC), s)
	if err != nil {
		folded = s
	}

	var b strings.Builder
	for _, r := range folded {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(strings.Join(strings.Fields(b.String()), " "), " .")
	if out == "" {
		return "sin-nombre"
	}
	return out
}

func bulkExportReadme(records int, at time.Time) string {
	return fmt.Sprintf(`Historias clinicas exportadas desde Chapni
Fecha de la exportacion: %s
Registros incluidos: %d

Que hay en este archivo
- Una carpeta por paciente, con un PDF por cada historia clinica aprobada.
  Cada PDF es el documento legal completo: identificacion del paciente,
  profesional responsable con tarjeta profesional, firma electronica,
  anotaciones posteriores y huella de integridad.
- indice.csv: el listado de todo lo que se incluyo.

Solo se exportan las historias aprobadas. Los borradores sin firmar no son
documento clinico y por eso no aparecen aqui.

La custodia y conservacion de la historia clinica es del profesional o la
institucion que la produce (Resolucion 1995 de 1999). Guarda esta copia en un
medio cifrado y con respaldo: contiene datos sensibles de tus pacientes.
`, at.Format("2006-01-02 15:04"), records)
}
