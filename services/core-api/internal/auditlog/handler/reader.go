package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sghcp/core-api/internal/auditlog"
	"sghcp/core-api/internal/shared/clinicalperm"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const (
	defaultLimit = 50
	maxLimit     = 200
)

// GET /api/v1/audit-log
//
// Filters: action, resource_type, patient_id, from, to (YYYY-MM-DD),
// only_mine=true, limit, offset.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > maxLimit {
		limit = defaultLimit
	}
	offset, _ := strconv.Atoi(q.Get("offset"))
	if offset < 0 {
		offset = 0
	}

	from, to, err := parseDateRange(q.Get("from"), q.Get("to"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// CLINIC_ADMIN holds audit_log:read for the whole organization: seeing who
	// touched what is the job. A dual-role account gets that same wide view —
	// it is already the administrator of this clinic.
	orgWide := clinicalperm.IsSysAdmin(claims.Roles) || hasRole(claims.Roles, "CLINIC_ADMIN")

	items, err := h.repo.List(ctx, auditlog.Filter{
		OrganizationID: claims.OrganizationID,
		UserID:         claims.UserID,
		OrgWide:        orgWide,
		OnlyMine:       q.Get("only_mine") == "true",
		Action:         strings.TrimSpace(q.Get("action")),
		ResourceType:   strings.TrimSpace(q.Get("resource_type")),
		PatientID:      strings.TrimSpace(q.Get("patient_id")),
		From:           from,
		To:             to,
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		slog.Error("audit log: read failed", "org", claims.OrganizationID, "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo leer el registro de accesos")
		return
	}

	h.resolvePatientNames(ctx, claims.OrganizationID, items)

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"limit":    limit,
		"offset":   offset,
		"org_wide": orgWide,
		"has_more": len(items) == limit,
	})
}

// resolvePatientNames decrypts the patient name once per distinct patient on
// the page. "Alguien abrió la historia de Ana" is the sentence the professional
// needs; a bare UUID is not an answer to who was accessed.
func (h *Handler) resolvePatientNames(ctx context.Context, orgID string, items []auditlog.Entry) {
	cache := map[string]string{}
	for i := range items {
		id := patientRef(items[i])
		if id == "" {
			continue
		}
		name, seen := cache[id]
		if !seen {
			if p, err := h.patients.Get(ctx, orgID, id); err == nil {
				name = strings.Join(strings.Fields(strings.Join([]string{
					p.FirstName, p.PaternalLastName, p.MaternalLastName,
				}, " ")), " ")
			}
			cache[id] = name
		}
		items[i].PatientID = &id
		items[i].PatientName = name
	}
}

// patientRef returns the patient this entry is about: either the row itself
// (resource_type "patient") or the patient behind the clinical record.
func patientRef(e auditlog.Entry) string {
	if e.PatientID != nil && *e.PatientID != "" {
		return *e.PatientID
	}
	if e.ResourceType == "patient" && e.ResourceID != nil {
		return *e.ResourceID
	}
	return ""
}

func parseDateRange(rawFrom, rawTo string) (from, to string, err error) {
	for _, f := range []struct {
		name string
		raw  string
		dst  *string
	}{{"from", rawFrom, &from}, {"to", rawTo, &to}} {
		v := strings.TrimSpace(f.raw)
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

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}
