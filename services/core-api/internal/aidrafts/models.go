package aidrafts

import "time"

type AIDraft struct {
	ID               string
	OrganizationID   string
	ClinicalRecordID string
	AppointmentID    string
	PatientID        string
	RequestedBy      string
	DEKID            string
	AudioPathEnc     []byte
	TranscriptionEnc []byte
	DraftContentEnc  []byte
	AIModelVersion   string
	WhisperModel     string
	TemplateID       string // custom record template; "" = integrated format
	Status           string
	ErrorMessage     string
	ProcessedAt      *time.Time
	ResolvedAt       *time.Time
	ResolvedBy       string
	SupersededBy     string // set when a later take on the same appointment absorbed this one
	CreatedAt        time.Time
	DeleteAfter      *time.Time
}

type CreateParams struct {
	OrganizationID string
	AppointmentID  string
	PatientID      string
	RequestedBy    string
	DEKID          string
	AudioPathEnc   []byte
	AIModelVersion string
	WhisperModel   string
	TemplateID     string // custom record template; "" = integrated format
	// UploadMS is how long the audio took to arrive and land on disk. nil when
	// the caller did not measure — the column stays NULL rather than 0.
	UploadMS *int32
	// AudioBytes is the size of the take on disk, the only measure of how long
	// the recording is that exists before the worker probes it. nil when it
	// could not be read: the ETA then treats this draft the way it treats every
	// other draft of unknown length instead of quoting it as instantaneous.
	AudioBytes *int64
}

// QueueEstimate is what the shared worker queue looks like from one draft's
// position in it. Aggregates only — see ai_queue_estimate() in migration 000076
// for why this crosses the tenant boundary and what it deliberately does not
// carry.
type QueueEstimate struct {
	// JobsAhead is how many drafts are queued or running before this one,
	// across every tenant, because the worker is shared.
	JobsAhead int
	// BytesAhead is the audio of those jobs, summed where it is known.
	BytesAhead int64
	// UnknownAhead is how many of those carry no byte count and are therefore
	// charged the default session length.
	UnknownAhead int
	// OwnBytes is this draft's audio, 0 when unknown.
	OwnBytes int64
	// P50RTF is the median real-time factor observed on this box, nil until
	// enough drafts have finished to have measured one.
	P50RTF *float64
}

// DraftMeta is the lightweight row returned by the list endpoint (no decryption).
type DraftMeta struct {
	ID               string
	Status           string
	PatientID        string
	PatientCode      *int
	AppointmentID    string
	ClinicalRecordID string
	CreatedAt        time.Time
}

// EncKeyRow is the raw row from encryption_keys used to decrypt the draft's DEK.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}

// PartialTranscript is the transcript of a recording session that is still
// being recorded — what the window jobs have got through so far, so that the
// job at "Finalizar sesión" only has the tail left. See migration 000077 for
// why it is a table of its own and not a column on AIDraft.
//
// It carries its own wrapped DEK rather than a reference to fetch later: every
// caller that has a use for the ciphertext needs the key in the same breath,
// and a second round trip for it is a second chance to get the pairing wrong.
type PartialTranscript struct {
	ID             string
	OrganizationID string
	AppointmentID  string
	UploadID       string
	DEKID          string
	// TranscriptEnc is nil until the first window finishes.
	TranscriptEnc []byte
	// CoveredParts is how many parts existed when the last window ran.
	CoveredParts int
	// CoveredMS is how many milliseconds of the session TranscriptEnc covers.
	// This is the cut point the next window starts from, not CoveredParts: a
	// window is cut at silence, which does not land on a part boundary.
	CoveredMS int64
	UpdatedAt time.Time

	// The DEK as stored, still wrapped. Open with KeyManager.DecryptDEK.
	EncryptedDEK []byte
	KeySource    string
}

// EnsurePartialParams creates the scratch row for one upload in progress. The
// DEK is minted by the caller (core-api holds the KeyManager) and stored
// wrapped, so the worker only ever has to decrypt one.
type EnsurePartialParams struct {
	OrganizationID string
	AppointmentID  string
	UploadID       string
	EncryptedDEK   []byte
	KeySource      string
}
