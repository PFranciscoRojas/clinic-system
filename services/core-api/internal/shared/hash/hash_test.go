package hash

import (
	"strings"
	"testing"
)

func initTestPepper(t *testing.T) {
	t.Helper()
	if err := Init(strings.Repeat("ab", 32)); err != nil {
		t.Fatalf("Init: %v", err)
	}
}

func contains(hashes []string, h string) bool {
	for _, x := range hashes {
		if x == h {
			return true
		}
	}
	return false
}

func TestSearchTokensAccentInsensitive(t *testing.T) {
	initTestPepper(t)

	index := SearchTokenHashes("María José", "Muñoz", "Gómez")

	// Accented, unaccented and differently-cased queries must all hit.
	for _, q := range []string{"maria", "María", "MUNOZ", "muñoz", "gómez", "gomez"} {
		qh := SearchQueryHashes(q)
		if len(qh) != 1 || !contains(index, qh[0]) {
			t.Errorf("query %q should match the index", q)
		}
	}
}

func TestSearchTokensPrefixTyping(t *testing.T) {
	initTestPepper(t)

	index := SearchTokenHashes("María", "Muñoz")

	// Typing progressively (2+ chars) must match at every step.
	for _, q := range []string{"ma", "mar", "mari", "mu", "muñ", "muno"} {
		qh := SearchQueryHashes(q)
		if len(qh) != 1 || !contains(index, qh[0]) {
			t.Errorf("prefix %q should match the index", q)
		}
	}
	// A non-prefix must not match.
	if qh := SearchQueryHashes("perez"); contains(index, qh[0]) {
		t.Error("unrelated word must not match")
	}
}

func TestSearchQueryHashesMultiWordAndShort(t *testing.T) {
	initTestPepper(t)

	if got := SearchQueryHashes("mari gome"); len(got) != 2 {
		t.Errorf("two words → two hashes, got %d", len(got))
	}
	// Single characters have no index counterpart and are dropped.
	if got := SearchQueryHashes("m"); len(got) != 0 {
		t.Errorf("1-char query must produce no hashes, got %d", len(got))
	}
	if got := SearchQueryHashes("   "); len(got) != 0 {
		t.Errorf("blank query must produce no hashes, got %d", len(got))
	}
}

func TestSearchTokenHashesDedup(t *testing.T) {
	initTestPepper(t)

	// "Ana Ana" repeats every prefix — the index must not.
	tokens := SearchTokenHashes("Ana Ana")
	seen := map[string]bool{}
	for _, h := range tokens {
		if seen[h] {
			t.Fatalf("duplicate token hash in index")
		}
		seen[h] = true
	}
}
