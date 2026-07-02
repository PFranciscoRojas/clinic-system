package aidrafts

import (
	"testing"

	"sghcp/core-api/internal/clinicalrecords"
)

// Every key the AI is asked to generate must survive the template-v2
// validation on approve — otherwise the content would be generated, shown,
// and then rejected (or silently dropped) when creating the record.
func TestIntegratedPromptSchemaKeysAreValid(t *testing.T) {
	for rt, sections := range IntegratedPromptSchema {
		allowed := clinicalrecords.AllowedSectionKeys(clinicalrecords.RecordType(rt))
		if allowed == nil {
			t.Fatalf("record type %s has a prompt schema but no template-v2 whitelist", rt)
		}
		for _, sec := range sections {
			if !allowed[sec.Key] {
				t.Errorf("%s: prompt section %q is not in the template-v2 whitelist", rt, sec.Key)
			}
			if sec.Hint == "" || sec.Type == "" {
				t.Errorf("%s: prompt section %q needs a type and a hint", rt, sec.Key)
			}
		}
	}
}

// The required sections of each record type must be in the prompt schema —
// a draft that never fills them could not be approved without manual edits.
func TestIntegratedPromptSchemaCoversRequiredSections(t *testing.T) {
	required := map[string][]string{
		"INITIAL":   {"consultation_reason", "current_problem"}, // mental_exam is a widget the professional fills
		"EVOLUTION": {"session_development"},
		"DISCHARGE": {"discharge_summary", "final_state"},
	}
	for rt, keys := range required {
		have := make(map[string]bool)
		for _, sec := range IntegratedPromptSchema[rt] {
			have[sec.Key] = true
		}
		for _, k := range keys {
			if !have[k] {
				t.Errorf("%s: required section %q missing from prompt schema", rt, k)
			}
		}
	}
}
