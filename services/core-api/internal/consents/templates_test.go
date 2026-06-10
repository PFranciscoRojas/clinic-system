package consents

import (
	"strings"
	"testing"
	"time"
)

func TestHashToken_Deterministic(t *testing.T) {
	a := HashToken("abc123")
	b := HashToken("abc123")
	if a != b || len(a) != 64 {
		t.Fatalf("expected stable 64-char hex hash, got %q / %q", a, b)
	}
	if HashToken("other") == a {
		t.Fatal("different tokens must hash differently")
	}
}

func TestNewSignToken_RandomAndLongEnough(t *testing.T) {
	tok1, err := NewSignToken()
	if err != nil {
		t.Fatal(err)
	}
	tok2, _ := NewSignToken()
	if tok1 == tok2 {
		t.Fatal("tokens must be random")
	}
	if len(tok1) < 40 { // 32 bytes base64url ≈ 43 chars
		t.Fatalf("token too short: %d", len(tok1))
	}
}

func TestValidateSignature(t *testing.T) {
	if err := ValidateSignature(true, "data:image/png;base64,iVBORw0KGgo="); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	if err := ValidateSignature(false, "data:image/png;base64,iVBORw0KGgo="); err == nil {
		t.Fatal("must reject when not accepted")
	}
	if err := ValidateSignature(true, ""); err == nil {
		t.Fatal("must reject empty signature")
	}
	if err := ValidateSignature(true, "not-a-data-url"); err == nil {
		t.Fatal("must reject non-PNG payload")
	}
	if err := ValidateSignature(true, "data:image/png;base64,"+strings.Repeat("A", 700_000)); err == nil {
		t.Fatal("must reject oversized signature (>500KB)")
	}
}

func TestValidateUpload(t *testing.T) {
	if err := ValidateUpload("application/pdf", 1024); err != nil {
		t.Fatalf("pdf rejected: %v", err)
	}
	if err := ValidateUpload("image/jpeg", 1024); err != nil {
		t.Fatal("jpeg rejected")
	}
	if err := ValidateUpload("image/png", 1024); err != nil {
		t.Fatal("png rejected")
	}
	if err := ValidateUpload("text/html", 1024); err == nil {
		t.Fatal("must reject html")
	}
	if err := ValidateUpload("application/pdf", 11*1024*1024); err == nil {
		t.Fatal("must reject >10MB")
	}
	if err := ValidateUpload("application/pdf", 0); err == nil {
		t.Fatal("must reject empty file")
	}
}

func TestBuildEvidence(t *testing.T) {
	at := time.Date(2026, 6, 9, 15, 0, 0, 0, time.UTC)
	got := BuildEvidence(at, ChannelRemoteLink, "1.2.3.4", "Mozilla/5.0")
	for _, want := range []string{`"accepted_at":"2026-06-09T15:00:00Z"`, `"channel":"REMOTE_LINK"`, `"ip":"1.2.3.4"`, `"user_agent":"Mozilla/5.0"`} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("evidence missing %s: %s", want, got)
		}
	}
}

func TestTokenUsable(t *testing.T) {
	now := time.Now()
	ok := SignToken{ExpiresAt: now.Add(time.Hour)}
	if err := ok.Usable(now); err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	expired := SignToken{ExpiresAt: now.Add(-time.Hour)}
	if err := expired.Usable(now); err != ErrTokenExpired {
		t.Fatal("expired token must return ErrTokenExpired")
	}
	usedAt := now.Add(-time.Minute)
	used := SignToken{ExpiresAt: now.Add(time.Hour), UsedAt: &usedAt}
	if err := used.Usable(now); err != ErrTokenUsed {
		t.Fatal("used token must return ErrTokenUsed")
	}
}
