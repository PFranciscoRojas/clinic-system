// Package auditlog reads back the trail the system has been writing since the
// first migration. Ley 1581 puts the burden of showing who accessed personal
// data on the responsable del tratamiento — the professional, not the
// processor — so that answer has to be reachable from inside the product.
package auditlog

import "time"

// Entry is one recorded action, joined with the actor and (when the action was
// about a clinical record) the patient behind it.
type Entry struct {
	ID           int64      `json:"id"`
	OccurredAt   time.Time  `json:"occurred_at"`
	Action       string     `json:"action"`
	ResourceType string     `json:"resource_type"`
	ResourceID   *string    `json:"resource_id"`
	Success      bool       `json:"success"`
	ErrorCode    *string    `json:"error_code"`
	ActorID      *string    `json:"actor_id"`
	ActorName    string     `json:"actor_name"`
	ActorRoles   []string   `json:"actor_roles"`
	ActorEmail   string     `json:"actor_email"`
	IPAddress    *string    `json:"ip_address"`
	Reason       string     `json:"reason"`
	PatientID    *string    `json:"patient_id"`
	PatientName  string     `json:"patient_name"`
	IsSelf       bool       `json:"is_self"`
	SessionDate  *time.Time `json:"session_date"`
}

// Filter scopes a read of the trail.
//
// OrgWide is the administrator's view of the whole organization. Without it a
// caller sees their own actions plus everything touching a patient on their
// treatment team, so the access log never becomes a way around the
// need-to-know rule that governs the records themselves.
type Filter struct {
	OrganizationID string
	UserID         string
	OrgWide        bool
	OnlyMine       bool
	Action         string // optional
	ResourceType   string // optional
	PatientID      string // optional
	From           string // optional, YYYY-MM-DD
	To             string // optional, YYYY-MM-DD
	Limit          int
	Offset         int
}
