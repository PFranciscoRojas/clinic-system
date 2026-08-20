#!/usr/bin/env bash
#
# `make verify` — the single command that says whether the work is done.
#
# It runs the same checks the CI runs, in the same order, and nothing else. The
# point is not convenience: it is that "done" stops being a judgement call. An
# agent (or a human at 1 a.m.) cannot report a change as finished on the basis
# of the part of the suite they happened to run.
#
# Deliberately NOT parallel. When something breaks you want the first failure
# and the whole log, not eight interleaved streams.
#
# Skipping a step:
#   VERIFY_SKIP="frontend ai" make verify
# Which is allowed for a fast local loop and never for reporting work as done.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP="${VERIFY_SKIP:-}"
FAILED=()
START=$(date +%s)

step() { # step <name> <command…>
  local name="$1"; shift
  if [[ " $SKIP " == *" $name "* ]]; then
    printf '\n\033[33m── %s — skipped (VERIFY_SKIP)\033[0m\n' "$name"
    return
  fi
  printf '\n\033[1m── %s\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m   ok\033[0m\n'
  else
    printf '\033[31m   FAILED\033[0m\n'
    FAILED+=("$name")
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── core-api ────────────────────────────────────────────────────────────────
# -race, matching CI. Without it the concurrency tests pass while a data race
# goes unreported, and those tests exist precisely to trigger races.
step "api-test" bash -c 'cd services/core-api && go test -race -count=1 ./...'
step "api-vet"  bash -c 'cd services/core-api && go vet ./...'

if have staticcheck; then
  step "api-staticcheck" bash -c 'cd services/core-api && staticcheck ./...'
else
  printf '\n\033[33m── api-staticcheck — not installed\033[0m\n'
  printf '   go install honnef.co/go/tools/cmd/staticcheck@v0.7.0\n'
  FAILED+=("api-staticcheck (not installed)")
fi

step "coverage" ./scripts/check_coverage.sh

# ── frontend ────────────────────────────────────────────────────────────────
step "frontend-types" bash -c 'cd services/frontend && npx tsc --noEmit'
step "frontend-lint"  bash -c 'cd services/frontend && npm run lint'
step "frontend-test"  bash -c 'cd services/frontend && npm test'
step "bundle"         ./scripts/check_bundle_size.sh

# ── ai-service ──────────────────────────────────────────────────────────────
# The venv if there is one, the system interpreter otherwise. `python` on this
# machine is /usr/sbin/python, which has no pytest and never will: resolving the
# interpreter here is the difference between a red step you fix and a red step
# you learn to ignore.
#
# faster-whisper and its converted weights are deliberately absent — conftest.py
# stubs the module, exactly as in build-ai-service.yml. Only the test deps are
# needed:
#   services/ai-service/.venv/bin/pip install pytest pytest-asyncio pydantic-settings anthropic redis asyncpg cryptography
PY=python3
if [[ -x services/ai-service/.venv/bin/python ]]; then
  PY=.venv/bin/python
fi
step "ai-test" bash -c "cd services/ai-service && PYTHONPATH=src $PY -m pytest -q"

# ── the blind spot ──────────────────────────────────────────────────────────
# The source-scanning checks (outbound hosts, PII in logs, declared
# dependencies) already ran inside api-test; they are ordinary Go tests.
#
# The skip ratchet runs here rather than with the language steps because it is
# the one check aimed at how the previous steps were made to pass.
step "skips" ./scripts/check_skips.sh

# Fuzzing itself runs in CI, not here — it costs minutes. What runs here is the
# logic that decides whether a red fuzz run blocks a merge or gets retried,
# which is exactly the piece nobody would notice going wrong. Milliseconds.
step "fuzz-classifier" ./scripts/run_fuzz_test.sh

# Same shape, same reason: mutation testing itself runs nightly, but the logic
# that reads its output — what counts as a measurement, what counts as a hang —
# runs here. It is the piece that stayed wrong for eight nights without anybody
# noticing, because its only symptom was a number that looked fine.
step "mutation-reader" ./scripts/run_mutation_test.sh

# And once more, for the piece that only speaks when something is already wrong.
# The production monitor reaches out to the network, so what runs here is its
# reading: what it concludes from the codes that came back, and whether that
# conclusion reaches a human. Nothing else in the suite fails when a monitor
# goes quiet — that is the whole reason to test it from here.
step "monitor" ./scripts/monitor_test.sh

# And the mode of the scripts themselves. Every step above this line runs a
# .sh by path, so a script committed without its exec bit is a step that
# vanishes on any clone that did not create it — including the VPS.
step "exec-bits" ./scripts/check_exec_bits.sh

if have gitleaks; then
  step "secrets" gitleaks git . --no-banner --redact --config .gitleaks.toml
else
  printf '\n\033[33m── secrets — gitleaks not installed\033[0m\n'
  printf '   go install github.com/zricethezav/gitleaks/v8@v8.30.1\n'
fi

# Pinned to the toolchain in go.mod, which is the one CI scans and the one the
# Dockerfile builds — not whatever Go the developer happens to have installed.
#
# This is not hygiene. On 2026-08-14 this step passed locally with seven live
# standard-library vulnerabilities, because the local toolchain was newer than
# the pinned one and already carried the fixes. CI, scanning go.mod's version,
# failed. A Definition of Done that reports green on a build nobody ships is
# worse than no check at all, so the local run now scans what gets shipped.
if have govulncheck; then
  step "vulns" bash -c '
    cd services/core-api
    GOTOOLCHAIN="go$(sed -n "s/^go //p" go.mod)" govulncheck ./...'
else
  printf '\n\033[33m── vulns — govulncheck not installed\033[0m\n'
  printf '   go install golang.org/x/vuln/cmd/govulncheck@latest\n'
fi

# ── verdict ─────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START ))
printf '\n────────────────────────────────────────────────\n'
if [[ ${#FAILED[@]} -eq 0 ]]; then
  printf '\033[32mverify ok\033[0m (%ss)\n' "$ELAPSED"
  exit 0
fi
printf '\033[31mverify FAILED\033[0m (%ss): %s\n' "$ELAPSED" "${FAILED[*]}"
printf '\nThe work is not done. Fix it — do not weaken, skip or delete a test to\n'
printf 'get past this; see the Definition of Done in CLAUDE.md.\n'
exit 1
