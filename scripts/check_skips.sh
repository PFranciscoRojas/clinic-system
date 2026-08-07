#!/usr/bin/env bash
#
# The skip ratchet.
#
# There is exactly one way to make a red suite green that nobody notices: turn
# the test off. `t.Skip`, `it.skip`, `xit`, `@pytest.mark.skip`, a commented-out
# assertion — the build goes green and the guarantee is gone, and the diff that
# did it looks like a one-line cleanup.
#
# So the count is pinned. Adding a skip requires raising the number in
# skip-budget.txt in the same commit, which puts it in the diff where somebody
# reads it. Removing skips lowers the ceiling automatically — a skip you paid
# off cannot be spent again.
#
# Usage:
#   scripts/check_skips.sh          check
#   scripts/check_skips.sh --bump   record the current count
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_FILE="$REPO_ROOT/skip-budget.txt"

cd "$REPO_ROOT"

# Only our own code. Installed and generated trees are full of other people's
# tests: `pip install pytest` into services/ai-service/.venv dropped a dozen
# files matching test_*.py and moved the count from 1 to 2 without a line of
# ours changing. A ratchet that reacts to `npm ci` is a ratchet nobody trusts.
EXCLUDE=(--exclude-dir=.venv --exclude-dir=venv --exclude-dir=node_modules
         --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build
         --exclude-dir=.git --exclude-dir=__pycache__)

# `grep -c` exits 1 on no match, and every count feeds arithmetic, so each one
# is normalised to a bare integer.
count() { local n; n=$( "$@" 2>/dev/null | wc -l ); echo "${n//[^0-9]/}"; }

# skipIfShort is not a skip in this sense: it is how the integration suite says
# "this needs Docker", and it is the mechanism the coverage ratchet runs on.
go_skips() {
  grep -rn "${EXCLUDE[@]}" --include='*_test.go' -E '\bt\.Skip(Now|f)?\(' services/ \
    | grep -v skipIfShort
}

count_go=$(count go_skips)
count_ts=$(count grep -rn "${EXCLUDE[@]}" \
  --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' --include='*.spec.tsx' \
  -E '\b(it|test|describe)\.(skip|todo)\b|\bxit\(|\bxdescribe\(' services/frontend/src)
count_py=$(count grep -rn "${EXCLUDE[@]}" --include='test_*.py' --include='*_test.py' \
  -E '@pytest\.mark\.(skip|xfail)|pytest\.skip\(' services/ai-service)

total=$(( count_go + count_ts + count_py ))

if [[ "${1:-}" == "--bump" ]]; then
  printf '%s\n' \
    "# Number of skipped/disabled tests across the repo." \
    "# Raising this is a decision. Record why in the commit message." \
    "# Rewrite with: scripts/check_skips.sh --bump" \
    "$total" > "$BUDGET_FILE"
  echo "==> skip budget set to $total (go $count_go, ts $count_ts, py $count_py)"
  exit 0
fi

budget=$(grep -v '^#' "$BUDGET_FILE" | tr -d '[:space:]')

echo "==> skipped tests: $total (go $count_go, ts $count_ts, py $count_py) — budget $budget"

if [[ "$total" -gt "$budget" ]]; then
  cat >&2 <<EOF

MORE TESTS ARE SKIPPED THAN BEFORE: $total > $budget

A test was turned off. That is not a way to make the build pass — a skipped
test is a guarantee that silently stopped being checked, and the commit that
adds one looks like a cleanup.

If the test is wrong, fix it or delete it and say so. If it genuinely has to be
skipped, raise the budget in the same commit and put the reason in the message:

  scripts/check_skips.sh --bump

Where they are:
EOF
  go_skips >&2 || true
  grep -rn "${EXCLUDE[@]}" \
    --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' --include='*.spec.tsx' \
    -E '\b(it|test|describe)\.(skip|todo)\b|\bxit\(|\bxdescribe\(' services/frontend/src >&2 || true
  grep -rn "${EXCLUDE[@]}" --include='test_*.py' --include='*_test.py' \
    -E '@pytest\.mark\.(skip|xfail)|pytest\.skip\(' services/ai-service >&2 || true
  exit 1
fi

if [[ "$total" -lt "$budget" ]]; then
  cat >&2 <<EOF

BUDGET IS STALE: only $total skips left, budget still allows $budget.

A skip was paid off. Lock it in so the allowance cannot be spent again:

  scripts/check_skips.sh --bump
EOF
  exit 1
fi

echo "==> skip ratchet ok"
