# Plan review — categories-parent
Reviewed-plan: 2d328a884f233938f84a64f5817dd34e99a68599 specs/categories-parent/plan.md
Verdict: not ready

Two Blocking findings stop this plan. Both are small fixes: one added step and one corrected path. The engine premises hold in source: vocabulary, write path, migration, scope and revision format.

## Blocking

1. **A decided spec requirement has no task.** spec.md:163-164 (Decided 1): "A parent's status never follows its children by itself; the drawer says 'alle subtaken afgerond' and offers the button." No task, step or test covers that message or the button. Task 8 (`ChildrenSection`) only lists children and offers "+".
   - Fix: add one bullet to Task 8 Step 1 and Step 3. When every child is `done` or `cancelled` and the parent is not, the children section shows "alle subtaken afgerond" and a button. The button is an ordinary write of the parent's categories column to its `done` option, through the lifecycle check. Add a vitest case for it.

2. **A file the plan modifies does not exist at that path.** Task 3 Files says "`apps/grid/src/App.tsx` (skin slot of `ChipBar`, :709)". There is no `apps/grid/src/App.tsx`. The chip row is in `apps/grid/src/ui/App.tsx:705-711`, inside `Workspace` (ui/App.tsx:187).
   - Fix: change the path to `apps/grid/src/ui/App.tsx`. Should-fix 1 below covers what the slot really holds.

## Should fix

1. **The `skin` slot holds one node, and the gallery already uses it.** Task 3 Step 3 says "put `FinishedChip` in the `skin` slot like `AwayChip` (App.tsx:710)".
   - Source: `ChipBarProps.skin?: ReactNode` (ui/ChipBar.tsx:34). The gallery already fills that slot with `SizeChips` (ui/App.tsx:709). The spreads overwrite each other, so on a gallery either S M L or "Afgerond tonen" disappears.
   - Task 8 also puts "Archief tonen" into `FinishedChip`, and that chip must also show on the grid, where the skin slot is not used today.
   - Fix: say that the slot renders a fragment of the skin's chips plus the finished/archive chips. Add a test that a gallery shows both `SizeChips` and "Afgerond tonen".
   - Name where the two `useViewChoice` calls live: a view hook, not more state in `Workspace`. The project memory "UI code has a place" asks for this.

2. **`hideFinished` cannot tell a grid from a calendar.** Task 3 Interfaces: `hideFinished(model, rows, show)` is "no-op for the grid and the board". Neither `Model` nor the rows carry the view type; skins are chosen per view (ui/App.tsx:717-731).
   - Fix: add a `skin: ViewType` (or `view`) parameter.

3. **The list of skins that hide is wrong.** Task 3 Files says "calendar, timeline, gallery, list, matrix", and Step 1 tests "calendar, timeline, gallery and list".
   - There is no `list` skin: `ViewType` (types.ts:153) is grid, matrix, calendar, board, timeline, gallery, dashboard. `list` is a dashboard tile kind (types.ts:158).
   - The matrix is in Files but missing from the test. The spec says every skin but the grid and the board hides (spec.md:37).
   - Fix: replace `list` with `matrix` in the Step 1 test, or state that the matrix's down rows are exempt. Drop `list`.

4. **The archive SQL hides rows whose categories column is NULL.** Task 6 Interfaces: `whereOf` ANDs `NOT (archivedWhere)`, where `archivedWhere` is `col IN (done/cancelled options) AND coalesce(MAX(at), created_at) < cutoff`.
   - For a NULL value in a nullable options column (categories are allowed there, e.g. `taak.wie`, studio datasets.ts:340), `NULL IN (...)` is NULL.
   - Once the row is older than the cutoff, the expression becomes `NOT (NULL AND TRUE)`, which is NULL, so the row is filtered out.
   - Fix: write it as `col IS NOT NULL AND col IN (...)`, or wrap it in `coalesce(..., 0)`. Add "a NULL status is never archived" to the Task 6 tests, beside the stale-value case.
   - Holds: the rest of the SQL. `revision.at` and `created_at` share one ISO format: writes.ts:700 uses `toISOString()`, and ddl.ts:33 uses `strftime('%Y-%m-%dT%H:%M:%fZ')`. So comparing them as strings is sound. Seeded rows have no revision (migrate.ts:180-183 `insertRows`), so the `created_at` fallback is the real path. Every row is revised on create (writes.ts:526-531), so "created already done" works. The `(entity, record_id)` index exists (revision.ts:18).

5. **The clock never reaches `whereOf`.** Task 6: `archivedWhere(decl, now: Date)` and "Write the failing tests (a clock passed in)".
   - `whereOf(domain, source, table, params, scope)` (rows.ts:40) has no time parameter. `readRows`, `/rows` (app.ts:362) and `EngineOptions` (app.ts:226-241) carry no clock either.
   - Fix: either add `now` to `RowsParams`, filled in the route, or say the tests backdate `revision.at` and `created_at` directly and drop the clock.

6. **Two threat-model mitigations have no denial test.**
   - Threat 3 says `/schema` serves `progress` only to a reader of the counted dataset. The Task 1 tests only check that a valid declaration is served. Add: an owner-role actor who cannot read `progress.dataset` gets no `progress` in `/schema`.
   - Threat 5 says `archived=1` is not authorization, but no test drives it. Add to Task 6: an owner with `archived=1` still sees only its own scope.

7. **Progress in the drawer is untested.** Spec R2 (spec.md:83) shows "done/total" on the board card, the grid row and the drawer. Task 8 Files and Step 1 cover only the grid row and the board card. Fix: add the drawer to both.

## Note

1. **Task 7's conditional step can be decided now.** The step says to read the dashboard progress tile first. That tile reads two view counts, not `voortgang` (engine dashboard.ts:141-145; studio seed.ts:433). The grid's only use of the word is the i18n label "Voortgang" (i18n.ts:170).
   - Once `werkpakket.voortgang` is gone, `voortgang` is no longer a domain word, so the `vocabulary-allow-grid.txt:21` line is dead.
   - Decide now whether to keep it or delete it, instead of leaving an "if".

2. **Simpler design for `progressOf`.** `scopeWhere` is private to rows.ts:29, so a new `progress.ts` must export it, which the plan does not list. `pointingAt` (rows.ts:201) already does the chunked (500), scoped, live read of "rows of X whose key is in ids".
   - Simpler: put `progressOf` in rows.ts on top of `pointingAt`, selecting the key and the column, and count in JS.
   - Also, the engine already has a private `progressOf` in dashboard.ts:141. A second exported one with the same name will confuse readers.

3. **The "First working version" cannot be seen on Studio's seeded Taken.** The only seeded Taken view is a grid filtered to `status: open` (seed.ts:373-381). `taak` declares no board or calendar. So Task 3 Step 4's "finished rows hidden outside the grid" needs a calendar or timeline view on `taak` made by hand first. Marks are visible at once. Task 3 is still the first visible task.

4. **Query columns do not get categories.** A query column with `writes` takes its target's options and tones (app.ts:126-133, `servedColumn`), but not categories. So a query over `taak.status` shows no marks.
   - Either copy `categories` there too, or record that query columns are out.
   - `checkCategories` on a query column must judge the declared options, not the inherited ones.

5. **A parent's progress may go stale in the grid after a child is written.** The write reply carries the child's row only (app.ts:46-53). Task 8 should say whether the grid re-reads the parent or the view, since the spec says progress is "never stale".

6. **Archived rows lose their history for good.** History reads ids through `readIds` → `whereOf` (history.ts:91-92) with params built only from filter/from/to. With the archive in `whereOf`, an archived row's history disappears, and "Archief tonen" cannot bring it back. Rule on whether that is intended.

7. **Rows from published and owner views carry no progress.** These rows come from views.ts:583 and owner-views.ts:102, and the plan attaches `progress` only in the `/rows` route and `reply`. The spec says "on each row". A ruling is needed.

8. **The 64-level cap refuses legitimate writes with a misleading code.** It refuses a real (acyclic) chain deeper than 64 with `parent_cycle`. That is acceptable, but the code is misleading. A ruling is needed on keeping that code or using a distinct `parent_too_deep`.

9. **The timeline may test the wrong column.** Task 9's "toned column" is the first toned select column (Timeline.tsx:82). If the categories column is not the first toned one, the category test checks the wrong column. Use `categoriesColumnOf` from the schema instead.

10. **Type mismatch.** Task 8 `treeOrder(..., { shut: Set<number> })` "reuses the group shut/onFold", but `GridBody`'s `shut` is a `Set<string>` of group keys (GridBody.tsx:28; Grid.tsx:126).

11. **The E2E flows in the Test map have no task.** `finished-hidden-until-shown` and `taak-tree-and-subtask` are named but no task writes them. That is fine if `/shakeout` registers them; say so.

12. **Possible double count.** A child `taak` that also carries `werkpakket_id` is counted both in the werkpakket's progress and as a subtask. Rule on whether subtasks inherit `werkpakket_id`.

13. **Small line and path drifts.**
    - `tone` is at app.ts:354, not :348. `/schema` runs from :302 to :359.
    - `rowsQuery` is defined in engine.ts:519; api.ts:131 only calls it.

## Premises checked
- Vocabulary is the theatre/fiche/studio dataset, query and column names split on `_` → scripts/check-vocabulary.ts:61-69 → holds. Probing the live domains: of parent, progress, archive, after, archived, categories, category, open, active, done, cancelled, children, child, ancestors, finished, tree, depth, muted, mark, total, key, column and dataset, none is a domain word today. Only `parent` becomes one once `taak.parent_id` exists, and it already occurs in engine and grid source (schema-diff.ts, Calendar.tsx and others). Option keys such as `open` are not vocabulary. → holds
- The shared allow list covers the engine, mcp and grid roots → package.json:14 (grid adds `--allow`) → holds
- `ColumnDecl` :39, `DatasetDecl` :162 → declare.ts:39, :162 → holds
- `OVERWRITTEN` :284, `LOOKUP_RESERVED` → validate.ts:284, :340 → holds
- `checkTones` :53, `checkLifecycle` :541 → validate.ts:53, :541 → holds
- `validateDomain` loops :795-815 / :820-845 → validate.ts:792-814 / :818-844 → holds (drift of 3 lines)
- `/schema` :302-348, `tone` :348 → app.ts:302-359, tone :354 → holds (line drift)
- Columns served whole, so `categories` rides along → app.ts:145-148 → holds (query `writes` columns excepted, Note 4)
- `servedLinks` readable check → app.ts:200-206 `readable(actor, linked)` → holds
- Rows route :362-376, `reply` :46 → app.ts:362-376, :46 → holds
- `scopeWhere` usable from progress.ts → rows.ts:29 is not exported → does not hold as written (Note 2)
- `pointingAt` batched by 500 → rows.ts:173 `CHUNK = 500`, :201 → holds
- `whereOf` covers rows, total, history and views → rows.ts:160/171 (rows and total), :187 via history.ts:92, views.ts:583, owner-views.ts:102 → holds
- `whereOf` can take a clock → rows.ts:40 has no time parameter → does not hold (Should fix 5)
- `RowsParams` :27, `shape` :46 → params.ts:27, :46 → holds
- `answeredOf` :623, `checkRelations` :178, `liveRow` → writes.ts:623, :178, :173 → holds
- Undo and import go through `answeredOf` → writes.ts:886 `restore` → `valuesOf` → `answeredOf` (:612); import.ts:163 `valuesOf` → holds
- A self-relation counts toward 409 `in_use` → writes.ts:449-457 (every dataset's relation to the target, including itself) → holds
- `scopeOf` is owner-only, and progress is read through the viewer's scope → access.ts:81-87, :66-68 → holds
- Revision has entity, record_id, field, at → revision.ts:8-16 → holds
- A seeded row has no revision → migrate.ts:180-183 → holds
- Adding nullable `parent_id` (self-FK) is an ALTER → schema-diff.ts:88 `addable`; studio datasets.ts:5 `relation()` is nullable → holds
- Dropping `voortgang` rebuilds `werkpakket` safely → schema-diff.ts:101-117 (FKs off), migrate.ts:68-71 (views dropped and recreated), :99 (`.pre-migrate` backup on rebuild), :92 (fk check) → holds
- No query SQL or seed view reads `voortgang` → grep of packages/studio/src → holds
- Studio line numbers: actie :98, actieSite :170, werkpakket :272, voortgang :307, taak :314 → datasets.ts → holds
- planning.ts :107-122 (FINISHED, progressOf, featureOf) → holds; the taak writer passes `parent_id` through (planning.ts:58-69) → holds
- seed.ts :170-180 (taken), planning.test.ts :157-175 (two voortgang tests), vocabulary-allow-grid.txt :21, specs/studio/spec.md :117 → holds
- Dashboard progress tile reads `voortgang` → dashboard.ts:141, seed.ts:433 (reads view counts) → does not hold; the conditional resolves to no (Note 1)
- `apps/grid/src/App.tsx` → it is apps/grid/src/ui/App.tsx → does not hold (Blocking 2)
- `skin` slot is free for a chip, like AwayChip → ui/ChipBar.tsx:34 (one node), ui/App.tsx:709 (gallery uses it) → does not hold (Should fix 1)
- `useViewChoice` → ui/choice.ts:6 → holds
- `OptionMark` → grid/cells/Select.tsx:23 → holds
- `InboundSection` → grid/drawer/Sections.tsx:112 (`rowsWhere`, limit 5) → holds
- A `list` skin exists → types.ts:153 → does not hold (Should fix 3)
- `rowsQuery` in api.ts → defined in engine.ts:519, called at api.ts:131 → partly holds
- Group `shut`/`onFold` reusable for the tree → GridBody.tsx:28 (`Set<string>`) → holds with a type change (Note 10)
- Timeline :63, :82, :88, :157 → Timeline.tsx:63, :82-88, :157 → holds
- Grid already explains a 409 `in_use` → i18n.ts:241, :488-501; store.ts:141 → holds (Task 8's test is a regression guard)
- Task order: Tasks 1-2 are invisible, Task 3 is the first visible; Task 9 needs Task 3's `categoryOf`; Task 8 needs Tasks 5-7 → holds (visibility caveat in Note 3)
- `ARCHITECTURE-INVARIANTS.md` → none in the repo → nothing to check
