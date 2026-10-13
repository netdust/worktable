# Plan review: step-3d part 2, the app styled as the mockups (third review)

Reviewed-plan: d3a47f902adbf042af582817d0d3434d3d9a885a
Verdict: ready with fixes

The six items the controller asked about hold in the plan. Two should-fix findings remain (the matrix hand-off finds the History panel when it is open; a seed test the plan does not list will fail), plus three smaller items where the plan is stale or a step is missing.

## Status of the latest review's findings (review of 5bb3519)
- B1 (Tijd): resolved. Task 2 is styling only; the range is built and tested (`columns.ts:271-305`, `cells/Date.tsx:12-21`, `i18n.ts:16`). Leftover: Task 2 Files still listed `Grid.test.tsx`.
- B2 (matrix hand-off): resolved in the plan, half-fixed in the code (Should fix 1 and 3).
- S1 (900px rule): resolved (`app.css:3610-3652`). The 760px rule sets `left: 0` on the slot while `.nv-drawer` keeps `flex: 0 0 392px`; settle in the compare.
- S2 (test edits): resolved; every listed path checks out.
- S3 (ChipRow): resolved; matches `App.tsx:521-537` and `GridBar.tsx:16-21`.
- S4 (week tile): resolved; `more-tiles.test.tsx:61-63` and `e2e/step-3c.spec.ts:168-170` exist as named.
- Previous Notes: resolved.

## Blocking
None.

## Should fix
1. **The matrix fallback finds the History panel instead of the matrix panel.** `Matrix.tsx:294` takes the first `.nv-drawer-slot .nv-drawer`; HistoryPanel portals a `.nv-drawer` into the same slot and can be open on a matrix view (`App.tsx:509`). Target the matrix's own panel (`.nv-drawer-slot .nv-panel` → closest `.nv-drawer`, `Panel.tsx:53`) and extend the Test map row with "with History open, focus still lands in the cell panel".
2. **Seeding "Per status" breaks `packages/theatre/test/seed-missing.test.ts`** (`:149` views 22 added, `:170` 30 present). Add it to Task 3 Files and widen the Global Constraint to "seed.ts and its seed tests".
3. **No step writes the matrix test.** Step 1 names only the RailFoot and slot cases; name the matrix case and say "three new tests".
4. **The SidePanel interface describes a DOM query; the code uses the `DrawerSlot` context.** Rewrite plan:87-88.
5. **Review Focus 5 points at a test that does not exist.** Point it at the compare pairs, or add a Playwright check.

## Note
- `matrix/Matrix.test.tsx:351` and `calendar/Calendar.test.tsx:79-85` still describe the drawer inside `.nv-body`; they pass without a slot.
- `ntdst-views/looks-open` persists; keep the e2e helper opening the card per test, so `grid-ux.spec.ts:527-530` keeps seeing it closed.
- `openLooks(page)` in `e2e/editor.ts` is a naming choice only.

## Fixes applied (plan blob c5b62ea)
All five, in the plan; Should fix 1 in the code with two App cases, each seen failing on the old query (RED) before the fix (GREEN). Execution continues on plan c5b62ea.

---

# Plan review: step-3d part 2, the app styled as the mockups (re-review)

Reviewed-plan: 5bb351973efe494320f01ae7e503a5b856ef31db
Verdict: not ready

Both Blocking findings have small fixes: a few plan lines each, no redesign. Execution has already started in the tree (RailFoot.tsx, RailFoot.test.tsx, Rail.test.tsx, Theme.tsx, theme.css, app.css, SpaceSelect.tsx and i18n.ts are modified or untracked).

## Status of the previous findings (review of 1c27c52)
- B1 (Tijd): not resolved, and the premise is now false in a new way (Blocking 1).
- B2 (drawer): partly resolved. The portal design matches spec row 36 and every mount site goes through SidePanel, but one matrix focus path and the 900px breakpoint break (Blocking 2, Should fix 1).
- B3: resolved. Pop and Pick are in Task 1 Files and Step 6.
- S1, S2, S3: resolved as spec ledger rows (spec.md:144-151).
- S4: partly resolved; three test edits listed, five more not (Should fix 2).
- S5: resolved. The overlay uses the prototype's 760px rule.
- S6: resolved. Test map row 63 says no Vitest test is possible.
- S7: resolved. Global Constraints 39-40 cover the tokens; afbouw is in the ledger (spec.md:152).
- S8: interfaces given, two inconsistent with source (Should fix 3 and 4).
- Previous Notes: resolved.

## Blocking

1. **Task 2 plans a feature that already exists, under a different rule.**
   - The range display is built and tested:
     - `grid/columns.ts:271-305` (`endOf`/`inDays`) sets the label to `t('time')`, returns `range(row)` and takes `blank` from the view's empty fact.
     - `grid/Grid.tsx:97` applies it whenever `layout.group` is a date column.
     - `grid/cells/Date.tsx:12-19` renders `.nv-time`/`.nv-time__end`.
     - `ui/app.css:1639-1653` styles it.
     - Tests: `grid/Grid.test.tsx:1701-1709` and `grid/columns.test.ts:183-215`.
   - Step 1's "see it fail" cannot fail. The plan's interface (`range: { end }`, gated on `model.calendar` and `view.group_by === model.date`) would replace a working rule; the client model has no `date` property (`types.ts:132` has `date_field`).
   - The plan's second assertion contradicts current behaviour: a day-grouped view showing both columns already reads the start as `13:00` under "Start" (`columns.test.ts:206-208`).
   - The existing rule fires on Planning and leaves both fixture views unchanged.
   - Smallest change: drop Task 2's range interface and Step 3; Step 3 becomes styling only; point the Test map at the existing tests as regression guards; correct the Simplest design bullet.

2. **Review Focus 2's premise is false for one matrix path.**
   - `matrix/Matrix.tsx:292-295` hands the keyboard to the panel with `bodyRef.current?.querySelector('.nv-drawer')`. Once portalled into `.nv-drawer-slot`, the drawer is no longer under `.nv-body`, so Enter/double-click no longer move focus into the panel.
   - No test catches it: `Matrix.test.tsx` renders without a slot, and the App case only checks the aside's parent.
   - Capture handlers, `closest('.nv-drawer')` at `:310`, Escape on the aside, and `focusOnOpen=false` all hold.
   - Smallest change: add `matrix/Matrix.tsx` to Task 1 with a slot-aware query, and a Test map row for an App-level matrix render where Enter focuses the panel.

## Should fix

1. **The slot breaks the 900px breakpoint.** `ui/app.css:3535-3539` collapses `.nv-app` to one column and rows `auto 1fr`; the slot lands in a third row, a bottom panel between 760 and 900px. Name the slot's rule inside the 900px query, and state how two open panels (HistoryPanel and a row drawer) sit in the slot.
2. **S4's list of test edits is incomplete.** Also: `ui/Rail.test.tsx:233-247`, `e2e/ui-fit.spec.ts:53,57` (loops at :81, :142), `e2e/step-3c.spec.ts:121,126`, `e2e/scrollbars.spec.ts:36-46`, `e2e/react-aria.spec.ts:127`. Or make the e2e helpers open Bijstellen once.
3. **ChipRow's premise is false.** App passes `scopeChip` only to Grid (`ui/App.tsx:534`). Calendar, Timeline and Matrix receive `filters` but not `scopeChip`; Board and Gallery receive neither. State what is newly passed and whether Calendar and Matrix render ChipRow or restyle their own bars. Name `rows` as `count` with an optional `cut`, as GridBar does.
4. **WeekBand's interface fits neither side.** The calendar's band is built from `placeEvents` → `weekGrid(...).allDay` with lanes, toneOf and spans. WeekTile shows every event of the week, timed ones included, and the prototype's band places timed rows too. `more-tiles.test.tsx:61-63` asserts 7 day groups and one `aria-current="date"`. Give WeekBand its real shape, or keep the calendar's band and restyle WeekTile; list `more-tiles.test.tsx:61-63` and `e2e/step-3c.spec.ts:168-170` as tests that stay green.

## Note
- `matrix/Matrix.test.tsx:351` and `calendar/Calendar.test.tsx:79-85` assert the drawer inside `.nv-body`; green without a slot, but they describe a placement the app no longer has.
- SidePanel reads the slot during render; a panel open on App's first commit would render inline then remount. Harmless today; `useLayoutEffect` with state is the robust form.
- Task 1 Step 8 does not name who renders `nv-foot`; Task 7 needs the matrix legend in it.
- Task 5 says nothing of the "08–24" hour range; `weekGrid` computes 08–20 extended for late events. Say "as computed".
- Dropping Sneltoetsen leaves Esc and ⌘K out of the hints; spec-approved, recorded so it is not taken for a regression.

---

# Plan review — step-3d part 2: the app styled as the mockups

Reviewed-plan: 1c27c52482fc954f9184895e22873b757464c1b1
Verdict: not ready

## Blocking

**B1. Task 2 Step 3 / Test map row "Grid: one Tijd column": the column join lands on the wrong views and in the wrong file.**
- **Wrong file.** The plan names `grid/cells/Time.tsx` as the file that renders start and end. `start_at`/`eind_at` are `type: 'datetime'` (`packages/theatre/src/datasets.ts:122-123`). Datetime renders through `DateCell` (`apps/grid/src/grid/cells/index.tsx:28-30`). `TimeCell` is only for `text` fields described `HH:MM` (`grid/columns.ts:106`).
- **Planning never triggers the join.** The prototype's Planning view shows `start_at` and not `eind_at` (`packages/theatre/src/seed.ts:227`). The rule "join start and end … for a view showing both" therefore never fires on the view the prototype pictures. The unit assertion "no Einde" already passes, so Step 1's "see them fail" fails on its premise.
- **The join hits the e2e fixtures instead.** The views that do show both are `Bevestigd` and `Optie of bevestigd` (`e2e/fixture-views.ts:11,18`). `step-0e.spec.ts:273-401` reads and types full datetimes into the `'Start'` column of exactly those views (also `step-0a:37`, `step-0b:168-173`). A joined "Tijd" cell either breaks those flows or changes how start is edited, which is new behaviour. Review Focus 4 forbids changing the tests.
- **Smallest change:**
  - Make the change display-only in `DateCell`/`columns.ts`: inside a day-grouped view whose dataset declares `calendar.start`/`end`, the start cell reads `HH:MM–HH:MM` from `row.fields[end]`.
  - Add `eind_at` to Planning's seed only if needed.
  - State explicitly that editing stays on Start, and which e2e expectations change.

**B2. Task 1 Step 7 / Test map row "Shell: drawer as a column": the premise about the drawer's mount is wrong, and the step hides a cross-skin state lift.**
- **The drawer is already a side column, not a portal or overlay.** `SidePanel` renders `<aside class="nv-drawer">` "Beside the sheet, never over it" (`ui/SidePanel.tsx:15,24`). Its CSS is `flex: 0 0 360px` (`ui/app.css:2431-2437`). Each skin mounts it inside `.nv-body`, which sits under `.nv-sheet` inside `.nv-work`: `grid/Grid.tsx:348-353`, `grid/useOpenRow.tsx:13` (Board, Timeline, Gallery), `calendar/Calendar.tsx:242`, `dashboard/Dashboard.tsx:97`, `matrix/Matrix.tsx:573`.
- **The new test barely fails today.** "Inside `.nv-work` … not in a portal" already passes. Only "beside `.nv-sheet`" (a sibling) fails.
- **Passing it means a large unplanned refactor.** Making the drawer a sibling means lifting the open-row state out of 7 mount sites, including the Grid's `related`/draft/DeleteRow/actions drawer and the Matrix's `PanelDrawer`. No task, file list or interface covers that.
- **It still won't match the prototype.** The prototype's drawer is the third column of the whole `.app`, full height beside the toolbar (`design/grid-prototype.html:95-96,535`), not a column of the work area.
- **Smallest change:** either
  - restyle in place (360→392px, head/props/sections) and rewrite the App case to assert "an `aside` beside `.nv-scroll`, not over it"; or
  - make the full-height lift its own task, listing all 7 mount sites and the lifted state's interface.

**B3. Spec §1 row "Popovers" (`ui/Pop.tsx`, `ui/Pick.tsx`) has no task.** Task 1 lists neither file, and no step covers it. **Smallest change:** add both files to Task 1 Files and one step. (The "Minimal scrollbars" row is already met: `ui/app.css:3711-3740`.)

## Should fix

**S1. Elements with no served data or existing behaviour that the plan styles without ruling.** Each would have to be faked or built. None is in the spec's ledger, and the plan is silent on all of them. Add each to the ledger as out (or name its real source):
- **Rail model counts** ("counts in 11px mono", spec row 29): `TableDef` carries no count (`apps/grid/src/types.ts:129-150`).
- **Production tone and meta line on the switcher card** (spec row 28): `productie` has no colour or meta field (`packages/theatre/src/datasets.ts:81-101`). `SpaceSelect` only derives initials (`ui/SpaceSelect.tsx:22-23,31`).
- **Toolbar "insight"** (Task 1 Step 5): the prototype computes "n nog in optie" (`design/grid-prototype.html:1000`). `Toolbar` has no such prop or source (`ui/Toolbar.tsx:19-48`).
- **Drawer head "n van m", up, down, expand** (spec row 36, Task 1 Step 7): `Drawer` has no navigation or expand props (`grid/Drawer.tsx:15-44`). This is behaviour.
- **Dashboard "bijgewerkt hh:mm"** (spec row 122): nothing in `dashboard/*` or `i18n.ts` serves it.

**S2. Gallery day sections are new behaviour (Task 6 Step 1).** `Gallery` renders a flat list with no grouping or bar (`gallery/Gallery.tsx:30-45`). App passes it no layout or filters (`ui/App.tsx:526`). The seeded gallery view has `group_by: null` (`seed.ts:457`). "Day sections when grouped" therefore never shows, unless grouping is built into the gallery. **Smallest change:** rule it out (ledger) or in, with the seed and the grouping reuse (`grid/group.ts`) named.

**S3. Timeline Week/Maand is undecided (Task 4 Step 1).** Spec row 77 requires the decision "Week/Maand only if the window supports both (else Week alone, ledger)". The plan omits Week/Maand entirely, and the ledger has no row for it. The window can be a month (`timeline/Timeline.tsx:17`, `isMonth`), but nothing switches it. **Smallest change:** state the decision.

**S4. Review Focus 4 contradicts what Task 1 must do to the e2e and unit tests.**
- Renaming the density group to "Rijhoogte" changes its accessible name. Today it is "Dichtheid" (`apps/grid/src/i18n.ts:68`).
- A Bijstellen card collapsed by default hides the Thema/density radios.
- These break `e2e/grid-ux.spec.ts:435-467` (`radiogroup` "Thema"/"Dichtheid"), `e2e/step-3.spec.ts:352` (clicks "Donker" directly) and `ui/App.test.tsx:305` ("Dichtheid" in the rail's contentinfo).
- The calendar's Week/Maand must stay radios, or `e2e/step-3.spec.ts:345` breaks.
- **Smallest change:** list these test edits in Task 1, or keep the existing accessible names.

**S5. Overlay below 900px (Review Focus 2, Task 1 Step 7) is invented and contradicts the spec.** Spec row 36 says "beside the work, never over it". The Global Constraint says values are copied, never re-guessed, and the prototype's fallback is at 760px (`design/grid-prototype.html:320-326`). **Smallest change:** use the prototype's 760px rule or drop the overlay.

**S6. The Test map row "no vertical borders by default" (computed `border-right` in Vitest) proves nothing.**
- Vitest has no `css` option (`apps/grid/vite.config.ts:20`).
- The only CSS imports are in `main.tsx:8-9`, so no stylesheet is loaded under jsdom. The assertion passes before and after the change.
- **Smallest change:** move it to a Playwright check reading `getComputedStyle` on the scratch build, or rely on the compare pair and drop the unit row.

**S7. Global Constraint "token names in `theme.css` already match the prototypes" is partly false.**
- `theme.css` lacks `--color-bg-column` (`#f3f4f7`/`#16171a`, used by board columns, `design/board-prototype.html:41,335`). It also lacks `--today`, which the plan does add.
- Prototype soort hues are `--s-*`; the app's are generic `--tone-*` (`ui/theme.css:47-55`).
- `afbouw` is `#a0612a` in the prototype (`grid-prototype.html:51`) but `amber` in theatre (`datasets.ts:33`), and no app tone matches it.
- **Smallest change:** Step 2 names `--color-bg-column`, and the afbouw hue goes to the ledger (or a tone decision).

**S8. Steps say what without showing how, and no task has `Interfaces`.** This matters for the structural changes:
- the Tijd join;
- the chip row on Board, Gallery and Timeline (`GridBar` needs `model`/`columns`/`layout`/`onLayout`, `grid/GridBar.tsx:11-22`, which App does not pass to those skins, `ui/App.tsx:521-526`);
- the Bijstellen card's storage keys;
- the WeekTile sharing the calendar's band (`WeekTile` has its own markup, `dashboard/WeekTile.tsx:30-40`).

Give each a short signature or snippet.

## Note

- **Dagkop, Rasterlijnen and Zebrarijen are acceptable presentational settings, not invented behaviour.** In the prototype they are pure attribute→CSS toggles (`design/grid-prototype.html:346-347,364-365,1131-1133`). They are the same class of thing as the existing density setting (`ui/RailFoot.tsx:27-44`), and spec row 31 asks for them.
- **Timeline "Vandaag" is a new control in the timeline.** The timeline has only prev/next (`timeline/Timeline.tsx:24-26`); the jump exists only in the calendar (`calendar/Calendar.tsx:224`). It binds to the same `onShown`, so it is acceptable, but say so. "Groep: productie" on the timeline must be a static chip: the timeline has no `onLane` (`ui/App.tsx:521-522`).
- **Board plus.** The board gets no `onAdd` (`ui/App.tsx:499`), so per spec row 66 there is no plus. The spec cites a ledger row that does not exist.
- **Board card fields.** `Board` caps a card at 3 fields (`board/Board.tsx:14`, `.slice(0, 3)`). Six seeded fields need that cap changed in Task 3.
- **Calendar hour height.** `HOUR_PX` is 48 against the prototype's 46 (`calendar/Calendar.tsx:28`). Changing it may move geometry asserted in `Calendar.test.tsx`/`layout.test.ts`.
- **"via tourstop" location.** It is rendered by `grid/cells/index.tsx:17` (`.nv-inherited`), not `Relation.tsx`, which is the file Task 2 Step 4 names.
- **Simplest design paragraph.** It is honest about restyling in place, but its list of structural changes is half wrong. "The drawer as a column" is already true in structure (see B2), and "one Tijd column" can be a display format of the existing start cell rather than a joined column. Both simpler options are missing from the paragraph.
