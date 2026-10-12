# Shake-out: step-3c

Driven 2026-10-13 on `feature/step-3c` at a45ed4f (the reviewed and fixed code: S1, N2, I-1…I-4 in f430629, 4df4bfe,
7e4c490, eaa2bb3), then re-driven at 6562271, which fixed three defects this shake-out found (observations 2–4 below), through the repo's own Playwright harness (`playwright.config.ts`) in an export of that commit,
because the full gate held the repo's own ports at the time. The harness starts a fresh invented theatre engine and
its grid (the repo's 127.0.0.1:4311 and :5174; the export remapped them only to run beside the gate, and the URLs
below are the repo's), and signs in its invented accounts through the magic-link form: editor `planner@e2e.test`
drives every flow, administrator `beheer@e2e.test` composes and deletes the team dashboard, owner `lotte@e2e.test`
(`persoon:1`) is the denied actor. Every flow ran in a real Chromium at 1280×720. Each flow makes its own records on
the API (productions such as "e2e botsingen" and "e2e lege productie", activities of Nachtwacht in the weeks of
June 2028 that nothing else uses, invented persons "Stat Proef", "Huid Proef") and deletes them again, whatever
happens; the week strip's flow is dated today, as the strip only shows this week. Each screenshot is the viewport,
written by `e2e/shots.ts` with `SHAKEOUT_SHOTS=specs/step-3c/shakeout`.

Sweep, at 6562271 plus the new flows:
- `bun run check`, `bun test packages scripts` and the grid vitest are the gate's, running in the repo at the same
  time; the shake-out did not re-run them beside it.
- `e2e/step-3c.spec.ts` with `e2e/smoke/step-3c.spec.ts`: 20 tests, 19 passed and row 10's expected failure
  (`test.fail()`), in 1.3 min; every screenshot is from that run.

Flows: the plan's Test map, E2E flows column (dashboard-landing, stat-red-then-neutral, stat-opens-view,
week-opens-activity, werklijst-set, quick-create, space-narrows, owner-no-dashboard, skins-open), rows 1–9 in that
order. Row 10 is a defect found while driving row 7. Rows 11–16 are the review's fixed behaviours and the Review
Focus edges, each its own committed flow.

The flows are in `e2e/step-3c.spec.ts` (`@e2e`); the read-only checks are in `e2e/smoke/step-3c.spec.ts` (`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | dashboard-landing (R7, gate "the dashboard is the landing page, every stat a live count"): `/` opens on "Overzicht". Its three stat tiles (Conflicten, Open plaatsen, Onbeantwoord) each read the total `GET /api/rows/<source>` answers under the view's own filters. Dark theme ("Donker" in the rail foot): `#root` is `data-theme="dark"`, background rgb(22, 23, 26), the sections still render. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/dashboard.png (dark: shakeout/dashboard-dark.png) — Test: `e2e/step-3c.spec.ts` › `dashboard-landing @e2e` |
| 2 | stat-red-then-neutral (gate; Review Focus "shape, not behaviour"): a production "e2e botsingen" with two overlapping activities on 2028-06-12, both bevestigd for "Stat Proef". With that production chosen, the Conflicten value read from the screen is ≥ 1 and the tile carries `nv-stat--bad`. The second Toewijzing PATCHed to geannuleerd (200), window focus: the value reads 0 and the tile carries no tone class (zero edge). | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/conflicten-red.png — Test: `e2e/step-3c.spec.ts` › `stat-red-then-neutral @e2e` |
| 3 | stat-opens-view (R7): pressing the Conflicten tile's title opens the view; the page heading reads "Conflicten". | browser | pass | Browser: http://127.0.0.1:5174/#view=13 · shakeout/stat-opens-view.png — Test: `e2e/step-3c.spec.ts` › `stat-opens-view @e2e` |
| 4 | week-opens-activity (R7): an activity of Nachtwacht dated today, "e2e vandaag in de strip", shows in the "Kalender activiteiten" week strip; clicking it opens its row drawer (complementary "e2e vandaag in de strip"). | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/week-drawer.png — Test: `e2e/step-3c.spec.ts` › `week-opens-activity @e2e` |
| 5 | werklijst-set (R7, gate "a werklijst row action runs from the list"): a taak "e2e afvinken" with no deadline is in the Werklijst list; its "Gedaan" button removes the row, and the title's count drops by one (re-entry: the list re-reads after its own `set`). | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/werklijst-set.png (before Gedaan) — Test: `e2e/step-3c.spec.ts` › `werklijst-set @e2e` |
| 6 | quick-create (R7, gate "a quick action creates a record"): "Nieuwe taak" → Titel "e2e snel aangemaakt" → Aanmaken: the dialog closes, the Werklijst count rises by one, the taak is on the server. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/quick-create.png — Test: `e2e/step-3c.spec.ts` › `quick-create @e2e` |
| 7 | space-narrows (R7, gate): choosing "De Kersentuin" in the space switcher sets the Conflicten value to `GET /api/rows/conflicten` under `productie_id` = De Kersentuin (3 against 8 for all productions). Only Conflicten is asserted (review M1); the other tiles are row 10. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/dashboard-space.png — Test: `e2e/step-3c.spec.ts` › `space-narrows @e2e` |
| 8 | owner-no-dashboard (denied actor, T1): in the owner's own signed-in context `GET /api/views` lists no view of skin `dashboard`. The person link page is not checked (review M1). | wire | pass | Test: `e2e/step-3c.spec.ts` › `owner-no-dashboard @e2e` — the owner's view list asserted |
| 9 | skins-open (R6, gate "each skin opens on a seeded view"), week of 2028-06-05: "Tijdlijn tourstops" shows "e2e huid tourstop" (5–8 jun) as one bar in the Nachtwacht row; "Galerij activiteiten" shows the activity's uploaded image (img "e2e huid activiteit"); "Kalender activiteiten" shows the activity; "Kalender afwezigheden" shows Huid Proef's absence as one bar in the "Hele dag" band, `grid-column-start` 4, `span 2` (its two days); "Bord toewijzingen" shows Huid Proef in the Voorlopig column. Two views the seed lacks, made by the flow and deleted after: "e2e Bord activiteiten" (board on Activiteit by status) shows the activity under Bevestigd; "e2e Kalender tourstops" (calendar on Speelreeks, which spans) shows the tourstop as one bar over ma 5 … do 8 (`grid-column-start` 2, `span 4`), ending before vr 9. | browser | pass | Browser: http://127.0.0.1:5174/#view=34 · shakeout/calendar-span.png (also shakeout/timeline.png, shakeout/gallery.png, shakeout/board.png, shakeout/board-activiteiten.png) — Test: `e2e/step-3c.spec.ts` › `skins-open @e2e` |
| 10 | space-narrows-every-tile (found while driving row 7 and row 14; spec R7 "the space switcher narrows every tile"): with a production chosen, only tiles on scoped sources narrow. Repro cold: as the editor, POST `/api/rows/productie` `{titel: "e2e productie zonder plaatsen", seizoen: "2028", status: "actief", organisatie_id: 1}`; open `/`, choose it in the space switcher. Conflicten reads 0 and "Vandaag · 0", but Open plaatsen still reads 1, Onbeantwoord 0 (the all-productions value), Plaatsen gevuld "0 van 1", and "Werklijst · 8" lists rows of other productions (e.g. "Open plaats voor Speler: repetitie Antwerpen"). Cause seen from the artifact: `werklijst` and `toewijzing` declare no `scoped`, and the plan (Task 5) applies the space only to a view whose `space` is `scoped`, so four of the eight tiles on Overzicht ignore the switcher while the rail says "e2e lege productie". | browser | fail | Browser: http://127.0.0.1:5174/ · shakeout/dashboard-empty-space.png (Open plaatsen 1, Plaatsen gevuld 0 van 1, Werklijst · 8 under "e2e lege productie") — Test: `e2e/step-3c.spec.ts` › `space-narrows-every-tile @e2e` (`test.fail()` until fixed) |
| 11 | composer-team-dashboard (Task 5b, review I-3 and I-4 as ruled; the rail delete): as the administrator, the rail's Dashboard group holds only the system "Overzicht" and offers no "Dashboard verwijderen". Bewerken → in section "Nu" the tile form: Soort tegel Getal, Weergave Vandaag, Titel tegel "e2e tegel", Kleur Rood, which shows "Boven" at 0 (a tile's options). Tegel toevoegen lists "Getal: Vandaag"; Opslaan makes a shared copy named "Overzicht" that lands with the "e2e tegel" stat, and the editor's landing shows it too (one team dashboard). The rail now lists two; "Dashboard verwijderen" on the copy deletes it (the dashboard list is back to the system one) and the editor's landing has no "e2e tegel". | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/composer.png — Test: `e2e/step-3c.spec.ts` › `composer-team-dashboard @e2e` |
| 12 | quick-create-activiteit (review I-1): "Nieuwe activiteit" with Alle producties asks Productie once (one combobox, "–"), Soort pre-filled (Voorstelling), Datum pre-filled with today; Productie Nachtwacht, Datum 2028-06-19, Soort Repetitie → Aanmaken: exactly one activity on plandag 2028-06-19, of Nachtwacht, soort repetitie. With "De Kersentuin" chosen, the dialog's Productie is De Kersentuin and changes to Nachtwacht. The review's "Plandag" is the column labelled Datum in the dialog (plandag is read-only and derived). | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/quick-create.png — Test: `e2e/step-3c.spec.ts` › `quick-create-activiteit @e2e` |
| 13 | editor-cannot-share-dashboard (review S1; empty edge): as the editor, POST `/api/views` `{name: "e2e gedeeld dashboard", skin: "dashboard", shared: true, layout: {sections: [], actions: []}}` → 403 `shared_dashboard`; the same unshared → 201; PATCH it `{shared: true}` → 403 `shared_dashboard` and it stays unshared. That empty own dashboard lands: heading "e2e eigen dashboard", "Dit dashboard is nog leeg.", Bewerken offered. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/dashboard-empty.png — Test: `e2e/step-3c.spec.ts` › `editor-cannot-share-dashboard @e2e` |
| 14 | dashboard-empty-space (empty edge, Review Focus T4/T5): a production "e2e lege productie" with no rows, chosen: Conflicten reads 0 with no tone class; the Vandaag list reads "Vandaag · 0" and "Geen rijen"; the week strip is empty. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/dashboard-empty-space.png — Test: `e2e/step-3c.spec.ts` › `dashboard-empty-space @e2e` |
| 15 | gallery-batch-boundary (review I-2; Review Focus boundary "201 ids answer 400"): an activity on 2028-06-26 with an uploaded PNG; `GET /api/attachments/activiteit?kind=foto&ids=<199 others>,<it>` (200 ids) → 200 with its file (`image/png`); 201 ids → 400 `bad_ids`. The grid's split into reads of 200 is `apps/grid/src/skins.test.tsx` (450 rows, three reads); no week holds 200 activities to drive it on a screen. | wire | pass | Test: `e2e/step-3c.spec.ts` › `gallery-batch-boundary @e2e` — statuses and the file asserted |
| 16 | tile-no-access (empty/denied edge, Review Focus T4): the administrator makes a private view "e2e eigen takenlijst" (taak) and a shared dashboard "e2e teamdashboard" whose one section "Privé" holds a stat on it (POST 201 each: a tile may name its owner's private view). The editor lands on "e2e teamdashboard" (shared by someone else ranks above the system one); the tile reads "Geen toegang" and the private view's name is nowhere in it. | browser | pass | Browser: http://127.0.0.1:5174/ · shakeout/tile-no-access.png — Test: `e2e/step-3c.spec.ts` › `tile-no-access @e2e` |

Edges not driven, with the reason:
- An action that fails shows its refusal and leaves the stat (re-entry): no seeded `set` or quick create is refused for the editor on a valid input; `more-tiles.test.tsx` covers the refusal.
- A span clipped at both window edges and a timeline over 92 days (boundary): unit tests (`calendar/layout.test.ts`, `timeline/*.test.tsx`); row 9 drives a span inside one week.
- Concurrent: two administrators saving the team dashboard at once is the views PATCH path's own; not driven.
- Mid-flow failure and delivery seam: nothing in this feature mails or rolls back.

Bite check: which test goes red when a dangerous path breaks.
- The landing not opening on the first readable dashboard, or a stat not a live count: row 1.
- The stat's tone not following its value, or not refreshing on focus: row 2.
- A list `set` writing elsewhere or not re-reading: row 5. A quick create sending a pre-filled value the dialog hid (I-1): row 12.
- An editor sharing a dashboard (S1): row 13 on the wire. An owner listing one: row 8.
- An administrator's save making a second copy instead of updating the team one, or the rail deleting the system dashboard (I-4): row 11.
- The 200-id cap lost on the engine: row 15. The grid's batching lost: unit only (`skins.test.tsx`), not bitten by any e2e flow.
- Any skin failing to render its seeded view: row 9.

Registry surfaces this branch touches: the landing page (every flow that starts at `/` now lands on the dashboard; a45ed4f fixed `step-0e`'s flow for it). The full suite is the gate's run in the repo, not re-driven here.

Observations, not failing a flow (live DOM, 1280×720):
Found at a45ed4f; 2–4 fixed in 6562271 and re-driven (the screenshots show the fixes), 1 and 5 open:
1. The open dashboard is not marked in the rail: its button has `aria-current="page"` but a transparent background and grey text rgb(79, 89, 100), where an open view's button has rgb(230, 238, 248) and blue rgb(37, 99, 171) (rows 1, 13).
2. Fixed: the title bar showed the table glyph (`lucide-table`) for the dashboard and for every skin; it now shows the view's own skin icon.
3. Fixed: a Speelreeks spanning four days was drawn as four separate chips, one per day; it is now one bar (row 9, shakeout/calendar-span.png).
4. Fixed: the composer's quick-actions group had no visible heading; it now carries the legend "Snelle acties" (shakeout/composer.png).
5. Since 6562271 the week band's axis cell no longer reads "Hele dag" on a spanning calendar (shakeout/calendar-span.png: the cell left of the bar is empty); the group keeps the name for assistive tech only.
