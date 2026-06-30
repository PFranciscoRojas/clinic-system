package clinicalrecords

import (
	"testing"
	"time"
)

func validEvolutionSections() map[string]any {
	return map[string]any{
		"session_development": "worked on cognitive restructuring",
		"plan_tasks":          "thought record for next session",
	}
}

func TestValidateTemplateV2(t *testing.T) {
	cases := []struct {
		name     string
		rt       RecordType
		sections map[string]any
		risk     RiskLevel
		reason   DischargeReason
		wantErr  error
	}{
		{
			name:     "valid evolution",
			rt:       RecordTypeEvolution,
			sections: validEvolutionSections(),
			risk:     RiskNone,
		},
		{
			name: "valid initial",
			rt:   RecordTypeInitial,
			sections: map[string]any{
				"consultation_reason": "anxiety at work",
				"current_problem":     "six months of insomnia",
				"mental_exam":         map[string]any{"affect": map[string]any{"status": "ALTERED", "note": "anxious"}},
				"initial_plan":        "weekly CBT",
			},
			risk: RiskIdeation,
		},
		{
			name: "valid discharge",
			rt:   RecordTypeDischarge,
			sections: map[string]any{
				"discharge_summary": "12 sessions completed",
				"final_state":       "symptoms remitted",
			},
			risk:   RiskNone,
			reason: DischargeTherapeutic,
		},
		{
			name:     "missing risk",
			rt:       RecordTypeEvolution,
			sections: validEvolutionSections(),
			risk:     "",
			wantErr:  ErrRiskRequired,
		},
		{
			name:     "invalid risk value",
			rt:       RecordTypeEvolution,
			sections: validEvolutionSections(),
			risk:     "HIGH",
			wantErr:  ErrRiskRequired,
		},
		{
			// plan_tasks is now optional; session_development alone satisfies the template.
			name:     "session_development alone is valid",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"session_development": "x"},
			risk:     RiskNone,
			wantErr:  nil,
		},
		{
			// empty plan_tasks is fine when task_checklist is used instead.
			name:     "empty optional plan_tasks accepted",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"session_development": "x", "plan_tasks": ""},
			risk:     RiskNone,
			wantErr:  nil,
		},
		{
			// task_checklist (array) is an accepted optional key.
			name: "task_checklist array accepted",
			rt:   RecordTypeEvolution,
			sections: map[string]any{
				"session_development": "CBT session",
				"task_checklist":      []any{"autorregistro_abc", "respiracion_diafragmatica"},
			},
			risk:    RiskNone,
			wantErr: nil,
		},
		{
			// required section missing.
			name:     "missing required section",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"plan_tasks": "x"},
			risk:     RiskNone,
			wantErr:  ErrMissingSection,
		},
		{
			// required section empty.
			name:     "empty required section",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"session_development": ""},
			risk:     RiskNone,
			wantErr:  ErrMissingSection,
		},
		{
			name:     "unknown section key rejected",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"session_development": "x", "not_a_real_section": "leftover"},
			risk:     RiskNone,
			wantErr:  ErrInvalidInput,
		},
		{
			name: "discharge without reason",
			rt:   RecordTypeDischarge,
			sections: map[string]any{
				"discharge_summary": "x",
				"final_state":       "y",
			},
			risk:    RiskNone,
			wantErr: ErrInvalidInput,
		},
		{
			name:     "non-discharge with reason rejected",
			rt:       RecordTypeEvolution,
			sections: validEvolutionSections(),
			risk:     RiskNone,
			reason:   DischargeDropout,
			wantErr:  ErrInvalidInput,
		},
		{
			name:     "interconsultation has no v2 template",
			rt:       RecordTypeInterconsultation,
			sections: map[string]any{"anything": "x"},
			risk:     RiskNone,
			wantErr:  ErrInvalidInput,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateTemplateV2(tc.rt, tc.sections, tc.risk, tc.reason)
			if err != tc.wantErr {
				t.Fatalf("got %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestValidateTemplateV2Lenient(t *testing.T) {
	cases := []struct {
		name     string
		rt       RecordType
		sections map[string]any
		wantErr  error
	}{
		{
			name:     "empty sections accepted — no required-field check",
			rt:       RecordTypeEvolution,
			sections: map[string]any{},
			wantErr:  nil,
		},
		{
			name:     "partial sections accepted",
			rt:       RecordTypeInitial,
			sections: map[string]any{"consultation_reason": "still typing"},
			wantErr:  nil,
		},
		{
			name:     "unknown section key still rejected",
			rt:       RecordTypeEvolution,
			sections: map[string]any{"not_a_real_section": "x"},
			wantErr:  ErrInvalidInput,
		},
		{
			name:     "interconsultation has no v2 template",
			rt:       RecordTypeInterconsultation,
			sections: map[string]any{},
			wantErr:  ErrInvalidInput,
		},
		{
			name:     "discharge with no reason accepted — lenient skips it",
			rt:       RecordTypeDischarge,
			sections: map[string]any{"discharge_summary": "draft"},
			wantErr:  nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateTemplateV2Lenient(tc.rt, tc.sections)
			if err != tc.wantErr {
				t.Fatalf("got %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestProcessDatesHasOpenProcess(t *testing.T) {
	d1 := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 3, 5, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name      string
		initial   *time.Time
		discharge *time.Time
		want      bool
	}{
		{"no records", nil, nil, false},
		{"initial only", &d1, nil, true},
		{"closed process", &d1, &d2, false},
		{"reopened after discharge", &d2, &d1, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := ProcessDates{LastInitial: tc.initial, LastDischarge: tc.discharge}
			if got := p.HasOpenProcess(); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
