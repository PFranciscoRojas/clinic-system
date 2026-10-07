#!/usr/bin/env bash
#
# Every path an AGENTS.md cites in backticks must exist.
#
# The agent instruction files are the first thing any agent reads, and the
# previous CLAUDE.md drifted for two months without anything failing: it sent
# agents to pages/Invoicing/ and lib/auth.ts, which no longer existed, and
# described the search hash as plain SHA-256 after it became an HMAC. Prose
# cannot be checked, but paths can, and a wrong path is the first sign that the
# prose around it is stale too.
#
# A backtick token counts as a path when it contains a slash or ends in a known
# source extension, and has no placeholder characters (<, >, *, {, }, $, space).
# It is resolved against the AGENTS.md's own directory first, then the repo root.
#
#   ./scripts/check_agents_md.sh            # every AGENTS.md in the repo
#   ./scripts/check_agents_md.sh FILE...    # only these
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  mapfile -t FILES < <(git ls-files --cached --others --exclude-standard -- 'AGENTS.md' '**/AGENTS.md')
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "no AGENTS.md found" >&2
  exit 1
fi

missing=0
checked=0
for f in "${FILES[@]}"; do
  dir="$(dirname "$f")"
  while IFS= read -r token; do
    case "$token" in
      *'<'*|*'>'*|*'*'*|*'{'*|*'}'*|*'$'*|*' '*|http*|~*|-*) continue ;;
    esac
    if [[ "$token" != */* && ! "$token" =~ \.(md|go|ts|tsx|py|sh|sql|yml|yaml|toml|txt|json)$ ]]; then
      continue
    fi
    checked=$((checked + 1))
    if [[ -e "$dir/$token" || -e "$token" ]]; then
      continue
    fi
    echo "$f: \`$token\` does not exist"
    missing=$((missing + 1))
  done < <(grep -o '`[^`]*`' "$f" | tr -d '`')
done

if [[ $missing -gt 0 ]]; then
  echo
  echo "$missing path(s) cited in AGENTS.md no longer exist. Fix the file, not this check."
  exit 1
fi
echo "$checked paths cited in ${#FILES[@]} AGENTS.md file(s), all present"
