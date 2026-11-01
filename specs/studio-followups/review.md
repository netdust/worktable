# Review: fix/studio-followups

Reviewed a38c834..2ad022f (code reviewer, opus, 2026-10-26). Verdict: with fixes. No plan (bounded change, chat design).

## Important (fixed RED→GREEN)
1. Grid.tsx:361-362 — the dock's "viewed" record came from the `drawer` id, not the drawer on screen; a row that left the sheet kept its waiting line hidden with no drawer open. Fixed: derived from the rendered `open`/`related`. Test: Grid.test.tsx "tells the dock which record it shows, and lets go once that row leaves the sheet" (RED: last call was the record, not null).
2. seed-days.test.ts — restoring an unset TZ stored "undefined" and left Europe/Brussels for later files. Fixed: restore to 'UTC'.

## Minor
3. Dashboard wiring of `viewing` has no own test (deferred; e2e covers Grid's related drawer).
4. queries.test.ts local `daysAgo` (24h blocks) shared the new helper's name: renamed `blocksAgo`. The agenda test's `morgen` stays JS-computed (deferred).
5. columns.ts:219 inherited width replaced the header width: now `Math.max`. Range columns are labelled "Tijd", unaffected.
6. The width test restates the formula (kept as a guard).
7. The ", " join is ambiguous for lines ending in a comma (accepted).
8. Wider defaults also widen XLSX export columns (expected).
9. A reappearing waiting line is announced again by the live region (accepted).
