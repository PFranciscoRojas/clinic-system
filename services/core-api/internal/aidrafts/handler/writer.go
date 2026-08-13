package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
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

// aiPrefs reads the professional's AI preferences, falling back to the defaults
// when there is no profile yet. Shared by both ways audio reaches the pipeline:
// the whole-body upload and the parts upload's completion.
func (h *Handler) aiPrefs(ctx context.Context, userID string) (noteStyle, tone, approach string) {
	noteStyle, tone, approach = "structured", "formal", ""
	var prefsRaw []byte
	if err := h.db.QueryRow(ctx, `
		SELECT COALESCE(ai_prefs, '{"note_style":"structured","tone":"formal"}'::jsonb)
		FROM professional_profiles WHERE user_id = $1
	`, userID).Scan(&prefsRaw); err != nil {
		return noteStyle, tone, approach
	}
	var prefs map[string]string
	if json.Unmarshal(prefsRaw, &prefs) != nil {
		return noteStyle, tone, approach
	}
	if v := prefs["note_style"]; v != "" {
		noteStyle = v
	}
	if v := prefs["tone"]; v != "" {
		tone = v
	}
	return noteStyle, tone, prefs["approach"]
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
	// server-wide 15 s ReadTimeout would otherwise cut a session-length upload
	// mid-body.
	//
	// This used to be documented as best-effort, on the theory that a writer
	// without per-request deadlines "just keeps the server defaults". That
	// reading is what hid the bug: keeping the server defaults is not a
	// degraded mode here, it is a broken upload.
	rc := http.NewResponseController(w)
	deadline := time.Now().Add(audioUploadDeadline)
	// These errors used to be discarded, and that is the whole reason the
	// failure below shipped: ResponseController returns ErrNotSupported the
	// moment any middleware wraps the ResponseWriter without an Unwrap method,
	// and the upload then dies at the server's 15 s ReadTimeout with a
	// "malformed multipart body" 400 that names neither the deadline nor the
	// wrapper. Logging it costs nothing and turns a silent breakage into a line
	// that says what happened.
	if err := rc.SetReadDeadline(deadline); err != nil {
		slog.Error("audio upload cannot extend its read deadline; uploads slower than the server ReadTimeout will fail",
			"err", err, "appointment_id", appointmentID)
	}
	if err := rc.SetWriteDeadline(deadline); err != nil {
		slog.Error("audio upload cannot extend its write deadline",
			"err", err, "appointment_id", appointmentID)
	}

	// This route is exempt from the router's 30 s context timeout (it would
	// expire while the body is still arriving) — bound it here instead.
	ctx, cancel := context.WithDeadline(r.Context(), deadline)
	defer cancel()
	r = r.WithContext(ctx)

	// Start the upload clock before the first byte of the body is read.
	// ParseMultipartForm blocks until the whole multipart body has arrived, so
	// this timestamp plus the moment the file lands on disk is the wall time the
	// professional actually spends staring at the progress bar.
	uploadStartedAt := time.Now()

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

	noteStyle, tone, approach := h.aiPrefs(r.Context(), claims.UserID)

	draftID, err := h.svc.UploadAudio(r.Context(), aidraftssvc.UploadAudioInput{
		OrganizationID:  claims.OrganizationID,
		AppointmentID:   appointmentID,
		PatientID:       patientID,
		RequestedBy:     claims.UserID,
		RecordType:      recordType,
		TemplateID:      templateID,
		NoteStyle:       noteStyle,
		Tone:            tone,
		Approach:        approach,
		Ext:             ext,
		Audio:           file,
		AudioSize:       header.Size,
		UploadStartedAt: uploadStartedAt,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"draft_id": draftID})
}
