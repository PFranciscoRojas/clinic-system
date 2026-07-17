package service

import (
	"context"
	"encoding/json"
	"sort"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/clinicalrecords"
)

// minorSimilarity splits "minor" edits from full rewrites of a section.
const minorSimilarity = 0.7

// levenshteinCap bounds the DP cost on pathological inputs; sections longer
// than this are compared on their first levenshteinCap runes.
const levenshteinCap = 2000

// ComputeFeedback classifies, per section key, how the professional's final
// version differs from the AI draft. Pure function over the two plaintext
// section maps that coexist only during the approve request — the result
// carries template keys and numbers, never clinical text.
func ComputeFeedback(draft, final map[string]any) aidrafts.DraftFeedback {
	keys := map[string]bool{}
	for k := range draft {
		keys[k] = true
	}
	for k := range final {
		keys[k] = true
	}

	var fb aidrafts.DraftFeedback
	for k := range keys {
		dv, dok := draft[k]
		fv, fok := final[k]
		if dok && clinicalrecords.IsEmptySection(dv) {
			dok = false
		}
		if fok && clinicalrecords.IsEmptySection(fv) {
			fok = false
		}
		if !dok && !fok {
			continue
		}

		d := detailFor(k, dv, dok, fv, fok)
		switch d.Change {
		case aidrafts.ChangeUnchanged:
			fb.FieldsUnchanged++
		case aidrafts.ChangeMinor:
			fb.FieldsMinor++
		case aidrafts.ChangeRewritten:
			fb.FieldsRewritten++
		case aidrafts.ChangeAdded:
			fb.FieldsAdded++
		case aidrafts.ChangeRemoved:
			fb.FieldsRemoved++
		}
		fb.FieldsTotal++
		fb.FieldDetail = append(fb.FieldDetail, d)
	}

	// Map iteration order is random; keep the stored detail deterministic.
	sort.Slice(fb.FieldDetail, func(i, j int) bool { return fb.FieldDetail[i].Key < fb.FieldDetail[j].Key })
	return fb
}

func detailFor(key string, dv any, dok bool, fv any, fok bool) aidrafts.FieldFeedback {
	before := normalizeSection(dv, dok)
	after := normalizeSection(fv, fok)
	d := aidrafts.FieldFeedback{Key: key, LenBefore: len([]rune(before)), LenAfter: len([]rune(after))}
	switch {
	case !dok:
		d.Change = aidrafts.ChangeAdded
	case !fok:
		d.Change = aidrafts.ChangeRemoved
	case before == after:
		d.Change = aidrafts.ChangeUnchanged
		d.Similarity = 1
	default:
		d.Similarity = similarity(before, after)
		if d.Similarity >= minorSimilarity {
			d.Change = aidrafts.ChangeMinor
		} else {
			d.Change = aidrafts.ChangeRewritten
		}
	}
	return d
}

// normalizeSection renders a heterogeneous section value (string for the
// integrated format; arrays/objects/numbers for custom-template widgets) as a
// comparable string. encoding/json marshals map keys sorted, so equal objects
// normalize equally.
func normalizeSection(v any, ok bool) string {
	if !ok || v == nil {
		return ""
	}
	if s, isStr := v.(string); isStr {
		return s
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func similarity(a, b string) float64 {
	ra, rb := []rune(a), []rune(b)
	if len(ra) > levenshteinCap {
		ra = ra[:levenshteinCap]
	}
	if len(rb) > levenshteinCap {
		rb = rb[:levenshteinCap]
	}
	maxLen := len(ra)
	if len(rb) > maxLen {
		maxLen = len(rb)
	}
	if maxLen == 0 {
		return 1
	}
	return 1 - float64(levenshtein(ra, rb))/float64(maxLen)
}

// levenshtein is the classic two-row DP edit distance over runes.
func levenshtein(a, b []rune) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}
	prev := make([]int, len(b)+1)
	curr := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		curr[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min3(prev[j]+1, curr[j-1]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[len(b)]
}

func min3(a, b, c int) int {
	if b < a {
		a = b
	}
	if c < a {
		a = c
	}
	return a
}

// SaveFeedback persists one approval's edit metrics. Idempotent per draft.
func (s *Service) SaveFeedback(ctx context.Context, fb aidrafts.DraftFeedback) error {
	return s.repo.InsertFeedback(ctx, fb)
}

// FeedbackStats returns the tenant's aggregate edit metrics.
func (s *Service) FeedbackStats(ctx context.Context, orgID string, rng aidrafts.StatsRange) (*aidrafts.FeedbackStats, error) {
	return s.repo.FeedbackStats(ctx, orgID, rng)
}
