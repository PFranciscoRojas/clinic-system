package legal

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type LegalDoc struct {
	DocType     string  `json:"doc_type"`
	Version     string  `json:"version"`
	BodyMD      string  `json:"body_md"`
	PublishedAt string  `json:"published_at"`
	UpdatedBy   *string `json:"updated_by,omitempty"`
}

// GET /api/v1/legal/documents/{type}  (public, no auth)
func (h *Handler) getDocument(w http.ResponseWriter, r *http.Request) {
	docType := chi.URLParam(r, "type")
	if docType != "terms" && docType != "privacy" && docType != "dpa" {
		httputil.WriteError(w, http.StatusNotFound, "document not found")
		return
	}

	var doc LegalDoc
	err := h.db.QueryRow(context.Background(), `
		SELECT doc_type, version, body_md, published_at::text, updated_by::text
		FROM legal_documents
		WHERE doc_type = $1 AND is_current
	`, docType).Scan(&doc.DocType, &doc.Version, &doc.BodyMD, &doc.PublishedAt, &doc.UpdatedBy)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "document not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, doc)
}

// PUT /api/v1/admin/legal/{type}  (SYSTEM_ADMIN only)
func (h *Handler) publishDocument(w http.ResponseWriter, r *http.Request) {
	docType := chi.URLParam(r, "type")
	if docType != "terms" && docType != "privacy" && docType != "dpa" {
		httputil.WriteError(w, http.StatusBadRequest, "invalid doc_type")
		return
	}

	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		Version string `json:"version"`
		BodyMD  string `json:"body_md"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Version == "" || body.BodyMD == "" {
		httputil.WriteError(w, http.StatusBadRequest, "version and body_md are required")
		return
	}

	tx, err := h.db.Begin(context.Background())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(context.Background()) //nolint:errcheck

	_, err = tx.Exec(context.Background(), `
		UPDATE legal_documents SET is_current = false
		WHERE doc_type = $1 AND is_current
	`, docType)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}

	_, err = tx.Exec(context.Background(), `
		INSERT INTO legal_documents (doc_type, version, body_md, is_current, updated_by)
		VALUES ($1, $2, $3, true, $4::uuid)
	`, docType, body.Version, body.BodyMD, claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := tx.Commit(context.Background()); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"doc_type": docType, "version": body.Version})
}

func (h *Handler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/v1/legal/documents/{type}", h.getDocument)
}

func (h *Handler) RegisterAdminRoutes(r chi.Router) {
	r.Put("/api/v1/admin/legal/{type}", h.publishDocument)
}
