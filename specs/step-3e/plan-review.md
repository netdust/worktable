# Plan review — step-3e (re-review 3)
Reviewed-plan: 6e97630db1e6814dd78634befb3f3d77c9173dd1
Verdict: ready

Every finding from the last review is fixed in the plan, and the fixes match the source. I found nothing Blocking and nothing Should fix. Two small notes are below.

## Blocking
None.

- **B1 is closed.** Each of the five mounts now passes the row's `model`, and only the mounts that own a view's rows pass `nav` (Architecture line 10, Task 5 Files line 191). The Grid's related drawer, the Dashboard and the Matrix cell pass no `nav`, so they show no position. Line 218 tests that ("no position without `nav`"). This matches the source: `Grid.tsx:137,343`, `Dashboard.tsx:96`, `Matrix.tsx:609`.

## Should fix
None. All four are closed:
- **S2:** Task 6 line 236 builds the afwezig banner from `absentOn`, with a Panel.test case.
- **S4:** Task 2's e2e (line 142) no longer asserts gallery sections. Task 7 owns `gallery-sections`, and Test map row 66 points there.
- **S3 / Review Focus 6 and 7:** line 218 now tests "no Geschiedenis on a query model" and "'–' with ↑ ↓ disabled when the row has left the view".
- **S7:** line 218 now tests `j` stepping down and `k` doing nothing at row 1.

## Note
- **Task 5 leaves out three files it will have to touch.** `useOpenRow(model, view, models)` (`grid/useOpenRow.tsx:7`) has no layout and no row list, so it cannot build `nav` or pass `layout`. Its three callers, `board/Board.tsx:56`, `gallery/Gallery.tsx:62` and `timeline/Timeline.tsx:58`, must hand it the rows and the layout. Add those three files to Task 5's Modify line.
- **`propsOf(model, view, layout, row)` (line 197) still requires `view` and `layout`.** The related drawer and the Dashboard pass neither. Make both optional in the signature (with none, no columns are hidden), and add a `derive.test` case for that.
- **The interface drift and the naming split are closed.** Lines 82-88 now match the working tree's `ui/period.ts`:
  - `Period.field` (`period.ts:11`)
  - `todayPeriod(p)` (`:56`)
  - `pressMonth` / `pressWeek` (`:59`, `:68`)
  - `stepPeriod(p, by)` (`:76`)
  - `withPeriod` (`:83`)

  The Test map seam (line 58) uses the same names. The `ChipBar.tsx:87-95` and `App.tsx:285-300` code already in the working tree uses them.

## Premises checked
- The mounts can pass `model` → `Grid.tsx:137` (`related.model`), `useOpenRow.tsx:7`, `Calendar.tsx:234`, `Dashboard.tsx:96`, `Matrix.tsx:584-609` → holds
- `useOpenRow` can supply `nav` / `layout` → `useOpenRow.tsx:7` → holds only if its callers pass them (Note 1)
- Period interface = code → `ui/period.ts:8-83` → holds
- The Matrix panel has what `absentOn` needs (view, column, away) → `Matrix.tsx:584` → holds

Notes applied after this review: the three useOpenRow callers added to Task 5; propsOf takes view and layout as optional.

---

# Plan review: step-3e (re-review)
Reviewed-plan: b29517a957c0c330d128cd6af67c0316c73dc263
Verdict: not ready. B1 is fixed for the three read-only skins (board, gallery, timeline), the calendar and the grid's main drawer, but not for the other three Drawer uses. The fix is one line in Task 5. S1, S3, S5 and S6 are closed. S2, S4 and S7 each still need a small fix.

## Blocking

**B1 (left over). The `DrawerContext` App provides is the wrong source for three of the Drawer's uses, and nothing tells the drawer which model the row belongs to.**
- **What the plan says.** Architecture line 10 and Task 5 Files: the drawer reads "models, schema, view, layout, the view's rows" from one App context, "plus the open row and `onStep` from each of the five mounts".
- **What derive needs.** `kindOf(model)`, `subOf(model, …)` and `propsOf(model, view, layout, row)` all take a single `model`. Neither the context nor the mounts pass one.
- **Where the context is wrong:**
  - **Grid's related drawer.** `grid/Grid.tsx:137,343`: `related` is `{ row, columns, model }`, a row of a *different* model. The context's view, layout and rows belong to the grid's own view, so "N van M", the hidden-column rule (C3) and ↑ ↓ would read the wrong view.
  - **Dashboard.** `dashboard/Dashboard.tsx:96` opens a row from a tile's list. On a dashboard App renders the `dashboard` branch (`ui/App.tsx:533`), with no active `view`, `layout` or `result.rows` for that list.
  - **Matrix.** `matrix/Matrix.tsx:594-611` (`PanelDrawer`): for a cell, the drawer's `row` is a made-up join record (`id: cell?.id ?? -(row.id*1000000+at)`), not a row of `view.model` or of the context's rows.
- **Smallest change.**
  - Each mount passes the row's `model`.
  - The Drawer takes optional `view`/`layout`/`rows` props that override the context. The Grid's related drawer and the Dashboard pass their own; with none, the position and ↑ ↓ are hidden.
  - Or state that the Matrix cell drawer and the related drawer have no position and no stepping.
  - Name these three cases in Task 5's Modify line and in one Drawer test.

## Should fix

**S2 (left over). Task 6 never builds the afwezig banner.** Task 5 (line 217) hands the C5 banner to "Task 6's cell drawer", but Task 6's rebuild list (lines 230-235) has no banner. Add "the afwezig banner from `absentOn` with its two actions" to that list, plus a `Panel.test` case.

**S4 (moved, not fixed). Task 2's e2e still needs Task 7.**
- The Vitest case moved to Task 7. But Task 2's e2e `groep-everywhere` (line 142) still asserts "gallery sections", and the Test map row "Gallery sections, S M L" (line 66) points at that e2e. Sections are D5, which Task 7 builds.
- Fix: drop "gallery sections" from Task 2's e2e. Give Task 7 the e2e assertion (extend `groep-everywhere` there) and update the Test map row.

**S3 / Review Focus 6 and 7: the tests are not named in the task.**
- RF6 points at `Drawer.test.tsx` for "Geschiedenis hidden on a query model". RF7 claims "–" and disabled ↑ ↓ when the row has left the view.
- Task 5's Drawer test list (line 218) has neither. The plan already lists the behaviour; only the tests are missing.
- Fix: add both cases to line 218.

**S7 (half done). `k`/`j` are in the build step (line 209) but not in the tests.** Line 218 tests "↑ stepping" only. Add "`j` in the head steps down; `k` at row 1 does nothing".

## Note

- **One function, two names.** The Test map seam (line 58) says `toggleMonth/Week`; the interface (lines 85-86) and the in-progress `ui/period.ts:59,68` say `pressMonth`/`pressWeek`. Use one name.
- **Task 1's interface has drifted from the code already written on this branch.**
  - The working tree's `ui/period.ts` has `todayPeriod(p)` and `stepPeriod(p, by)` without `today` (`period.ts:56,76`). The plan's lines 84 and 87 take `today`.
  - The code's `Period` carries `field` (`period.ts:56`, `App.tsx:300`). The plan's `Period` (line 82) does not.
  - Bring the interface block in line with the code, or the code with it.
- **Checked against source:** S5's view names; the store type and `legacy_post_id`; `vervangers` and werklijst declared in `queries.ts`; the D7 ruling; where RecordLink and Actions go; the dropped regroup fallback (Review Focus 4). One thing to confirm: Bord toewijzingen has no `board.column` in its seed (`seed.ts:465-473`). Make sure the board falls back to the lifecycle `state` column, which Review Focus 3's refusal test depends on.

## Premises checked
- S1: lifecycle mapped onto `Model` in Task 8 (line 253, `engine.ts`, `types.ts`) → `types.ts:63-90` has no field today, and the task now adds it → holds
- S3: Geschiedenis hidden when `model.query` (line 214) → `types.ts` `query?: boolean` → holds
- S5: the views Planning, Per status, Galerij activiteiten, Kalender activiteiten, Tijdlijn tourstops, Toewijzingen per activiteit and Bord toewijzingen exist → `seed.ts:254,264,465,475,485,495,505` → holds
- S5: Bord toewijzingen has no date → toewijzing declares no `date` (`datasets.ts` dates at :109,:286,:337,:395, none on toewijzing) → holds
- S6: matrix `shown` nulled today → `App.tsx:507` now passes `period?.name` on every non-dashboard skin (working tree) → holds
- Task 3 `draggable` inputs `served.writable[model]` and `model.fields[c].readonly` → `types.ts:289`, `types.ts` Field `readonly?` → holds
- Context from App supplies `view`/`layout`/`rows` for every mount → `Grid.tsx:137,343`, `Dashboard.tsx:96`, `Matrix.tsx:594-611`, `App.tsx:533` → **does not hold** for the related drawer, the Dashboard and the Matrix cell
- Drawer has a `model` to derive from → `useOpenRow.tsx:7` has one, `Matrix.tsx:609`/`Dashboard.tsx:96` pass none, and the plan adds none → **does not hold**
- Task 6 builds the C5 banner → Task 6's step list (lines 230-235) → **does not hold**

---

# Plan review — step-3e (one period, board drag, the mockups' drawer)
Reviewed-plan: d63fa21721e1a6d7dbcddb604177487c486b31f3
Verdict: not ready (one Blocking finding in Task 5; the rest are small fixes)

## Blocking

**B1. Task 5: "The five mounts keep their props" is false. The new drawer needs inputs that no mount passes today.**
- **What the plan says.** Architecture line 10 and Task 5's Files list: only `grid/Drawer.tsx`, `ui/SidePanel.tsx` and `ui/App.tsx` change ("the row order for N van M").
- **What the source has.** `Drawer` takes only `row, columns, onClose, editor, actions, onAction, focusOnOpen, recordLink, attachments, onBatch` (`apps/grid/src/grid/Drawer.tsx:17-35`).
- **What the plan's functions need.** `derive.ts` takes `model`, `schema`, `view` and `layout` (`kindOf(model)`, `subOf(model, schema, row)`, `propsOf(model, view, layout, row)`, `inboundOf(schema, model)`). "N van M" and ↑ ↓ need the view's row list and a way to set the open row.
- **Why App alone cannot supply them.** App does not hold the open row. Each skin owns it:
  - `grid/useOpenRow.tsx:9-13` (board, gallery, timeline)
  - `calendar/Calendar.tsx:234`
  - `grid/Grid.tsx:343-345`
  - `dashboard/Dashboard.tsx:96`
  - `matrix/Matrix.tsx:609`
- **Result.** Built as written, the head, subline, hidden-column rule (C3), inbound sections (C4) and stepping (C1) have nothing to read from.
- **Smallest change.**
  - State how the drawer gets `model`, `models`/`schema`, `view`, `layout`, `rows` and `onStep`: new Drawer props at each mount, or one context provided by App.
  - Add the five mount files to Task 5's Modify list.
  - Correct the Architecture line.

## Should fix

**S1. Task 8 (Q12 insight): the grid's `Model` has no lifecycle.**
- The plan says "the warn-toned option of the lifecycle column", and Global Constraints lists "lifecycle" among the metadata the grid derives from.
- The engine serves it: `packages/engine/src/app.ts:291`, typed at `apps/grid/src/engine.ts:76-77`.
- But `toSchema` only carries it onto the matrix join (`engine.ts:221-226`). `Model` in `types.ts:63-90` has no such field.
- Fix: add `apps/grid/src/engine.ts` and `types.ts` to Task 8 (map `lifecycle.column` onto `Model`), plus a test that it gets through.

**S2. Task 5 (C5): the generic drawer has no absence data.**
- `absentOn(away, view, column, date)` needs a matrix view, a matrix column and the away rows (`matrix/away.ts:10`).
- App reads away rows only for matrix views (`ui/App.tsx:322`), and the only current use is `matrix/Panel.tsx:43`.
- Fix: move the afwezig banner to Task 6's cell drawer, or name its data source for other drawers.

**S3. Task 5 (Geschiedenis) breaks on query rows.**
- `GET /history/:source?filter={"id":N}` accepts the `id` key only when the source is a dataset (`packages/engine/src/filter.ts:36`). A query source answers 400 `bad_filter`.
- Drawers open from query views: Per persoon per dag, Persoonskalender, Werklijst, the dashboard lists.
- Fix: add a `derive.test` / `Drawer.test` case. Either hide Geschiedenis when `model.query`, or read it from the dataset the row writes to.

**S4. Task 2's tests need Task 7's work.**
- "the gallery's Groep 'Plandag' draws day sections with counts" is D5, which Task 7 builds.
- Fix: move that test to Task 7. Task 2 keeps "the gallery's Groep lists date and select fields plus geen".

**S5. Task 1 and Task 3 e2e use view names that do not exist.**
- The seeds (`packages/theatre/src/seed.ts:252-505`) have no view "Bezetting", "Galerij" or "Tijdlijn".
- The only matrix view is "Toewijzingen per activiteit" (`seed.ts:264-267`). The others are "Galerij activiteiten" and "Tijdlijn tourstops".
- Fix: use the real names in `period-sequence`. Add a view with no date field (Bord toewijzingen, since `toewijzing` declares no `date`) and assert it shows no period control. That is A5's "a view with no date field shows none", which no test covers today.

**S6. Task 1: the title pill is switched off on the matrix.**
- App passes `shown={matrix || … ? null : …}` (`ui/App.tsx:516`), so A1's "period name in the title-line pill on every skin" cannot hold on the matrix.
- Fix: add "App stops nulling `shown` on the matrix" to the Task 1 wiring step.

**S7. Task 5 (C1): the `k`/`j` keys are missing.**
- The spec asks for "↑ ↓ buttons with keys (also `k`/`j` and ↑/↓ while focus is in the head)". The plan says only "↑ ↓ (keys)".
- Fix: name `k`/`j` in the build step and in the Drawer tests.

## Note

- **Review Focus 4 is already answered.**
  - The engine accepts `group` on any column of the source (`packages/engine/src/params.ts:80-81,121`), and `soort` is a column.
  - The "regroup client-side" fallback in Task 2 is dead and can go. Keep the e2e as proof.
- **B3 is already built.**
  - `Board.tsx` renders `t('noneOf', …)` = "Geen {label}" on an empty column (`board/Board.tsx`, `i18n.ts:110`).
  - Task 3's "Geen activiteiten" test will be green before any code. Treat it as a guard, not a red-then-green test.
- **Task 2's "the Filter count renders as `.nv-chip__count`" test is also already green**: `ui/Filters.tsx` renders that class today. A8's gap is CSS only (no rule in `app.css`). That gap is checked in the compare pair, not by this test.
- **Small naming slips:**
  - Task 3's `store: GridStore`: the type is `Store` (`grid/store.ts:51`, `grid/hooks.ts:31`).
  - `derive.test`'s `legacy_post`: the field is `legacy_post_id` (`theatre/src/datasets.ts:136`).
  - The spec's `calendar/layout.ts:142`: the lane-first sort is at `:170`.
- **Theatre declarations:** Tasks 6 and 9 must also declare the new `vervangers` query and werklijst's `context` column in `packages/theatre/src/queries.ts` (`defineQuery` at `:182`, `:200`), not only the SQL.
- **Task 9 (D7) needs a ruling at execution time:** "the change line where a stat's view is dated" says what without how. Which earlier period, and is it a second `rows(limit 1)` read?
- **Task 5 sections:** the drawer's existing RecordLink and declared Actions (`Drawer.tsx:63-66`) have no place in the C4 section order. Say where they go.
- **Board refusal path holds as planned:** `store.apply` reverts the painted value and sets `error` on a refusal (`grid/store.ts:219-228`), and `toewijzing`'s lifecycle refuses e.g. bevestigd→open (`datasets.ts:261-272`). Review Focus 3 is testable.
- **Simplest design:** the rejected alternative ("fix each symptom where it shows") is stated honestly. The source bears out the plan's reason: the period logic is split across `App.tsx:285-311`, `ChipBar.tsx:85-103`, `Filters.tsx:58` and `bar.ts`. I see no simpler design it missed.

## Premises checked

- Period writes `between` on `view.date_field` → `ui/App.tsx:300-304` → holds
- Lit Maand does nothing (`!month && toMonth()`) → `ui/ChipBar.tsx:99` → holds
- Week from a month uses the month's first day → `ui/ChipBar.tsx:100` (`weekOf(from)`) → holds
- `period` null on grid/board/gallery without a condition → `ui/App.tsx:306-311` → holds
- Date chips drawn with ISO `betweenDays` → `ui/Filters.tsx:36-37,58`, `i18n.ts:295` → holds
- `nv-chip__count` has no CSS → `ui/Filters.tsx` renders it, `app.css` has no rule → holds
- Relative ops `week`/`month`/`today`/`next_week` exist → `grid/conditions.ts:6,27,177-188` → holds
- ViewList already uses `useDragAndDrop` on a GridList → `ui/ViewList.tsx:4,143` → holds
- The grid store's `apply` exists and is built for board views → `grid/store.ts:54,285`, `ui/App.tsx:340` (`!matrix`) → holds
- A refused write reverts and records the error → `grid/store.ts:219-228` → holds
- QuickCreate has no `preset` yet → `dashboard/QuickCreate.tsx` → holds (to add)
- `Layout` has `hidden`/`order`/`group` and parses strictly → `grid/layout.ts:12-21,81-92` → holds (`size` needs the parser too; `grid/layout.ts` is in Task 2's files)
- Engine accepts `?group=` on any column → `engine/src/params.ts:121` → holds (Review Focus 4 resolved)
- Drawer mounted in five places → Dashboard:96, Calendar:234, Matrix:609, useOpenRow:13, Grid:343/345 → holds
- "The five mounts keep their props" while the drawer derives from model, schema, view, layout and rows → `grid/Drawer.tsx:17-35` → **does not hold**
- `Field.via`, `Row.inherited`, `Schema.space`, `Field.tones`, `links` fields → `types.ts:28,36,38,291,323`, `engine.ts:216` → holds
- Lifecycle available on the grid's `Model` → `types.ts:63-90` (absent; join only, `engine.ts:221`) → **does not hold**
- `absentOn` usable in a generic drawer → `matrix/away.ts:10`, `App.tsx:322` → **does not hold**
- `/history/:source?filter={"id":N}` → `engine/src/app.ts:334`, `filter.ts:36` → holds for datasets only
- `rows(…, limit)` for rail counts → `api.ts:109` → holds
- `blocksOf` sorts by lane first → `calendar/layout.ts:154-170` → holds
- `toewijzing` board on lifecycle `state`; `rol_id` exists, unseeded on assigned rows → `datasets.ts:209,234,261`; `seed.ts:165` → holds
- `kandidaten.sql`, `werklijst.sql` exist as declared queries → `theatre/src/queries.ts:182,200` → holds
- Views named in the e2e (Planning, Per status, Kalender activiteiten) → `seed.ts:254,475,505` → holds; "Bezetting", "Galerij", "Tijdlijn" → **do not hold**
- e2e ports 4311/5174/4312/5175 → `playwright.config.ts:10-45` → holds
