package recordtemplates

import (
	"errors"
	"time"
)

// TemplateStatus maps the template_status ENUM.
type TemplateStatus string

const (
	StatusActive   TemplateStatus = "ACTIVE"
	StatusArchived TemplateStatus = "ARCHIVED"
)

// FieldType describes the kind of input a section expects.
type FieldType string

const (
	FieldText      FieldType = "text"
	FieldSelect    FieldType = "select"
	FieldScale     FieldType = "scale"
	FieldChecklist FieldType = "checklist"
	FieldWidget    FieldType = "widget"
)

// SectionDef is one parsed section from the template markdown.
// It mirrors the JSON rows stored in clinical_record_templates.schema.
type SectionDef struct {
	Key       string    `json:"key"`
	Label     string    `json:"label"`
	Hint      string    `json:"hint,omitempty"`
	Required  bool      `json:"required"`
	Type      FieldType `json:"type"`
	Options   []string  `json:"options,omitempty"`    // for type=select
	ScaleMin  *int      `json:"scale_min,omitempty"`  // for type=scale
	ScaleMax  *int      `json:"scale_max,omitempty"`  // for type=scale
	Widget    string    `json:"widget,omitempty"`     // for type=widget (name in field-widgets.json)
}

// Template is the domain entity for a clinical-record template.
type Template struct {
	ID             string
	OrganizationID string
	Name           string
	RecordType     string // matches clinicalrecords.RecordType values
	SourceMarkdown string
	Schema         []SectionDef
	Version        int
	Status         TemplateStatus
	IsDefault      bool
	CreatedBy      string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// CreateParams is the input for persisting a new template.
type CreateParams struct {
	OrganizationID string
	Name           string
	RecordType     string
	SourceMarkdown string
	Schema         []SectionDef
	IsDefault      bool
	CreatedBy      string
}

var (
	ErrNotFound      = errors.New("record_template: not found")
	ErrInvalidInput  = errors.New("record_template: invalid input")
	ErrAlreadyActive = errors.New("record_template: template already active")
)
