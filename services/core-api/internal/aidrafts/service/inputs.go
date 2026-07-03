package service

import "io"

type UploadAudioInput struct {
	OrganizationID string
	AppointmentID  string
	PatientID      string
	RequestedBy    string
	RecordType     string
	// TemplateID is optional. When set the AI worker uses the custom template
	// schema to build the Claude prompt instead of the hardcoded section list.
	TemplateID string
	NoteStyle  string
	Tone       string
	// Approach is the professional's therapeutic approach (ai_prefs.approach);
	// it orients the AI's wording, never the section schema.
	Approach  string
	Filename  string
	Audio     io.Reader
	AudioSize int64
}
