package handler

import (
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

	// Shapes the AI draft to the clinical record being written in this session
	recordType := r.FormValue("record_type")
	if recordType != "INITIAL" && recordType != "DISCHARGE" {
		recordType = "EVOLUTION"
	}

	filename := fmt.Sprintf("%s%s", appointmentID, ext)

	draftID, err := h.svc.UploadAudio(r.Context(), aidraftssvc.UploadAudioInput{
		OrganizationID: claims.OrganizationID,
		AppointmentID:  appointmentID,
		PatientID:      patientID,
		RequestedBy:    claims.UserID,
		RecordType:     recordType,
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
