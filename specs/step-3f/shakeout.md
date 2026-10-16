# Shake-out: step-3f

Driven 2026-10-16 on `feature/step-3f`, on the reviewed and fixed code of 4698d09. The shake-out's own commits, 9320fba and
957c1f6, change `e2e/` only, so the product is the same at 957c1f6. Every row was driven on that commit.

The runner is the repo's own Playwright harness (`playwright.config.ts`):
- it starts a fresh invented theatre engine and its grid on 127.0.0.1:4311 and :5174, and fiche on :4312 and :5175;
- it signs in its invented accounts through the magic-link form (`e2e/global-setup.ts`);
- the editor `planner@e2e.test` drives every flow. The administrator `beheer@e2e.test` owns the shared, sorted boards of
  rows 4 and 5;
- every flow ran in a real Chromium at 1600×900, except planning-details (1440×900, then 1440×720),
  date-editors-fit (1280×800) and undo-from-the-page (1280×720).

Each flow makes its own invented records on the API, on weeks no other spec uses, and deletes them in a `finally`:
- board flows on 2032-02-02 … 2032-03-29, notes on 2032-05-03, bezetting on 2029-04-09;
- the tone flow on 2033-06-06, the timeline overlap on 2028-11-06;
- conflicts on 2034-09-04 … 2034-10-09. Ezra Dubbelboek is an invented person, double-booked on two productions. Mira
  Invaller, also invented, is the stand-in.

Each screenshot is the viewport, written by `e2e/shots.ts` with `SHAKEOUT_SHOTS=specs/step-3f/shakeout`.

Sweep:
- the grid's Vitest suite: 1332 tests in 80 files, green;
- `bun test packages scripts`: 2009 tests, green;
- the 3f flows: `e2e/step-3f.spec.ts`, `e2e/smoke/step-3f.spec.ts`, and planning-details, date-editors-fit and
  undo-from-the-page. 24 tests on 9320fba, 15:55–16:01; 23 passed.
  - board-keyboard timed out once (started 15:56:13). Its trace holds 8 `net::ERR_NETWORK_CHANGED`, and the page never
    drew the rail.
  - It passed alone on 957c1f6, 16:02–16:04, with board-reorder, board-reorder-fresh, board-undo-both and
    planning-details after their screenshots were added (5/5).
- the registry: every spec file `specs/CHECKS.md` names (all of `e2e/` but `step-0*`), 246 tests on 957c1f6,
  16:08–16:42; 241 passed. Each of the 5 failures timed out and passed when run alone (16:43–16:44, 5/5):
  - `dagplanning` › locatie-own-and-back (16:09:25, inside the 16:00–16:10 window of another process's disk-heavy
    `find /`), 44 `net::ERR_NETWORK_CHANGED`;
  - `step-3e` › drawer-anatomy (16:32:59), 12 `net::ERR_NETWORK_CHANGED`;
  - `grid-ux` › create-team-and-personal-view (16:12:37), a rail that never rendered;
  - `react-aria` › edit-relation-cell (16:18:59), an API call that timed out;
  - `toolbar` › filter-or (16:40:07), an API call in its `finally`, after every assertion had passed.

  The last three are the WSL flake's other forms: their traces carry no `net::ERR_` line, and each passed alone.

Runs that fell in the 16:00–16:10 window:
- the end of the 3f run;
- the five-test rerun for screenshots;
- the live measurements below;
- the first two minutes of the registry run.

Only locatie-own-and-back failed in that window.

`bun run gate` was not run here: the gate and the shake-out never overlap.

Flows:
- the plan's Test map names the board flows, undo-from-the-page, notities-block, group-filled, production-tone,
  conflict-marks-and-insight, conflict-band-negeren and timeline-overlap;
- Task 12 adds conflict-choose-other;
- the Tijd-width row carries the updated planning-details and date-editors-fit;
- rows 17 and 18 are the gaps the review named. Before this shake-out, the timeline's and the calendar's "Iemand anders
  kiezen" (b66c8e2) had no test at any layer.

Where the tests are:
- the flows: `e2e/step-3f.spec.ts` (`@e2e`);
- undo-from-the-page: `e2e/step-3e.spec.ts`;
- planning-details: `e2e/grid-ux.spec.ts`;
- date-editors-fit: `e2e/ui-fit.spec.ts`;
- the read-only checks: `e2e/smoke/step-3f.spec.ts` (`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | board-drop-between (B2, B4; review Note 5). Manual board "e2e Bord tussen", week of 2032-02-02: "e2e tussen sleep" (optie) and four bevestigd cards. Held by the mouse between Bevestigd's 2nd and 3rd card, the slot is drawn at index 2, and the live region reads "boven Bevestigd, plaats 3 van 5". Dropped, the card lands 3rd, and the API reads `status: bevestigd` with a `position`. The order holds after a reload. **Outside the board** (Note 5): held over Optie's top, the pointer leaves the board above it and lets go. The region reads "Slepen geannuleerd: e2e tussen sleep blijft in Bevestigd.", no card stays lifted, the order is unchanged, and no PATCH is sent. | browser | pass | Browser: http://127.0.0.1:5174/#view=34 · shakeout/board-drop-between.png — Test: `e2e/step-3f.spec.ts` › `board-drop-between @e2e` |
| 2 | board-reorder (B3). Four unranked optie cards on a manual board. The 4th goes to the top ("plaats 1 van 4"). The 3rd then goes to the 2nd place, below the ranked card and above the unranked ones ("plaats 2 van 4"). Each drop writes the card's `position`. The order holds after a reload (screenshot after it). | browser | pass | Browser: http://127.0.0.1:5174/#view=34 · shakeout/board-reorder.png — Test: `e2e/step-3f.spec.ts` › `board-reorder @e2e` |
| 3 | board-reorder-fresh (B3; empty edge, every card unranked). Card 1 of four unranked optie cards goes down to the 3rd place ("plaats 3 van 4"). It is 3rd at once, nothing else on the board moves, and its `position` is written. It is still 3rd after a reload. | browser | pass | Browser: http://127.0.0.1:5174/#view=35 · shakeout/board-reorder-fresh.png — Test: `e2e/step-3f.spec.ts` › `board-reorder-fresh @e2e` |
| 4 | board-sorted-to-manual (B5; re-entry). The administrator's shared board "e2e Bord gesorteerd", sorted on plandag and start_at: locked for the planner, with no changed mark. The earliest Optie card is dropped at the 3rd place. The board turns manual in the planner's own layout only: the changed mark (More actions) appears, and `ntdst-views/layout/v2/<view>` holds the sort `[position, plandag, start_at]`. The card's `position` is written. After a reload: the same order, and the mark. Terugzetten brings back the dates' order, and both the mark and the stored layout go. | browser | pass | Browser: http://127.0.0.1:5174/#view=37 · shakeout/board-sorted-to-manual.png — Test: `e2e/step-3f.spec.ts` › `board-sorted-to-manual @e2e` |
| 5 | board-sorted-cross-column (B5). The same kind of shared sorted board. A Thursday optie card is held over Bevestigd's top: the column is tinted (`nv-board__column--drop`), and no slot is drawn (screenshot). Dropped, it lands between Wednesday and Friday, by its date, not at the pointer. Its status is bevestigd and its `position` stays null. There is no changed mark. After a reload: the same, and the stored sort is unchanged. | browser | pass | Browser: http://127.0.0.1:5174/#view=38 · shakeout/board-sorted-cross-column.png — Test: `e2e/step-3f.spec.ts` › `board-sorted-cross-column @e2e` |
| 6 | board-slot-steady (B2; boundary, a crowded and scrolled column). 64 optie and 17 bevestigd cards, titles only. The held card sits in the board's middle (`scrollTop` > 200). The pointer goes into Optie a third of the way down, then down in 4px steps to three quarters. At every step the slot's index never steps back; overall it grows by at least 4. The slot box stays under the pointer: its top is never a slot's height or more away from it. Escape puts the card back, and no PATCH is sent. | browser | pass | Browser: http://127.0.0.1:5174/#view=39 · shakeout/board-slot-steady.png — Test: `e2e/step-3f.spec.ts` › `board-slot-steady @e2e` |
| 7 | board-undo-both (B7). A drop below two unranked Optie cards ranks them, then writes the dropped card's column and place: three records written. One ⌘Z restores the column, the place and every rank written: all three `position` null again, and the card bevestigd. This is driven twice: first with the focus on the page, then with the focus on Sluiten in the card's drawer. The board is as before after a reload. The screenshot is the drawer pass, after its ⌘Z. | browser | pass | Browser: http://127.0.0.1:5174/#view=36 · shakeout/board-undo-both.png — Test: `e2e/step-3f.spec.ts` › `board-undo-both @e2e` |
| 8 | board-keyboard (B8). Space lifts ("e2e toets a opgepakt in Optie, plaats 1 van 2."). ↓ and ↑ move within a column, → and ← to the neighbour at the same place, each announced in Dutch. Space drops ("neergezet in Bevestigd, plaats 2 van 4."). The API reads bevestigd, and the place holds after a reload. **Escape** cancels: "Slepen geannuleerd: e2e toets b blijft in Optie.", with status optie, `position` null and no PATCH. | browser | pass | Browser: http://127.0.0.1:5174/#view=37 · shakeout/board-keyboard.png — Test: `e2e/step-3f.spec.ts` › `board-keyboard @e2e` |
| 9 | board-drag-refused (B6; 3e row 11; review Note 4; denied and mid-flow). Bord toewijzingen with 64 geweigerd and 21 bevestigd invented places, scrolled to the card (`scrollTop` > 200). **Mouse:** Bevestigd › Geweigerd tints the column without scrolling the board. The drop answers 422, "statuswijziging is niet toegestaan" shows, and the card snaps back. Both columns' full order is unchanged, also after a reload. **Keyboard:** Space, →, Space gives the same 422 and the same snap-back. **No undo step on a manual board** (Note 4): Voorlopig › Bevestigd by keyboard first. Then a card is dropped below a Geweigerd card: that card is ranked, and the dropped card's own write is refused. One ⌘Z then undoes the earlier move (back to voorlopig). The refused card stays bevestigd, and the rank written stays. | browser | pass | Browser: http://127.0.0.1:5174/#view=20 · shakeout/board-drag-refused.png — Test: `e2e/step-3f.spec.ts` › `board-drag-refused @e2e` |
| 10 | undo-from-the-page (B7; the Test map's page-undo row, 3e's flow). Planning, week of 2028-11-13. A cell's Status goes optie › bevestigd through its select. Then the view's title is clicked, so no cell has the focus. ⌘Z: the API reads optie again. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/undo-from-the-page.png — Test: `e2e/step-3e.spec.ts` › `undo-from-the-page @e2e` |
| 11 | notities-block (G1, E2; empty edge). The Planning drawer of "e2e notities". NOTITIES is its own section right after Mensen, and no field line is named Notities, unfolded or not. Empty, it reads "Nog geen notities. Klik om er een toe te voegen.". Pressed, its textarea opens with the focus (shakeout/notities-editing.png). Two lines and Ctrl+Enter write the note, and the API reads the text. Escape on an edit keeps the text and the drawer open. After a reload the drawer reads the note back. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/notities-block.png — Test: `e2e/step-3f.spec.ts` › `notities-block @e2e` |
| 12 | group-filled (G7, E5; empty edge). Planning, week of 2029-04-09. Day one has two activities with 5 places, 3 of them filled: its band reads "bezetting 3/5". The next day has no places, and its band shows no bezetting fact. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/group-filled.png — Test: `e2e/step-3f.spec.ts` › `group-filled @e2e` |
| 13 | production-tone (G6, E4). Tijdlijn tourstops, week of 2033-06-06. The seeded productions carry the kleuren rose, sky and green, and one tourstop each. Each lane's `--lane` is `var(--tone-<kleur>)` from the first paint, never the palette first. Each lane's dot and bar paint as a probe of that tone does; the optie bar is hatched in its tone. The bar's drawer names De Kersentuin in its subline, beside a rose bar. With Nachtwacht's kleur set to violet on the API, its lane follows after a reload, and De Kersentuin keeps rose. The kleur is reset in the `finally`. | browser | pass | Browser: http://127.0.0.1:5174/#view=22 · shakeout/production-tone.png — Test: `e2e/step-3f.spec.ts` › `production-tone @e2e` |
| 14 | conflict-marks-and-insight (G2, G3, E3). Ezra is confirmed on two timed, overlapping activities, one of Nachtwacht and one of De Kersentuin, week of 2034-09-04. conflicten lists both, with ernst conflict. On Per status both cards carry the "Conflict" badge, titled "Ezra Dubbelboek staat dubbel ingepland…". The title line's "2 Conflicten" opens Conflicten in the same space (Alle producties). One activity moved to Geannuleerd by keyboard takes both marks and the count away, without a reload. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/conflict-marks.png — Test: `e2e/step-3f.spec.ts` › `conflict-marks-and-insight @e2e` |
| 15 | conflict-band-negeren (G4; re-entry). The card's drawer shows the band "Conflict", its text, and the words "Iemand anders kiezen" and "Negeren". Ezra carries the flag in Mensen. Negeren hides the band and stores nothing. Opened again, the drawer shows the band again. | browser | pass | Browser: http://127.0.0.1:5174/#view=21 · shakeout/conflict-band.png — Test: `e2e/step-3f.spec.ts` › `conflict-band-negeren @e2e` |
| 16 | conflict-choose-other from Planning and from Per status (G4, Task 12; review Should fix 1). Mira and Ezra both hold Speler, and Ezra's places are Speler places. From the drawer, opened by Openen on the Planning row or by a click on the Per status card: Iemand anders kiezen focuses the Persoon search on Ezra's flagged row in Mensen. "Mira" lists Mira Invaller. Picked: the band goes, Mensen lists Mira, and the place's `persoon_id` is hers. One ⌘Z on the page brings Ezra back, and the band with him. Picked again: after a reload, Mira holds the place and there is no band. Board screenshot: shakeout/conflict-choose-other-board.png. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/conflict-choose-other.png — Test: `e2e/step-3f.spec.ts` › `conflict-choose-other @e2e` |
| 17 | conflict-choose-other-timeline (G4; review Should fix 1, the timeline's record drawer; the gap the review named). The seeded Tijdlijn tourstops is over Tourstops, whose drawer lists no people. So the flow makes "e2e Tijdlijn kies", a timeline over Activiteiten laned by productie, week of 2034-10-02. A conflict across two productions puts one bar in each lane, and neither is marked as an overlap. The first bar carries the conflict flag. From the bar's drawer, the same choose, ⌘Z, choose again and reload as row 16. | browser | pass | Browser: http://127.0.0.1:5174/#view=43 · shakeout/conflict-choose-other-timeline.png — Test: `e2e/step-3f.spec.ts` › `conflict-choose-other-timeline @e2e` |
| 18 | conflict-choose-other-calendar (G4; review Should fix 1, the calendar's own drawer; the gap the review named). Kalender activiteiten, week of 2034-10-09. The event carries the conflict flag. From the calendar's own drawer, the same choose, ⌘Z, choose again and reload as row 16. | browser | pass | Browser: http://127.0.0.1:5174/#view=24 · shakeout/conflict-choose-other-calendar.png — Test: `e2e/step-3f.spec.ts` › `conflict-choose-other-calendar @e2e` |
| 19 | timeline-overlap (G5). Tijdlijn tourstops, week of 2028-11-06: two Nachtwacht tourstops that overlap by a day. Both bars are marked ("Overlapt met e2e overlap twee"), and the title line reads "1 overlap". With one cancelled, after a reload that bar reads cancelled, and the marks and the count are gone. | browser | pass | Browser: http://127.0.0.1:5174/#view=22 · shakeout/timeline-overlap.png — Test: `e2e/step-3f.spec.ts` › `timeline-overlap @e2e` |
| 20 | planning-details (C1, updated). 1440×900, Nachtwacht, week of 2027-03-22: R10's order, time ranges, tones, scope chip and rail (shakeout/details.png). A night activity past the day line, "Nachtrit e2e details" (00:30–02:00 the next day), reads "wo 24/03 00:30–02:00". Its Tijd cell has `scrollWidth` ≤ `clientWidth`. Measured live on a second night row: cell 216px wide, content 172px. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/planning-tijd-fits.png — Test: `e2e/grid-ux.spec.ts` › `planning-details @e2e` |
| 21 | date-editors-fit (C1, updated). Planning, week of 2026-10-12, 1280×800. The Tijd cell's datetime editor is no wider than its cell or its content, in light and in dark (shakeout/datetime-dark.png). On Optie of bevestigd, the date editor is as wide as its cell. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/datetime-light.png — Test: `e2e/ui-fit.spec.ts` › `date-editors-fit @e2e` |
| 22 | smoke: `GET /api/schema`, which serves flags, tones and `position` in this step, answers 401 `unauthenticated` without a session. | wire | pass | Test: `e2e/smoke/step-3f.spec.ts` › `/api/schema asks for a session before it serves flags, tones and ranks @smoke` |
| 23 | smoke: `GET /api/rows/activiteit?sort=position&limit=1` answers 401 `unauthenticated` without a session. | wire | pass | Test: `e2e/smoke/step-3f.spec.ts` › `/api/rows/activiteit sorted on position asks for a session @smoke` |
| 24 | smoke: `GET /api/rows/toewijzing?sort=position&limit=1` answers 401 `unauthenticated` without a session. | wire | pass | Test: `e2e/smoke/step-3f.spec.ts` › `/api/rows/toewijzing sorted on position asks for a session @smoke` |

Edges, per `edge-classes.md`:
- empty: row 3 (a column where every card is unranked), row 11 (an empty note asks for one), row 12 (a day without places
  shows no bezetting);
- denied actor: the writer's refusal through the whole chain, row 9 (422, and the card snaps back). An owner's or a link's
  `position` PATCH (403) is proven at the engine only (`position.test.ts`). Security L4 was not driven: on a shared
  board an owner is offered the drag and the server answers 403;
- re-entry: rows 1–5, 7 and 8 reload and read the order back; row 4 reverts the layout; rows 15–18 open the drawer again;
- concurrent: a second drop of the same card before the first answers queues on the record. That is proven in
  `store.test.ts` only, with no e2e: a hand cannot drop twice inside one PATCH's round trip;
- boundary: rows 6 and 9, crowded and scrolled columns of 64 or more cards;
- mid-flow failure: row 9, a refusal snaps back and leaves no undo step;
- delivery seam: every write is read back from `/api/rows`, and every board flow reads its order again after a reload;
- shape, not behaviour: rows 11–19 prove each engine shape by what the page paints (the block, the badge, the count, the
  colour, the bezetting fact), not by `/schema` alone.

Observations, not defects of this branch:
- **The dashboard drawer and the matrix row drawer offer "Negeren" only.** This is the ruled deferral (review,
  Deferrals); it was driven live in a scratch flow that was not committed.
  - Dashboard: a double booking today. The week tile marks the event, and its drawer's band holds `["Negeren"]`.
  - Toewijzingen per activiteit: the row label's drawer holds `["Negeren"]`.
  - The board, Planning, timeline and calendar drawers offer both words (rows 15–18).
- **Pre-existing: under an open drawer the title line clips the view's name** at 1280 (Planning reads "Plan") and the
  period pill at 1280 and 1440. Measured live:
  - At 1280×800, with a row's drawer open, the h1's box (the parent of `.nv-toolbar h1`) is 80px wide (x 286–366),
    while the h1 runs to x 401. The pill is 18 of 134px, and any insight is clipped with it.
  - The same with no insight at all (shakeout run, "e2e obs kaal", bevestigd, no people): this is not caused by 3f's
    "N Conflicten". 3e's "Optie" insight clips the same way.
  - At 1440 the pill is 91 of 134px.
  - At 1600, on Kalender activiteiten with "2 Conflicten" beside it, the pill reads "Week 4…" (71 of 150px;
    shakeout/conflict-choose-other-calendar.png).
  - Repro: sign in as the planner at 1280×800, open Planning on any week, and press Openen on a row.
  - title-line-reads-in-full checks the h1's own `scrollWidth` with no drawer open, so it stays green. For the controller
    to route: a 3d/3e drawer-column follow-up, or the UI-architecture feature.
- **Pre-existing: on a scrolled board, cards paint above the sticky column heads.** `.nv-board` has a 14px padding-top,
  and `.nv-board__head` is sticky at `top: 0`, so the heads stop 14px below the board's edge. Measured live on Bord
  toewijzingen, scrolled 600px: the board's top is at y 102 and Geweigerd's head at y 116. At y 109
  `elementFromPoint` is a card ("e2e kop 6"). Visible in shakeout/board-slot-steady.png and board-drag-refused.png.
  The same two rules stood in `app.css` at b9d0730, so this is not from the move to `board.css`.
- A flagged event's accessible name carries its flag's text, which names the other activity. On the dashboard's week
  tile the button "e2e obs dash twee" is also named "Conflict: Obs Dubbel staat dubbel ingepland: … twee en … een.". A
  screen reader hears both titles on each event, and a role-and-name locator for one matches both.
- The registry's auth row "Long text cell editor (no source serves a textarea column yet)" no longer holds:
  `activiteit.notities` is served as long text since E2. No e2e drives that cell editor in a grid. The Test map names
  only the drawer block (row 11), so this shake-out leaves the row as it is, for the controller.
- Registry upkeep in this pass:
  - undo-from-the-page (3e) was in the Test map and missing from `specs/CHECKS.md`; it is registered now.
  - Two greps matched no test, both rows restamped here and so fixed: `period-is-a-filter` is now `period-is-the-period`
    (dagplanning), and smoke/dagplanning's `f=%5B%2` is now `f=%5B%7`, as its title reads.
  - Every row with a test is stamped `957c1f6 2026-10-16`, the commit all 245 of them passed on.
  - `ui-fit.spec.ts` › open-button-shows-on-hover is still not registered. It ran green in the registry pass, and it is
    not 3f's to register.

Bite check: the review's fixed paths, and the test that goes red if each breaks:
- Should fix 1 (b66c8e2), "Iemand anders kiezen" in the board's, timeline's and calendar's drawers:
  - rows 16 (board), 17 (timeline) and 18 (calendar); `Board.test.tsx` for the board;
  - without `places` the band offers "Negeren" alone, and each row's `['Iemand anders kiezen', 'Negeren']` goes red;
  - before rows 17–18, nothing covered the Timeline and Calendar wiring.
- Should fix 2, the CHECKS stamps: this pass restamped every row on the commit it passed on.
- Note 3 (4fec7ce), timed bars overlap only when their times do:
  - `overlap.test.ts` and `Timeline.test.tsx` only. Row 19 uses tourstops, which carry dates and no times.
  - Driven live in a scratch flow: on a timeline over Activiteiten, Nachtwacht at 10–12, 14–16 and 15–17 on one day.
    Only 14–16 and 15–17 are marked, and the title line reads "1 overlap".
- Note 4 (2f683e6), a refused drop leaves no undo step: row 9's manual-board step, and `store.test.ts`.
- Note 5 (337095f), letting go outside the board cancels: row 1's second half, and `target.test.ts`.
- Note 7 (db021ae), the CSS beside its view: style only. Rows 1–11 render the board and the long block as before. No
  test asserts where the CSS lives.
- Note 8 (cdf1087), a band keyed by its text and marks: `Drawer.test.tsx` only. No e2e re-reads the flags in another
  order with a band hidden.
- Security L2 (117d655): `position.test.ts`.
- The cheap list:
  - Negeren hands the focus to Sluiten (b7a62de): `Drawer.test.tsx` only. Observed live on the board's drawer: after
    Negeren the focus is on Sluiten, and Escape closes the drawer. conflict-band-negeren clicks Sluiten, so it would
    stay green if this broke.
  - board-undo-both holds the focus on Sluiten (03e16eb): row 7 itself.
  - useTones for a caller not served the tone column (d2ce04f): `useTones.test.ts` only.
  - applyStep refusing a record named twice (880f6e5): `store.test.ts` only.
  - the Tijd column's 8px of slack (522e37a): row 20 (`scrollWidth` ≤ `clientWidth` on the night row) and
    `columns.test.ts`.
- Stefan's calls:
  - A read-only drawer shows no NOTITIES block while the note is empty (b1745ca): `Drawer.test.tsx`. Observed live: the
    board's drawer of an activity without a note has no Notities region (shakeout/conflict-band.png). With a note it
    shows the text, with no button and no textbox. The editable Planning drawer keeps its empty block (row 11).
  - The gallery card's relation line takes its record's tone (198fc23): `skins.test.tsx` only. Observed live on Galerij
    activiteiten: the productie line carries `var(--tone-sky)` for Nachtwacht and `var(--tone-rose)` for De Kersentuin.
