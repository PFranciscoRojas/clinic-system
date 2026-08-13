package service

import (
	"io"
	"time"
)

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
	Approach string
	// Ext is the audio file extension including the dot (".webm"), already
	// checked against the handler's allowlist. The filename itself is minted
	// here, not by the caller: every take of a session needs its own file, and
	// letting the caller name it is what used to make two takes collide.
	Ext       string
	Audio     io.Reader
	AudioSize int64
	// UploadID names an upload that arrived in parts during the session. When
	// set, Audio is ignored and the take is assembled from the parts already on
	// disk. Empty means the whole body came in this one request, which is how
	// the manual file-picker upload still works.
	UploadID string
	// UploadStartedAt is when the handler began reading the request body, used
	// to record how long the audio took to arrive. The zero value means the
	// caller did not measure, and the column stays NULL — "no medido" and "tardó
	// 0 ms" have to stay distinguishable in the data.
	UploadStartedAt time.Time
}
