# Shake-out: studio-polish

Driven 2026-10-23 on `feature/studio-polish` at 7170c1a, after the review's fix pass. The shake-out adds tests, screenshots, registry rows and this file, no product code.

**Re-driven 2026-10-23 at 3f6de2f.** After the first shake-out, Stefan made four changes on this branch:
- e761d4f: a stronger row line. `--color-border-row` is now #c4cbd3 in light and #3a3d44 in dark, where it was #d0d6dd and #33363c (rows 5 and 6).
- 5aa886b, a7390c6 and 3f6de2f: fixes for the hunt's three confirmed bugs. They now have rows 7, 9 and 37, and the hunt record below says so.

Every file below was re-run under the machine lock with the screenshots retaken, 47 tests in all, all green:
- `e2e/studio.spec.ts`, 31 tests;
- `e2e/drawer-actions.spec.ts`, 9;
- `e2e/title-line.spec.ts`, 4;
- `e2e/smoke/studio.spec.ts`, 2;
- `e2e/smoke/studio-polish.spec.ts`, 1.

The first run's count of 32 for `e2e/studio.spec.ts` was wrong: `--list` gives 31 with toggle-cell-fits included.

**Wider switch columns.** 3f6de2f widens every switch column's default from 80 to 108 px, in every domain. This was checked from a scratch spec, deleted afterwards, at 1440 by 900:
- Theatre's Personen › Actief: 5 cells, each 108 px with a scroll width of 108. The switch and "Ja" or "Nee" sit whole with no dot.
- Fiche's Fiches › Verborgen: 5 cells, the view's last column, which fills to 308 px. None is clipped and none has a dot.
- Theatre's Rollen per persoon › Voorkeur was not reached: the scratch spec found no switch cell in that view. No committed e2e takes a screenshot of a theatre or fiche switch column, so neither check has a row.

The 28 px does push the columns right of a switch further along. On theatre's Personen, Actief is the last column and sits past the 1440 viewport's right edge, as it did before.

The artifact is the harness's fresh invented instances: studio (engine 4313, grid 5176, `packages/studio/src/seed.ts`), theatre (grid 5174) and the engine's selection fixture (grid 5177). Every flow ran in a real Chromium at 1440 by 900 as the seeded administrator, unless the row says otherwise. Every Playwright run held the machine-wide e2e lock.

**The flows.** They come from the plan's Test map, E2E flows column:
- no-edit-on-worker-columns
- no-new-where-not-allowed
- toolbar-at-1440
- tick-on-a-query-view
- the changed studio rows: sites-board-and-gallery and person-cannot-take-worker-steps

**Also driven:**
- row-lines-at-150, and its new sibling row-lines-at-125.
- Three new tests for the screenshots the brief asked for: board-groups-only, drawer-reads-right and title-pill-worst-first.
- At the re-drive: toggle-cell-fits, the test for hunt bug 3's fix.
- Theatre's two-tone pill (title-pill-two-tones, the plan's Close item 4).
- The rest of `e2e/studio.spec.ts`, every row of which this diff's grid changes reach.
- `e2e/drawer-actions.spec.ts` and `e2e/title-line.spec.ts`, which the branch or this shake-out changed.

**Results.** All 32 tests of `e2e/studio.spec.ts`, the 15 tests of drawer-actions, its smoke and title-line, and the 3 smoke checks are green at 7170c1a with this shake-out's test edits.

**Edges.** Each flow carries its edges where it can meet them:
- **empty:** the Voorbereiden lane, "Geen opdrachten";
- **denied actor:** the editor, and a real service account;
- **re-entry:** Niet nu, then Toch wel;
- **boundary:** a selection of only retired sites, and the row lines at two display scales;
- **mid-flow failure:** a dropped Bevestigen, and a refused save at 1440.

**Smoke.** The studio grid's sessionless smoke is already `e2e/smoke/studio.spec.ts` (studio-domain), so it is re-driven and not duplicated. The one new smoke check, `e2e/smoke/studio-polish.spec.ts`, asserts only what this branch adds to every sessionless page: the stylesheet's row-line token, stronger than the subtle border (R19).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | no-edit-on-worker-columns: on Sites, Gezondheid, HTTP, WordPress, PHP, Updates plugins, TLS, Laatste check and In registry are aria-readonly cells. The Onderhoudslog has no editable cell. The Status of an opdracht in the Opdrachten table is read-only, so it is changed through its buttons only (R17). The hunt (charter 2) also pressed Delete, Backspace, a digit, Enter and a paste on four of those cells, and clicked their drawer values. No editor opened and no write was sent. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-worker-kolommen.png · Test: e2e/studio.spec.ts "no-edit-on-worker-columns @e2e" |
| 2 | no-new-where-not-allowed: Sites, Sites per gezondheid, Sites met aandacht and the Onderhoudslog offer no primary button and no "Nieuw…" button. "Opdrachten per status" offers no lane "Nieuw in …". Opdrachten itself still offers "+ Nieuwe opdracht", which a person may create. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/sites-zonder-nieuw.png · Test: e2e/studio.spec.ts "no-new-where-not-allowed @e2e" |
| 3 | toolbar-at-1440: in Taken with a drawer open, a refused cell edit with a 350-character message. The toolbar keeps its one-line height, and "Niet opgeslagen: D…" is cut. The "+ Nieuwe taak" button ends left of the drawer's title. Mid-flow failure edge: the refusal is the server's 422. | browser | pass | Browser: http://127.0.0.1:5176/#view=17 · shakeout/werkbalk-1440.png · Test: e2e/studio.spec.ts "toolbar-at-1440 @e2e" |
| 4 | tick-on-a-query-view: in Sites met aandacht, voorbeeld-blog and testmans-bestel are ticked. The bar reads "2 geselecteerd" with the four actions. Gezondheid checken opens "Gezondheidscheck · 2 sites", and its database links are exactly those two site ids. Undo removes it. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/sites-aandacht-aangevinkt.png · Test: e2e/studio.spec.ts "tick-on-a-query-view @e2e" |
| 5 | row-lines-at-150: Sites at deviceScaleFactor 1.5, re-driven at 3f6de2f. The row separator computes to rgb(196, 203, 211), which is `--color-border-row` #c4cbd3 (e761d4f), not the subtle border. In the full-resolution PNG, measured in the blank columns at CSS x 1200 and 1360, each separator is two device pixels. One is a half-tone (225, 229, 233), the other exactly #c4cbd3 (196, 203, 211), about 1.64:1 against white; it was 1.46:1 with #d0d6dd. It reads as a clear thin grey line between every row. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/rijlijnen-150.png · Test: e2e/studio.spec.ts "row-lines-at-150 @e2e" |
| 6 | row-lines-at-125: the same at deviceScaleFactor 1.25, re-driven at 3f6de2f, with the same computed colour. The 1 CSS px line still falls between device pixels: one pixel of (210, 216, 222) and one of (240, 242, 244), measured at the same blank columns. That darker pixel is about 1.44:1 against white. At 7170c1a it was (219, 224, 229), 1.33:1. The line is now as dark at 1.25 as the old token was at 1.5. At full resolution it reads as a visible fine grey line between every row, though still lighter than at 1.5. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/rijlijnen-125.png · Test: e2e/studio.spec.ts "row-lines-at-125 @e2e" |
| 7 | board-groups-only: Opdrachten per status has no lane "+". Its footer reads exactly "↑↓←→ bewegen", "↵ openen" and "⌘Z ongedaan maken", with no "Sleep een kaart" and no "Spatie oppakken". A click on the seeded card opens "Bijwerken · 2 sites". Escape then closes the drawer, and the focus stays on the card. This was hunt bug 1, fixed in 5aa886b. Empty edge: the Voorbereiden lane reads "Geen opdrachten". | browser | pass | Browser: http://127.0.0.1:5176/#view=11 · shakeout/opdrachten-per-status.png · Test: e2e/studio.spec.ts "board-groups-only @e2e" |
| 8 | drawer-reads-right (new): a fresh preview on voorbeeld-site, made the way the worker makes it. Its drawer shows Bevestigen as `nv-button--primary` (filled) beside Annuleren as `nv-button--secondary`. The head reads "Volgt live", and "Bezig…" never shows. The opdracht declares no actions, so none sit under its buttons. voorbeeld-site's own drawer shows its four actions in the viewport, at its head (R12). The preview is cancelled afterwards. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/opdracht-drawer-bevestigen.png · site drawer: shakeout/site-drawer-acties-boven.png · Test: e2e/studio.spec.ts "drawer-reads-right @e2e" |
| 9 | title-pill-worst-first: the Sites title line shows a red "Storing 1", then an amber "Let op 1". Each count equals the API's sites with that gezondheid. A search for an In orde site leaves "1 rij" and no pill. This was hunt bug 2, fixed in a7390c6. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-storing-en-let-op.png · Test: e2e/studio.spec.ts "title-pill-worst-first @e2e" |
| 10 | title-pill-two-tones (new, theatre): two name-only toewijzingen on activiteit 5 are made through the API. One is uitgenodigd then geweigerd, the other uitgenodigd then geannuleerd. The theatre seed holds no bad-toned row. On Toewijzingen as the theatre administrator, the title line reads a red "Geweigerd · Geannuleerd 2", then an amber "Uitgenodigd 2", each count equal to the API's. Both rows are deleted afterwards. | browser | pass | Browser: http://127.0.0.1:5174/#view=5 · shakeout/theatre-toewijzingen-pil.png · Test: e2e/title-line.spec.ts "title-pill-two-tones @e2e" |
| 11 | sites-board-and-gallery (changed): Sites per gezondheid shows In orde, Let op, Storing and Onbekend. The card has no drag class, and Space lifts nothing. The order and gezondheid ok are unchanged. Sites in beeld shows the four live sites. | browser | pass | Browser: http://127.0.0.1:5176/#view=2 · shakeout/sites-per-gezondheid.png · gallery: shakeout/sites-in-beeld.png · Test: e2e/studio.spec.ts "sites-board-and-gallery @e2e" |
| 12 | person-cannot-take-worker-steps (changed): a fresh Bijwerken on voorbeeld-blog sits in Aangevraagd. Its card has no drag class, and Space lifts nothing. It stays in Aangevraagd, and the row stays aangevraagd. The hunt (charter 1) also tried a mouse drag of 320 px across lanes: nothing moved and no write was sent. | browser | pass | Browser: http://127.0.0.1:5176/#view=11 · shakeout/opdracht-sleep-voorbereiden.png · Test: e2e/studio.spec.ts "person-cannot-take-worker-steps @e2e" |
| 13 | Re-drive, dashboard-opens-on-monday-questions: four sections, two quick creates, figures equal to the API, worst site first. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/overzicht.png · view: shakeout/sites-met-aandacht.png · Test: e2e/studio.spec.ts "dashboard-opens-on-monday-questions @e2e" |
| 14 | Re-drive, space-narrows-dashboard: Bakkerij Testmans narrows every scoped tile. Empty edge: Storing reads 0. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/overzicht-klant.png · Test: e2e/studio.spec.ts "space-narrows-dashboard @e2e" |
| 15 | Re-drive, request-health-check-for-selected-sites: the drawer opens with "Volgt live" (R8), the retired site is skipped, and Undo removes the opdracht. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/opdracht-drawer-live.png · bar: shakeout/sites-selection-bar.png · Test: e2e/studio.spec.ts "request-health-check-for-selected-sites @e2e" |
| 16 | Re-drive, boundary edge, request-only-retired-sites-refused: the refusal shows in the bar, and nothing is written. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/alleen-oud-archief.png · Test: e2e/studio.spec.ts "request-only-retired-sites-refused @e2e" |
| 17 | Re-drive, request-from-a-site-drawer: Smoketest on voorbeeld-site alone, then Undo. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/site-drawer-request.png · Test: e2e/studio.spec.ts "request-from-a-site-drawer @e2e" |
| 18 | Re-drive, preview-opens-from-request: each site line's preview summary, with Preview klaar and Niet nu. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/te-bevestigen-drawer.png · Test: e2e/studio.spec.ts "preview-opens-from-request @e2e" |
| 19 | Re-drive, re-entry edge, drop-site-before-confirm: Niet nu, Undo, then Niet nu and Toch wel, each checked in the database. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/niet-nu.png · Test: e2e/studio.spec.ts "drop-site-before-confirm @e2e" |
| 20 | Re-drive, confirm-update-from-dashboard: Bevestigen from the dashboard drawer, after which the tile count drops. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/na-bevestigen.png · Test: e2e/studio.spec.ts "confirm-update-from-dashboard @e2e" |
| 21 | Re-drive, confirm-refused-on-an-expired-preview: the refusal is stated, and the row stays voorbereid. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/preview-verlopen.png · Test: e2e/studio.spec.ts "confirm-refused-on-an-expired-preview @e2e" |
| 22 | Re-drive, mid-flow failure edge, confirm-survives-a-dropped-request: an aborted PATCH changes nothing, and a second press confirms. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/bevestigen-weggevallen.png · Test: e2e/studio.spec.ts "confirm-survives-a-dropped-request @e2e" |
| 23 | Re-drive, denied actor edge, service-cannot-confirm: the real service account is refused Bevestigen, a fresh rewind and a new voorstel, and the row is unchanged. | wire | pass | Test: e2e/studio.spec.ts "service-cannot-confirm @e2e" |
| 24 | Re-drive, denied actor edge, editor-cannot-confirm: as the seeded editor, Bevestigen is never offered, and the PATCH answers 422. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/redacteur-drawer.png · Test: e2e/studio.spec.ts "editor-cannot-confirm @e2e" |
| 25 | Re-drive, add-to-the-agenda: a blank title is refused, the item is made, and Ctrl+Z removes it. A planned opdracht shows as Opdracht. | browser | pass | Browser: http://127.0.0.1:5176/#view=19 · shakeout/agenda.png · Test: e2e/studio.spec.ts "add-to-the-agenda @e2e" |
| 26 | Re-drive, op-tafel: the open tasks due this week. On the dashboard, Gedaan makes a line leave. | browser | pass | Browser: http://127.0.0.1:5176/#view=18 · shakeout/op-tafel.png · Test: e2e/studio.spec.ts "op-tafel @e2e" |
| 27 | Re-drive, decided-request-lines: after Bevestigen the line reads Preview klaar, and after Annuleren it reads Niet gestart. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/bevestigd-regels.png · Test: e2e/studio.spec.ts "decided-request-lines @e2e" |
| 28 | Re-drive, op-tafel-offers-new-task: an enabled Nieuwe taak, whose new task gets today as its deadline. | browser | pass | Browser: http://127.0.0.1:5176/#view=18 · shakeout/op-tafel-knop.png · Test: e2e/studio.spec.ts "op-tafel-offers-new-task @e2e" |
| 29 | Re-drive, recent-moment-not-late: yesterday's check and a feature updated two days ago show their days muted. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/tegel-rode-dagen.png · Test: e2e/studio.spec.ts "recent-moment-not-late @e2e" |
| 30 | Re-drive, delete-a-request-explains: Verwijderen on an opdracht says to cancel it, and the row stays. | browser | pass | Browser: http://127.0.0.1:5176/#view=10 · shakeout/opdracht-verwijderen.png · Test: e2e/studio.spec.ts "delete-a-request-explains @e2e" |
| 31 | Re-drive, today-keeps-its-titles: at 1280 by 720 with a drawer open, the Vandaag item's title stays inside its line. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/vandaag-smal.png · Test: e2e/studio.spec.ts "today-keeps-its-titles @e2e" |
| 32 | Re-drive, drawer-actions on the engine's selection fixture, all 9 tests. The live mark reads "Volgt live" (R8), and the record's actions sit under its buttons (R12). | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/redrive-drawer-live.png · Test: e2e/drawer-actions.spec.ts "drawer-follows-an-outside-change @e2e" and the file's other 8 `@e2e` tests |
| 33 | Re-drive, theatre's title line at 1280: title-line-fits-at-1280, and title-line-fits-with-a-drawer-open on Planning and on Per status. The R10 pills sit beside the period without pushing the name. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/redrive-title-line-drawer.png · Test: e2e/title-line.spec.ts "title-line-fits-with-a-drawer-open" |
| 34 | Smoke, re-driven: without a session, the studio grid answers 200 with the Dutch Aanmelden form and no error text. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-signin.png · Test: e2e/smoke/studio.spec.ts "studio surface @smoke" |
| 35 | Smoke, re-driven: GET /api/schema on 4313 without a session answers 401. | wire | pass | Test: e2e/smoke/studio.spec.ts "studio schema asks a visitor without a session to sign in @smoke" |
| 36 | Smoke (new): without a session, the studio grid answers 200. Its stylesheet serves `--color-border-row` as a hex colour that differs from `--color-border-subtle`, with no error text. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-rijlijn-token.png · Test: e2e/smoke/studio-polish.spec.ts "studio row lines @smoke" |
| 37 | toggle-cell-fits (new, hunt bug 3, fixed in 3f6de2f): on Sites, every SLA switch cell's scroll width is at most its client width at the column's new default of 108 px. The screenshot shows Ja and Nee beside the switch, with no stray dot under "Nee" on oud-archief, voorbeeld-blog or voorbeeld-site. The 4x crop was checked. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-worker-kolommen.png · Test: e2e/studio.spec.ts "toggle-cell-fits @e2e" |

Hunt: 5 charters · 3 confirmed · 0 not ours · 4 rejected

The hunt ran once, at 7170c1a, in the harness's real Chromium, on the same fresh invented instances, from scratch specs under the gitignored `e2e/.tmp`. It took about 90 browser actions. Each confirmed finding then went RED on its own expect assertion, never on a timeout. All three were there before this branch, on main d1d3613, and were first recorded as not ours. Stefan then chose to fix all three on this branch, so the files they render through are now in its diff, and the bugs are ours. Each now has a `@e2e` test and a pass row (rows 7, 9 and 37), re-driven at 3f6de2f. The re-dispatch did not hunt again. The scratch specs are deleted.

Charter 1, first-time visitor, keyboard-only on the boards that no longer drag (Opdrachten per status, Sites per gezondheid), about 20 actions. Arrows move between cards, Enter opens, Space lifts nothing, and a 320 px mouse drag moves nothing and writes nothing. Neither board offers a lane "+", and both footers drop the drag hints. Finding: confirmed bug 1.

Charter 2, odd input, the read-only worker columns of Sites in the table and in a site's drawer, about 22 actions. Delete, Backspace, typing, Enter and a paste on Gezondheid, HTTP, WordPress and In registry opened no editor and sent no write. The drawer's In registry switch is aria-readonly. The Sites footer no longer sums HTTP codes. Finding: confirmed bug 3.

Charter 3, error paths, the selection bar on Sites met aandacht, about 14 actions. Only oud-archief ticked, then Smoketest draaien: "Geen van deze sites staat nog in de registry." shows in the bar, the tick stays and nothing is written. Select all reads "3 geselecteerd". The query row's drawer offers no actions, by the R15 ruling. After a search leaves one ticked row, the bar reads "1 geselecteerd", and Gezondheid checken acts on that site alone. No bug.

Charter 4, numbers and copy, the toolbar at 1280 by 800 with a 370-character save error and a drawer open, about 16 actions. The error is cut to one line with its full text in its title, and the toolbar keeps its height. "+ Nieuwe taak" ends 35 px left of the drawer. Without the drawer, the error sits on the one line. No bug, see the first rejected line.

Charter 5, state after reload, theatre's two-tone pill when a cell changes, after a reload, under a search, and on theatre's boards, about 18 actions. Changing a toewijzing to Geweigerd in its Status cell adds the red pill at once, and a reload keeps it. Theatre's Bord toewijzingen and Per status still drag and keep their lane "+". Finding: confirmed bug 2.

confirmed bug 1, fixed in 5aa886b, now row 7. Escape did not close a drawer opened from a board card. Open Opdrachten per status, focus the first card and press Enter: the drawer opens and focus stays on the card. Press Escape twice: the drawer stays. Clicking a card with the mouse, then Escape, does the same. Theatre's Bord toewijzingen, which drags, does the same. From a table, Openen then Escape closes it. Cause: the drawer closes on Escape only from a key event inside it (`SidePanel.tsx`), and a board keeps focus on the card. At 7170c1a, `apps/grid/src/board` and `SidePanel.tsx` were unchanged since main. Confirmed RED: expected 0 drawers, received 1. At 3f6de2f, board-groups-only presses Escape after the card's click and expects no drawer and the card focused, and it is green.

confirmed bug 2, fixed in a7390c6, now row 9. The title line's tone pills ignored the search box. On theatre's Toewijzingen with a geweigerd row, type Gastmuzikant in Zoeken. The count pill reads "1 rij" and the only row is Bevestigd, yet the pills still read "Geweigerd 1" and "Uitgenodigd 2". On Planning, a search with no match shows 0 rows and still "Optie 1". Cause: `insightOf` is fed the view's rows before the search, as main fed its warn pill. R10 changed what the pills show, not which rows they count. Confirmed RED: expected 0 pills, received 2. At 3f6de2f, title-pill-worst-first searches for an In orde site and expects "1 rij" and no pill, and it is green.

confirmed bug 3, fixed in 3f6de2f, now row 37. A Nee cell in the SLA column drew a stray dot. In Sites, the SLA cells of oud-archief, voorbeeld-blog and voorbeeld-site show the switch, "Nee" and a small dot under its end. The cell is 80 px wide and its content 101 px, so the cell's text-overflow draws an ellipsis that is clipped to one dot. It shows in studio-domain's own screenshot at 9dbf14b, before this branch. Confirmed RED: expected the scroll width at most 80, received 101. The fix makes a switch column's default width 108 px, so every switch column in theatre and fiche is 28 px wider too. toggle-cell-fits is green at 3f6de2f, and the retaken screenshot shows no dot.

rejected: at 1280 with any drawer open, the toolbar is two rows, 93 px against 57. That is the layout theatre's registered title-line-fits-with-a-drawer-open drives: the bar's end gives way first. The save error adds no height: 93 px with the drawer and no error, 93 px with both.

rejected: the console logs "[Table] Column with id 'id' does not exist." on studio's Opdrachten views. Their seeded views sort on the id, which is no grid column (`packages/studio/src/seed.ts`, unchanged by this branch). The rows still come newest first.

rejected: theatre's Toewijzingen Status cell still offers all six options inline. Theatre declares no transition buttons, so R17 does not apply, as the plan rules.

rejected: on a site's drawer the four actions are four filled buttons, each on its own line. That is the grid's existing action style, which R12 only moved to the head.

## Known and accepted, seen again

- The opdracht drawer keeps Verwijderen (review: a per-row `deletable` is deferred to Stefan's list).
- M-1, the R9 race on an optimistic drawer edit, was not driven: it is not a regression.

## The registry

`specs/CHECKS.md`:
- **Bumped:** every studio row (studio.spec.ts and smoke/studio.spec.ts), every drawer-actions row (e2e and smoke) and the title-line rows, to 7170c1a 2026-10-23.
- **Reworded:** "Studio · Opdrachten per status", grep id person-cannot-take-worker-steps. It now says the board does not drag, so no opdracht reaches the worker's steps.
- **Added, first feature studio-polish:** ten e2e rows and one smoke row.
  - In `e2e/studio.spec.ts`: no-edit-on-worker-columns, no-new-where-not-allowed, toolbar-at-1440, tick-on-a-query-view, row-lines-at-125, row-lines-at-150, board-groups-only, drawer-reads-right and title-pill-worst-first.
  - In `e2e/title-line.spec.ts`: title-pill-two-tones.
  - In `e2e/smoke/studio-polish.spec.ts`: the smoke row.
- **At the re-drive:**
  - Added toggle-cell-fits as an e2e row, first feature studio-polish.
  - Bumped to 3f6de2f 2026-10-23 every row this re-drive ran: the studio, drawer-actions and title-line rows, and their smoke rows.

`bun scripts/check-checks.ts` exits 0.

## Bite check

By reading the assertions. No product line was hand-broken.

- A person's write to a written_by column offered in the grid: row 1 (aria-readonly per column, on Sites, the log and Opdrachten' Status).
- A create control on a created_by model, a query without creates, or a lane whose column the person may not set: row 2.
- A board with drag false, or grouped by a buttons lifecycle: rows 7, 11 and 12, on the drag class, Space, the unchanged lane and the database status.
- R5, a sum on footer none: not pinned by an e2e. `group.test.ts` holds it, and the hunt read "Totaal · 5 rijen" with no HTTP sum.
- R6 primary: row 8, on the class. R8: rows 8, 15 and 32, on the words. R12: rows 8 and 32.
- R10: rows 9 and 10, on the labels, counts and tone classes.
- R11: row 3, on the toolbar height and the button's right edge.
- R15: row 4, on the exact site ids in the database.
- R19: rows 5, 6 and 36, on the computed colour and the token. Rows 5 and 6 pin the exact #c4cbd3, so a revert to #d0d6dd goes RED.
- Hunt bug 1: row 7. With no Escape handling for a skin's card, it fails on the drawer count, and with the focus lost, it fails on toBeFocused.
- Hunt bug 2: row 9. If the pills count the rows before the search, it fails on the pill count.
- Hunt bug 3: row 37. With a switch width of 80, it fails on the clipped-cell count.
- The engine's 403 service_only refusals: not driven in the browser, because the grid offers no control that reaches them. They are proven in `packages/engine/test/column-writers.test.ts` and `packages/studio/test/ownership.test.ts`.
