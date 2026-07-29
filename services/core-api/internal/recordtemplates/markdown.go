package recordtemplates

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// Widget fields are fully retired from new template saves (migration 000067
// converted every ACTIVE template): the bespoke widgets kept drifting out of
// sync with the AI schema, mental_exam is expressible with generic
// select/multiselect fields, risk_level is a fixed system control of the
// record form (not template content), and diagnoses/treatment_plan live in
// the patient profile panels. Archived template versions that still
// reference a widget keep rendering — FieldWidget stays in the model and
// this parser only gates *saving*.

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
//     {widget:name}        → rejected (retired since migration 000067; archived schemas may still contain widget sections)
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

	// A hint that still carries a "##" marker means headings were jammed onto
	// one line and every field after the first was silently absorbed as hint
	// text instead of becoming its own field. That is how Marcela's intake
	// template ended up with seven fields buried in one description, so this
	// fails closed rather than storing a template that looks nothing like what
	// the professional wrote.
	var flushErr error
	flush := func() {
		if current == nil {
			return
		}
		current.Hint = strings.TrimSpace(strings.Join(hintLines, " "))
		if flushErr == nil && strings.Contains(current.Hint, "##") {
			flushErr = fmt.Errorf("record_template: the description of %q contains a %q marker — each field needs its own line", current.Label, "##")
		}
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

	if flushErr != nil {
		return nil, "", flushErr
	}
	if len(sections) == 0 {
		return nil, suggestedName, ErrInvalidInput
	}

	// Two fields whose labels slugify to the same key are indistinguishable
	// from there on. The record payload is a map keyed by SectionDef.Key
	// (clinicalrecords/service/create.go builds its whitelist from it), so the
	// professional fills both fields and only one value survives — and the PDF
	// then prints that one value under both headings. Fail closed, the same way
	// this parser already refuses headings jammed onto one line: a template
	// that silently drops clinical text is worse than one that will not save.
	//
	// Only reachable at save time — ParseMarkdown is called from the create /
	// preview / update handlers, never when loading a stored schema — so this
	// cannot break templates that already exist.
	seenKeys := make(map[string]string, len(sections))
	for _, s := range sections {
		if prev, dup := seenKeys[s.Key]; dup {
			return nil, "", fmt.Errorf(
				"record_template: %q and %q both become the field %q — give them distinct names",
				prev, s.Label, s.Key)
		}
		seenKeys[s.Key] = s.Label
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
			return nil, fmt.Errorf("record_template: widget %q is retired — use generic field types (select/multiselect/scale/checklist/text)", m[1])

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
		// The ASCII bound applies to digits too. It used to guard only the
		// letter branch, so unicode.IsDigit let non-ASCII digits through —
		// "۴" (U+06F4) became the key "۴", contradicting both this function's
		// contract and the letter branch right above. Found by fuzzing; no
		// stored template was affected.
		if unicode.IsLetter(r) && r <= unicode.MaxASCII {
			b.WriteRune(r)
			prev = r
		} else if unicode.IsDigit(r) && r <= unicode.MaxASCII {
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
