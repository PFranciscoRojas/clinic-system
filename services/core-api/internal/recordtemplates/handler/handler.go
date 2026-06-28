package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/recordtemplates"
	rtrepo "sghcp/core-api/internal/recordtemplates/repository"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// Handler serves the record-template API endpoints.
type Handler struct {
	repo recordtemplates.Repository
}

// New wires the handler. The pool is used for unscoped lookups; tenant-scoped
// queries use the querier injected by TenantScope middleware.
func New(pool *pgxpool.Pool) *Handler {
	return &Handler{repo: rtrepo.New(pool)}
}

// Routes mounts all record-template endpoints at /api/v1/record-templates.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Preview — parse markdown without saving (for live preview in the UI).
	r.With(middleware.RequirePermission("record_templates:read")).
		Post("/parse", h.parsePreview)

	r.With(middleware.RequirePermission("record_templates:read")).
		Get("/", h.list)

	r.With(middleware.RequirePermission("record_templates:create")).
		Post("/", h.create)

	r.With(middleware.RequirePermission("record_templates:read")).
		Get("/{id}", h.get)

	r.With(middleware.RequirePermission("record_templates:update")).
		Put("/{id}", h.update)

	r.With(middleware.RequirePermission("record_templates:archive")).
		Post("/{id}/archive", h.archive)

	r.With(middleware.RequirePermission("record_templates:update")).
		Post("/{id}/default", h.setDefault)

	return r
}

// POST /api/v1/record-templates/parse — preview without persisting.
func (h *Handler) parsePreview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Markdown string `json:"markdown"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(body.Markdown) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "markdown is required")
		return
	}
	sections, name, err := recordtemplates.ParseMarkdown(body.Markdown)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"suggested_name": name,
		"sections":       sections,
	})
}

// GET /api/v1/record-templates
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	rt := r.URL.Query().Get("record_type")
	items, err := h.repo.List(r.Context(), claims.OrganizationID, rt, false)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, t := range items {
		out = append(out, templateJSON(t))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

// POST /api/v1/record-templates
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		Name       string `json:"name"`
		RecordType string `json:"record_type"`
		Markdown   string `json:"markdown"`
		IsDefault  bool   `json:"is_default"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !validRecordType(body.RecordType) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid record_type")
		return
	}
	sections, suggestedName, err := recordtemplates.ParseMarkdown(body.Markdown)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = suggestedName
	}
	if name == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required (or add a # heading to the markdown)")
		return
	}

	t, err := h.repo.Create(r.Context(), recordtemplates.CreateParams{
		OrganizationID: claims.OrganizationID,
		Name:           name,
		RecordType:     body.RecordType,
		SourceMarkdown: body.Markdown,
		Schema:         sections,
		IsDefault:      body.IsDefault,
		CreatedBy:      claims.UserID,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, templateJSON(t))
}

// GET /api/v1/record-templates/{id}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")
	t, err := h.repo.Get(r.Context(), claims.OrganizationID, id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, templateJSON(t))
}

// PUT /api/v1/record-templates/{id}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var body struct {
		Name     string `json:"name"`
		Markdown string `json:"markdown"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	sections, suggestedName, err := recordtemplates.ParseMarkdown(body.Markdown)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = suggestedName
	}
	if name == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	t, err := h.repo.Update(r.Context(), id, claims.OrganizationID, name, body.Markdown, sections)
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, templateJSON(t))
}

// POST /api/v1/record-templates/{id}/archive
func (h *Handler) archive(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.repo.Archive(r.Context(), id, claims.OrganizationID); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/record-templates/{id}/default
func (h *Handler) setDefault(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")

	// Load the template to know its record_type.
	t, err := h.repo.Get(r.Context(), claims.OrganizationID, id)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := h.repo.SetDefault(r.Context(), id, claims.OrganizationID, t.RecordType); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"id": id})
}

func templateJSON(t *recordtemplates.Template) map[string]any {
	return map[string]any{
		"id":              t.ID,
		"name":            t.Name,
		"record_type":     t.RecordType,
		"source_markdown": t.SourceMarkdown,
		"schema":          t.Schema,
		"version":         t.Version,
		"status":          t.Status,
		"is_default":      t.IsDefault,
		"created_by":      t.CreatedBy,
		"created_at":      t.CreatedAt,
		"updated_at":      t.UpdatedAt,
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch err {
	case recordtemplates.ErrNotFound:
		httputil.WriteError(w, http.StatusNotFound, "record template not found")
	case recordtemplates.ErrInvalidInput:
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid template")
	default:
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
	}
}

// validRecordType checks that the type is one of the existing values.
func validRecordType(rt string) bool {
	switch rt {
	case "INITIAL", "EVOLUTION", "DISCHARGE":
		return true
	}
	return false
}
