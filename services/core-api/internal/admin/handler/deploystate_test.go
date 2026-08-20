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

// ── versión y asunto ────────────────────────────────────────────────────────

func TestDeployStateReadsVersionAndSubject(t *testing.T) {
	d := parseDeployState(
		"1787000000|green|bcfc0b5|blue|639aa2d|running",
		"1787000000|green|bcfc0b5|v0.9.4|feat(ops): la consola dice qué se desplegó\n",
	)
	if d.ActiveVersion != "v0.9.4" {
		t.Errorf("ActiveVersion = %q, want v0.9.4", d.ActiveVersion)
	}
	if d.ActiveSubject != "feat(ops): la consola dice qué se desplegó" {
		t.Errorf("ActiveSubject = %q", d.ActiveSubject)
	}
}

// Un asunto puede traer el separador. Si la línea se partiera por ahí, el
// historial mostraría fragmentos justo cuando alguien lo lee para decidir a qué
// volver.
func TestDeployStateSubjectKeepsItsSeparators(t *testing.T) {
	d := parseDeployState("", "1787000000|blue|aaa111|v1.0.0|fix: a | b | c\n")
	if len(d.History) != 1 {
		t.Fatalf("got %d entries, want 1", len(d.History))
	}
	if d.History[0].Subject != "fix: a | b | c" {
		t.Errorf("Subject = %q, want the whole thing", d.History[0].Subject)
	}
}

// Las líneas escritas antes de que existieran estos campos tienen que seguir
// leyéndose: el historial es de solo añadir y no se reescribe.
func TestDeployStateOldLinesStillParse(t *testing.T) {
	d := parseDeployState("", "1787000000|blue|aaa111\n1787000100|green|bbb222|v0.9.5|feat: algo\n")
	if len(d.History) != 2 {
		t.Fatalf("got %d entries, want 2", len(d.History))
	}
	if d.History[1].Version != "" || d.History[1].Subject != "" {
		t.Errorf("una línea vieja no debe inventar campos: %+v", d.History[1])
	}
	if d.History[0].Version != "v0.9.5" {
		t.Errorf("una línea nueva sí debe traerlos: %+v", d.History[0])
	}
}

// Un rollback vuelve a escribir el mismo SHA sin versión, porque la de ese build
// ya está en su línea original. La lectura tiene que encontrarla igual.
func TestDeployStateFindsVersionAcrossARollback(t *testing.T) {
	d := parseDeployState(
		"1787000200|green|bbb222|blue|aaa111|running",
		"1787000000|green|bbb222|v0.9.5|feat: la buena\n"+
			"1787000100|blue|aaa111|v0.9.6|fix: la mala\n"+
			"1787000200|green|bbb222||\n",
	)
	if d.ActiveVersion != "v0.9.5" {
		t.Errorf("ActiveVersion = %q, want v0.9.5 — la línea del rollback no trae versión y hay que buscarla más atrás", d.ActiveVersion)
	}
	if d.ActiveSubject != "feat: la buena" {
		t.Errorf("ActiveSubject = %q", d.ActiveSubject)
	}
	if d.FallbackVersion != "v0.9.6" {
		t.Errorf("FallbackVersion = %q, want v0.9.6", d.FallbackVersion)
	}
}
