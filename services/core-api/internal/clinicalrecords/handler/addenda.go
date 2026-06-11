package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// POST /api/v1/clinical-records/{id}/addenda
func (h *Handler) addAddendum(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	id, err := h.svc.AddAddendum(r.Context(), claims.OrganizationID, recordID, claims.UserID, body.Content)
	if err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_ADDENDUM", "clinical_record", recordID)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /api/v1/clinical-records/{id}/addenda
func (h *Handler) listAddenda(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	addenda, err := h.svc.ListAddenda(r.Context(), claims.OrganizationID, recordID)
	if err != nil {
		writeErr(w, err)
		return
	}

	items := make([]map[string]any, 0, len(addenda))
	for _, a := range addenda {
		items = append(items, addendumResponse(a))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func addendumResponse(a *clinicalrecords.Addendum) map[string]any {
	return map[string]any{
		"id":          a.ID,
		"record_id":   a.RecordID,
		"created_by":  a.CreatedBy,
		"author_name": a.AuthorName,
		"content":     a.Content,
		"created_at":  a.CreatedAt,
	}
}
