# Test audit, slice E2 (step-3 to 3f gates, plus grid-ux, react-aria, toolbar and ui-fit)

I ran no tests, builds, `bun`, `vitest`, `playwright` or `make`. Everything below comes from reading the source, at 9320fba in `/home/ntdst/Sites/worktable-prune`.

## Totals
- **Tests examined:** 129. By file: grid-ux 15, react-aria 16, step-3 12, step-3c 16, step-3d 14, step-3e 18, step-3f 18, toolbar 13, ui-fit 7.
- **DELETE:** 0. Every delete candidate is either registered in `specs/CHECKS.md` or named in a plan's Test map.
- **DELETE-CONFLICT:** 30.
- **REWRITE:** 14 (8 single tests, plus 6 ui-fit tests that share one helper fix).
- **KEEP:** 21 tests in 16 rows. The other 64 were read and found fine, so they get no row.
- **Lines that would go:** about 984 e2e lines (918 in test bodies, about 66 in helpers that go dead). The REWRITEs remove about 92 more e2e lines and add about 50 vitest lines. The moved assertions add back about 30 e2e lines. Net: about 1,040 lines out of the slice's 6,501.
- **Estimated gate time saved: about 4.5 to 7 minutes**, roughly 30 of the about 285 e2e tests.
  - The DELETE-CONFLICTs add up to about 207 s from each test's waits and steps. That fits the gate's own average of 6–12 s per test, so 3.5–5.5 min.
  - The REWRITEs save about 1–1.5 min: two `chooseOther` runs about 35 s, timeline-overlap about 10 s, ui-fit's screenshot-only theme passes about 15–20 s, small items about 5 s.
  - One finding outside the brief (seeding the read-limit rows in SQL) is worth about 1.5 min more.
- **Moderate-confidence calls**, the four Stefan should look at hardest: step-3e title-line-insight, step-3e undo-from-the-page, step-3f board-reorder, step-3f conflict-band-negeren. Each depends on an assumption stated in its row.

## Scanned
- **Read in full:** all 9 slice files. Helpers in `/home/ntdst/Sites/worktable-prune/e2e/`: tree.ts, shots.ts, editor.ts, board.ts, db.ts, auth.ts, segments.ts, fixture-views.ts, global-setup.ts. Also `/home/ntdst/Sites/worktable-prune/playwright.config.ts`.
- **Governing sources read:** `docs/SPEC.md`, `docs/REVIEW.md`, `AGENTS.md`, `specs/CHECKS.md`; the step-3, 3d and 3f reviews; the Test maps of step-3, 3d, 3f and grid-ux; grid-ux spec R10.
- **Lower-tier tests opened and compared line by line:** step3-queries, lookups (theatre), step3c (theatre), dashboard, skins (engine), Dashboard, Composer, more-tiles, ChipBar, Calendar, calendar/layout, Timeline, skins, Board, drop, flags, Matrix, RailFoot, Providers, engine (grid), conditions, Toolbar, App (lines 2110–2240).
- **Skimmed:** compared only against the lower tier's test names, not line by line:
  - react-aria's cell-editor flows (edit-date/datetime/select/relation-cell, add-and-remove-link, open-related-record, edit-long-text, toggle-bool, reorder-views);
  - step-3e drawer-anatomy and matrix-cell-drawer;
  - step-3d new-timeline-defaults;
  - grid-ux's tree and view-CRUD flows.

**Short names used in the evidence**, all under `/home/ntdst/Sites/worktable-prune/`:

| Short name | Path |
|---|---|
| `SPEC.md` | `docs/SPEC.md` |
| `CHECKS` | `specs/CHECKS.md` |
| `3f-plan` | `specs/step-3f/plan.md` |
| `gux-plan` | `specs/grid-ux/plan.md` |
| `gux-spec` | `specs/grid-ux/spec.md` |
| `3d-spec` | `specs/step-3d/spec.md` |
| `step3-queries.test.ts`, `lookups.test.ts`, `step3c.test.ts`, `grid-ux.test.ts` | `packages/theatre/test/` |
| `dashboard.test.ts`, `skins.test.ts`, `filter.test.ts` | `packages/engine/test/` |
| `Dashboard.test.tsx`, `Composer.test.tsx`, `more-tiles.test.tsx` | `apps/grid/src/dashboard/` |
| `ChipBar.test.tsx`, `period.test.ts`, `Window.test.tsx`, `Toolbar.test.tsx`, `App.test.tsx`, `tables.test.ts`, `usePageUndo.test.tsx`, `RailFoot.test.tsx` | `apps/grid/src/ui/` |
| `Calendar.test.tsx`, `layout.test.ts` | `apps/grid/src/calendar/` |
| `Timeline.test.tsx`, `overlap.test.ts` | `apps/grid/src/timeline/` |
| `skins.test.tsx`, `flags.test.tsx`, `engine.test.ts` | `apps/grid/src/` |
| `Board.test.tsx`, `drop.test.ts` | `apps/grid/src/board/` |
| `Matrix.test.tsx` | `apps/grid/src/matrix/` |
| `Drawer.test.tsx`, `group.test.ts`, `conditions.test.ts` | `apps/grid/src/grid/` |
| `Select.test.tsx` | `apps/grid/src/grid/cells/` |

## Dispositions

| path::method | disposition | reason (one line) |
|---|---|---|
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::read-limit-cut-bar-and-foot | DELETE-CONFLICT | The bar-count assertion appears twice (lines 759 and 760, identical) and equals read-limit-cut:746. Only the tfoot line (761) is new. Repeats an openWeek and a 5000-row render (about 10–20 s). |
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::band-facts | DELETE-CONFLICT | Same template and week shape as fold-day-band, which already asserts the facts (353). inherited-venue does too (441). About 7 s. |
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::fold-day-band | REWRITE | Takes over band-facts' unique assertions. Its gridline check (341–344) repeats step-3d looks-gridlines:143–161. |
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::read-limit-cut | KEEP | The only proof that the engine's 5000-row cap reaches the grid. Takes over the foot assertion. |
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::planning-details | KEEP | Its pixel values are spec-approved. |
| /home/ntdst/Sites/worktable-prune/e2e/grid-ux.spec.ts::dark-and-density | KEEP | Its row heights are spec-approved. |
| /home/ntdst/Sites/worktable-prune/e2e/react-aria.spec.ts::not-nullable-select-offers-no-leeg | DELETE-CONFLICT | engine.test.ts:147 maps not-nullable to required; Select.test.tsx:99 covers "required offers no leeg"; edit-select-cell:343 and 379–384 drive the same path in the browser. About 5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/react-aria.spec.ts::publish-address-reads-in-full | DELETE-CONFLICT | Same copy-and-publish flow as toolbar publish-from-share-menu. Only the scrollWidth check (1020–1021) is new. About 4–5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/react-aria.spec.ts::edit-datetime-cell | REWRITE | Its 'datetime-calendar' theme pass (302–316) opens the same popover component as 'date-calendar' (229–243). About 2–3 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::candidates-none | DELETE-CONFLICT | Matrix.test.tsx:626 covers "says Geen kandidaten…and still offers everyone"; step3-queries.test.ts:295 covers "none where nobody else has the role". About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::conflicten-edges | DELETE-CONFLICT | The untimed-rule edges are step3-queries.test.ts:166–227, case for case. The per-production split is :363–373. The space-switcher wire is covered by step-3c space-narrows and grid-ux switch-production. About 12 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::owner-denied-queries | DELETE-CONFLICT | The 404s are step3-queries.test.ts:435–445. The 200 plus the lookup-filter 400 are lookups.test.ts:121–134. The rail check moves to owner-has-no-switcher. About 3 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::month-starting-sunday | DELETE-CONFLICT | layout.test.ts:68 ("six Monday-first weeks", Nov 2026). Month naming is Window.test.tsx:44; the month step is period.test.ts:72. About 5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::conflicten-six-types | KEEP | The SPEC step-3 browser gate. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::badge-clears | KEEP | The SPEC step-3 browser gate. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::calendar-edges | KEEP | Measures drawn geometry that jsdom cannot. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3.spec.ts::point-event-shows-its-name | KEEP | The title's height inside the block is CSS. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::owner-no-dashboard | DELETE-CONFLICT | API only, identical to step3c.test.ts:56–59 and dashboard.test.ts:157–164. It is not even the browser gate SPEC asks for. About 1 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::gallery-batch-boundary | DELETE-CONFLICT | API only. skins.test.ts:76–82 covers 201 ids → 400 bad_ids and 200 → 200; :39 covers the mime. About 1 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::editor-cannot-share-dashboard | DELETE-CONFLICT | The API part is dashboard.test.ts:181–198. Landing order is tables.test.ts:120; Bewerken on an empty dashboard is Composer.test.tsx:157. The empty-dashboard copy moves to a unit test. About 2–3 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::quick-create-activiteit | DELETE-CONFLICT | more-tiles.test.tsx:92 ("asks each required column once, its day and option filled in") and :112 ("fills the chosen space in, and it stays changeable"). The real create is proven by quick-create and quick-create-calendar. About 4–5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::dashboard-empty-space | DELETE-CONFLICT | Same empty-production setup and landing as space-narrows-every-tile. Its three assertions move there. About 3 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::dashboard-landing | REWRITE | The dark block (122–129) asserts the root background rgb(22, 23, 26), exactly grid-ux dark-and-density:456–461. It says nothing about the dashboard itself. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::skins-open | REWRITE | Its `toHaveCSS('grid-column-…')` pins (337–338, 355–356) duplicate Calendar.test.tsx:169–179, which checks `gridColumn '2 / span 4'`. Keep the gate, drop the CSS pins. No time saved. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3c.spec.ts::stat-opens-view | KEEP | The SPEC 3c gate "a stat opens its view". |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::one-chip-row | DELETE-CONFLICT | Slot order on six skins is ChipBar.test.tsx:199–207 and :243–246. Per-skin period is covered by step-3e period-sequence ×6, Groep by groep-everywhere, a dateless table by no-period-control. Its dashboard check is wrapped in `if (dash > 0)`. About 30–35 s (6 openWeek). |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::calendar-lanes-in-groep | DELETE-CONFLICT | ChipBar.test.tsx:248 ([Productie, Tourstop, Geen]) and :230 (closes on pick, pressed state). Calendar.test.tsx:61 and :104 cover the legend with and without lanes. step-3 person-calendar:317–319 drives Groep→lanes in a real calendar. About 4–5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::grid-period-steps | DELETE-CONFLICT | period.test.ts:60 (week → month of its Thursday), :67 and :72; ChipBar.test.tsx:262–264; Window.test.tsx:44. Overlaps step-3e period-sequence on Planning and dagplanning's period test. Its one wire assertion moves. About 7–8 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::quick-create-calendar-readable | DELETE-CONFLICT | Same create on the same view and week as quick-create-calendar. Only lines 410–411 are new and they move. It is no longer `test.fail`. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::no-add-on-query-calendar | DELETE-CONFLICT | App.test.tsx:2130 "offers a new row on a dataset calendar and none on a query calendar", also checking no "Alleen lezen". About 3–4 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::unlaned-timeline-one-lane | DELETE-CONFLICT | skins.test.tsx:207–218 covers one lane, head = count, packed by overlap, third bar back on the first. The e2e adds pixel tops '9px'/'57px' (506–508) that no source approves, plus a corner-count assertion that moves. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::matrix-heads-and-legend | DELETE-CONFLICT | Matrix.test.tsx:213–237 covers tones, legend items, and first name vs whole name. Only "the legend is in the foot on a matrix only" (App.tsx:640) is new and it moves. About 6–7 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::gallery-placeholder | DELETE-CONFLICT | skins.test.tsx:143–155 covers 'OG' and `pictures: 1`. step-3c skins-open:325 proves the real batched image. Only the one-word "Zo" rule is new and it moves. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::summary-per-view | DELETE-CONFLICT | App.test.tsx:2223 covers calendar → dashboard ("week N"). step-3e dashboard-title-pill covers the dashboard's pill. The board's "N kolommen" moves to a unit test. About 4–5 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::looks-gridlines | REWRITE | Lines 163–165 claim "a matrix keeps its own lines" but only re-read `#root[data-lines]`, which cannot detect that. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3d.spec.ts::drawer-in-slot | KEEP | The 392px drawer is spec-approved and the geometry needs a browser. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::board-drag | DELETE-CONFLICT | Re-drives 3e's drag, now covered by step-3f: cross-column mouse drop and drop tint in board-sorted-cross-column:372–381; blurred ⌘Z in board-undo-both (page variant); Space and arrows in board-keyboard:536–549; the drop to the left column in Board.test.tsx:90. The card-fit assertion moves. About 12 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::board-column-plus | DELETE-CONFLICT | Same board, week and "Nieuw in" dialog as board-column-plus-in-window. The column's value is Board.test.tsx:57. Two assertions move. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::undo-from-the-page | DELETE-CONFLICT | usePageUndo.test.tsx:13. Board and grid share App's one store and tab history (App.tsx:213, :396, :616), so board-undo-both's page variant and conflict-choose-other's page ⌘Z prove the same path. Moderate confidence. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::title-line-insight | DELETE-CONFLICT | App.test.tsx:2154 covers "an edit takes the badge with it" and :2165 the insight gone. The board writes through the same App store. Moderate confidence. About 9–10 s (2 openWeek). |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::period-sequence on (6 skins) | KEEP | The period logic is unit-pinned, but each seeded skin's wiring and re-read is browser-only. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3e.spec.ts::gallery-sections | KEEP | Heads and counts duplicate skins.test.tsx:126, but the S/M/L widths are CSS. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::board-reorder | DELETE-CONFLICT | The rank cases are drop.test.ts:21, :32 and :42. Mouse drop within a column persisting over reload is proven by board-reorder-fresh and board-sorted-to-manual. Two small cases move to drop.test.ts. Moderate confidence. About 9 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::conflict-band-negeren | DELETE-CONFLICT | Drawer.test.tsx:298 (Negeren hides and stores nothing), :313 and :347 (the flagged person in Mensen). The real band in the board's drawer is driven by conflict-choose-other's board run (1102, 1104, 1122). Moderate confidence. About 8 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::conflict-choose-other-timeline | REWRITE | Repeats the whole `chooseOther` flow (9 POSTs, 2 openWeek, ⌘Z, reload). It differs only in the drawer: the timeline's comes from the same `useOpenRow` as the board's (Timeline.tsx:77 vs Board.tsx:62). Marks are flags.test.tsx:104–131. About 15–20 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::conflict-choose-other-calendar | REWRITE | Same: only the calendar's own Drawer `onLink` is new (Calendar.tsx:255). About 15–20 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::timeline-overlap | REWRITE | Marks, count and the cancelled bar left out are Timeline.test.tsx:89–102 and overlap.test.ts. "1 overlap" in the toolbar is Toolbar.test.tsx:197. Theatre's cancelled tone is grid-ux.test.ts:175. Only the App wiring is new. About 9–10 s. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::board-slot-steady | KEEP | Pointer plus scroll slot stability needs real layout. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::board-keyboard | KEEP | dnd-kit's words and real neighbour geometry. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::notities-block | KEEP | The persisted write and its read-back. |
| /home/ntdst/Sites/worktable-prune/e2e/step-3f.spec.ts::group-filled | KEEP | The only have>0 proof on real links. |
| /home/ntdst/Sites/worktable-prune/e2e/toolbar.spec.ts::or-with-period-narrows | DELETE-CONFLICT | conditions.test.ts:74 ("puts the conditions in $or…the period beside it so it always narrows") and filter.test.ts:65 ("$or sits beside plain keys"). Same builder flow as filter-or. About 7–8 s. |
| /home/ntdst/Sites/worktable-prune/e2e/toolbar.spec.ts::builder-fits-at-1280 | DELETE-CONFLICT | Same 1280×800 builder with Soort and Omschrijving conditions as ui-fit filter-row-fits. Its three containment checks move. About 5–6 s. |
| /home/ntdst/Sites/worktable-prune/e2e/ui-fit.spec.ts::select-and-picker-fit, space-switcher-fits, chips-fit, date-editors-fit, filter-row-fits, drawer-picker-keeps-its-frame | REWRITE | `bothThemes` (ui-fit:64–72) asserts nothing beyond the surface reopening. `shot()` returns at once without `SHAKEOUT_SHOTS` (shots.ts:5–6), so in the gate each call runs 3 theme switches and 2 open/close cycles for nothing. About 15–20 s in total. |
| /home/ntdst/Sites/worktable-prune/e2e/ui-fit.spec.ts::open-button-shows-on-hover | KEEP | A CSS regression check. |

## KEEP: the bar, point by point

**step-3.spec.ts::conflicten-six-types**
- Decided: SPEC.md:353 "the Conflicten view lists all six types: four from seeded data, open_slot and onbevestigd from rows the gate creates relative to today".
- Expected value: each of its own rows' Dutch Type and Ernst labels (step-3:214–227) come from the spec's type list, not from the code.
- Outcomes, not call shape: it reads the rendered cells.
- Caller's seam: the planner's Conflicten view in the browser.
- Can fail: a missing type or a wrong ernst fails `toHaveText`. Review CR-S4 tightened it.
- Lowest seam: the SQL is pinned at step3-queries.test.ts:95. SPEC.md:345 asks for this gate in a real browser, and no other e2e duplicates it.

**step-3::badge-clears**
- Decided: SPEC.md:353 "a badge appears on a conflicting row and disappears when fixed".
- Expected value: badge '1', then none on the same row (step-3:245, 260–261).
- Outcome: the rendered badge.
- Seam: Per persoon per dag and Afwezigheden, as a planner uses them.
- Can fail: yes; the row is asserted present, so a filtered-out row cannot fake a pass.
- Lowest seam: step3-queries.test.ts:355 covers the count. This e2e is the browser gate.

**step-3::calendar-edges**
- Decided: the day line, SPEC.md:295.
- Expected value: night block within its day column and taller than 100px, point event under 48px (step-3:511–521), from the spec's day line.
- Outcome: measured boxes.
- Seam: the Persoonskalender.
- Can fail: yes.
- Lowest seam: placements are layout.test.ts:23–38, but the drawn geometry is CSS that jsdom cannot measure.

**step-3::point-event-shows-its-name**
- Decided: the shake-out defect "name clipped to nothing".
- Expected value: title height above 8 and inside the block (step-3:575–576).
- Outcome: geometry.
- Seam: the person calendar.
- Can fail: yes.
- Lowest seam: Calendar.test.tsx:48 pins only the class; visibility is CSS.

**step-3c::stat-opens-view**
- Decided: SPEC.md:354 "a stat opens its view".
- Expected value: heading 'Conflicten'.
- Outcome: the routed page.
- Seam: the landing dashboard.
- Can fail: yes.
- Lowest seam: Dashboard.test.tsx:62–63 asserts only the callback; the e2e proves App routes it. About 2 s.

**step-3e::period-sequence on Planning / Per status / Galerij / Kalender / Tijdlijn / Matrix**
- Decided: CHECKS:216–221, and the step-3e "one period on every skin" rule.
- Expected value: lit and unlit state per skin type, pill text, week number restored by Vandaag.
- Outcome: radios and pill.
- Seam: each seeded view.
- Can fail: yes.
- Lowest seam: period.test.ts:37–77 and ChipBar.test.tsx:258 pin the logic. That each real seeded skin gets a period and reads again is browser-only. This is the one to keep; one-chip-row and grid-period-steps go.

**step-3e::gallery-sections**
- Decided: CHECKS:229.
- Expected value: cards get wider S → L, then narrower back.
- Outcome: measured widths.
- Seam: Galerij activiteiten.
- Can fail: yes.
- Lowest seam: heads and counts duplicate skins.test.tsx:126, but the widths come from CSS reading `--min`.

**step-3f::board-slot-steady**
- Decided: 3f-plan:71.
- Expected value: the slot index never steps back, and the slot stays within one height of the pointer (step-3f:442–448).
- Outcome: measured slots.
- Seam: a scrolled board.
- Can fail: yes.
- Lowest seam: needs real pointer and scroll layout. It costs about 30–60 s (240 s timeout), mostly 81 serial POSTs; see the findings.

**step-3f::board-keyboard**
- Decided: 3f-plan:71.
- Expected value: the Dutch live-region text per key (537–546) and the order after reload.
- Outcome: announcements and the stored order.
- Seam: a manual board.
- Can fail: yes.
- Lowest seam: Board.test.tsx:75–147 covers keyboard drops on mocked geometry. dnd-kit's arrow-to-neighbour on real geometry and the persistence are e2e-only.

**step-3f::notities-block**
- Decided: SPEC.md:140 (`long: true`).
- Expected value: the text written, kept on Escape, read back after reload.
- Outcome: the stored `notities` and its rendering.
- Seam: Planning's drawer.
- Can fail: yes.
- Lowest seam: Drawer.test.tsx:191–280 covers the block; persistence through theatre's declaration is the only addition.

**step-3f::group-filled**
- Decided: SPEC.md:143.
- Expected value: 'bezetting 3/5', and no fact on a day with none.
- Outcome: band text.
- Seam: Planning.
- Can fail: yes.
- Lowest seam: group.test.ts:152 pins the logic. grid-ux's band tests only ever see 0/2, which cannot tell "have counts targets" from "have is always 0".

**grid-ux::planning-details**
- Decided: gux-spec:157 "model 13.5px weight 500; view 13.5px weight 400, muted, 28px rows" and gux-spec:163 "The h1 is 19px".
- Expected value: those approved numbers.
- Outcome: computed style.
- Seam: Planning.
- Can fail: yes.
- Lowest seam: CSS, so e2e.

**grid-ux::dark-and-density**
- Decided: gux-spec:79 "Compact (32px), Normaal (40px) and Ruim (46px)".
- Expected value: those heights.
- Outcome: measured rows.
- Seam: Bevestigd.
- Can fail: yes.
- Lowest seam: CSS.

**grid-ux::read-limit-cut**
- Decided: SPEC.md:45, the 5000 default.
- Expected value: '5000+ rijen · 2 groepen', and '… zonder tijd'.
- Outcome: rendered counts.
- Seam: Planning.
- Can fail: yes.
- Lowest seam: Toolbar.test.tsx:62 and group.test.ts:165 pin the "+". Only this test proves the engine's real cap reaches the grid.

**step-3d::drawer-in-slot**
- Decided: 3d-spec:36 "Record drawer as a full-height column, 392px".
- Expected value: 392–393px, height 900, overlay below 760px.
- Outcome: boxes.
- Seam: the Per status board.
- Can fail: yes.
- Lowest seam: geometry. Its DOM-structure asserts (188–191) repeat the App.test case named in specs/step-3d/plan.md:64 and could go.

**ui-fit::open-button-shows-on-hover**
- Decided: the regression note at ui-fit:418 ("a rule with #root once kept it at opacity 0").
- Expected value: opacity 0 → 1.
- Outcome: computed style.
- Seam: Personen.
- Can fail: yes.
- Lowest seam: CSS. It is not registered in CHECKS.

## REWRITE: the bar, point by point, and the replacement

**step-3f::conflict-choose-other-timeline and ::conflict-choose-other-calendar**
- Decided: the step-3f review ruling 1(a), "goes in every record drawer that has a store behind it".
- As written the expected values are fine.
- Outcomes are fine.
- Seam: as written they are a whole planner flow repeated four times.
- They can fail.
- Lowest seam: fails. They are duplicates of the Planning and board runs except for the drawer each skin builds (Timeline.tsx:77 via `useOpenRow`; Calendar.tsx:255 with its own Drawer). The marks are flags.test.tsx:104–131.
- Replacement: one Timeline.test.tsx case and one Calendar.test.tsx case, mirroring Board.test.tsx:164–196.
  - Render with `flags` and `places={(of, id) => placeWriter(store, of, id)}`.
  - Click the flagged bar or event.
  - Assert the band's buttons are ['Iemand anders kiezen', 'Negeren'] and that a pick writes the place once.
  - App's prop wiring (App.tsx:610 and :613) would then rest on one optional App.test.tsx case. Without it, a missing optional `places` prop would go unnoticed.

**step-3f::timeline-overlap**
- Decided: SPEC.md:141 "The timeline's 'N overlap' … counts the bars of one lane that overlap".
- Expected value, outcome and failure: fine as written.
- Lowest seam: fails; see its row in the table.
- Replacement: an App.test.tsx case. Schema: a timeline view whose status tones mark the cancelled option `bad`. Rows: two overlapping bars in one lane. Assert `.nv-toolbar__overlaps` reads '1 overlap'; with one bar cancelled, assert none. Then delete the e2e.

**grid-ux::fold-day-band**
- Its own fold, reload and Enter assertions pass the bar.
- Lowest seam / no duplicates: fails twice. Lines 341–344 duplicate looks-gridlines, and band-facts duplicates its setup.
- Replacement: drop 341–344 and the `openLooks` call at 342. Before the fold, add band-facts' loop (all 4 bands '7' plus the facts) and `.nv-bar__count` '28 rijen · 4 groepen` (band-facts:378–382).

**step-3d::looks-gridlines**
- Every point passes except "can fail" for lines 163–165: the root attribute is set by RailFoot whatever view is open.
- Replacement: assert a matrix cell's `border-right-width` is the same with Rasterlijnen Aan and Uit, which is what the comment claims; or drop the lines.

**step-3c::dashboard-landing**
- The live-count part passes (SPEC.md:354).
- The dark part fails "no duplicates": it is grid-ux:461 verbatim.
- Replacement: drop 122–129, or check a stat tile's luminance in dark mode with react-aria's `luminance` helper (react-aria:109–124), so that "licht en donker" (CHECKS:180) says something about the dashboard.

**step-3c::skins-open**
- The SPEC 3c gate passes the bar.
- Its CSS grid-column pins are implementation, already unit-pinned.
- Replacement: keep `toHaveCount(1)` for "one bar, not a chip per day". Drop the four `toHaveCSS` lines, or replace them with box edges measured against the day heads.

**react-aria::edit-datetime-cell**
- The editor assertions pass.
- The theme pass duplicates 'date-calendar': it is the same `PickerEditor` (Date.tsx:116–146).
- Replacement: drop lines 302–316.

**The 6 ui-fit tests listed in the table**
- Their fit assertions pass the bar (layout jsdom cannot measure).
- `bothThemes` cannot fail meaningfully.
- Replacement: add `if (!process.env.SHAKEOUT_SHOTS) return` as the first line of `bothThemes` (ui-fit:64). The shake-out keeps its screenshots and the gate drops about 15–20 s.

## DELETE-CONFLICT: the governing line, quoted

Each CHECKS line is quoted up to its entry. Deleting a test means removing or merging its row.
- grid-ux::read-limit-cut-bar-and-foot — CHECKS:48 `| Dagplanning · read limit | e2e | bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"`
- grid-ux::band-facts — CHECKS:46 `| Dagplanning · day bands | e2e | … --grep "band-facts @e2e"`, and gux-plan:43 `| Group bands | GridBody, groupRows | unit · … | fold-day-band, band-facts |`
- react-aria::not-nullable-select-offers-no-leeg — CHECKS:99 `| Select cell editor · not nullable | e2e | … --grep "not-nullable-select-offers-no-leeg @e2e"`
- react-aria::publish-address-reads-in-full — CHECKS:109 `| Exporteren / delen · Publiceren dialog | e2e | … --grep "publish-address-reads-in-full @e2e"`
- step-3::candidates-none — CHECKS:167 `| Matrix · geen kandidaten, Iedereen tonen | e2e | … --grep "candidates-none @e2e"`
- step-3::conflicten-edges — CHECKS:169 `| Conflicten · randen en per productie | e2e | … --grep "conflicten-edges @e2e"`
- step-3::owner-denied-queries — CHECKS:172 `| GET /api/rows/conflicten, kandidaten, persoon_dag, locatie_dag, werklijst · owner | e2e | … --grep "owner-denied-queries @e2e"`
- step-3::month-starting-sunday — CHECKS:177 `| Bedrijfsweek · maand die op zondag begint | e2e | … --grep "month-starting-sunday @e2e"`
- step-3c::owner-no-dashboard — CHECKS:193 `| GET /api/views · owner, geen dashboard | e2e | … --grep "owner-no-dashboard @e2e"`, and SPEC.md:354 "…an owner never sees a dashboard". The browser form moves to owner-has-no-switcher; the test as written is API-only.
- step-3c::gallery-batch-boundary — CHECKS:195 `| GET /api/attachments/activiteit?ids · 200 en 201 | e2e | … --grep "gallery-batch-boundary @e2e"`
- step-3c::editor-cannot-share-dashboard — CHECKS:192 `| POST/PATCH /api/views dashboard shared · editor | e2e | … --grep "editor-cannot-share-dashboard @e2e"`
- step-3c::quick-create-activiteit — CHECKS:186 `| Dashboard · Nieuwe activiteit | e2e | … --grep "quick-create-activiteit @e2e"`
- step-3c::dashboard-empty-space — CHECKS:189 `| Dashboard · lege productie | e2e | … --grep "dashboard-empty-space @e2e"`
- step-3d::one-chip-row — CHECKS:202 `| Chiprij · elke weergave | e2e | … --grep "one-chip-row @e2e"`
- step-3d::calendar-lanes-in-groep — CHECKS:203 `| Kalender · Groep (rijen) | e2e | … --grep "calendar-lanes-in-groep @e2e"`
- step-3d::grid-period-steps — CHECKS:204 `| Planning · periode stappen | e2e | … --grep "grid-period-steps @e2e"`
- step-3d::quick-create-calendar-readable — CHECKS:206 `| Kalender · Nieuwe activiteit leesbaar (test.fail tot de fix) | e2e | … --grep "quick-create-calendar-readable @e2e"`
- step-3d::no-add-on-query-calendar — CHECKS:207 `| Persoonskalender, Bedrijfsweek · geen Nieuw | e2e | … --grep "no-add-on-query-calendar @e2e"`
- step-3d::unlaned-timeline-one-lane — CHECKS:209 `| Tijdlijn · Groep geen, één rij | e2e | … --grep "unlaned-timeline-one-lane @e2e"`
- step-3d::matrix-heads-and-legend — CHECKS:211 `| Matrix · koppen en legende | e2e | … --grep "matrix-heads-and-legend @e2e"`
- step-3d::gallery-placeholder — CHECKS:212 `| Galerij · initialen, met beeld | e2e | … --grep "gallery-placeholder @e2e"`
- step-3d::summary-per-view — CHECKS:213 `| Titelregel · samenvatting per weergave | e2e | … --grep "summary-per-view @e2e"`
- step-3e::board-drag — CHECKS:224 `| Bord · slepen, muis en toetsen, ⌘Z | e2e | … --grep "board-drag @e2e"`
- step-3e::board-column-plus — CHECKS:225 `| Bord · + in kolom | e2e | … --grep "board-column-plus @e2e"`
- step-3e::undo-from-the-page — not in CHECKS. 3f-plan:72 `| Page undo | usePageUndo | component · ui/usePageUndo.test.tsx · grid vitest | board-undo-both, undo-from-the-page |`
- step-3e::title-line-insight — CHECKS:232 `| Titelregel · inzicht Optie | e2e | … --grep "title-line-insight @e2e"`
- step-3f::board-reorder — CHECKS:234 `| Bord · volgorde in een kolom, na herladen | e2e | … --grep "board-reorder @e2e"`, and 3f-plan:71 `| Board drag | … | board-drop-between, board-reorder, board-sorted-to-manual, …`
- step-3f::conflict-band-negeren — CHECKS:246 `| Bord · conflictband met Iemand anders kiezen en Negeren; … | e2e | … --grep "conflict-band-negeren @e2e"`, and 3f-plan:76 `| flags | … | conflict-marks-and-insight, conflict-band-negeren |`
- toolbar::or-with-period-narrows — CHECKS:82 `| Filter · Of | e2e | … --grep "or-with-period-narrows @e2e"`
- toolbar::builder-fits-at-1280 — CHECKS:79 `| Filter builder | e2e | … --grep "builder-fits-at-1280 @e2e"`

## Assertions to move before the deletes
- **read-limit-cut-bar-and-foot → read-limit-cut:** `expect(page.locator('tfoot td.nv-first')).toHaveText(\`Totaal · ${MAX_READ}+ rijen\`)` (grid-ux:761).
- **band-facts → fold-day-band, before the fold:** the four-band loop (count '7' plus facts) and '28 rijen · 4 groepen' (grid-ux:378–382). The summary regex is already in planning-details:493.
- **owner-denied-queries and owner-no-dashboard → grid-ux owner-has-no-switcher:** the rail has no 'Conflicten' and no 'Per persoon per dag' (step-3:473–474); the rail has no `group 'Dashboard'` and the heading is not 'Overzicht'. That gives SPEC.md:354 its browser proof.
- **editor-cannot-share-dashboard → Dashboard.test.tsx:167:** `getByText('Dit dashboard is nog leeg.')` (step-3c:467), replacing the current check that some region exists.
- **dashboard-empty-space → space-narrows-every-tile:** Conflicten `not.toHaveClass(/nv-stat--/)`, 'Vandaag · 0', and 'Geen rijen' in Vandaag (step-3c:483–485).
- **month-starting-sunday → Calendar.test.tsx:** a month render of 2026-11-01..30 shows 6 `tbody tr`; the first row's last cell reads '1' and the last row's first cell reads '30' (step-3:543–545).
- **one-chip-row:**
  - → dashboard-title-pill: the dashboard's bar has no 'Groep:' button and no 'Periode' radiogroup (step-3d:266–272).
  - → groep-everywhere's six-skin loop: 'Kolommen' is visible on every skin except the matrix, which shows '+ Kolom' (step-3d:236–257).
- **calendar-lanes-in-groep → groep-everywhere:** the Groep dialog lists ['Productie', 'Tourstop', 'Geen'] on Kalender activiteiten and ['Productie', 'Geen'] on Tijdlijn tourstops (step-3d:283, 301).
- **grid-period-steps → dagplanning.spec.ts period-is-the-period** (/home/ntdst/Sites/worktable-prune/e2e/dagplanning.spec.ts:139): one 'Volgende periode' press brings a next-week row in (step-3d:315–319). This target is outside my slice.
- **quick-create-calendar-readable → quick-create-calendar after step-3d:374:** the band's button `not.toHaveAccessibleName('')`, and its height ≥ 16 (step-3d:410–411).
- **unlaned-timeline-one-lane → skins.test.tsx:207:** `.nv-tl__corner .nv-tl__count` is present when laned and absent unlaned (step-3d:491, 502).
- **matrix-heads-and-legend → App.test.tsx "a matrix view":** list 'Legende' in `footer.nv-foot` on a matrix, gone after switching to a grid view (step-3d:575–582).
- **gallery-placeholder → skins.test.tsx:143:** a one-word, picture-less title reads its first two letters ('Zonnewende' → 'Zo') (step-3d:608).
- **summary-per-view → skins.test.tsx:** Board's `onShown` carries `columns: <number of options>`, so the count reads "· N kolommen" (step-3d:637). Nothing pins this today.
- **board-drag → board-drop-between:** every card's right edge ≤ its column's right edge (step-3e:185–191).
- **board-column-plus → board-column-plus-in-window:** `dialog.getByLabel('Status')` count 0, and the stored row's status equals the column's (step-3e:223, 237).
- **board-reorder → drop.test.ts:**
  - a drop at index 0 of an unranked column ranks only the dropped card;
  - a drop just below the one ranked card, above unranked ones, ranks only the dropped card (step-3f:243–256).
- **conflict-band-negeren → `chooseOther`'s first run, optional:** Negeren, band gone, reopen, band back (step-3f:1045–1050). Otherwise Drawer.test.tsx:298 stands alone.
- **or-with-period-narrows → filter-or, optional:** one 'reis' row outside the week stays out after Of (toolbar:384, 408). conditions.test.ts:74 already pins the logic.
- **publish-address-reads-in-full → publish-from-share-menu after toolbar:478:** `address.scrollWidth <= address.clientWidth` (react-aria:1020–1021).
- **builder-fits-at-1280 → filter-row-fits:** with the Soort value list open, `.nv-fb-panel`, `.nv-fb__menu` and `.nv-fb__remove` stay inside 1280×800 (toolbar:283–300).
- **Nothing to move** for candidates-none, conflicten-edges, gallery-batch-boundary, quick-create-activiteit, no-add-on-query-calendar, undo-from-the-page, title-line-insight, not-nullable-select-offers-no-leeg.

## Support code that goes dead if every DELETE is applied
- **step-3d.spec.ts:** `slotsOf` (76–103), `inOrder` (106–113), `openDashboard` (122–129), `summary` (69), `MONTH` (17), and the WEEK keys `chips`, `period`, `matrix`, `gallery`.
- **step-3e.spec.ts,** in 'the board drags': `made`, `nachtwacht`, `card` and `status` (134–151). The imports `glide`, `lift`, `cardIn` and `openEditor` go unused.
- **step-3.spec.ts:** the `state` import, and the WEEK keys `none`, `edges`.
- **step-3c.spec.ts:** the WEEK keys `quick`, `empty`.
- **step-3f.spec.ts:** the WEEK keys `reorder`, `ignore`.
- **CHECKS rows** listed above. Plan Test map cells to update: gux-plan:43, 3f-plan:71, 72 and 76.
- **Shake-out screenshots** these tests produce go with them: for example `specs/step-3/shakeout/candidates-none.url`, `conflicten-scoped.url`, `month-six-weeks.url`; `specs/step-3c/shakeout/dashboard-empty-space.url`; `specs/step-3d/shakeout/matrix-heads-and-legend.url`, `quick-create-calendar-readable.url`; `specs/step-3e/shakeout/board-drag.url`, `board-column-plus.url`, `title-line-insight.url`. Some `specs/*/shakeout.md` ledgers cite them.

## Findings outside the brief
- **Stale CHECKS entry:** CHECKS:60 `--grep "period-is-a-filter @e2e"` matches no test. The test is `period-is-the-period @e2e` (/home/ntdst/Sites/worktable-prune/e2e/dagplanning.spec.ts:139); "period-is-a-filter" is only its screenshot name. That registered check runs nothing.
- **Stale "test.fail" labels:** CHECKS:175, 188 and 206 say "(test.fail tot de fix)", but point-event-shows-its-name (step-3:550), space-narrows-every-tile (step-3c:235) and quick-create-calendar-readable (step-3d:392) are plain `test(...)`. The comments at react-aria:900 and step-3d:390–391 still say expected-to-fail.
- **Unregistered flows:** undo-from-the-page, open-button-shows-on-hover, conflict-choose-other-timeline and conflict-choose-other-calendar are not in CHECKS.
- **Assertions that cannot fail as claimed:**
  - Dashboard.test.tsx:167 "an empty dashboard says so" only asserts that some region exists.
  - step-3d:164–165, covered above.
  - grid-ux:759–760 are the same assertion twice.
  - step-3d:269's `if (dash > 0)` lets the dashboard block skip silently.
- **Implementation pins that no source approves:**
  - step-3d:506–508 (bar tops 9px and 57px);
  - step-3c:337–338 and 355–356 (CSS grid-column);
  - step-3e:437 (`border-top-style: none` on the alert's buttons);
  - step-3f:137–141 and 327–333, where `storedSort` reads the localStorage key `ntdst-views/layout/v2/<id>`; the stored-layout format is pinned rather than the behaviour.
- **Read-limit setup cost:** grid-ux:712–739 creates and deletes 5,001 activities through the API in 101 batches of 50 each way. It is likely the largest single fixed cost in the slice. One `writeDb` statement (a recursive-CTE INSERT, with `plandag` set) and one DELETE would likely save about 1.5 min. The read limit needs no writer or revisions.
- **Serial setups:**
  - board-slot-steady creates 81 activities one by one (step-3f:403–405);
  - board-drag-refused creates 85 toewijzingen one by one (step-3f:589–591);
  - conflicten-edges re-fetches every production (`nachtwacht()`, a GET with limit=500) for each of its 12 activities.

  Batching them as grid-ux:719–728 does would save a few seconds each. board-slot-steady's "ids run as made" comment does not apply to its assertion.
- **Fixed sleeps:** react-aria's `settle` (400 ms, about 12 calls), toolbar's 800 ms waits (4), and grid-ux:614 (500 ms) add about 8 s of fixed sleep in total. These are negative assertions; a request counter plus `expect.poll` with a short timeout would bound them.
- **Screenshot-only step:** step-3 company-week:354–356 switches to Donker only for a screenshot.
- I found no production code without a caller in the paths I read, but I did not search for one beyond them.
