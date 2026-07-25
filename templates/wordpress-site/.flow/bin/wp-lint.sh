#!/usr/bin/env bash
# wp-lint.sh — PHP syntax. The cheapest gate there is, and the one that
# turns "the site is down" into "the commit did not pass".
#
#   wp-lint.sh [base-ref]
GATE=wp-lint
source "$(dirname "$0")/tool.sh"
require php "lint PHP" "ddev exec php, or apt install php-cli"

base="${1:-}"
files=$(changed_files php "$base")
if [ -z "$files" ]; then
  echo "ok    [wp-lint]  no PHP files in scope"
  exit 0
fi

fails=0
count=0
while read -r f; do
  [ -z "$f" ] && continue
  count=$((count + 1))
  if ! out=$(php -l "$f" 2>&1); then
    echo "FAIL  [wp-lint]  $(echo "$out" | head -2 | tail -1)"
    fails=$((fails + 1))
  fi
done <<< "$files"

if [ "$fails" -gt 0 ]; then
  echo "wp-lint: $count file(s), $fails with syntax errors"
  exit 1
fi
echo "ok    [wp-lint]  $count file(s) parse"
