package recordtemplates

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// knownWidgets is the set of widget names registered in services/shared/field-widgets.json.
// Keep in sync manually when adding new widgets.
//
// Only widgets whose structure a generic field type can't express are
// accepted in new template saves. The retired bespoke widgets
// (task_checklist, session_evaluation, task_adherence, functionality,
// formulation_5f, spa_history, functional_analysis, distress_scale) kept
// drifting out of sync with the AI schema — they are select/multiselect/
// scale template fields now. Archived template versions that still
// reference them keep rendering (this list only gates parsing on save).
var knownWidgets = map[string]bool{
	"mental_exam":    true,
	"risk":           true,
	"treatment_plan": true,
	"diagnoses":      true,
}

var (
	reAnnotation  = regexp.MustCompile(`\{([^}]+)\}`)
	reScale       = regexp.MustCompile(`(?i)^scale:(\d+)-(\d+)$`)
	reSelect      = regexp.MustCompile(`(?i)^select:(.+)$`)
	reMultiselect = regexp.MustCompile(`(?i)^multiselect:(.+)$`)
	reWidget      = regexp.MustCompile(`(?i)^widget:(\S+)$`)
)

// ParseMarkdown converts markdown written by a professional into a slice of
// SectionDef. Rules:
//   - Lines starting with "##" are section headings. The heading text (minus
//     annotations) becomes the label; slugify(label) becomes the key.
//   - Annotations inside {…} on the heading line control the field type:
//     {text}               → text (default)
//     {select:a|b|c}       → select with those options
//     {multiselect:a|b|c}  → multiselect (string[]) with those options
//     {scale:0-10}         → scale from 0 to 10
//     {checklist}          → checklist (string[], free text)
//     {widget:name}        → named widget from the registry
//     {required}           → marks the section as required
//     {collapsed}          → starts hidden behind an accordion (e.g. an
//                            optional, rarely-needed section the form
//                            shouldn't lead with)
//     {pills}              → for select|multiselect: render as toggle pill
//                            buttons instead of a dropdown/checkboxes
//     {allow_other}        → for multiselect: lets the professional add a
//                            free-text value beyond the fixed options
//   - Non-heading text following a heading (until the next "##" or "##") is
//     the hint/placeholder for that section.
//   - The first "# " line (single hash) is the template name if the caller
//     passes an empty name; it is not part of the schema.
//
// Returns (sections, suggestedName, error).
func ParseMarkdown(src string) (sections []SectionDef, suggestedName string, err error) {
	lines := strings.Split(src, "\n")

	var current *SectionDef
	var hintLines []string

	flush := func() {
		if current == nil {
			return
		}
		current.Hint = strings.TrimSpace(strings.Join(hintLines, " "))
		sections = append(sections, *current)
		current = nil
		hintLines = nil
	}

	for _, rawLine := range lines {
		line := strings.TrimRight(rawLine, " \t\r")

		if strings.HasPrefix(line, "## ") {
			flush()
			def, parseErr := parseHeading(strings.TrimPrefix(line, "## "))
			if parseErr != nil {
				return nil, "", parseErr
			}
			current = def
			continue
		}

		if strings.HasPrefix(line, "# ") && suggestedName == "" {
			suggestedName = strings.TrimSpace(strings.TrimPrefix(line, "# "))
			continue
		}

		if current != nil && strings.TrimSpace(line) != "" {
			hintLines = append(hintLines, strings.TrimSpace(line))
		}
	}
	flush()

	if len(sections) == 0 {
		return nil, suggestedName, ErrInvalidInput
	}
	return sections, suggestedName, nil
}

func parseHeading(raw string) (*SectionDef, error) {
	annotations := reAnnotation.FindAllString(raw, -1)
	label := strings.TrimSpace(reAnnotation.ReplaceAllString(raw, ""))
	if label == "" {
		return nil, ErrInvalidInput
	}

	def := &SectionDef{
		Key:   slugify(label),
		Label: label,
		Type:  FieldText, // default
	}

	for _, ann := range annotations {
		inner := strings.TrimSuffix(strings.TrimPrefix(ann, "{"), "}")
		inner = strings.TrimSpace(inner)
		lower := strings.ToLower(inner)

		switch {
		case lower == "required":
			def.Required = true

		case lower == "collapsed":
			def.Collapsed = true

		case lower == "pills":
			def.Display = "pills"

		case lower == "allow_other":
			def.AllowOther = true

		case lower == "text":
			def.Type = FieldText

		case lower == "checklist":
			def.Type = FieldChecklist

		case reScale.MatchString(lower):
			m := reScale.FindStringSubmatch(lower)
			mn, _ := strconv.Atoi(m[1])
			mx, _ := strconv.Atoi(m[2])
			if mn >= mx {
				return nil, fmt.Errorf("record_template: scale min must be < max in %q", raw)
			}
			def.Type = FieldScale
			def.ScaleMin = &mn
			def.ScaleMax = &mx

		case reSelect.MatchString(inner):
			m := reSelect.FindStringSubmatch(inner)
			opts := strings.Split(m[1], "|")
			for i := range opts {
				opts[i] = strings.TrimSpace(opts[i])
			}
			if len(opts) < 2 {
				return nil, fmt.Errorf("record_template: select must have at least 2 options in %q", raw)
			}
			def.Type = FieldSelect
			def.Options = opts

		case reMultiselect.MatchString(inner):
			m := reMultiselect.FindStringSubmatch(inner)
			opts := strings.Split(m[1], "|")
			for i := range opts {
				opts[i] = strings.TrimSpace(opts[i])
			}
			if len(opts) < 2 {
				return nil, fmt.Errorf("record_template: multiselect must have at least 2 options in %q", raw)
			}
			def.Type = FieldMultiselect
			def.Options = opts

		case reWidget.MatchString(lower):
			m := reWidget.FindStringSubmatch(lower)
			name := m[1]
			if !knownWidgets[name] {
				return nil, fmt.Errorf("record_template: unknown widget %q", name)
			}
			def.Type = FieldWidget
			def.Widget = name

		default:
			// Unknown annotation — ignore silently to remain forward-compatible.
		}
	}

	return def, nil
}

// slugify converts a label to a snake_case ASCII key suitable for use as a
// JSON field name and a DB column equivalent. Non-ascii runes are dropped.
func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	prev := '_'
	for _, r := range s {
		if unicode.IsLetter(r) && r <= unicode.MaxASCII {
			b.WriteRune(r)
			prev = r
		} else if unicode.IsDigit(r) {
			b.WriteRune(r)
			prev = r
		} else {
			// Replace any run of non-word runes with a single underscore.
			if prev != '_' {
				b.WriteRune('_')
				prev = '_'
			}
		}
	}
	result := strings.Trim(b.String(), "_")
	if result == "" {
		return "section"
	}
	return result
}
