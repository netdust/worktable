#!/usr/bin/env bash
# tool.sh — shared preamble for the shell gates.
#
# The rule these gates follow: A GATE THAT CANNOT RUN DOES NOT PASS.
#
# The tempting alternative is to skip with a warning when ddev or phpcs
# is missing, so the flow keeps moving on any machine. That would make
# green mean "either this was verified, or it wasn't, and you can't tell
# from here" — which is the hidden completion heuristic this whole
# system exists to refuse. A missing tool is a config problem, and
# config problems block.
#
# If you genuinely want to run without a gate, remove it from the flow
# and say so in the pack. That is a decision on the record.
set -euo pipefail

require() {
  local tool="$1" why="$2" how="${3:-}"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "FAIL  [${GATE:-gate}]  \`$tool\` not found — cannot ${why}."
    [ -n "$how" ] && echo "FAIL  [${GATE:-gate}]  install: ${how}"
    echo "FAIL  [${GATE:-gate}]  a gate that cannot run does not pass."
    exit 1
  fi
}

# Files changed against the base ref, filtered by extension. Falls back
# to the whole tree when no base is given. An unresolvable base is fatal
# — silently shrinking the diff would let committed changes escape the
# scan, which is floor-check.py's lesson learned the same way.
changed_files() {
  local ext="$1" base="${2:-}"
  if [ -z "$base" ]; then
    find wp-content/themes wp-content/plugins -name "*.${ext}" -type f 2>/dev/null || true
    return
  fi
  if ! git rev-parse --verify "$base" >/dev/null 2>&1; then
    echo "FAIL  [${GATE:-gate}]  cannot resolve base ref \`$base\`" >&2
    exit 1
  fi
  git diff --name-only "${base}...HEAD" -- "*.${ext}" | while read -r f; do
    [ -f "$f" ] && echo "$f"
  done
}
