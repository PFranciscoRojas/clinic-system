package handler

import "testing"

// readDeployState reads two files the host writes. The tests below are about the
// readings that matter when something has gone wrong, because that is when
// anybody looks at this section of the console.

func TestDeployStateMissingFilesAreNotAnError(t *testing.T) {
	// A deploy older than this feature wrote nothing, and a console that fails
	// to load because a file is absent is worse than one missing a section.
	d := parseDeployState("", "")
	if d.ActiveColour != "" || d.SwitchedAt != nil {
		t.Errorf("no state file should yield the zero value, got %+v", d)
	}
	if d.History == nil {
		t.Error("History must be an empty slice, never nil — the JSON has to say [] and not null")
	}
}

func TestDeployStateReadsTheSnapshot(t *testing.T) {
	d := parseDeployState("1787000000|green|bcfc0b5|blue|12d6fd0|running", "")
	if d.ActiveColour != "green" || d.ActiveSHA != "bcfc0b5" {
		t.Errorf("active = %s/%s, want green/bcfc0b5", d.ActiveColour, d.ActiveSHA)
	}
	if !d.FallbackRunning {
		t.Error("a running fallback must read as available")
	}
	if d.SwitchedAt == nil || d.SwitchedAt.Unix() != 1787000000 {
		t.Errorf("SwitchedAt = %v, want epoch 1787000000", d.SwitchedAt)
	}
}

// The one that protects an operator mid-incident: the previous colour has been
// retired, so the one-click rollback no longer works. Offering it anyway is
// worse than offering nothing.
func TestDeployStateRetiredFallbackIsNotAvailable(t *testing.T) {
	for _, state := range []string{"exited", "", "created", "dead"} {
		d := parseDeployState("1787000000|green|bcfc0b5|blue|12d6fd0|"+state, "")
		if d.FallbackRunning {
			t.Errorf("fallback state %q must not read as available", state)
		}
	}
}

func TestDeployStateHistoryIsNewestFirst(t *testing.T) {
	// The file grows at the end; the console reads top-down.
	d := parseDeployState("", "1787000000|blue|aaa111\n1787000100|green|bbb222\n1787000200|blue|ccc333\n")
	if len(d.History) != 3 {
		t.Fatalf("got %d entries, want 3", len(d.History))
	}
	if d.History[0].SHA != "ccc333" || d.History[2].SHA != "aaa111" {
		t.Errorf("history is not newest-first: %+v", d.History)
	}
}

func TestDeployStateSkipsUnreadableLines(t *testing.T) {
	// A truncated write must cost that one line, not the whole section.
	d := parseDeployState("", "1787000000|blue|aaa111\nbasura\n|||\n1787000200|green|ccc333\n")
	if len(d.History) != 2 {
		t.Fatalf("got %d usable entries, want 2: %+v", len(d.History), d.History)
	}
}

func TestDeployStateShortSnapshotIsIgnored(t *testing.T) {
	// Half a line is not half a state.
	d := parseDeployState("1787000000|green", "")
	if d.ActiveColour != "" {
		t.Errorf("a truncated snapshot must be ignored, got %+v", d)
	}
}
