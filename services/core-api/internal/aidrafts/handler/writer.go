package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const maxAudioSize = 200 << 20 // 200 MB

var allowedAudioExtensions = map[string]bool{
	".mp3": true, ".mp4": true, ".m4a": true,
	".wav": true, ".ogg": true, ".webm": true,
}

// POST /api/v1/appointments/{appointment_id}/audio
func (h *Handler) uploadAudio(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	appointmentID := chi.URLParam(r, "appointment_id")

	if err := r.ParseMultipartForm(maxAudioSize); err != nil {
		httputil.WriteError(w, http.StatusRequestEntityTooLarge, "audio file too large (max 200 MB)")
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
	noteStyle, tone := "structured", "formal"
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
