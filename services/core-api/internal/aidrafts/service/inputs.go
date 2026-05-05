package service

import "io"

type UploadAudioInput struct {
	OrganizationID string
	AppointmentID  string
	PatientID      string
	RequestedBy    string
	Filename       string
	Audio          io.Reader
	AudioSize      int64
}
