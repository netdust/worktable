# categories-parent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An options column can declare what its options mean (open, active, done, cancelled); a dataset can have a parent row, progress from its children, and archive finished rows by age; Studio adopts all three.

**Architecture:** The engine declares and validates (`categories`, `parent`, `progress`, `archive_after`), serves them in `/schema`, refuses parent cycles on write, and works out `progress` and "archived" on read, so nothing is stored or stale. The grid reads the served categories to draw marks, hide finished rows, show a tree and a children list. Studio declares them and drops its stored `voortgang`.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, Zod, Biome, TypeScript; React + vitest in `apps/grid`; Playwright e2e.

**Spec:** `specs/work-model/spec.md` (R1, R2, "Studio adopts it"). Plans 2 and 3 of its cut (`default-view`, `editable-*`) are not here.

## Global Constraints

- The engine stays domain-free: no Dutch domain word in `packages/engine`, `packages/mcp` or `apps/grid/src`; `bun run check` enforces it (the dataset, query and column names of theatre, fiche and studio are the forbidden vocabulary, so `parent` needs a line in `scripts/vocabulary-allow.txt`).
- The four category words are exactly `open`, `active`, `done`, `cancelled`; a declaration with any other word, an option with none, or categories on a column without options is refused at startup.
- Error codes verbatim: 422 `parent_cycle`; a non-live parent is the existing 400 `bad_relation`; a parent with live children is the existing 409 `in_use`.
- UI copy verbatim: "Afgerond tonen", "Archief tonen"; the children list's add button uses the dataset's `new_label`.
- Archive defaults in Studio: `taak` 30 days, `actie` 14 days. Archived rows are hidden, never deleted.
- A column without categories behaves exactly as today. No migration for `categories`, `parent` (beyond one nullable column) or `archive_after`.
- Engine names are English and generic; Studio names are Dutch. No client data; fixtures are invented. Gate: `bun run gate`. Comments only for a non-obvious why, one line (house rule).
- Nothing in the spec's "Out of scope" is built, stubbed or prepared for.

## Threat model

**Assets.** Row integrity (a parent chain the engine can walk), what a viewer may know about rows it cannot read (a count is a leak), the cost of one read (a deep or wide tree must not make it unbounded).

**Attacks and mitigations**
1. An editor or a service sets a parent that makes a row its own ancestor (directly, in two steps, through undo or import) → `checkParent` in `answeredOf` walks the ancestors and answers 422 `parent_cycle`; the walk is capped at 64 levels and a longer chain is refused the same way, so legacy data cannot loop it.
2. A parent pointing at a deleted row or one that is not the dataset's own → existing `checkRelations` (400 `bad_relation`); that `parent` names a relation column to the dataset itself is a startup check, `checkParentDecl` (Task 1).
3. A viewer reads `progress` counts for a dataset it may not read, or for rows outside its scope → `progressOf` counts through the viewer's `scopeWhere` on the counted dataset, and `/schema` and the rows route serve `progress` only when the viewer's role may read that dataset (the `servedLinks` readable check).
4. A request makes the grid or the engine fetch an unbounded ancestor set → the engine counts and walks with a cap of 64 levels; the grid reads dropped ancestors one level per read, at most 5 levels, at most 500 ids.
5. `archived=1` is mistaken for authorization → it is a display switch; access is still role and scope on every read. The spec says so; the code must not read it as a permission.

**Deferrals.** Rows reached through a matrix cell or a link are not archive-filtered (the spec says so; Studio has no matrix over an archiving dataset). Progress counts include archived children, since archiving hides and does not change what was done.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Declarations: `categories`, `parent`, `progress`, `archive_after` | `validateDomain`, `GET /schema` | unit · `packages/engine/test/declarations.test.ts` · `bun test packages/engine/test/declarations.test.ts` | none — proven by tests |
| Parent write rule | `POST`/`PATCH /rows/:dataset`, undo, import | integration · `packages/engine/test/parent.test.ts` · `bun test packages/engine/test/parent.test.ts` | none — proven by tests |
| Progress on rows | `GET /rows/:source`, write reply | integration · `packages/engine/test/progress.test.ts` · `bun test packages/engine/test/progress.test.ts` | none — proven by tests |
| Archive on read | `GET /rows/:source?archived=` | integration · `packages/engine/test/archive.test.ts` · `bun test packages/engine/test/archive.test.ts` | none — proven by tests |
| Studio adoption | `migrate`, taak/werkpakket writers, seed | integration · `packages/studio/test/planning.test.ts`, `packages/studio/test/adoption.test.ts` · `bun test packages/studio` | none — proven by tests |
| Grid marks, hide, toggles | the rendered grid, board, drawer | unit (vitest) · `apps/grid/src/grid/categories.test.tsx` · `bun run --filter @worktable/grid test` | finished-hidden-until-shown |
| Grid tree, children, progress | the rendered grid and drawer | unit (vitest) · `apps/grid/src/grid/tree.test.ts`, `apps/grid/src/grid/drawer/children.test.tsx` · same | taak-tree-and-subtask |
| Timeline cancelled by category | the rendered timeline | unit (vitest) · `apps/grid/src/timeline/cancelled.test.tsx` · same | none — proven by tests |

## Review Focus

- A parent edit that closes a loop in two steps, or through undo or import, is refused 422 `parent_cycle` and leaves both rows unchanged (Task 4 test).
- A row created already `done` archives `archive_after` days after its creation; a seeded row with no revision falls back to `created_at`; a row whose status leaves `done` is visible again at once (Task 6 tests).
- A stored value that is not one of the column's options has no category: no mark, never hidden, never archived (Task 3 and Task 6 tests).
- A filter that matches only a deep child still shows its ancestors, greyed, and stops at 5 levels on a looped legacy chain (Task 8 test).
- Deleting a parent with children is a clear grid message, not a raw 409 (Task 8 test); the board keeps its Done column and the archive, not the toggle, is what trims it (Task 3 test).

## First working version

Task 3: Studio's Taken show a mark beside every status and finished rows hide behind "Afgerond tonen". Tasks 1 and 2 are what it stands on; nothing before it is visible.

## Simplest design

The simplest design stores nothing new: categories as a client-only convention. It fails on `progress` and archive, which need the engine's rows and revisions and must never be stale, so those two are computed on read in the engine. Hiding finished rows stays in the grid (rows are capped at 5000 and the choice is per browser). One new row key (`progress`), one new query flag (`archived`), one new nullable column (`parent_id` on `taak`), one rebuild (`werkpakket` loses `voortgang`).

---

### Task 1: Engine declarations and the served schema

**Files:**
- Modify: `packages/engine/src/declare.ts` (`ColumnDecl` :39, `DatasetDecl` :162), `packages/engine/src/validate.ts` (loop :795-815, per-dataset :820-845, `OVERWRITTEN` :284), `packages/engine/src/app.ts` (`/schema` :302-348), `scripts/vocabulary-allow.txt`
- Test: `packages/engine/test/declarations.test.ts`

**Interfaces:**
- Produces: `export const CATEGORIES = ['open','active','done','cancelled'] as const`; `export type Category = (typeof CATEGORIES)[number]`; `ColumnDecl.categories?: Record<string, Category>`; `DatasetDecl.parent?: string`; `DatasetDecl.progress?: { dataset: string; key: string; column: string }`; `DatasetDecl.archive_after?: number`; `export function progressDeclOf(decl: DatasetDecl): { dataset: string; key: string; column: string } | null` (the declared one, else own children when `parent` and exactly one categories column exist, else null); `export function categoriesColumnOf(decl: DatasetDecl): string | null` (the one column with categories, else null).

- [ ] **Step 1: Write the failing tests** in `declarations.test.ts` (patterns `refused(withDataset(...))` / `schemaOf`): categories on a column without options is refused; a category word outside the four is refused; an option missing from `categories` is refused; a category for an unknown option is refused; `parent` naming a column that is not a relation to the dataset itself is refused; `progress.dataset` unknown, `progress.key` not a relation to this dataset, or `progress.column` without categories are each refused; `archive_after` of 0, 1.5 or on a dataset without exactly one categories column is refused; a column named `progress` is refused (`OVERWRITTEN`); a valid declaration is served by `/schema` (`columns.status.categories`, dataset `parent`, `progress`, `archive_after`).
- [ ] **Step 2: Run** `bun test packages/engine/test/declarations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `checkCategories(source)` (model: `checkTones`, validate.ts:53) and `checkParentDecl`, `checkProgressDecl`, `checkArchive` (model: `checkLifecycle`, :541) wired into the loops; add `'progress'` to `OVERWRITTEN` and `LOOKUP_RESERVED`; serve the dataset keys with conditional spreads in `/schema` like `tone` (:348); serve `progress` only when `progress.dataset` is readable to the viewer (reuse `servedLinks`' check). Add a `parent` line to `scripts/vocabulary-allow.txt`.
- [ ] **Step 4: Run** the same command plus `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): declare categories, parent, progress and archive_after`.

### Task 2: Studio declares categories

**Files:**
- Modify: `packages/studio/src/datasets.ts` (`taak` :314 status, `werkpakket` :272 fase, `actie` :98 status, `actieSite` :170 state)
- Test: `packages/studio/test/adoption.test.ts`

**Interfaces:**
- Consumes: Task 1's `categories`.

- [ ] **Step 1: Write the failing test** `studio declares categories on every status column`: `taak.status` open→open, bezig→active, geblokkeerd→active, gedaan→done, overgeslagen→cancelled; `werkpakket.fase` ontwerp,plan→open; bouwen,review,geblokkeerd→active; klaar→done; geparkeerd→cancelled; `actie.status` aangevraagd→open; voorbereiden,voorbereid,bevestigd,bezig→active; klaar,deels→done; mislukt,geannuleerd→cancelled; `actie_site.state` wacht→open; te_bevestigen,bezig→active; klaar→done; mislukt,overgeslagen→cancelled — asserted from `/schema`. Every option of each column has one (the engine's own check).
- [ ] **Step 2: Run** `bun test packages/studio/test/adoption.test.ts`. Expected: FAIL.
- [ ] **Step 3: Add** `categories` to the four columns as above. (`mislukt` and `deels` are this plan's call, marked in the report for Stefan.)
- [ ] **Step 4: Run** `bun test packages/studio`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(studio): categories on the status columns`.

### Task 3: Grid draws categories and hides finished rows

**Files:**
- Create: `apps/grid/src/grid/categories.ts`, `apps/grid/src/ui/FinishedChip.tsx`
- Modify: `apps/grid/src/engine.ts` (`EngineColumn`, `fieldOf`), `apps/grid/src/types.ts` (`Field`), `apps/grid/src/grid/cells/Select.tsx` (`OptionMark`), `apps/grid/src/board/Card.tsx`, `apps/grid/src/grid/drawer/derive.ts`, the skins' row sources (calendar, timeline, gallery, list, matrix) and `apps/grid/src/App.tsx` (skin slot of `ChipBar`, :709)
- Test: `apps/grid/src/grid/categories.test.tsx`

**Interfaces:**
- Produces: `export function categoryOf(field: Field, value: unknown): Category | undefined` (undefined for a value that is not an option); `export function hideFinished<T extends { fields: Record<string, unknown> }>(model: Model, rows: T[], show: boolean): T[]` (no-op for the grid and the board, for a model without a categories column, and when `show`); `export const CATEGORY_MARK: Record<Category, string>` (empty circle, half circle, check, cross glyphs); the choice `useViewChoice(view, 'ntdst-views/finished/v1/', …)`.

- [ ] **Step 1: Write the failing tests**: `categoryOf` returns the category of an option and undefined for a stale value; the status chip in the grid cell, on a board card and in the drawer shows the mark beside the tone; `hideFinished` drops `done` and `cancelled` rows on the calendar, timeline, gallery and list but not on the grid or the board, and a row with a stale value stays; the "Afgerond tonen" chip appears only on skins that hide, and turning it on shows the rows; the board still renders its `done` column.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** as above; copy `categories` through `fieldOf`; `OptionMark` renders `CATEGORY_MARK` before the tone pill when the field has categories; put `FinishedChip` in the `skin` slot like `AwayChip` (App.tsx:710).
- [ ] **Step 4: Run** the same command plus `bun run check`. Expected: PASS. Then load the Studio dev server and look at Taken: marks visible, finished rows hidden outside the grid.
- [ ] **Step 5: Commit** `feat(grid): category marks and "Afgerond tonen"`.

### Task 4: Parent rule on write

**Files:**
- Modify: `packages/engine/src/writes.ts` (`answeredOf` :623, beside `checkRelations` :178)
- Test: `packages/engine/test/parent.test.ts`

**Interfaces:**
- Produces: `function checkParent(sqlite: Database, decl: DatasetDecl, id: number | null, values: Values): void` — throws `new ApiError(422, 'parent_cycle', …)`.

- [ ] **Step 1: Write the failing tests** (fixture dataset with `parent: 'parent_id'`): a row cannot be its own parent (422 `parent_cycle`); A→B then B→A is refused and both rows are unchanged; the same loop through undo and through import is refused; a chain of 70 live rows is refused on the 65th link; a parent that is deleted is 400 `bad_relation`; a parent with live children cannot be deleted (409 `in_use`); clearing the parent works; a service and an administrator are refused alike.
- [ ] **Step 2: Run** `bun test packages/engine/test/parent.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `checkParent`: when `decl.parent` and the value changes, walk `liveRow` up from the new parent to a cap of 64 and refuse when it meets `id` or the cap; call it after `checkRelations`. Undo and import need no extra call (both go through `answeredOf`).
- [ ] **Step 4: Run** the command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): refuse a parent cycle`.

### Task 5: Progress on rows

**Files:**
- Create: `packages/engine/src/progress.ts`
- Modify: `packages/engine/src/app.ts` (rows route :362-376, `reply` :46)
- Test: `packages/engine/test/progress.test.ts`

**Interfaces:**
- Consumes: `progressDeclOf`, `categoriesColumnOf` (Task 1).
- Produces: `export function progressOf(sqlite: Database, domain: Domain, decl: DatasetDecl, ids: number[], actor: Actor): Map<number, { done: number; total: number }>` — batched by 500 like `pointingAt`, counts live rows of `progress.dataset` through the viewer's `scopeWhere`, cancelled left out, archived included; rows get a `progress` key beside `links`.

- [ ] **Step 1: Write the failing tests**: own-children progress is `{done:1,total:3}` for one done, one open, one active child; a cancelled child is not counted; a dataset with a declared cross-dataset progress counts those rows; a child with a stale status value is counted in `total`, not `done`; a row with no children is `{done:0,total:0}`; the write reply carries it; an owner account whose scope excludes some children counts only its own; a viewer whose role cannot read the counted dataset gets no `progress` key.
- [ ] **Step 2: Run** `bun test packages/engine/test/progress.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `progressOf` with one grouped query per chunk; attach in the rows route and `reply` only for datasets where `progressDeclOf` is non-null and readable.
- [ ] **Step 4: Run** the command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): serve progress on rows`.

### Task 6: Archive on read

**Files:**
- Create: `packages/engine/src/archive.ts`
- Modify: `packages/engine/src/rows.ts` (`whereOf` :40), `packages/engine/src/params.ts` (`shape` :46, `RowsParams` :27), `apps/grid/src/api.ts` (`rowsQuery`)
- Test: `packages/engine/test/archive.test.ts`

**Interfaces:**
- Produces: `export function archivedWhere(decl: DatasetDecl, now: Date): SQL | null` — null without `archive_after`; else rows whose categories column holds a `done`/`cancelled` option and whose `coalesce((SELECT MAX(at) FROM revision WHERE entity = ? AND record_id = t.id AND field = ?), created_at)` is older than `now - archive_after` days; `RowsParams.archived?: boolean` (query `archived=1`); `whereOf` ANDs `NOT (archivedWhere)` unless `archived`.

- [ ] **Step 1: Write the failing tests** (a clock passed in): a row done 31 days ago is hidden at 30, visible at 29; `archived=1` returns it; `total` agrees; a row created already `done` archives from its creation; a seeded row with no revision archives from `created_at`; moving the status to `open` shows it again at once; a stale value is never archived; a dataset without `archive_after` is untouched; history and a published view hide archived rows by default.
- [ ] **Step 2: Run** `bun test packages/engine/test/archive.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `archivedWhere` and wire `whereOf` (covers rows, total, history, views); parse `archived` in `params.ts`.
- [ ] **Step 4: Run** the command plus `bun test packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): archive finished rows by age on read`.

### Task 7: Studio adopts parent, progress and archive; `voortgang` goes

**Files:**
- Modify: `packages/studio/src/datasets.ts` (`taak` :314, `werkpakket` :272 loses :307), `packages/studio/src/writers/planning.ts` (:107-122), `packages/studio/src/seed.ts` (:170-180), `packages/studio/test/planning.test.ts` (:157-175), `scripts/vocabulary-allow-grid.txt` (:21), `specs/studio/spec.md` (:117)
- Test: `packages/studio/test/adoption.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 4, 5, 6.

- [ ] **Step 1: Write the failing tests**: `taak` serves `parent: 'parent_id'`, `archive_after: 30` and own-children progress; `actie` serves `archive_after: 14`; `werkpakket` serves `progress: { dataset: 'taak', key: 'werkpakket_id', column: 'status' }` and no `voortgang` column; a werkpakket row reads `progress {done,total}` from its taken (replaces the two `voortgang` tests in `planning.test.ts`); the featureOf writer still stamps `bijgewerkt`; migrating a database created with the old `werkpakket` (with `voortgang` values) keeps every row, drops the column and leaves the `<db>.pre-migrate` backup; the seed holds one taak with two children.
- [ ] **Step 2: Run** `bun test packages/studio`. Expected: FAIL.
- [ ] **Step 3: Implement**: declare `parent: 'parent_id'` (nullable relation to `taak`) and `archive_after` on `taak`/`actie`, `progress` on `werkpakket`, delete `FINISHED` and `progressOf` from `planning.ts` (keep `bijgewerkt`), remove `voortgang`; read the dashboard progress tile in `apps/grid` first and, if it reads `voortgang`, switch it to the served `progress` and drop the allow-list line, else leave the line.
- [ ] **Step 4: Run** `bun test packages/studio` and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(studio): adopt the work model, progress replaces voortgang`.

### Task 8: Grid tree, children and progress

**Files:**
- Create: `apps/grid/src/grid/tree.ts`, `apps/grid/src/grid/drawer/ChildrenSection.tsx`
- Modify: `apps/grid/src/engine.ts` (`parent`, `progress`, `archive_after` on `EngineSource`/`Model`), `apps/grid/src/grid/GridBody.tsx`, `apps/grid/src/grid/drawer/Sections.tsx`, `apps/grid/src/api.ts`, `apps/grid/src/ui/FinishedChip.tsx` (adds "Archief tonen"), `apps/grid/src/board/Card.tsx` and the grid row (progress "done/total" with a thin bar)
- Test: `apps/grid/src/grid/tree.test.ts`, `apps/grid/src/grid/drawer/children.test.tsx`

**Interfaces:**
- Produces: `export function treeOrder(rows: Row[], parentField: string, opts: { shut: Set<number>; muted: Set<number> }): { row: Row; depth: number; muted: boolean }[]` (children under their parent, sorted within a level, a loop broken after 5 levels); `export async function withAncestors(model: Model, rows: Row[]): Promise<{ rows: Row[]; muted: Set<number> }>` (one read per level, ≤5 levels, ≤500 ids); `ChildrenSection({ model, row })` modelled on `InboundSection`, listing children with their status chips and a "+" button labelled with `new_label` that creates a child through `newRow` with the parent set; the "Archief tonen" choice (`ntdst-views/archive/v1/`) sets `archived=1` on `rowsQuery`.

- [ ] **Step 1: Write the failing tests**: `treeOrder` indents children and keeps the keyboard row order flat; a collapsed parent hides its children; a looped chain stops at 5 levels; `withAncestors` adds a dropped ancestor muted and stops at the cap; the drawer lists children with chips and "+" creates one with the parent set; deleting a parent with children shows a clear message; progress renders "1/3" with a bar on the grid row and the board card; "Archief tonen" requests `archived=1`.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** the tree as an ordering step before `GridBody` (the flat order keeps `data-cell` indices correct; collapse state reuses the group `shut`/`onFold`).
- [ ] **Step 4: Run** the command plus `bun run check`; then look at Taken in the browser: a parent with two children, indented, "1/2", filter on a child keeps the parent greyed.
- [ ] **Step 5: Commit** `feat(grid): tree, children list and progress`.

### Task 9: Timeline draws `cancelled` by category

**Files:**
- Modify: `apps/grid/src/timeline/Timeline.tsx` (:63, :82, :88, :157)
- Test: `apps/grid/src/timeline/cancelled.test.tsx`

- [ ] **Step 1: Write the failing test**: with categories on the toned column a `cancelled` bar gets `nv-tl__bar--cancelled` and is left out of overlap checks even when its tone is not `bad`; a `done` bar with tone `bad` is not drawn cancelled; without categories the tone `bad` rule is unchanged.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** by passing `categoryOf(toned, value) === 'cancelled'` where categories exist, else the tone test.
- [ ] **Step 4: Run** the command plus `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(grid): the timeline draws cancelled by category`.

## Not in this plan

The `netdust-core:worktable` skill's `voortgang` lines live in the netdust-plugins repo (plugin cache here): change them there after this merges. `op_tafel.sql` and `agenda.sql` keep their hard-coded open statuses (the "Te doen" query is out of scope in the spec).
