# Feature review: week-tile-cap

Reviewed: origin/main..4eb4217 (worktable, no plan). The bounded change answers Stefan's words of 2026-10-26: "the agenda on the dashboard has the same issue".
Reviewer (2026-10-26, opus): code reviewer (superpowers requesting-code-review). No threat model and no invariants doc, so none was needed.

## Blocking
None.

## Should fix (fixed)
1. The tile still grew on a full day, while the code and the test said it didn't. Fixed: every day of the strip now has room for TILE_FIT lines (`--fit` drives its min-height), so a full day and a quiet one are equally tall. The TILE_FIT comment says why the number is fixed rather than measured.
2. The e2e height bound did not prove the claim. Fixed:
   - the baseline is measured after the bars draw;
   - a full day must equal the quiet height within 1px;
   - a 13th row must leave the height unchanged while "+N meer" counts one more.

## Note
3. The extraction preserves the month view.
4. `Day<T>` leaves keys to its callers; both callers key their lines.
5. `.nv-cal__more` is styled inside the tile.
6. Narrow widths add no overflow; the popover fits at 375px.
7. TILE_FIT = 5 matches the Vandaag list beside the tile.
8. The duplicate `.nv-cal__day .nv-week-tile__bar` selector is deliberate: the second rule holds the popover-only properties.
9. No domain words appear in apps/grid.

## Added on this branch
The drawer's site lines now wrap a long path or address (Stefan, 2026-10-26: a Studio-plugin installeren drawer ran off the screen). `.nv-dw-list__main` gets `minmax(0, 1fr)` and `overflow-wrap: anywhere`. Proven by the drawer-line-wraps flow: RED without the CSS (the line ran past the drawer's edge), GREEN with it.

Findings: 0 Blocking · 2 Should fix · 7 Note
