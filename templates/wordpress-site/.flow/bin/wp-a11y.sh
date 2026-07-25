#!/usr/bin/env bash
# wp-a11y.sh — accessibility and markup on the rendered pages.
#
# This is the part of "design" a machine can genuinely verify, and it is
# worth having a gate for precisely because it is the part a human eye
# skips: nobody notices a missing form label by looking at a page they
# designed. Contrast, landmarks, heading order, alt text and labels are
# mechanical, and they are also the ones that turn into a legal problem
# for a client.
#
# It does NOT judge whether the design is good. That is the shake-out,
# and it stays human.
#
#   wp-a11y.sh
GATE=wp-a11y
source "$(dirname "$0")/tool.sh"
require npx "run Playwright"
require ddev "serve the site"

cd "$(dirname "$0")/.." || exit 1
if [ ! -d node_modules/@playwright ] && [ ! -d ../node_modules/@playwright ]; then
  echo "FAIL  [wp-a11y]  Playwright not installed in .flow/ — run: npm ci"
  echo "FAIL  [wp-a11y]  a gate that cannot run does not pass."
  exit 1
fi

if ! out=$(npx playwright test tests/a11y.spec.ts --reporter=line 2>&1); then
  echo "$out" | grep -E "✘|Error|expect" | head -20 | sed 's/^/FAIL  [wp-a11y]  /'
  echo "wp-a11y: see the Playwright output above"
  exit 1
fi
echo "ok    [wp-a11y]  $(echo "$out" | grep -oE '[0-9]+ passed' | head -1)"
