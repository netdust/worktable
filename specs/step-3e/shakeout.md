# Shake-out: step-3e

Driven 2026-10-14 on `feature/step-3e` at ea74984, the reviewed and fixed code, through the repo's own Playwright harness
(`playwright.config.ts`). The harness starts a fresh invented theatre engine and its grid on 127.0.0.1:4311 and :5174, and
signs in its invented accounts through the magic-link form. The editor `planner@e2e.test` drives every flow. Every flow
ran in a real Chromium, at 1280×720 or, for the board, drawer, matrix and insight flows, at 1600×900. Each flow that
writes makes its own invented records on the API and deletes them in a `finally`:
- activities of Nachtwacht on 2028-10-03…05, 2028-10-10, 2028-10-17 and 2028-10-24, weeks no other spec uses;
- one place of Lotte on 2028-10-17 (Speler, note "brengt eigen gitaar") and her absence that day ("e2e studiedag").

Each screenshot is the viewport, written by `e2e/shots.ts` with `SHAKEOUT_SHOTS=specs/step-3e/shakeout`.

Sweep:
- the grid's Vitest suite: 1201 tests, green;
- `e2e/step-3e.spec.ts` with `e2e/smoke/step-3e.spec.ts`: 21 tests. 19 passed, row 10 failed as expected (`test.fail()`),
  and row 11 was skipped (`test.fixme`), in 1.8 min. Every screenshot is from that run;
- the registered specs this diff touches were re-driven: attachments, dagplanning, grid-ux, period-today, rail-tree,
  react-aria, scrollbars, step-3c, step-3d, title-line, toolbar and ui-fit, 109 tests in 16.5 min. 108 passed.
  `toolbar.spec.ts` › `link-to-a-view-not-yours @e2e` failed every time, alone too. It went to `/#view=…&f=…` from `/`,
  then reloaded. Since the fix pass (I1), that same-page hash change lands the link while the app is open. Driven
  without the reload, the product is right: the note "De gedeelde weergave is er niet voor jou; je ziet Overzicht
  zonder de filters van de link." shows, there is no "Soort is Reis" chip, the heading is Overzicht and `f` leaves the
  address. The reload then threw that note away. The test is fixed (test-only): it opens the link cold, from
  `about:blank`, which is the mount path it was written for, and is green again. The 108 rows of those files in
  `specs/CHECKS.md` carry `ea74984 2026-10-14`.

`bun run gate` was not run here. The gate and the shake-out never overlap.

Flows: the plan's Test map names period-sequence (six skins), groep-everywhere, board-drag (mouse, keyboard),
board-column-plus, drawer-anatomy, matrix-cell-drawer and gallery-sections. Rows 15–17 are the read-only contracts the
orchestrator added: the dashboard's pill and read time, the rail counts and the title-line insight. The Test map proves
those by compare pair only. Row 10 is a defect found while driving row 9. Row 11 is held by ruling. Each flow has its
edges per `edge-classes.md`.

The flows are in `e2e/step-3e.spec.ts` (`@e2e`); the read-only checks are in `e2e/smoke/step-3e.spec.ts` (`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | period-sequence on Planning (grid, spec A1–A6, R1–R5): Maand lights Maand and the title-line pill names the month (`oktober 2026`). Maand again clears the period (neither chip lit, › disabled), since a grid shows every date. Week shows `Week 42 · 12–18 okt`, and › moves the week number. Vandaag returns to this week. Week again clears it. At every press no condition chip names a week, a month or an ISO day. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/period-planning.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Planning @e2e` |
| 2 | period-sequence on Per status (board): the same sequence as row 1. Maand again and Week again clear the period. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/period-per-status.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Per status @e2e` |
| 3 | period-sequence on Galerij activiteiten (gallery): the same sequence as row 1. Maand again and Week again clear the period. | browser | pass | Browser: http://127.0.0.1:5174/#view=23 · shakeout/period-galerij-activiteiten.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Galerij activiteiten @e2e` |
| 4 | period-sequence on Kalender activiteiten (calendar): boundary, a skin that needs a window. Maand again keeps Maand lit and Week again keeps Week lit; the period is never removed. › and Vandaag behave as in row 1. | browser | pass | Browser: http://127.0.0.1:5174/#view=24 · shakeout/period-kalender-activiteiten.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Kalender activiteiten @e2e` |
| 5 | period-sequence on Tijdlijn tourstops (timeline): as row 4, the period stays lit. The screenshot shows Week 42 with the today line on 14. | browser | pass | Browser: http://127.0.0.1:5174/#view=22 · shakeout/period-tijdlijn-tourstops.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Tijdlijn tourstops @e2e` |
| 6 | period-sequence on Toewijzingen per activiteit (matrix): as row 4, the period stays lit, with the role line under each head and the Afwezigheden chip in the bar. | browser | pass | Browser: http://127.0.0.1:5174/#view=2 · shakeout/period-toewijzingen-per-activiteit.png — Test: `e2e/step-3e.spec.ts` › `period-sequence on Toewijzingen per activiteit @e2e` |
| 7 | no-period-control (empty edge): "Bord toewijzingen" sits on a table with no date. It shows Filter, but no Periode radiogroup and no Vandaag. | browser | pass | Browser: http://127.0.0.1:5174/#view=20 · shakeout/no-period-control.png — Test: `e2e/step-3e.spec.ts` › `a view whose table has no date shows no period control @e2e` |
| 8 | groep-everywhere: on each of the six skins, "Groep: …" opens the Groeperen dialog with its choices, and Escape closes it. On Per status, Groep › Soort reads "Groep: soort". The board regroups: a "Voorstelling" column appears and "Optie" leaves. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/groep-everywhere.png — Test: `e2e/step-3e.spec.ts` › `groep-everywhere @e2e` |
| 9 | board-drag and board-column-plus (spec B1–B2): "e2e sleep mij" (optie, 2028-10-03) on Per status, week of 2028-10-02. **Mouse:** a drag from Optie to Bevestigd moves the card, and the API reads `status: bevestigd`. ⌘Z with the focus on the page puts it back in Optie. Every card's right edge stays within its column. **Keyboard:** Enter on "e2e sleep mij verslepen", then Enter, lands it in Bevestigd. Re-entry: Enter, Shift+Tab ×2, Enter takes it back to Optie. **Column +:** "Nieuw in Geannuleerd" opens the dialog without a Status field (preset). Nachtwacht on 2028-10-05 › Aanmaken gives exactly one activity on 2028-10-05, with `status: geannuleerd` (shakeout/board-column-plus.png). | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/board-drag.png — Test: `e2e/step-3e.spec.ts` › `board-drag @e2e`, `board-column-plus @e2e` |
| 10 | board-column-plus-in-window (boundary, a week that does not hold today; found driving row 9). **Repro:** sign in as planner and open Per status. Set its plandag condition to "ligt tussen 2028-10-02 en 2028-10-08" (title line `Week 40 · 2–8 okt`); every column reads "Geen activiteiten". Click the + on Optie ("Nieuw in Optie") and choose Productie Nachtwacht. Datum reads **2026-10-14** (today), not 2028-10-02. Aanmaken: POST `/api/rows/activiteit` answers 201 with `datum: 2026-10-14, status: optie`, and the dialog closes. Optie still reads "Geen activiteiten", 0 `.nv-board__card`, after a reload too. The card is made outside the board it was made from and never shows. The calendar's quick create starts on the window's first day (step 3d row 6). **Cause:** `apps/grid/src/ui/App.tsx:641` passes `window={calendar ? calendarShown : null}` to `QuickCreate`, so the board gets no window and `madeFrom` starts the date on today. By the same line, read from source and not driven, the toolbar's "Nieuwe …" on a board, gallery or timeline (`quickAdd`, `App.tsx:387`) gets none either. **Fixed** after the shake-out: every skin now passes the period it shows to `QuickCreate` (`window={calendar ? calendarShown : (period?.window ?? null)}`), so the date starts on the window's first day and the card shows where it was made. `test.fail()` removed; re-driven green. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/board-column-plus-in-window.png — Test: `e2e/step-3e.spec.ts` › `board-column-plus-in-window @e2e` |
| 11 | board-drag-refused (denied path: Bevestigd › Geweigerd refused with 422 and "statuswijziging is niet toegestaan", the card snaps back). Not driven: `test.fixme` by worktable-ac's ruling. It failed only at the end of the full suite on a crowded board (3 of 3 gate runs), and step 3f rebuilds the drag on dnd-kit and proves the refusal there. The writer's refusal and the store's revert stay covered by the theatre writer tests and the grid store's refusal tests. | browser | not-reachable | Held by ruling, carried to step 3f — Test: `e2e/step-3e.spec.ts` › `board-drag-refused @e2e` (`test.fixme`) |
| 12 | drawer-anatomy (spec C1–C3, Q14–Q15; review Minor 1): two invented activities on 2028-10-10 (10:00–12:00 and 14:00–16:00) on Planning, week of 2028-10-09. "Openen" on the first opens the drawer. The head reads "Repetitie · Activiteiten" and "1 van 2". The h2 is the title, the subline names Nachtwacht. Tijd reads `10:00–12:00` on one line and Plandag reads `di 10 okt 2028`. Mensen and Geschiedenis are regions. **Fold:** "+ 8 andere velden" unfolds more fields. **Keys:** with focus on Sluiten (in the head line, not on the ↑↓ buttons), `j` steps to "e2e lade tweede" (2 van 2) and `↑` steps back (1 van 2). The Volgende button steps to 2 van 2. **Expand:** "Volledig openen" adds `nv-drawer--wide`. Escape narrows it and leaves the drawer open. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/drawer-anatomy.png — Test: `e2e/step-3e.spec.ts` › `drawer-anatomy @e2e` |
| 13 | matrix-cell-drawer (spec D6; review C1, I2): Lotte placed as Speler, bevestigd, note "brengt eigen gitaar", on "e2e matrix lade" 2028-10-17, and away that day. Her head reads the role line "Speler", and Bezet reads `1/1`. A click on her cell opens "Lotte Verhaegen · e2e matrix lade". **Alert band:** "Afwezig en toegewezen", with its icon centred on the title line (< 3px apart), the reason as a sentence, and borderless word actions. Rol reads Speler and Activiteit the title. **Status:** the badge "✓ Bevestigd" opens in place, on the Status line (< 4px), with the radiogroup Status under it and the word "Status" once. **Kiezen:** "Wie kan in de plaats" lists 3. Kiezen on the first moves the same toewijzing (one record on the activity) with `rol_id` and `notitie` kept and state `voorlopig`, and the newcomer's head appears. **Undo:** one ⌘Z gives the place back to Lotte. **Afwezigheden:** pressed by default, toggles off and on. | browser | pass | Browser: http://127.0.0.1:5174/#view=2 · shakeout/matrix-cell-drawer.png — Test: `e2e/step-3e.spec.ts` › `matrix-cell-drawer @e2e` |
| 14 | gallery-sections (spec D5): Galerij activiteiten, Groep › Plandag. Each `.nv-gallery__head` names its day, and its count equals the cards in its section. **S M L:** Klein, then Groot, widens the first card. Middel narrows it again (screenshot at Middel). Groep › Geen restores the seed. | browser | pass | Browser: http://127.0.0.1:5174/#view=23 · shakeout/gallery-sections.png — Test: `e2e/step-3e.spec.ts` › `gallery-sections @e2e` |
| 15 | dashboard-title-pill (spec D7, read-only): Overzicht on landing. With no production chosen the pill reads `Alle producties · week 42` (ISO week of today), and the bar reads `bijgewerkt hh:mm`. With De Kersentuin chosen it reads `De Kersentuin · week 42`, the list closes, and `bijgewerkt hh:mm` is still there. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/dashboard-title-pill.png — Test: `e2e/step-3e.spec.ts` › `dashboard-title-pill @e2e` |
| 16 | rail-counts (spec D2, read-only): Activiteiten, Tourstops and Toewijzingen each show a `.nv-model__count` equal to `GET /api/rows/<dataset>?limit=1` `total`, named "<n> records". The Overzichten group (queries) shows no count. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/rail-counts.png — Test: `e2e/step-3e.spec.ts` › `rail-counts @e2e` |
| 17 | title-line-insight (spec D1c, Q12; review I5): two invented optie activities on 2028-10-24, Per status, week of 2028-10-23. The title line carries the warn badge "Optie" with its count, equal to the Optie column's cards (2). A keyboard drop of "e2e inzicht een" into Bevestigd makes it 1 at once, without a reload. ⌘Z makes it 2 again. Empty edge: on the week of 2031-03-03 there is no insight. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/title-line-insight.png — Test: `e2e/step-3e.spec.ts` › `title-line-insight @e2e` |
| 18 | smoke, a drawer's "alle n" link lands on the sign-in page: sessionless, `/#view=activiteit&f=[…productie_id…]` answers 200 with the sign-in form and no error text. | wire | pass | Test: `e2e/smoke/step-3e.spec.ts` › `a drawer link with a condition lands on the sign-in page @smoke` |
| 19 | smoke, `GET /api/rows/kandidaten?limit=1` (query changed in this step) answers 401 `unauthenticated` without a session. | wire | pass | Test: `e2e/smoke/step-3e.spec.ts` › `/api/rows/kandidaten asks for a session @smoke` |
| 20 | smoke, `GET /api/rows/werklijst?limit=1` (query changed in this step) answers 401 `unauthenticated` without a session. | wire | pass | Test: `e2e/smoke/step-3e.spec.ts` › `/api/rows/werklijst asks for a session @smoke` |

Observations, not defects:
- The dashboard's no-production pill reads "Alle producties · week 42", not "week 42". The `.replace(/^ · /, '')`
  branch at `App.tsx:433` (review Minor 8) never runs while the switcher names "Alle producties".
- At L the gallery cards stretch past 330px (two columns of about 480px at 1280). 330px is the column's minimum in
  `repeat(auto-fill, minmax(var(--min), 1fr))`, not a fixed width.

Bite check: the review's fixed paths, and the test that goes red if each breaks:
- C1, Kiezen recreates the place, or takes two undos: row 13 (role, note, one record, one ⌘Z), and `matrix/store.test.ts` › move;
- I1, the "alle n" link dead while the app is open: `App.test.tsx` › "lands a link followed while the app is open".
  No e2e clicks "alle n" itself, so this is a gap at the e2e layer. The same-page landing was observed live while
  re-driving `link-to-a-view-not-yours` (see Sweep);
- I2, theatre words in the cell drawer: `Panel.test.tsx` only. Row 13 reads "Rol" and "Activiteit", which the join's labels
  and the old i18n words both give, so row 13 would not go red;
- I3, the status opens on every click after one Enter: `Panel.test.tsx` › "opens the status for the hand-off only" only;
- I5, a stale insight: row 17 (the count follows a drop without a reload) and `App.test.tsx`;
- Minor 1, j/k only on the ↑↓ buttons: row 12 (keys from Sluiten) and `Drawer.test.tsx`;
- the period sequence and "never a chip": rows 1–7 and `ui/period.test.ts`;
- the refused board drop: no e2e (row 11, held); the grid store's refusal tests;
- the column + date outside the window: row 10, red until fixed.
