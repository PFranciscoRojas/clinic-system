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
	Filename   string
	Audio      io.Reader
	AudioSize  int64
}
