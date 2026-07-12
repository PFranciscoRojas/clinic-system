package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const maxAudioSize = 200 << 20 // 200 MB

// A whole-session recording (up to maxAudioSize) arriving over a slow clinic
// uplink (~2 Mbps) needs ~14 min of wall time to upload — far beyond the
// server-wide 15 s ReadTimeout that protects every other route.
const audioUploadDeadline = 20 * time.Minute

var allowedAudioExtensions = map[string]bool{
	".mp3": true, ".mp4": true, ".m4a": true,
	".wav": true, ".ogg": true, ".webm": true,
}

// POST /api/v1/appointments/{appointment_id}/audio
func (h *Handler) uploadAudio(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	// The appointment id becomes the audio filename on disk — reject anything
	// that is not a UUID before it can reach the filesystem.
	appointmentID := chi.URLParam(r, "appointment_id")
	if _, err := uuid.Parse(appointmentID); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid appointment id")
		return
	}

	// Extend this connection's deadlines before touching the body: the
	// server-wide 15 s ReadTimeout would otherwise cut a session-length
	// upload mid-body. Best-effort — a ResponseWriter that doesn't support
	// per-request deadlines (e.g. httptest) just keeps the server defaults.
	rc := http.NewResponseController(w)
	deadline := time.Now().Add(audioUploadDeadline)
	_ = rc.SetReadDeadline(deadline)
	_ = rc.SetWriteDeadline(deadline)

	// MaxBytesReader is the real size cap: ParseMultipartForm's argument only
	// bounds the in-memory portion — without this, an oversized body would
	// spool to temp files on disk without limit.
	r.Body = http.MaxBytesReader(w, r.Body, maxAudioSize)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			httputil.WriteError(w, http.StatusRequestEntityTooLarge, "audio file too large (max 200 MB)")
			return
		}
		httputil.WriteError(w, http.StatusBadRequest, "malformed multipart body")
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "audio field is required")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedAudioExtensions[ext] {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "unsupported audio format")
		return
	}

	patientID := r.FormValue("patient_id")
	if patientID == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "patient_id is required")
		return
	}

	// Shapes the AI draft to the clinical record being written in this session.
	recordType := r.FormValue("record_type")
	if recordType != "INITIAL" && recordType != "DISCHARGE" {
		recordType = "EVOLUTION"
	}
	// Optional custom template — drives the AI prompt and record section schema.
	templateID := r.FormValue("template_id")

	// Load professional's AI preferences; fall back to defaults if no profile yet
	noteStyle, tone, approach := "structured", "formal", ""
	var prefsRaw []byte
	if err := h.db.QueryRow(r.Context(), `
		SELECT COALESCE(ai_prefs, '{"note_style":"structured","tone":"formal"}'::jsonb)
		FROM professional_profiles WHERE user_id = $1
	`, claims.UserID).Scan(&prefsRaw); err == nil {
		var prefs map[string]string
		if json.Unmarshal(prefsRaw, &prefs) == nil {
			if v := prefs["note_style"]; v != "" {
				noteStyle = v
			}
			if v := prefs["tone"]; v != "" {
				tone = v
			}
			approach = prefs["approach"]
		}
	}

	filename := fmt.Sprintf("%s%s", appointmentID, ext)

	draftID, err := h.svc.UploadAudio(r.Context(), aidraftssvc.UploadAudioInput{
		OrganizationID: claims.OrganizationID,
		AppointmentID:  appointmentID,
		PatientID:      patientID,
		RequestedBy:    claims.UserID,
		RecordType:     recordType,
		TemplateID:     templateID,
		NoteStyle:      noteStyle,
		Tone:           tone,
		Approach:       approach,
		Filename:       filename,
		Audio:          file,
		AudioSize:      header.Size,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"draft_id": draftID})
}
