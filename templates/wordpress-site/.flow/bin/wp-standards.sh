#!/usr/bin/env bash
# wp-standards.sh — PHPCS against WordPress-Coding-Standards.
#
# WPCS is not a style opinion here. Its WordPress.Security sniffs encode
# the escaping/sanitizing/nonce rules that wp-security.py checks
# structurally, and its WordPress.DB sniffs catch prepare() misuse this
# repo's own scanner would miss. Style and safety arrive together;
# taking both is cheaper than arguing about it.
#
#   wp-standards.sh [base-ref]
#
# Setup, once, in the site repo:
#   composer require --dev wp-coding-standards/wpcs \
#       dealerdirect/phpcodesniffer-composer-installer
GATE=wp-standards
source "$(dirname "$0")/tool.sh"

PHPCS="${PHPCS:-vendor/bin/phpcs}"
if [ ! -x "$PHPCS" ]; then
  echo "FAIL  [wp-standards]  $PHPCS not found — cannot check coding standards."
  echo "FAIL  [wp-standards]  install: composer require --dev wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer"
  echo "FAIL  [wp-standards]  a gate that cannot run does not pass."
  exit 1
fi

base="${1:-}"
files=$(changed_files php "$base")
if [ -z "$files" ]; then
  echo "ok    [wp-standards]  no PHP files in scope"
  exit 0
fi

# .phpcs.xml in the site repo is the standard; the ruleset lives with
# the project, not with this gate.
if ! out=$(echo "$files" | xargs "$PHPCS" --report=summary 2>&1); then
  echo "$out" | sed 's/^/FAIL  [wp-standards]  /'
  exit 1
fi
echo "ok    [wp-standards]  $(echo "$files" | wc -l | tr -d ' ') file(s) meet the ruleset"
