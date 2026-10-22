# Shake-out: selection-actions

Driven 2026-10-22 on `feature/selection-actions` at e991993, the review's fix pass, and re-driven at b48dc7d. The shake-out adds tests, screenshots and this file, no product code. Row 17 failed at e991993; it was fixed in b48dc7d (CSS only) and re-driven there by hand: the box column, the header box and the screenshots that show the number column were retaken at b48dc7d.

The artifact is the selection fixture instance the harness boots: engine on 4314 (`packages/engine/test/fixtures/selection-domain.ts`, invented data) and the grid on 5177, signed in as the seeded editor selectie@e2e.test. Every run held the machine-wide e2e lock. The hand drives were Playwright scripts under `e2e/.tmp` (ignored, never committed), driving a real Chromium at 1440 by 900 with real mouse and keyboard events; the committed flows are in `e2e/selection.spec.ts` and `e2e/smoke/selection.spec.ts`.

Not driven, by the brief: the owner and other roles (only the editor exists on this instance; the denial tests are the integration tier's), and the 500/501 boundary with its 'Maximaal 500 tegelijk' copy (unit-covered; the fixture holds 114 members and no more were made).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | select-and-run: tick Ann and Cy, run Gather "Duo" once. One notice "Gather uitgevoerd." with Ongedaan maken, the bar and every tick gone, one bundle Duo with two ties; Undo removes the bundle and both ties. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/selection-bar.png · notice: shakeout/run-notice.png · Test: e2e/selection.spec.ts "select-and-run @e2e" |
| 2 | select-all-in-view: on "Alpha members" the header box reads "3 geselecteerd" and the run links 3; unticking Ann gives "2 geselecteerd" and an indeterminate header box. On "All members" the header box reads "114 geselecteerd" and Touch runs once on all of them. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/select-all-filtered.png · Test: e2e/selection.spec.ts "select-all-in-view @e2e" |
| 3 | run-from-drawer: Openen on Bob shows the groups Gather, Touch, Pair and Rename in the drawer; Gather "Solo" runs on that one record, the parent holds exactly Bob. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-run.png · Test: e2e/selection.spec.ts "run-from-drawer @e2e" |
| 4 | link-opens-record: on "All bundles" the drawer of a bundle lists its Ties item Bob; the item opens the tie record read-only (no textbox on the page), and the links cell removes it with its x. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-link-record.png · Test: e2e/selection.spec.ts "link-opens-record @e2e" |
| 5 | tree-hides-link-table: the rail lists Members, Roster, Bundles and Slots; Ties (listed false) is absent. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/tree-no-link-table.png · Test: e2e/selection.spec.ts "tree-hides-link-table @e2e" |
| 6 | add-from-query: + Nieuw Slots on the Roster calendar opens a dialog asking Name and Day, Day filled with today (2026-10-22); Aanmaken adds the slot, Ctrl+Z removes it. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/nieuw-calendar-dialog.png · Test: e2e/selection.spec.ts "add-from-query @e2e" |
| 7 | Mouse ticks one after another: Ann, Bob and Cy ticked with real mouse clicks at the box's own coordinates; the y of a lower row stayed 261 at every tick, and again after Selectie wissen. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/selection-bar.png · Test: e2e/selection.spec.ts "bar-reserves-its-strip @e2e" |
| 8 | Tab through a selectable table: exactly two box tab stops exist (header box, and the active row's box); Shift+Tab from the active row lands on "Bob selecteren". | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/tab-active-row-box.png · Test: e2e/selection.spec.ts "tab-stops @e2e" |
| 9 | Three-digit numbers: on "Beta members" (111 rows) the number of row 111 sits right of its box, and the cell's scrollWidth equals its clientWidth (68) at rows 1, 10, 100 and 111. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/three-digit-numbers.png · Test: e2e/selection.spec.ts "three-digit-numbers @e2e" |
| 10 | Double-click on the action button: Gather "Dbl" double-clicked once makes one bundle and one notice. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/run-notice.png · Test: e2e/selection.spec.ts "double-submit-run @e2e" |
| 11 | Empty input and Selectie wissen: with Ann ticked Gather and Pair are disabled until their inputs are given (Name; a Bundle pick); Touch, with no input, is enabled. Selectie wissen removes the bar and every tick. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/selection-bar.png · Test: e2e/selection.spec.ts "selection-clear-and-empty-input @e2e" |
| 12 | Stale id: Di and Ann ticked, Di deleted through the API, then Touch: the alert reads "Een of meer rijen bestaan niet meer; de lijst is bijgewerkt.", the Di row is gone from the re-read list (113 rows), the bar reads "1 geselecteerd", and the retry runs. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/stale-id.png · Test: e2e/selection.spec.ts "stale-id-run @e2e" |
| 13 | Mid-run refusal: Gather with the name "refused" (the fixture's tie writer refuses it) shows the alert "that note is refused", leaves no bundle and no tie behind (the whole run rolled back), and keeps "2 geselecteerd" and the typed input. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/refused-run.png · Test: e2e/selection.spec.ts "refused-run @e2e" |
| 14 | Escape on the drawer: Escape closes the open drawer. In a link record opened from a bundle it closes the whole drawer. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-run.png · Test: e2e/selection.spec.ts "drawer-escape @e2e" |
| 15 | + Nieuw refusals: Aanmaken on an empty Name keeps the dialog open with the alert `"name" is required` and adds no slot; Escape closes the dialog with no slot; a double-click on Aanmaken adds one slot. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/nieuw-calendar-dialog.png · Test: e2e/selection.spec.ts "add-from-query-refusals @e2e" |
| 16 | Transport failures on a run: an aborted request shows the alert "Failed to fetch", a 500 shows the engine's message, a cleared session shows the sign-in form with "Sign in first". The selection stays in the first two, and the retry then runs once. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/stale-id.png · Test: e2e/selection.spec.ts "transport-failures-run @e2e" |
| 17 | The box column is one column: at b48dc7d the set of `tbody td.nv-num input` x positions is one value, 280, in "All members" (top and scrolled down 3000px) and in "Beta members" (111 rows, top and bottom), and the header box sits at the same 280. Before the fix (e991993) it answered 300, 293 and 286 (the header at 307). Cold check: open Members, "All members", run `[...new Set([...document.querySelectorAll('tbody td.nv-num input')].map(b => Math.round(b.getBoundingClientRect().x)))]`. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/three-digit-numbers.png · Test: e2e/selection.spec.ts "checkbox-column-aligned @e2e" (RED at e991993, GREEN at b48dc7d) |
| 18 | The sign-in page and the schema without a session (smoke): the page answers 200 with the Aanmelden form and no selection column; GET /api/schema answers 401 `unauthenticated`. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/tree-no-link-table.png · Test: e2e/smoke/selection.spec.ts "@smoke" (two tests) |

Hunt: 3 charters · 1 confirmed · 0 not ours · 3 rejected

The hunt ran in the browser on the dev instance after a fresh boot, about 60 browser actions in all. Its one confirmed bug is row 17, fixed in b48dc7d.

**Charter 1, odd input (Gather and + Nieuw):** a blank-ish name, a refused note, a 600-character name, an empty + Nieuw submit, in about 20 actions.
- The 600 characters were cut to 500 by the field's maxlength. An empty + Nieuw and the refused note are rows 15 and 13.
- A name of three spaces is taken: the bundle "   " was made with its tie.

**Charter 2, numbers and state after change:** the column of boxes across row counts, a sort, a view switch and back, a reload, in about 20 actions.
- Sort keeps the ticks (2 geselecteerd before and after), a reload drops them, switching to another view and back drops them.
- The boxes are not one column: row 17.

**Charter 3, error paths:** a dropped request, a 500, a lost session, and a stale id, in about 20 actions. These are rows 12 and 16; all four gave a visible message and no half-write.

rejected: a text input of three spaces is accepted and stores a bundle named with spaces. The grid's run button mirrors the engine's own input check (`typedValid` in ActionInputs.tsx "as the engine checks it") and the engine takes any non-empty text; the same holds for a single-record action's input.

rejected: the selection is dropped on a switch to another view and back, and on a reload. A selection belongs to one table view's rows; the spec names no cross-view memory.

rejected: the dropped request reads "Failed to fetch", in English. It is the browser's own message from the shared request path (apps/grid/src/api.ts), which this feature added 7 lines to for runSelection and left as it was for every call.

## The registry

`specs/CHECKS.md` gained 17 e2e rows for selection-actions (one per flow of `e2e/selection.spec.ts`; the alignment repro among them, RED until the fix) and 2 smoke rows (`e2e/smoke/selection.spec.ts`), all verified b48dc7d 2026-10-22. `scripts/check-checks.ts` exits 0.

## Bite check

Each dangerous path of the diff and the test that should go RED when it breaks (by reading the assertions; none was hand-broken):
- the stale id notice and re-read (S2): "stale-id-run @e2e", RED on its alert text if the 404 is not mapped, and on the Weg row still present if no re-read;
- one run for a double-click: "double-submit-run @e2e" counts the bundles named Eenmaal;
- a mid-run refusal rolls back: "refused-run @e2e" counts bundles before and after;
- the reserved strip (S1): "bar-reserves-its-strip @e2e" on the row's y;
- the tree guard: "tree-hides-link-table @e2e" on the Ties node.

I did not hand-break the product code: the tree was not mine to edit while the gate's result stood.
