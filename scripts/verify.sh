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

if have gitleaks; then
  step "secrets" gitleaks git . --no-banner --redact --config .gitleaks.toml
else
  printf '\n\033[33m── secrets — gitleaks not installed\033[0m\n'
  printf '   go install github.com/zricethezav/gitleaks/v8@v8.30.1\n'
fi

if have govulncheck; then
  step "vulns" bash -c 'cd services/core-api && govulncheck ./...'
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
