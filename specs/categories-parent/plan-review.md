# Plan review — categories-parent (second review)
Reviewed-plan: e7f7788d340fc8a98e7c42dd721ffe7a5aebeac4 specs/categories-parent/plan.md
Verdict: ready with fixes

The plan is ready to build once the fixes below are made. Both Blocking findings from the first review are fixed, and so are all seven Should-fix findings. Two of those fixes brought in new problems, described below: a skin name that does not exist (`table`), and a helper the grid is not allowed to import. All the engine premises the plan adds in this version hold in source: `childProgress` on `pointingAt`, the cutoff computed in `whereOf`, history passing `archived: true`, and `categories` in `servedColumn`. Nothing is Blocking.

Status of the first review's findings:
- **B1 ("alle subtaken afgerond" button):** fixed. Task 8's Interfaces and Step 1 now cover it. Its condition is unsound (Should fix 6).
- **B2 (wrong `App.tsx` path):** fixed. `ui/App.tsx:704-711` is the `ChipBar` row.
- **SF1 (skin slot):** fixed (a fragment, plus a gallery test).
- **SF2 (`hideFinished` cannot tell skins apart):** fixed, but it names a skin that does not exist (Should fix 2).
- **SF3 (`list` skin):** fixed.
- **SF4 (NULL archive SQL):** fixed.
- **SF5 (clock):** fixed.
- **SF6 (denial tests):** fixed.
- **SF7 (progress in the drawer):** fixed.
- **Note 2 (`progressOf` placement):** taken. `childProgress` is now in rows.ts.
- **Note 6 (history of archived rows):** ruled, but history.ts is missing from Task 6's Files (Should fix 4).
- **Note 9 (timeline column):** taken, but it names an engine function the grid cannot import (Should fix 1).
- **Note 10 (`shut` type):** only half taken. The plan now contradicts itself (Should fix 5).
- **Note 12 (double count):** ruled, but subtasks now drop out of their client's space (Should fix 7).

## Blocking
None.

## Should fix

1. **Task 9 Step 3 and Task 3 use a function the grid cannot import.** Task 9 says "taking the column from `categoriesColumnOf`". Task 1's Interfaces define `categoriesColumnOf(decl: DatasetDecl)` in the engine. `apps/grid` talks to the engine over REST only (AGENTS.md, Layout), and no grid file imports `@worktable/engine` today (grep finds none). Task 3's `hideFinished` ("a model without a categories column") needs the same lookup on the grid side.
   - Fix: Task 3 produces a grid helper in `grid/categories.ts`, for example `categoriesFieldOf(model: Model): string | undefined`, read from the served `Field.categories`. Task 9 uses that helper.

2. **Task 3 Interfaces: `hideFinished` names a skin that does not exist.** It says "no-op for the `table` and `board` skins". `ViewType` is `'grid' | 'matrix' | 'calendar' | 'board' | 'timeline' | 'gallery' | 'dashboard'` (apps/grid/src/types.ts:153).
   - Fix: change `table` to `grid`.

3. **Three tasks own "Archief tonen" in different ways, and the plumbing is not named.**
   - Task 3 Step 3 shows the chip on the grid "on a dataset with `archive_after`". `archive_after` only reaches `Model` in Task 8 ("`archive_after` on `EngineSource`/`Model`"), and the engine parameter only exists after Task 6.
   - Task 6 Files lists "`apps/grid/src/api.ts` (`rowsQuery`)" but has no grid step or test. `rowsQuery` is defined at engine.ts:519, and api.ts:131 only calls it.
   - Task 8 adds "Archief tonen" again.
   - The real path is `rows(view, window, scope, layout, limit)` (api.ts:120) → `viewQuery` (api.ts:127) → `rowsQuery` (engine.ts:519). None of these takes an archive flag, and Workspace's rows load must reload when the flag changes.
   - Fix: Task 3 owns "Afgerond tonen" only. Task 6 drops `api.ts` from Files. Task 8 owns "Archief tonen" end to end and names the path: `useFinished().archived` → `rows(..., archived)` → `viewQuery` → `rowsQuery` adds `archived=1`, with the flag in the reload key. Task 8's existing test "'Archief tonen' requests `archived=1`" covers it.

4. **Task 6 Files leaves out history.ts.** The Interfaces say "history reads pass `archived: true`". The params are built in history.ts:91 (`{ ...parseRowsParams(source, { filter, from, to }), limit: MAX_LIMIT }`). The premise holds: adding `archived: true` there works. But the file is not listed, and Step 3 says only "wire `whereOf` (covers rows, total, history, views)". Wiring `whereOf` alone hides archived rows from history.
   - Fix: add `packages/engine/src/history.ts` (:91) to Task 6 Files and to Step 3.

5. **Task 8 contradicts itself on collapse state, and does not say how it persists per view.**
   - The Interfaces say "the tree's collapse state is its own `Set<number>` of row ids (the group `shut` set holds string keys)".
   - Step 3 says "collapse state reuses the group `shut`/`onFold`".
   - The spec asks for "collapsed or open per view" (spec.md:75). The group fold is already per view and stored: `useFolded(view, group)` keeps a `Set<string>` under `ntdst-views/folded/v1/${view}/${group}` (grid/hooks.ts:69-84).
   - Fix: pick one. The smaller choice is `useFolded(view.key, '<parent field>')` with `String(id)` keys, stated in both places.

6. **The "alle subtaken afgerond" condition is judged on a list that can be cut short.** `ChildrenSection` is "modelled on `InboundSection`". That section reads `rowsWhere(..., 5)`, at most five rows (grid/drawer/Sections.tsx:115). It also reads through `/rows`, which after Task 6 hides archived children. With six or more children, "every child is done or cancelled" is decided on the first five. When every child is archived the list is empty, and the plan does not say what an empty list means.
   - Fix: decide it from a count that sees every child. One option: a `rowsWhere` on the parent field plus the open and active options of the categories column, with `archived=1` and limit 1, then `total === 0`, together with at least one child.
   - Also say whether the section lists every child or five plus "all of them".
   - Add the six-children case to Step 1.

7. **A subtask created from the drawer can drop out of its client's space.**
   - Task 8 creates a child "with only the parent (and the scope field) set".
   - `taak` is `scoped: 'organisatie_id'` (studio datasets.ts:322). The taak writer fills `organisatie_id` through `clientOf`, which looks only at `site_id`, `werkpakket_id` and `project_id` (studio writers/planning.ts:33-44).
   - When no space is selected, the child is stored with `organisatie_id` null, so it no longer shows when the parent's space is selected.
   - Fix: in Task 7, add `['taak', values.parent_id]` first in `clientOf`. Add a test: a child created with only `parent_id` takes its parent's `organisatie_id`.

## Note

1. **The grid row's progress has no named mechanism.** Task 8 says "the grid row (progress 'done/total' with a thin bar)" without naming a file or a column. If it becomes a grid column called `progress`, `engineColumn` (engine.ts:509-512) passes it to the engine as `sort=progress`. Only `lookups.` and `rollups.` ids are dropped. The engine would answer 400 `bad_sort` (params.ts:114).
   - Name it as a computed column like rollups (grid/columns.ts:262), sorted only in the grid or not at all.
   - Name `toRow` and `Row` carrying `progress`.
   - Ruling needed at execution time if this is left open.

2. **Signature drift in Task 5.** `childProgress(sqlite: Database, ...)` is "built on `pointingAt`", but `pointingAt` takes the Drizzle `db: BunSQLiteDatabase` (rows.ts:202). Take `db`, as `linksOf` does (rows.ts:289-295).

3. **`ChildrenSection({ model, row })` cannot call `newRow` as written.** `newRow` needs a `View` and a `Scope` (grid/newRow.ts:24). `madeFrom(target, tables, window, scope)` (newRow.ts:53) is the existing entry point for this case. The section also needs the scope and the tables from the drawer context.

4. **Archived ancestors and the tree.** `withAncestors` and the children list read through `/rows` without `archived`. A parent archived while a child is still open is never fetched, so the child shows at the top level. Rule on whether to read ancestors with `archived=1`. Also say what the tree does on a grouped grid view.

5. **Queries are never archive-filtered.** `archivedWhere(decl: DatasetDecl, ...)` applies to datasets only. The plan should say so. Studio's `op_tafel` and `agenda` already filter by status, so nothing shows wrongly today.

6. **No test pins "rows read through a matrix cell or a link are not filtered"** (spec.md:55). It holds by construction: `cellsOf` and `linksOf` read through `pointingAt` (rows.ts:236, :304), not `whereOf`. One assertion in Task 6 would keep it that way.

7. **Hidden rows and the counts.** `hideFinished` runs in the grid after the engine's `total`. Say whether the title line and count chip count the hidden finished rows.

8. **Line drift.**
   - `servedColumn` is at app.ts:112-119, not :126-133 (Task 1 Step 3).
   - `/schema` runs from :302 to :359, not :302-348 (Task 1 Files).

9. **Simplest design.** The rejected alternative (categories as a client-only convention) is stated honestly. The reason holds: progress needs scoped engine reads, and the archive needs `revision.at`. I found no simpler design that meets the spec.

## Premises checked
- `pointingAt` does a chunked (500), live, scoped read with a caller-chosen `select` → rows.ts:173, :201-227 (`scopeWhere` at :218) → holds; private, but `childProgress` sits in the same file → holds
- `scopeOf(actor, counted)` gives the viewer's scope on the counted dataset → used the same way at rows.ts:301 → holds
- `readable` check as in `servedLinks` → app.ts:200-206 → holds
- `whereOf(domain, source, table, params, scope)` can compute the cutoff itself → rows.ts:40-63, no clock needed → holds
- `whereOf` covers rows, total, history, published views and owner views → rows.ts:160/169, :187; history.ts:91-92; views.ts:578-583; owner-views.ts:101-102 → holds
- History params can carry `archived: true` → history.ts:91 spreads `parseRowsParams` → holds (file missing from Task 6, Should fix 4)
- `RowsParams` :27, `shape` :44-53 → params.ts → holds
- Revision fields and the create path: `CREATED = 'id'`, each non-null column revised on create, ISO `now` → writes.ts:515-531, :697; revision.ts:3-19 → holds
- `servedColumn` copies options and tones of a `writes` target → app.ts:112-119 → holds (line drift)
- Dataset columns served whole, so `categories` rides along → app.ts:145-148 → holds
- `reply` uses `rowOf` → app.ts:46-54, writes.ts:744 → holds
- Rows route :362-380 → holds
- `OVERWRITTEN` :284 (checked for datasets and queries at :293), `LOOKUP_RESERVED` :340, `checkTones` :53, `checkLifecycle` :541, loops :791-845 → validate.ts → holds
- `ColumnDecl` :39, `DatasetDecl` :162 → declare.ts → holds
- `answeredOf` :623, `checkRelations` :178, `liveRow` :173 → writes.ts → holds (the id comes from `ctx.current`)
- Vocabulary allow lists; `voortgang` at vocabulary-allow-grid.txt:21; no other `voortgang` in packages, grid or e2e besides the files Task 7 lists → holds
- Studio anchors: `actie` :98 (status options as the plan lists them; lifecycle :149), `actie_site.state` (options as listed), `werkpakket` :272 / `voortgang` :307, `taak` :314 (scoped :322) → holds
- planning.ts `FINISHED` / `progressOf` / `featureOf` :107-122 → holds; `clientOf` ignores a parent → Should fix 7
- `ui/App.tsx` chip row :704-711; the gallery fills `skin` with `SizeChips` → holds
- `ChipBarProps.skin?: ReactNode` → ui/ChipBar.tsx:34 → holds
- `useViewChoice(view, prefix, parse, fallback)` → ui/choice.ts:6 → holds
- `ViewType` contains `table` → types.ts:153 → does not hold (Should fix 2)
- `fieldOf` copies keys explicitly, so `categories` must be added → engine.ts:165-183 → holds
- `rowsQuery` → engine.ts:519; api.ts:120-132 have no archive parameter → holds as a Task 8 change; does not hold as Task 6's `api.ts (rowsQuery)`
- `categoriesColumnOf` usable from the grid → no grid import of the engine; AGENTS.md says REST only → does not hold (Should fix 1)
- Group fold reusable for the tree → grid/hooks.ts:69 (`Set<string>`, per view) and GridBody.tsx:28 → holds with string keys; the plan contradicts itself (Should fix 5)
- `InboundSection` reads 5 rows → grid/drawer/Sections.tsx:115 → holds (Should fix 6)
- `newRow` needs a View; `madeFrom` exists → grid/newRow.ts:24, :53 → holds (Note 3)
- Timeline `TONE_CLASS` :63, `toned` and the overlap test :82-88, bar class :157 → holds
- docs/SPEC.md carries the work model → docs/SPEC.md:55, :83 → holds
- `ARCHITECTURE-INVARIANTS.md` → none in the repo → nothing to check
