package handler

import "fmt"

// TherapeuticApproaches is the closed catalog for ai_prefs.approach. It shapes
// how the AI writes treatment-plan proposals, recaps and draft wording; keys
// must stay in sync with the Python worker (_APPROACH_INSTRUCTIONS) and the
// Settings UI selector. Empty string = not set (approach-neutral behaviour).
var TherapeuticApproaches = map[string]bool{
	"cbt":           true, // terapia cognitivo-conductual
	"humanistic":    true,
	"psychodynamic": true,
	"systemic":      true,
	"gestalt":       true,
	"act":           true, // aceptación y compromiso
	"dbt":           true, // dialéctico-conductual
	"integrative":   true,
}

// aiPrefsAllowed whitelists every ai_prefs key with its accepted values
// (nil = free-form string). Fail-closed: an unknown key or value is rejected
// so a typo can never silently disable a preference.
var aiPrefsAllowed = map[string]map[string]bool{
	"note_style":  {"structured": true, "narrative": true},
	"tone":        {"formal": true, "neutral": true, "plain": true},
	"approach":    TherapeuticApproaches,
	"data_retain": nil,
}

func validateAIPrefs(prefs map[string]any) error {
	for k, v := range prefs {
		values, ok := aiPrefsAllowed[k]
		if !ok {
			return fmt.Errorf("ai_prefs: unknown key %q", k)
		}
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("ai_prefs: %q must be a string", k)
		}
		if values != nil && s != "" && !values[s] {
			return fmt.Errorf("ai_prefs: invalid value %q for %q", s, k)
		}
	}
	return nil
}
