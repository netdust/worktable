# Shake-out: views-and-actions

Driven 2026-10-24 on `feature/views-and-actions` at 6ec02d6, after the review's fix pass. The shake-out adds tests, screenshots, registry rows and this file. It changes no product code.

The artifact is the harness's fresh invented instances:
- studio: engine 4313, grid 5176, `packages/studio/src/seed.ts`;
- theatre: grid 5174;
- the engine's selection fixture: grid 5177.

Every flow ran in a real Chromium at 1440 by 900, unless the row says otherwise. The actor was the seeded administrator, except where a row names the editor. Every Playwright run held the machine-wide e2e lock.

**The flows.**
- From the plan's Close: tick-and-run-from-the-panel, request-shows-running-then-result, drawer-actions-in-the-bar, toolbar-at-1280 and delete-a-seeded-view. Each was re-driven as committed, for its screenshots and its registry row.
- The reviewer's five screenshots, (a) to (e), are rows 6 to 11.
- The obvious flows, as Stefan clicks them, are rows 12 to 15.
- The hunt's five confirmed bugs are rows 16 to 20.
- The re-drives of registered surfaces this branch touched are rows 21 to 29, then the smoke checks.

No flow was left out.

**Results of the full re-drive.** 127 tests ran over 11 files:
- `e2e/studio.spec.ts`, 46 tests (36 that were there, plus 10 new);
- `action-inputs`, 6 (2 that were there, plus 4 new);
- `drawer-actions` 9, `selection` 17, `title-line` 4, `step-1` 6, `step-2` 12, `step-3c` 11, `step-3d` 5, `ui-fit` 7 and `step-0c` 4.

120 passed. Exactly the 7 repro tests of the fail rows failed, each on its `expect`, never on a timeout. The 12 smoke checks passed in a separate run.

**Edges met:**
- empty: a never-given SLA, and the board's empty Voorbereiden lane;
- denied actor: the editor, offered only a copy of a seeded view;
- re-entry: Verwijderen, then Escape, then Verwijderen again; delete, seed, restore, seed;
- concurrent: the worker moving a run while the page follows it; twenty runs followed at once;
- boundary: 1280 px, a 430 px-high window, and the 20-follow cap;
- mid-flow failure: a run that ends Mislukt;
- delivery seam: the dock's link from another skin, and the toast over a widened drawer.

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | tick-and-run-from-the-panel (R1, R2, R7): on Sites, hovering row 1 shows its tick box at opacity 1, and row 2's stays at 0. Two ticks raise the panel in the dock, and row 1's y is unchanged. The panel's height is under its button plus 28 px. Gezondheid checken creates the opdracht with exactly sites 1 and 2, and Undo removes it. The header's column line computes to rgb(58, 61, 68) in dark and rgb(196, 203, 211) in light. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-panel-lines-dark.png · light: shakeout/sites-panel-lines-light.png · hover: shakeout/sites-hover-dark.png · Test: e2e/studio.spec.ts "tick-and-run-from-the-panel @e2e" |
| 2 | request-shows-running-then-result (R3–R5b), concurrent edge. "Gezondheid checken aangevraagd." shows above the busy line "Gezondheid checken · Aangevraagd", and that row's number cell turns. On the Overzicht, the worker (a real service account) sets the site to storing and the run through bezig to klaar. The line reads Klaar and the Storing stat rises by one without a reload. A Bijwerken stays busy past 3.5 s in Aangevraagd. Prepared, it ends as "Bijwerken · Voorbereid — openen". From the board, the link opens the opdracht in its table. In the light theme the waiting line's text does not show at all (row 9). | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/opdracht-loopt-in-dock.png · Klaar: shakeout/opdracht-klaar-in-dock.png · waiting: shakeout/opdracht-wacht-in-dock.png · Test: e2e/studio.spec.ts "request-shows-running-then-result @e2e" |
| 3 | drawer-actions-in-the-bar (R6): a prepared Bijwerken on voorbeeld-site shows Bevestigen, filled, in the drawer head. The body holds no Bevestigen or Annuleren, and Acties lists Annuleren. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/opdracht-acties-menu.png · Test: e2e/studio.spec.ts "drawer-actions-in-the-bar @e2e" |
| 4 | toolbar-at-1280 (R12), boundary edge: at 1280 by 800, the toolbar is as high with testmans-winkel's drawer open as without it. Ctrl+K focuses the search box. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/toolbar-1280-drawer.png · alone: shakeout/toolbar-1280-alone.png · Test: e2e/studio.spec.ts "toolbar-at-1280 @e2e" |
| 5 | delete-a-seeded-view (R8, R10, R10a), re-entry edge. "Storing" is editable for the administrator. Verwijderen from its rail menu takes it out of the rail. `--seed-missing` reports "deleted by a person, left alone", and the Overzicht has no Storing tile. A restore and a second seed bring the tile back. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/overzicht-zonder-storing.png · Test: e2e/studio.spec.ts "delete-a-seeded-view @e2e" |
| 6 | (a) table-lines-in-both-themes (new; R7, R14): Sites lists exactly testmans-bestel, testmans-winkel, voorbeeld-blog and voorbeeld-site, and no oud-archief. Every header cell and every row cell, number column aside, computes one right border: `rgb(58, 61, 68) 1px` in dark and `rgb(196, 203, 211) 1px` in light. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-kolomlijnen-donker.png · light: shakeout/sites-kolomlijnen-licht.png · Test: e2e/studio.spec.ts "table-lines-in-both-themes @e2e" |
| 7 | (b) inputs-panel-under-the-head (new; R6, N9): on theatre's first tourstop, Acties › Tourstop verschuiven opens its panel. The panel's top is at or below the head's bottom, its close button "Sluiten" is in the viewport, and Dagen has focus. Escape closes the panel and puts focus on Acties, and the drawer stays. The panel covers the record's title while it is open, by design (an overlay under the head). | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/invoerpaneel-licht.png · dark: shakeout/invoerpaneel-donker.png · Test: e2e/action-inputs.spec.ts "inputs-panel-under-the-head @e2e" |
| 8 | (c) waiting-line-and-panel-leave-the-last-row (new): the window is 1440 by 430. A Bijwerken on voorbeeld-site waits on Bevestigen; close its drawer, tick testmans-bestel and testmans-winkel, wait for the toast to go, and scroll the table to its end. The last row is reachable, since elementFromPoint finds it. **The totals line is not clear of the panel:** the panel starts at y 299 and the tfoot ends at 304. Cause, measured in the live DOM: `.nv-sheet:has(...) .nv-scroll` pads the scroll area by a fixed 96 px. The dock's stack is panel 45 px + gap 8 + run line 32 + bottom offset 16 = 101 px. While the request's toast still shows, the dock spans y 258 to 384: the toast covers the whole totals line and the bottom 13 px of the last row (231 to 271). The totals text itself stays readable at steady state. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/wacht-en-selectie-onderaan-donker.png · Test: e2e/studio.spec.ts "waiting-line-and-panel-leave-the-last-row @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 9 | (c) waiting-line-reads-in-both-themes (new): **in the light theme the waiting line "Bijwerken · Voorbereid — openen" is white on white**, an empty box with only its ×. `.nv-run__open` takes `color: var(--color-accent-fg, …)`, and `--color-accent-fg` is #ffffff, the text-on-accent token (`theme.css:34`), on the line's `--color-bg-surface`. Measured after the theme's transitions ran: dark rgb(255, 255, 255) on rgb(22, 23, 26), 17.9:1; light rgb(255, 255, 255) on rgb(255, 255, 255), 1:1. To reproduce: request Bijwerken on voorbeeld-site from the Sites panel, let the worker prepare it, and look at the dock in light. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/wacht-en-selectie-onderaan-licht.png · Test: e2e/studio.spec.ts "waiting-line-reads-in-both-themes @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 10 | (d) dock-link-from-the-board (new; review S1), delivery seam edge, in dark. A waiting Bijwerken's line shows over the board Opdrachten per status, with no drawer open. Pressing "— openen" moves to the Opdrachten table with "Bijwerken · voorbeeld-site" open, and the line is gone. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/bord-dock-openen-voor.png · after (the Opdrachten table): shakeout/bord-dock-openen-na.png · Test: e2e/studio.spec.ts "dock-link-from-the-board @e2e" |
| 11 | (e) the toast over a widened drawer (review N7): in theatre's Personen, Lotte Verhaegen's drawer is widened ("Volledig openen") and Acties › Link kopiëren pressed. "Link gekopieerd" shows over the drawer, and elementFromPoint at its centre is the toast. | browser | pass | Browser: http://127.0.0.1:5174/#view=4 · shakeout/toast-over-brede-lade.png · Test: e2e/step-2.spec.ts "link-shows-own-projects-only @e2e" |
| 12 | acties-menu-by-keyboard (new): in voorbeeld-site's drawer, focus Acties and press Enter. The menu reads Gezondheid checken, Malware scannen, Bijwerken, Smoketest draaien, with focus on the first. ArrowDown moves to Malware scannen. Escape closes the menu onto Acties with the drawer still open, and a second Escape closes the drawer. The hunt also drove ArrowDown on the closed trigger, End, Home and typeahead "b"; all work. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/site-acties-toetsen.png · Test: e2e/studio.spec.ts "acties-menu-by-keyboard @e2e" |
| 13 | delete-asks-twice (new; R6), re-entry edge: on a fresh task, Acties › Verwijderen shows "Zeker?". Escape closes it with the drawer and the task kept. Verwijderen, then Zeker?, deletes the task and closes the drawer. A site's drawer offers no Verwijderen (sites are the worker's). | browser | pass | Browser: http://127.0.0.1:5176/#view=16 · shakeout/taak-verwijderen-zeker.png · Test: e2e/studio.spec.ts "delete-asks-twice @e2e" |
| 14 | seeded-view-menu-by-role (new; R8), denied actor edge. As the administrator, SLA-sites' rail menu offers Kopie maken, Naam wijzigen and Verwijderen, and renaming it to SLA-klanten saves for everyone. As the seeded editor in a second context, SLA-klanten shows with the copy-only lock, and its menu offers only Kopie maken. The name is put back afterwards. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/rail-menu-beheerder.png · editor: shakeout/rail-menu-redacteur.png · Test: e2e/studio.spec.ts "seeded-view-menu-by-role @e2e" |
| 15 | null-boolean-reads-blank (new; R16 ruling), empty edge: testmans-winkel's SLA is set to null through the API. Its cell is empty, with no switch and no "Nee". A click on the cell, then Space, sets it to true, and the switch shows checked. Restored to true afterwards. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sla-leeg.png · Test: e2e/studio.spec.ts "null-boolean-reads-blank @e2e" |
| 16 | Hunt bug 1, null-boolean-by-mouse: **a never-given SLA cannot be set with the mouse.** The blank cell's `span.nv-cell__bool--blank` carries the onClick, but it measures 0 by 0 (the cell is 108 by 40 at x 896, y 176). A click anywhere on the cell only selects it; one click, two clicks and a double click all leave `sla` null. The drawer shows the field as "—", and a click on it changes nothing. Only Space in the table sets it. To reproduce: PATCH site 1 with sla null, open Sites, click testmans-winkel's SLA cell, and read the row. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sla-leeg.png · Test: e2e/studio.spec.ts "null-boolean-by-mouse @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 17 | Hunt bug 2, twenty-runs-leave-the-table-reachable, boundary edge: **twenty followed runs stack twenty undismissable lines up the whole work column.** On Sites, tick testmans-winkel and press Gezondheid checken in the panel, twenty times. The dock is 798 px high, from y 56 to 854, and its lines (x 530 to 783) cover the Gezondheid and Organisatie cells of every row and the column heads. The toast covers the toolbar's Filter and Groep chips. A running line has no ×, and nothing caps or folds the stack. At 900 px with Sites' four rows, the stack reaches the last row from about 15 lines. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/twintig-lopende-opdrachten.png · Test: e2e/studio.spec.ts "twenty-runs-leave-the-table-reachable @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 18 | Hunt bug 3, keys-in-the-inputs-panel-stay-there: **keys typed in the inputs panel step the drawer to another record.** The panel now renders in the drawer's head line, where `headKey` (`Drawer.tsx:101-107`) turns ↑, ↓, j and k into record steps and prevents their default. To reproduce on theatre's Tourstops, first tourstop "Repetities": Acties › Sjabloon toepassen › "Sjabloon: —", then type "j" in the search. The drawer jumps to "Brugge", the panel closes and the search is lost. Likewise in Tourstop verschuiven: Dagen "2", then ↓, jumps to Brugge, where the field should read 1. ↑ in Dagen does not change the number either. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/invoerpaneel-licht.png · Test: e2e/action-inputs.spec.ts "keys-in-the-inputs-panel-stay-there @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 19 | Hunt bug 4, escape-after-the-picker: **after Escape closes the Sjabloon picker, the keyboard cannot close the panel or the drawer.** On the first tourstop, open Acties › Sjabloon toepassen › "Sjabloon: —" and press Escape. The picker closes, but focus falls to `<body>`. A second and a third Escape close neither the panel (its Escape handler listens inside the panel) nor the drawer. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/invoerpaneel-donker.png · Test: e2e/action-inputs.spec.ts "escape-after-the-picker @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 20 | Hunt bug 5, focused-input-shows-its-mark: **the field the panel focuses shows no focus and no edge.** In Tourstop verschuiven, Dagen (class `nv-fb__text`) has focus, yet computes border 0px none, a transparent background, outline none and box-shadow none on the white panel. A first-time visitor sees the label and a stepper but no field, and no sign of where typing goes. The borderless field itself predates this branch (`specs/action-inputs/shakeout/drawer-dagen.png`); the panel now puts focus in it (N9). | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/invoerpaneel-licht.png · Test: e2e/action-inputs.spec.ts "focused-input-shows-its-mark @e2e" · Fixed at 2ea9b2f (RED at 6ec02d6), the repro is now green. |
| 21 | Re-drive, the other 31 tests of `e2e/studio.spec.ts`, all green. Among them: drawer-reads-right, with Bevestigen filled in the head, Annuleren in Acties, no live mark while it waits, and a site's four actions in Acties at its head. Also request-health-check-for-selected-sites, tick-on-a-query-view, the boards, the dashboard and editor-cannot-confirm. service-cannot-confirm is the wire half. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/opdracht-drawer-bevestigen.png · site: shakeout/site-drawer-acties-boven.png · Test: e2e/studio.spec.ts, every `@e2e` test registered for studio-domain and studio-polish |
| 22 | Re-drive, `e2e/drawer-actions.spec.ts` on the selection fixture, 9 green. The declared buttons sit in the head and in Acties. The live drawer, Undo after close and the action's result drawer all work. | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/drawer-buttons.png · Test: e2e/drawer-actions.spec.ts, its 9 `@e2e` tests |
| 23 | Re-drive, `e2e/selection.spec.ts` on the selection fixture, 17 green: select and run, select all, tab stops, double submit, refusals, the stale id and transport failures. In bar-reserves-its-strip, no row moves on the first tick, the second or Selectie wissen with the floating panel. | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/selectie-paneel-fixture.png · Test: e2e/selection.spec.ts, its 17 `@e2e` tests |
| 24 | Re-drive, `e2e/title-line.spec.ts`, 4 green: the theatre title line at 1280, with a drawer open on a row and on a card, and the two-tone pill. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/title-line-drawer-row.png · Test: e2e/title-line.spec.ts, its 4 tests |
| 25 | Re-drive, `e2e/step-1.spec.ts`, 6 green. Sjabloon toepassen runs from Acties' inputs panel and says "Sjabloon toepassen uitgevoerd." (nothing live), with the double submit, undo and redo. Rollen for the editor and the administrator. | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/sjabloon-toegepast.png · Test: e2e/step-1.spec.ts, its 6 `@e2e` tests |
| 26 | Re-drive, `e2e/step-2.spec.ts`, 12 green: apply-template-with-slots, the matrix, invitations, #/act, the state rules and the person link (row 11). | browser | pass | Browser: http://127.0.0.1:5174/#view=2 · shakeout/apply-template-with-slots.png · Test: e2e/step-2.spec.ts, its 12 `@e2e` tests |
| 27 | Re-drive, `e2e/step-3c.spec.ts`, 11 green. composer-team-dashboard edits theatre's seeded Overzicht in place, as an unlocked team dashboard (R8), and restores it. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/composer.png · Test: e2e/step-3c.spec.ts, its 11 `@e2e` tests |
| 28 | Re-drive, the two `e2e/action-inputs.spec.ts` tests that were there, through Acties' panel: shift-tourstop, and shift-refused-in-dutch with the refusal under the action. | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/drawer-dagen.png · refused: shakeout/refused-in-dutch.png · Test: e2e/action-inputs.spec.ts "shift-tourstop @e2e" and "shift-refused-in-dutch @e2e" |
| 29 | Re-drive, `e2e/step-3d.spec.ts` (5 green, looks-gridlines with lines on by default under the v2 key), `e2e/ui-fit.spec.ts` (7) and `e2e/step-0c.spec.ts` (4, unregistered). | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/looks-gridlines.png · picker: shakeout/drawer-picker-dark.png · Test: e2e/step-3d.spec.ts "looks-gridlines @e2e" and the files' other tests |
| 30 | Smoke (new): without a session, the studio grid answers 200 with the Aanmelden form and no error text. Its stylesheets carry `.nv-dock`, `.nv-run__open` and `[data-lines="on"]`. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-aanmelden.png · Test: e2e/smoke/views-and-actions.spec.ts "views and actions: the grid serves the dock @smoke" |
| 31 | Smoke (new): GET /api/views on 4313 without a session answers 401 `unauthenticated`. | wire | pass | Test: e2e/smoke/views-and-actions.spec.ts "views and actions: the saved views ask a visitor without a session to sign in @smoke" |
| 32 | Smoke, re-driven: the 10 other sessionless checks, all green. These are studio's sign-in and schema, studio-polish's row-line token, selection, drawer-actions, step-2 and grid-ux. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-signin.png · Test: e2e/smoke/, every `@smoke` test |

Hunt: 5 charters · 5 confirmed · 0 not ours · 8 rejected

The hunt ran once, at 6ec02d6, in the harness's Chromium on the same fresh instances, from scratch specs under the gitignored `e2e/.tmp`, which are now deleted. It took about 150 browser actions, 42 of them the twenty runs of charter 1. Each confirmed finding then went RED on its own `expect` assertion in a committed test (rows 16 to 20), never on a timeout. Every file their surfaces render through is in this branch's diff (`runs.tsx`, `app.css`, `DrawerTools.tsx`, `Drawer.tsx`, `SidePanel.tsx`, `Bool.tsx`), so all five are ours.

Charter 1, error paths, the dock under load on studio's Sites. Three runs from the panel (Gezondheid checken, Smoketest draaien, Malware scannen) show three busy lines and three turning rows. The worker ends one Mislukt and one Klaar. Klaar leaves after 6 s; Mislukt stays in rgb(176, 48, 47), and its Negeren × removes it. Undo in the toast clears a running line and its row's ring. Twenty-one runs leave twenty lines, so the cap holds. Finding: confirmed bug 2.

Charter 2, first-time visitor on the keyboard, the Acties menu in a site's and an opdracht's drawer, about 20 actions. Enter, Space and ArrowDown open it. Arrows, Home, End and typeahead move through it, Tab closes it to the next head button, and Escape returns to Acties. Choosing Gezondheid checken by Enter opens its result drawer with focus on its Sluiten. A fresh aangevraagd opdracht offers only Annuleren. No bug.

Charter 3, odd input, the inputs panel on theatre's tourstops, about 25 actions. Tab goes from Dagen to the widen button, because the close × sits before the field. A widened drawer keeps the panel at its top right. Escape with the Sjabloon picker open, ↓ in Dagen and a letter in the search all misbehave. Findings: confirmed bugs 3, 4 and 5.

Charter 4, state after reload, a seeded view edited by the administrator and by the editor, about 15 actions. The administrator's sort click on Let op PATCHes view 7 with `sort: ["-naam"]` for everyone (R8). The editor then opens Let op with Naam ↓. The editor's own click writes nothing and adds Terugzetten under the toolbar's ⋯ (the changed mark). The sort was put back afterwards. No bug.

Charter 5, odd input, the layout fit and the null boolean, about 20 actions. A stored layout for Sites with sort start_at, a filter on "nope", group start_at and hidden "ghost" loads with 2 rows and no error. It is written back fitted: sort, group and the unknown keys dropped, the gezondheid filter and the width kept. Copying a blank SLA cell gives "", and pasting it onto voorbeeld-site's Nee writes nothing. Finding: confirmed bug 1.

rejected: the fit dropped a hidden "php". "php" is no column; the column is `php_versie`, so this was my input, not the fit.

rejected: an opdracht deleted through the API kept its line turning. The delete was refused, because an opdracht with site lines cannot be deleted (`writers/actie.ts:102`). Undo in the toast, which removes the lines first, clears the line and the ring.

rejected: the rail shows Sites 5 beside a view of 4 rows. A rail count is the dataset's (rail-counts, step-3e), and oud-archief is still a site.

rejected: the console logs "[Table] Column with id 'id' does not exist." on studio's Opdrachten views. Their seeded sort on the id is kept by the R11 fit ruling, as studio-polish's shake-out found, and the rows still come newest first.

rejected: the editor sees the copy-only lock on every seeded view. That is the plan's ruling, which Stefan confirms here (see below).

rejected: the Dagen field has no border. It looks the same in action-inputs' own screenshot before this branch; its missing focus mark is confirmed bug 5.

rejected: the editor's sort click shows no arrow beside Naam and no mark by the title. Clicking a descending sort clears it, and the changed mark is the toolbar's ⋯ with Terugzetten, which appears.

rejected: Tab from Dagen skips the panel's × and the disabled run button. The × comes before the field in the panel, Shift+Tab reaches it, and a disabled button takes no focus.

## For Stefan to confirm

- The lock mark: an administrator sees a lock only on a locked view, and an editor sees the copy-only lock on every seeded view (rail-menu-redacteur.png).
- The touched rule's consequence (review): a sort click on a seeded view saves for the team and marks it touched for good, and a delete is one-way for `--seed-missing`.

## Notes for the fix pass

- Seen, not pursued, and no repro: with Bevestigen and the step arrows in an opdracht's drawer head, its dataset label reads "Opdrachte 1 van 4", the label clipped without an ellipsis (bord-dock-openen-na.png). It is cosmetic, and it is not counted in the hunt.
- Flow 2's `finally` (request-shows-running-then-result, not rewritten here) deletes its opdrachten. A prepared Bijwerken and a Klaar check cannot be deleted, so they stay in the fresh instance until the run ends, and the Opdrachten views of later tests in the same run show them. The new tests cancel their prepared run instead.
- The 7 repro tests are committed RED as `@e2e`, so `bun run gate` is red until the fix pass makes each one GREEN.

## The registry

`specs/CHECKS.md`:
- **Added**, with first feature views-and-actions: 19 e2e rows and 2 smoke rows. The 7 repro rows read "RED at 6ec02d6 2026-10-24, owed by the fix pass" in `verified`.
- **Bumped to 6ec02d6 2026-10-24:** 109 rows, every registered row of studio, studio smoke, title-line, selection (with its smoke), drawer-actions (with its smoke), step-1, step-2, step-3c, step-3d, ui-fit and action-inputs, each green again here.
- **Reworded:** the drawer-reads-right row now says Bevestigen is in the head and Annuleren in Acties. The selection row "reserved strip" now says no row moves with the floating panel.

`bun scripts/check-checks.ts` and `bun run check` exit 0.

## Bite check

By reading the assertions. No product line was hand-broken.

- Only a human administrator changes a seeded view (attacks 1–3): the engine's denial tests (`seeded-views.test.ts`) hold the wire. In the browser, row 14 fails if the editor is offered Naam wijzigen or Verwijderen, and row 5 if Storing is not editable.
- A deleted seeded view survives the seed (R10, R10a): row 5, on the seed's "deleted by a person, left alone" line and the missing tile.
- A run ends by itself, waits on a primary button, and stays busy on Annuleren only (R5, R5a): row 2, on aria-busy, the Klaar line, the Storing stat and the 3.5 s wait. Row 10 covers the link from a board.
- No action left in the body (R6): row 3, on the body's buttons; rows 12, 13 and 7 cover the menu, Verwijderen and the inputs.
- Column lines (R7): rows 1 and 6 pin the exact colours, so a revert to the subtle border fails both.
- Toolbar at 1280 (R12): row 4, on its height.
- The layout fit (R11): no e2e pins it. `views.test.ts` and `useSavedViews.test.ts` hold it, and charter 5 drove it in the browser.
- The refused-create copy (R13): not driven, because studio offers no create that its engine refuses. `App.test.tsx` holds it.
- A null boolean (R16): row 15 fails if it shows a switch or "Nee". Row 16 is the mouse half, RED.
- R4's ring on the acted rows: row 2, on `tr[data-running]`.
