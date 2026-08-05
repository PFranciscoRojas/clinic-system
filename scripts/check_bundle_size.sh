#!/usr/bin/env bash
#
# Bundle-size budget for the frontend.
#
# The clinics this serves work over Colombian mobile links; a bundle that grows
# a megabyte does not show up as a failing test, it shows up as a consulting
# room where the app "takes forever to open". Nothing else in CI would notice,
# because a heavier bundle is still a correct bundle.
#
# Same shape as the coverage ratchet, and for the same reason: a budget nobody
# updates stops meaning anything, so drifting too far BELOW the budget fails
# too and asks you to bump it down. That is what makes the ceiling fall as the
# app gets lighter instead of only ever rising.
#
# Usage:
#   scripts/check_bundle_size.sh          check (builds first)
#   scripts/check_bundle_size.sh --bump   rewrite the budget to what was built
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$REPO_ROOT/services/frontend"
BUDGET_FILE="$FRONTEND/bundle-budget.txt"

# How far under budget the build may sit before we ask for a bump down. It has
# to be comfortably wider than the 10 % headroom --bump leaves, or setting the
# budget would immediately report it as stale.
SLACK_PCT="${BUNDLE_SLACK_PCT:-20}"

BUMP=0
[[ "${1:-}" == "--bump" ]] && BUMP=1

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> npm run build (frontend)"
  (cd "$FRONTEND" && npm run build >/dev/null)
fi

DIST="$FRONTEND/dist"
if [[ ! -d "$DIST" ]]; then
  echo "no dist/ — nothing was built" >&2
  exit 1
fi

# Gzipped, because that is what crosses the wire. Caddy serves the assets with
# `encode gzip zstd`, so the raw byte count on disk is not what anyone waits for.
total=0
while IFS= read -r -d '' f; do
  size=$(gzip -c "$f" | wc -c)
  total=$((total + size))
done < <(find "$DIST/assets" -type f \( -name '*.js' -o -name '*.css' \) -print0)

if [[ "$total" -eq 0 ]]; then
  echo "measured 0 bytes of JS/CSS in $DIST/assets — the build layout changed and" >&2
  echo "this check is now measuring nothing, which would pass forever" >&2
  exit 1
fi

total_kb=$(( (total + 1023) / 1024 ))

if [[ "$BUMP" -eq 1 ]]; then
  # Round up to the next 10 kB and add 10 % headroom, so ordinary work does not
  # trip the budget on the very next commit.
  new=$(( (total_kb * 110 / 100 + 9) / 10 * 10 ))
  printf '%s\n' \
    "# Maximum gzipped size, in kB, of all JS and CSS in services/frontend/dist/assets." \
    "# Rewrite with: scripts/check_bundle_size.sh --bump" \
    "$new" > "$BUDGET_FILE"
  echo "==> budget set to ${new} kB (measured ${total_kb} kB)"
  exit 0
fi

if [[ ! -f "$BUDGET_FILE" ]]; then
  echo "no budget file at $BUDGET_FILE — run with --bump to create it" >&2
  exit 1
fi

budget=$(grep -v '^#' "$BUDGET_FILE" | tr -d '[:space:]')

echo "==> bundle: ${total_kb} kB gzipped (budget ${budget} kB)"

if [[ "$total_kb" -gt "$budget" ]]; then
  cat >&2 <<EOF

BUNDLE OVER BUDGET: ${total_kb} kB > ${budget} kB

Something got heavier. Find out what before raising the ceiling:

  cd services/frontend && npx vite build --mode production
  ls -lS dist/assets/*.js | head

A new dependency is the usual answer, and the usual fix is not importing all of
it. If the growth is genuinely wanted, raise the budget in the same commit that
causes it, so the diff says so:

  scripts/check_bundle_size.sh --bump
EOF
  exit 1
fi

floor=$(( budget * (100 - SLACK_PCT) / 100 ))
if [[ "$total_kb" -lt "$floor" ]]; then
  cat >&2 <<EOF

BUDGET IS STALE: ${total_kb} kB is more than ${SLACK_PCT}% under the ${budget} kB ceiling.

The bundle got lighter. Lock the win in, or the budget quietly allows the app
to grow back to where it was:

  scripts/check_bundle_size.sh --bump
EOF
  exit 1
fi

echo "==> bundle budget ok"
