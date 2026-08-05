package handler

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/consents"
	consentsrepo "sghcp/core-api/internal/consents/repository"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	repo       consents.Repository
	km         *crypto.KeyManager
	audit      *audit.Writer
	notifier   notify.Notifier
	appBaseURL string
	pool       *pgxpool.Pool
}

func New(db *pgxpool.Pool, km *crypto.KeyManager, notifier notify.Notifier, appBaseURL string) *Handler {
	return &Handler{
		repo:       consentsrepo.New(db),
		km:         km,
		audit:      audit.New(db),
		notifier:   notifier,
		appBaseURL: strings.TrimRight(appBaseURL, "/"),
		pool:       db,
	}
}

// consentTokenOrg maps a sign-token hash to its organization via the SECURITY
// DEFINER resolver (bypassing RLS — the token is the credential), so the public
// remote-signature flow can pin the org's RLS scope before reading the now
// RLS-protected consent_sign_tokens / consent_templates / patients tables.
func (h *Handler) consentTokenOrg(ctx context.Context, tokenHash string) (string, error) {
	var org pgtype.Text
	if err := h.pool.QueryRow(ctx, `SELECT consent_token_org($1)::text`, tokenHash).Scan(&org); err != nil {
		return "", err
	}
	return org.String, nil
}

// Routes is mounted at /api/v1/patients/{patient_id}/consents.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/", h.list)
	r.With(middleware.RequirePermission("consents:create")).Post("/sign", h.signInOffice)
	r.With(middleware.RequirePermission("consents:create")).Post("/upload", h.upload)
	r.With(middleware.RequirePermission("consents:create")).Post("/send-link", h.sendLink)
	return r
}

// OrgRoutes is mounted at /api/v1/consents (operations by consent id).
func (h *Handler) OrgRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/{id}/document", h.document)
	r.With(middleware.RequirePermission("consents:update")).Post("/{id}/revoke", h.revoke)
	return r
}

// TemplateRoutes is mounted at /api/v1/consent-templates.
func (h *Handler) TemplateRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/", h.listTemplates)
	r.With(middleware.RequirePermission("consents:update")).Put("/{type}", h.updateTemplate)
	return r
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return fmt.Sprintf("%x", sum[:])
}

// createSigned seals the template snapshot, the drawn signature and the
// acceptance evidence with a fresh DEK and inserts the consent row.
// Shared by the in-office and the remote (public token) flows.
func (h *Handler) createSigned(ctx context.Context, orgID, patientID, staffID string, tpl *consents.Template, signaturePNG, channel, ip, userAgent string) (string, error) {
	plainDEK, encDEK, keySource, err := h.km.GenerateDEK()
	if err != nil {
		return "", fmt.Errorf("generate dek: %w", err)
	}
	defer crypto.Zeroize(plainDEK)

	dekID, err := h.repo.CreateEncKey(ctx, encDEK, keySource)
	if err != nil {
		return "", err
	}

	docBytes := []byte(tpl.Title + "\n\n" + tpl.Body)
	docEnc, err := crypto.Seal(plainDEK, docBytes)
	if err != nil {
		return "", fmt.Errorf("seal document: %w", err)
	}
	sigEnc, err := crypto.Seal(plainDEK, []byte(signaturePNG))
	if err != nil {
		return "", fmt.Errorf("seal signature: %w", err)
	}
	evEnc, err := crypto.Seal(plainDEK, consents.BuildEvidence(time.Now(), channel, ip, userAgent))
	if err != nil {
		return "", fmt.Errorf("seal evidence: %w", err)
	}

	return h.repo.Create(ctx, consents.CreateParams{
		OrganizationID:       orgID,
		PatientID:            patientID,
		StaffID:              staffID,
		DEKID:                dekID,
		ConsentType:          tpl.ConsentType,
		SigningMethod:        "DIGITAL",
		DocumentEnc:          docEnc,
		DocumentTemplateHash: sha256Hex(docBytes),
		SignatureEnc:         sigEnc,
		EvidenceEnc:          evEnc,
		TemplateID:           tpl.ID,
		SignedAt:             time.Now(),
	})
}

// POST /api/v1/patients/{patient_id}/consents/sign
func (h *Handler) signInOffice(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		ConsentType  string `json:"consent_type"`
		Accepted     bool   `json:"accepted"`
		SignaturePNG string `json:"signature_png"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := consents.ValidateSignature(body.Accepted, body.SignaturePNG); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	tpl, err := h.repo.GetActiveTemplate(r.Context(), claims.OrganizationID, consents.ConsentType(body.ConsentType))
	if err != nil {
		writeErr(w, err)
		return
	}

	id, err := h.createSigned(r.Context(), claims.OrganizationID, patientID, claims.UserID,
		tpl, body.SignaturePNG, consents.ChannelInOffice, httputil.ClientIP(r), r.UserAgent())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.Record(r, "CONSENT_SIGN", "consent", id)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// POST /api/v1/patients/{patient_id}/consents/upload  (multipart: consent_type, signed_at, file)
func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	if err := r.ParseMultipartForm(11 << 20); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	consentType := r.FormValue("consent_type")
	if consentType == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "consent_type is required")
		return
	}
	signedAt := time.Now()
	if v := r.FormValue("signed_at"); v != "" {
		if d, err := time.Parse("2006-01-02", v); err == nil {
			signedAt = d
		}
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "file is required")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 11<<20))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	contentType := http.DetectContentType(data[:min(len(data), 512)])
	if err := consents.ValidateUpload(contentType, int64(len(data))); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	fileType := map[string]string{
		"application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG",
	}[contentType]

	tpl, err := h.repo.GetActiveTemplate(r.Context(), claims.OrganizationID, consents.ConsentType(consentType))
	if err != nil {
		writeErr(w, err)
		return
	}

	plainDEK, encDEK, keySource, err := h.km.GenerateDEK()
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer crypto.Zeroize(plainDEK)

	dekID, err := h.repo.CreateEncKey(r.Context(), encDEK, keySource)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	docBytes := []byte(tpl.Title + "\n\n" + tpl.Body)
	docEnc, err := crypto.Seal(plainDEK, docBytes)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	scanEnc, err := crypto.Seal(plainDEK, data)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	evEnc, err := crypto.Seal(plainDEK, consents.BuildEvidence(time.Now(), consents.ChannelInOffice, httputil.ClientIP(r), r.UserAgent()))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	id, err := h.repo.Create(r.Context(), consents.CreateParams{
		OrganizationID:       claims.OrganizationID,
		PatientID:            patientID,
		StaffID:              claims.UserID,
		DEKID:                dekID,
		ConsentType:          consents.ConsentType(consentType),
		SigningMethod:        "PHYSICAL_SCAN",
		DocumentEnc:          docEnc,
		DocumentTemplateHash: sha256Hex(docBytes),
		ScanFileEnc:          scanEnc,
		ScanFileType:         fileType,
		EvidenceEnc:          evEnc,
		TemplateID:           tpl.ID,
		SignedAt:             signedAt,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.Record(r, "CONSENT_UPLOAD", "consent", id)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// POST /api/v1/patients/{patient_id}/consents/send-link
func (h *Handler) sendLink(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		ConsentType string `json:"consent_type"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	tpl, err := h.repo.GetActiveTemplate(r.Context(), claims.OrganizationID, consents.ConsentType(body.ConsentType))
	if err != nil {
		writeErr(w, err)
		return
	}

	email, firstName, err := h.patientContact(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		writeErr(w, err)
		return
	}
	if email == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "patient has no email on file")
		return
	}

	token, err := consents.NewSignToken()
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	expiresAt := time.Now().Add(consents.TokenTTL())
	if _, err := h.repo.CreateSignToken(r.Context(), consents.SignToken{
		OrganizationID: claims.OrganizationID,
		PatientID:      patientID,
		ConsentType:    consents.ConsentType(body.ConsentType),
		TemplateID:     tpl.ID,
		TokenHash:      consents.HashToken(token),
		CreatedBy:      claims.UserID,
		ExpiresAt:      expiresAt,
	}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	link := h.appBaseURL + "/sign/" + token
	go h.notifier.ConsentSignLink(context.Background(), email, notify.ConsentLinkDetails{
		OrgID:            claims.OrganizationID,
		PatientFirstName: firstName,
		ConsentTitle:     tpl.Title,
		Link:             link,
	})

	h.audit.Record(r, "CONSENT_SEND_LINK", "patient", patientID)
	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"expires_at": expiresAt.Format(time.RFC3339)})
}

// patientContact decrypts the patient's email and first name with their DEK.
func (h *Handler) patientContact(ctx context.Context, orgID, patientID string) (email, firstName string, err error) {
	emailEnc, firstNameEnc, dek, err := h.repo.PatientContact(ctx, orgID, patientID)
	if err != nil {
		return "", "", err
	}
	plainDEK, err := h.km.DecryptDEK(dek.KeySource, dek.EncryptedDEK)
	if err != nil {
		return "", "", err
	}
	defer crypto.Zeroize(plainDEK)

	if len(emailEnc) > 0 {
		if b, err := crypto.Open(plainDEK, emailEnc); err == nil {
			email = string(b)
		}
	}
	if len(firstNameEnc) > 0 {
		if b, err := crypto.Open(plainDEK, firstNameEnc); err == nil {
			firstName = string(b)
		}
	}
	return email, firstName, nil
}

// GET /api/v1/consents/{id}/document
func (h *Handler) document(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	consentID := chi.URLParam(r, "id")

	doc, err := h.repo.GetDocument(r.Context(), claims.OrganizationID, consentID)
	if err != nil {
		writeErr(w, err)
		return
	}
	plainDEK, err := h.km.DecryptDEK(doc.DEK.KeySource, doc.DEK.EncryptedDEK)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer crypto.Zeroize(plainDEK)

	out := map[string]any{
		"id":             doc.ID,
		"patient_id":     doc.PatientID,
		"consent_type":   doc.ConsentType,
		"signing_method": doc.SigningMethod,
		"signed_at":      doc.SignedAt.Format(time.RFC3339),
		"revoked_at":     doc.RevokedAt,
		"template_id":    doc.TemplateID,
	}
	if b, err := crypto.Open(plainDEK, doc.DocumentEnc); err == nil {
		out["document_text"] = string(b)
	}
	if len(doc.SignatureEnc) > 0 {
		if b, err := crypto.Open(plainDEK, doc.SignatureEnc); err == nil {
			out["signature_png"] = string(b)
		}
	}
	if len(doc.ScanFileEnc) > 0 {
		if b, err := crypto.Open(plainDEK, doc.ScanFileEnc); err == nil {
			out["scan_file_base64"] = base64.StdEncoding.EncodeToString(b)
			out["scan_file_type"] = doc.ScanFileType
		}
	}
	if len(doc.EvidenceEnc) > 0 {
		if b, err := crypto.Open(plainDEK, doc.EvidenceEnc); err == nil {
			out["evidence"] = string(b)
		}
	}

	h.audit.Record(r, "CONSENT_VIEW_DOCUMENT", "consent", doc.ID)
	httputil.WriteJSON(w, http.StatusOK, out)
}

// POST /api/v1/consents/{id}/revoke
func (h *Handler) revoke(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	consentID := chi.URLParam(r, "id")

	var body struct {
		Reason string `json:"reason"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "reason is required")
		return
	}

	if err := h.repo.Revoke(r.Context(), claims.OrganizationID, consentID, body.Reason); err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "CONSENT_REVOKE", "consent", consentID)
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/consent-templates
func (h *Handler) listTemplates(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	items, err := h.repo.ListActiveTemplates(r.Context(), claims.OrganizationID)
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

// PUT /api/v1/consent-templates/{type}
func (h *Handler) updateTemplate(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	consentType := chi.URLParam(r, "type")

	switch consents.ConsentType(consentType) {
	case consents.ConsentTypeTreatment, consents.ConsentTypeRecording,
		consents.ConsentTypeDataProcessing, consents.ConsentTypeInformationSharing:
	default:
		httputil.WriteError(w, http.StatusUnprocessableEntity, "unknown consent type")
		return
	}

	var body struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(body.Title) == "" || strings.TrimSpace(body.Body) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "title and body are required")
		return
	}

	t, err := h.repo.CreateTemplateVersion(r.Context(), claims.OrganizationID,
		consents.ConsentType(consentType), body.Title, body.Body, claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.Record(r, "CONSENT_TEMPLATE_UPDATE", "consent_template", t.ID)
	httputil.WriteJSON(w, http.StatusOK, templateJSON(t))
}

// GET /api/v1/patients/{patient_id}/consents
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	items, err := h.repo.List(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Record(r, "CONSENT_LIST", "patient", patientID)

	out := make([]map[string]any, 0, len(items))
	for _, c := range items {
		out = append(out, map[string]any{
			"id":             c.ID,
			"patient_id":     c.PatientID,
			"staff_id":       c.StaffID,
			"consent_type":   c.ConsentType,
			"signing_method": c.SigningMethod,
			"signed_at":      c.SignedAt.Format("2006-01-02"),
			"valid_until":    c.ValidUntil,
			"revoked_at":     c.RevokedAt,
			"created_at":     c.CreatedAt,
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func templateJSON(t *consents.Template) map[string]any {
	return map[string]any{
		"id":           t.ID,
		"consent_type": t.ConsentType,
		"version":      t.Version,
		"title":        t.Title,
		"body":         t.Body,
		"created_at":   t.CreatedAt,
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch err {
	case consents.ErrNotFound:
		httputil.WriteError(w, http.StatusNotFound, "not found")
	case consents.ErrTemplateNotFound:
		httputil.WriteError(w, http.StatusNotFound, "consent template not found")
	default:
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
	}
}
