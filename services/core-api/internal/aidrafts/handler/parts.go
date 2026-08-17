package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// The session recording, uploaded while it is still being recorded.
//
// Neither of these routes is exempt from the server's ordinary timeouts, and
// that is the point rather than an oversight. The single-shot route needs a
// 20-minute deadline and a bespoke exemption in the router because it carries a
// whole session over a clinic uplink; one part is a few hundred kilobytes and
// fits in the same 15 s every other route lives with. The bespoke exemption is
// the kind of thing that breaks quietly — it already did once, when a
// ResponseWriter without Unwrap turned the deadline into a silent 400.
//
// It also puts each request under Cloudflare's 100 MB body limit, which is one
// of the two reasons the DNS is still on grey cloud.

// maxPartSize bounds a single part's body. The recorder sends ~60 s of 24 kbps
// Opus, so ~180 KB; 8 MB is room for a client that batches differently without
// being room for anything strange. The total across parts is capped separately
// by the service, which is the limit that actually matters.
const maxPartSize = 8 << 20

// maxCompleteSize bounds the completion request, which carries a handful of form
// fields and no file at all.
const maxCompleteSize = 64 << 10

// POST /api/v1/appointments/{appointment_id}/audio/parts
func (h *Handler) uploadAudioPart(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	appointmentID := chi.URLParam(r, "appointment_id")
	if _, err := uuid.Parse(appointmentID); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid appointment id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPartSize)
	if err := r.ParseMultipartForm(maxPartSize); err != nil {
		httputil.WriteError(w, http.StatusRequestEntityTooLarge, "audio part too large")
		return
	}

	index, err := strconv.Atoi(r.FormValue("index"))
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "index is required")
		return
	}

	file, _, err := r.FormFile("part")
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "part field is required")
		return
	}
	defer file.Close()

	if err := h.svc.AppendPart(r.Context(), aidraftssvc.AppendPartInput{
		OrganizationID: claims.OrganizationID,
		AppointmentID:  appointmentID,
		UploadID:       r.FormValue("upload_id"),
		Index:          index,
		Part:           file,
	}); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/appointments/{appointment_id}/audio/complete
//
// Ends an upload that arrived in parts: assembles the take and enqueues the
// draft, which is everything the single-shot route does once its body has
// landed. No file in this request — the audio is already on disk.
func (h *Handler) completeAudioUpload(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	appointmentID := chi.URLParam(r, "appointment_id")
	if _, err := uuid.Parse(appointmentID); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid appointment id")
		return
	}
	// No ParseForm here, deliberately. It does not parse a multipart body but
	// does set r.Form, and FormValue below only reaches into the multipart when
	// r.Form is still nil — so calling it first would leave every field empty
	// for exactly the clients that send FormData, which is all of them.
	r.Body = http.MaxBytesReader(w, r.Body, maxCompleteSize)

	patientID := r.FormValue("patient_id")
	if patientID == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "patient_id is required")
		return
	}

	// The extension decides how ffmpeg reads the file downstream, so it goes
	// through the same allowlist as a picked file rather than being assumed to
	// be whatever the recorder happens to produce today.
	ext := strings.ToLower(r.FormValue("ext"))
	if ext == "" {
		ext = ".webm"
	}
	if !allowedAudioExtensions[ext] {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "unsupported audio format")
		return
	}

	recordType := r.FormValue("record_type")
	if recordType != "INITIAL" && recordType != "DISCHARGE" {
		recordType = "EVOLUTION"
	}

	noteStyle, tone, approach := h.aiPrefs(r.Context(), claims.UserID)

	draftID, err := h.svc.UploadAudio(r.Context(), aidraftssvc.UploadAudioInput{
		OrganizationID: claims.OrganizationID,
		AppointmentID:  appointmentID,
		PatientID:      patientID,
		RequestedBy:    claims.UserID,
		RecordType:     recordType,
		TemplateID:     r.FormValue("template_id"),
		NoteStyle:      noteStyle,
		Tone:           tone,
		Approach:       approach,
		Ext:            ext,
		UploadID:       r.FormValue("upload_id"),
		// Deliberately not measured. UploadMS is the time the professional spends
		// watching a progress bar, and for a parts upload that number is the last
		// part plus this request — the rest travelled while they were still in
		// the room. Recording the assembly time here instead would quietly
		// rewrite the latency baseline this whole plan is measured against.
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"draft_id": draftID})
}
