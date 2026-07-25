#!/usr/bin/env bash
# wp-render.sh — boot the real WordPress and prove the pages render.
#
# Static analysis cannot tell you that a template fatals on a post with
# no featured image. Only requesting the page can. This gate boots the
# DDEV stack, activates the theme, requests every route in
# .flow/render-routes.txt, and fails on:
#
#   * a non-2xx/3xx status
#   * "Fatal error" / "Parse error" / "Warning:" / "Notice:" / "Deprecated:"
#     in the response body — WP_DEBUG_DISPLAY prints them into the page,
#     which is exactly how they reach a visitor
#   * new lines in wp-content/debug.log during the run — the errors that
#     do NOT print still count
#
# The debug.log delta is the important half. A warning suppressed from
# output is still a warning, and a theme that logs 400 notices per
# request is a theme that will fall over under load.
#
#   wp-render.sh [theme-slug]
GATE=wp-render
source "$(dirname "$0")/tool.sh"
require ddev "boot WordPress" "https://ddev.readthedocs.io/en/stable/#installation"
require curl "request pages"

THEME="${1:-}"
ROUTES_FILE="$(dirname "$0")/../render-routes.txt"
if [ ! -f "$ROUTES_FILE" ]; then
  echo "FAIL  [wp-render]  no route list at $ROUTES_FILE"
  echo "FAIL  [wp-render]  list the URLs that must render, one per line —"
  echo "FAIL  [wp-render]  a render gate with nothing to render proves nothing."
  exit 1
fi

ddev start >/dev/null 2>&1 || { echo "FAIL  [wp-render]  ddev start failed"; exit 1; }

# WP_DEBUG on, errors logged AND displayed: we want them findable both ways.
ddev wp config set WP_DEBUG true --raw --type=constant >/dev/null 2>&1
ddev wp config set WP_DEBUG_LOG true --raw --type=constant >/dev/null 2>&1
ddev wp config set WP_DEBUG_DISPLAY true --raw --type=constant >/dev/null 2>&1

if [ -n "$THEME" ]; then
  if ! ddev wp theme activate "$THEME" >/dev/null 2>&1; then
    echo "FAIL  [wp-render]  cannot activate theme \`$THEME\`"
    exit 1
  fi
fi

BASE=$(ddev describe -j 2>/dev/null | grep -o '"primary_url":"[^"]*"' | head -1 | cut -d'"' -f4)
BASE="${BASE:-https://localhost}"

LOG="wp-content/debug.log"
before=0
[ -f "$LOG" ] && before=$(wc -l < "$LOG" | tr -d ' ')

fails=0
count=0
while read -r route; do
  case "$route" in ""|\#*) continue ;; esac
  count=$((count + 1))
  url="${BASE}${route}"
  body=$(curl -sk -o - -w '\n__STATUS__%{http_code}' "$url" 2>/dev/null || true)
  status="${body##*__STATUS__}"
  html="${body%__STATUS__*}"

  case "$status" in
    2*|3*) ;;
    *) echo "FAIL  [wp-render]  $route -> HTTP $status"; fails=$((fails + 1)); continue ;;
  esac

  if hit=$(echo "$html" | grep -oiE "(fatal error|parse error|warning:|notice:|deprecated:)[^<]{0,90}" | head -1); then
    if [ -n "$hit" ]; then
      echo "FAIL  [wp-render]  $route renders a PHP diagnostic: $hit"
      fails=$((fails + 1))
    fi
  fi
done < "$ROUTES_FILE"

after=0
[ -f "$LOG" ] && after=$(wc -l < "$LOG" | tr -d ' ')
delta=$((after - before))
if [ "$delta" -gt 0 ]; then
  echo "FAIL  [wp-render]  $delta new line(s) in $LOG during the run:"
  tail -n "$delta" "$LOG" | head -5 | sed 's/^/FAIL  [wp-render]    /'
  fails=$((fails + 1))
fi

if [ "$fails" -gt 0 ]; then
  echo "wp-render: $count route(s), $fails failure(s)"
  exit 1
fi
echo "ok    [wp-render]  $count route(s) render clean, no new log lines"
