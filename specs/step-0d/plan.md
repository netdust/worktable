# Step 0d — matrix, saved views, parity items: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The matrix skin runs on the engine (Toewijzing across persoon, down activiteit, writes through the writer); planners save, share, delete and restore views; the Toewijzing writer switches person↔name in one edit; Toewijzing and Beschikbaarheid show titles through their person; datetimes display, saved non-`$eq` filters apply, "+ New" skips the title, relation options page past 5000.

**Architecture:** The engine learns three generic shapes — a title `{ via, else }` resolved on read, `offset` on `/rows`, and a dataset's `matrix` declaration (served in `/schema`, cells returned by `GET /rows/<down>?cells=1` in one query) — and engine-owned SavedView routes under `/api/views`. Theatre declares the matrix and the derived titles and normalises the assignee switch. The grid's adapter feeds the copied matrix and saved-view code from those routes; four parity changes land in the grid.
First working version: Task 1a — `GET /api/rows/<fixture>?offset=2` and a fixture row whose title comes through a relation, visible with curl.

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm (bun-sqlite), React 19, Vite, Vitest, Playwright, Biome.

**Spec:** `specs/step-0d/spec.md` (parent: `docs/SPEC.md`).

**Simplest design:** Matrix cells: the grid fetching join rows with `$in` on the down ids is simplest but breaks past 100 ids (`IN_MAX_VALUES`); one engine query on the down relation and the window costs no more. Away periods: the grid reads them with an overlap filter (`start_at <= to`, `end >= from`) it builds itself — no engine change, because `/rows` filters already express it. Derived titles: a stored column is simplest — rejected by Stefan (stale on rename); resolving on read reuses `withLookups`. Saved views: reusing `runWrite` would bring cutting, encoding, Revision and soft delete for free, but `runWrite` resolves writers from the domain only and restore needs a deleted row; `views.ts` is a small route module that reuses the exported `revise`, `filterWhere` and the write guard instead.

## Decisions

- Matrix declared by the domain, cells served by the engine; SavedView gains `shared` (and drops the unused `scope`), widths and picks stay local; titles may come through a relation; `/rows` gains `offset`. — Stefan, 2026-10-05.
- The away declaration names its end column: `away: { dataset, across, label, end }`; the away dataset declares `date` (Beschikbaarheid: `date: 'start_at'`). Away rows for a window are read by overlap. — plan review B1.
- `/schema` marks the down source `matrix_join: <join dataset>` (one key, one type). The spec diff at the end says so. — plan review S4.
- A via title is served in `/schema` as `title: <else column>`, `title_via: <relation column>`. In the grid the `else` column stays an ordinary, writable field (`naam`, `reden`); only the computed title is read-only and is never sorted, grouped or filtered on. — plan reviews S5, N1.
- A view over 16 kB is 400 `view_too_large`, measured on the view as it would be stored. — plan review S3.
- Every existing database needs `--fresh` (SavedView's DDL changes; ALTER is step 0e's entry condition).
- Last write wins (0b) stands for views too.
- 0e requirement recorded: the permission check runs before the in-use check, with a test.
- Checkpoint after Task 4 (Stefan, 2026-10-05): the matrix's ledger rows and line counts are reported before Task 5 starts; if the matrix's production rework exceeds about 150 lines, execution stops for Stefan's answer.
- The proposed spec diff states that last write wins also applies to views (Stefan, 2026-10-05).

## Global Constraints

- `packages/engine` holds no domain word and imports no domain package.
- Domain words (keys, marks, Dutch labels and refusals) live in the theatre package.
- Every write route — rows and views — keeps the 0b guard: JSON content type, `Sec-Fetch-Site`, Host.
- The fiche package keeps running unchanged.
- No commit leaves the grid unable to boot or a previous e2e flow red: each grid task ends with `rm -rf e2e/.tmp && bun run e2e`.
- Out: auth, import, WordPress block, slots (and the matrix's open column), lifecycle, prefs, `share_token`/`public`.
- `docs/SPEC.md` is never committed by this plan; the diff is proposed at the end.
- Each task logs its start and end time in the Time log.

## Threat model

**Assets.** Saved views (another planner's work), the planning rows a matrix cell writes, the host process.

**Attacks.**
1. **Writing someone else's view** — `PATCH/DELETE /api/views/<id>`, `POST …/restore` on a view the caller does not own → **`ownedView()` in `views.ts`: unshared → 404 `unknown_view`, a live shared view → 403 `not_owner`, a deleted view that is not the caller's → 404 whatever its sharing (final fix wave, so restore reveals no deleted ids); nothing written.**
2. **Forging ownership or audit** — a body with `owner_id`, `id`, `deleted_at`, `share_token`, `public`, `scope` → **`viewBody()` keeps only `name`, `source`, `skin`, `filters`, `sort`, `group_by`, `visible_fields`, `shared`; the owner is the actor.**
3. **Injecting through a saved filter, sort or column list** — replayed on every rows request → **`viewBody()` validates `filters` with the exported `filterWhere(input, source, tableOf(source))` (the same compile and key resolution as `/rows`), refuses a filter that changes on a JSON round trip (non-finite numbers), and checks `sort`, `group_by`, `visible_fields` against declared columns, at most 16 keys and no duplicates (the same cap in `parseSort` for `/rows`); 400 `bad_view` / `bad_sort`; nothing stored.**
4. **Oversized or hostile names** — **64 kB body cap (0b), 16 kB stored-view cap (400 `view_too_large`), name 1–80 characters after trim, no control or format characters (`\p{Cc}`, `\p{Cf}`); names rendered as React text only.**
5. **Matrix cells as a bypass** — **no new write route: cells write through `/api/rows/<join>` and its writer.**
6. **Unbounded cell reads** — **`?cells=1` without a window → 400 `window_required`, a window over 92 days → 400 `window_too_wide` (`params.ts`); the `/rows` limit applies to the down rows.**
7. **Cross-site view writes** — **the 0b `writeGuard()` is mounted on every `/api` write (`app.ts:46`); the views routes are mounted on the same app; a test asserts it.**

**Mitigations — where they live.** `ownedView()`, `viewBody()` and the routes in `packages/engine/src/views.ts` (1–4, 7); `cellsOf()` in `packages/engine/src/rows.ts` and the window and key caps in `params.ts` (3, 5, 6).

**Deferrals.** No real actors: the dev actor owns everything until auth, so attack 1 is enforced and tested with a directly inserted foreign view but not exercised by a second human. Prefs are not stored. `share_token`/`public` untouched. Recorded at the final review:
- **Auth.** Every view made before auth is owned by actor 0 and needs a reassignment migration; no real actor may get id 0. The seeded views are shared but owned by 0, so no real user can edit them until that migration runs.
- **A database seeded before 0d** keeps views with no owner, which are unreachable. Rebuild it with `--fresh`; there is no backfill.
- **Browser layout keys** are not namespaced per database: after `--fresh`, a stale layout can attach to a reused view id. The worst case is a 400 until the viewer reverts.
- **The e2e flows are not idempotent.** They mutate seeded rows in file order, on one worker, with `--fresh` only at start. Running a flow twice fails by design.
- **Datetime grouping** (`GridBar` `GROUPABLE`, `group.ts`) is not offered; it isn't needed yet.
- **The away end column** must be a date or datetime column. It is validated as declared, not by type.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Engine: title via, offset | `GET /api/rows/:source`, `/api/schema`, `validateDomain` | integration · `packages/engine/test/rows.test.ts`, `validate.test.ts` · `bun test packages/engine` | none (relation-beyond-page is gone: `apps/grid/src/api.test.ts` "pages with offset until the total: five rows at page size 2 take three calls") |
| Engine: matrix declaration and cells | `GET /api/rows/<down>?cells=1`, `/api/schema`, `validateDomain` | integration · `packages/engine/test/matrix.test.ts` · `bun test packages/engine` | matrix-cell-persists |
| Engine: saved views | `/api/views` routes | integration · `packages/engine/test/views.test.ts` — denials first (attacks 1–4, 7): status, code, `saved_view` + `revision` unchanged | view-saved-after-reload |
| Theatre: matrix, titles, assignee switch | theatre through the routes | integration · `packages/theatre/test/matrix.test.ts` | matrix-cell-persists, person-to-name |
| Grid: matrix and via titles | the app against `/api` | unit · `apps/grid/src/engine.test.ts`, `api.test.ts`, `matrix/*.test.ts(x)`, `ui/App.test.tsx` | matrix-cell-persists |
| Grid: saved views | the app against `/api/views` | unit · `apps/grid/src/api.test.ts`, `ui/views.test.ts`, `ui/App.test.tsx` | view-saved-after-reload, in-filter-applies |
| Grid: parity | the app | unit · `grid/columns.test.ts`, `grid/newRow.test.ts`, `api.test.ts` | in-filter-applies (datetime-shown, new-without-title and relation-beyond-page are gone: `grid/columns.test.ts` "shows a datetime as the short weekday, day/month and time" and "keeps the date of a moment on another day than its row", `grid/newRow.test.ts` "asks only for the production on Activiteit" with `new-row-people` in `e2e/dagplanning.spec.ts` for the focus and the empty POST list, `api.test.ts` "pages with offset until the total") |
| Gate | `bun run gate` | e2e · `e2e/step-0d.spec.ts` · `bun run e2e` | all; matrix-two-activities-undo is a part of matrix-cell-persists now |

E2E flows: **matrix-cell-persists** — open "Toewijzingen per activiteit" (it opens as a matrix) and give one person cells on two different activiteiten: type `b` in the first empty cell (✓, `GET /api/rows/toewijzing` holds it with `state: bevestigd`), `u` in the second (?); press undo once: the second cell is gone (its toewijzing soft-deleted), the first stays ✓; reload: the same in the matrix and in `GET /api/rows/toewijzing`; clear the first: the toewijzing is soft-deleted (this flow took in matrix-two-activities-undo); the away mark of a person with a Beschikbaarheid is pinned by `matrix/Matrix.test.tsx` "shades a cell where the person is away" and `away-only-afwezig` (`e2e/step-3.spec.ts`). **view-saved-after-reload** — change a chip on Planning, "Save as new" "Mijn planning", reload: listed, opens with the chip, `GET /api/views` holds it with `mine: true`; a width set before saving is still set after reload. **person-to-name** — in Toewijzingen type a name in the naam cell of a person row: one PATCH, `persoon_id` null, the title shows the name. **in-filter-applies** — the seeded "Optie of bevestigd" view shows only those, with "+ 1 vaste filter"; adding a Status chip keeps both conditions. Gone from this gate, each pinned lower: **datetime-shown** (`grid/columns.test.ts`), **new-without-title** (`grid/newRow.test.ts`, with `new-row-people` in `e2e/dagplanning.spec.ts` for the focus and no POST), **relation-beyond-page** (`api.test.ts` "pages with offset until the total"; the e2e Vite server no longer sets `VITE_RECORDS_PAGE_SIZE`), **foreign-view-hidden** (`packages/engine/test/views.test.ts` "GET lists my views and the shared ones, live, by id, never another unshared view"), and the view delete and undo (`copy-rename-delete-view` in `e2e/grid-ux.spec.ts`).

## Review Focus

1. Another owner's view must not be writable (attack 1) → views denial tests.
2. A saved filter is compiled exactly like a `/rows` filter (attack 3) → views denial tests, in-filter-applies.
3. The assignee switch must not clear on an ambiguous body (both set) → theatre matrix tests.
4. Titles through a relation follow a rename → engine title test renames the target and re-reads.
5. Away periods that start before the window must still mark the week → `away.test.ts` "a period that started before the window marks the days it still covers", and away-only-afwezig (`e2e/step-3.spec.ts`).

---

## Time log

| Task | Start | End |
|---|---|---|
| 1a | 10-05 23:21 | 23:29 |
| 1b | 23:30 | 23:31 |
| 2 | 23:32 | 23:49 |
| 3 | 23:51 | 10-06 00:05 |
| 4 | 00:06 | 00:20 |
| 5 | 00:23 | 00:52 |
| 6 | 00:53 | 01:03 |
| 7 | 01:07 | 09:34 (overnight pause; its first commit 08:25) |

Final review and security audit 09:35–09:40; final fix wave 09:40–09:53. Agent wall-clock, not human days.

---

### Task 1a: Engine — titles through a relation, and offset

**Files:**
- Modify: `packages/engine/src/declare.ts`, `validate.ts`, `params.ts`, `rows.ts`, `app.ts`, `packages/engine/test/fixture.ts` (a dataset whose title is `{ via, else }`), `rows.test.ts`, `validate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TitleDecl = string | { via: string; else: string }
  // DatasetDecl.title: TitleDecl; QueryDecl.title stays string
  ```
  - `validateDomain`: `via` must be a relation column of the dataset, `else` a declared column; a relation whose target dataset has a via title is refused (its lookup title would need a second hop).
  - Every `/rows` row and every write reply carry `title: string` — set in `withLookups` (so `rowOf` write replies get it too): a column title's value, or the via target's title, else the `else` column, else `''`.
  - `/schema` serves `title: <column or else column>` and, for a via title, `title_via: <relation column>`.
  - `offset`: integer ≥ 0 (default 0), else 400 `bad_offset`; `total` stays the exact count.

- [ ] **Step 1: Tests first** — via title resolves and falls back; renaming the target changes the title on the next read; a write reply carries `title`; `offset=2&limit=2` pages with an exact total; `offset=-1`/`abc` → 400; `validateDomain` refuses `via` on a non-relation, `else` undeclared, and a relation to a via-title dataset. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Run** `bun test packages` + `bun run check`, **Step 4: Commit** — `feat(engine): titles through a relation, and offset on /rows`.

### Task 1b: Engine — the matrix declaration and its cells

**Files:**
- Modify: `declare.ts`, `validate.ts`, `params.ts` (`cells`), `rows.ts` (`cellsOf()`), `app.ts`, `fixture.ts` (a join dataset with a matrix declaration and an away dataset), Create: `packages/engine/test/matrix.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface MatrixDecl {
    down: string; across: string; label?: string
    cell: string; note?: string
    keys: Record<string, string>; marks: Record<string, string>; count: string
    away?: { dataset: string; across: string; label: string; end: string }
  }
  // DatasetDecl.matrix?: MatrixDecl
  ```
  - `validateDomain`: `down`/`across` relation columns of the join; `label`/`note` text columns; `cell` an options column; every `keys` value, every `marks` key and `count` are `cell` options; `away.dataset` declares `date`, `away.across` is a relation targeting the join's `across` target, `away.label` and `away.end` are declared columns; at most one matrix per `down` source.
  - `/schema`: `sources[join].matrix = MatrixDecl`; `sources[down].matrix_join = join`.
  - `GET /rows/<down>?cells=1&from&to` → each row gains `cells: EngineRow[]` (live join rows with `down` = row id, with titles and lookups); 400 `window_required` without a window; 400 `no_matrix` on a source that is no matrix's `down`.

- [ ] **Step 1: Tests first** — the denial and validation cases above; cells are only live join rows of rows in the window; a soft-deleted join row is absent. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Run**, **Step 4: Commit** — `feat(engine): the matrix declaration and its cells`.

### Task 2: Engine — saved views

**Files:**
- Create: `packages/engine/src/views.ts`, `packages/engine/test/views.test.ts`
- Modify: `saved-view.ts` (add `shared` boolean default false; drop `scope`), `writes.ts` (export `revise`), `app.ts` (mount the routes on the `/api` app; **`/schema` keeps serving `views` until Task 5 removes it**), `migrate.ts` `seedDomain` (seeded views: owner 0, `shared: true`, for every domain), `declare.ts` (`SavedViewSeed.skin: 'table' | 'matrix'`), `index.ts`

**Interfaces:**
- Produces:
  ```ts
  type ViewOut = SavedViewRow & { shared: boolean; owner_id: number; mine: boolean; editable: boolean }
  function viewBody(input: unknown, domain: Domain, creating: boolean): ViewFields   // throws ApiError(400,'bad_view' | 'view_too_large')
  function ownedView(sqlite: Database, id: number, actor: Actor, includeDeleted?: boolean): SavedViewRow // throws 404 unknown_view / 403 not_owner
  ```
  Routes: `GET /api/views` → `{ views: ViewOut[] }` (own + shared, live, by id); `POST` → 201 `ViewOut`; `PATCH /:id` → `ViewOut` (`source`, `skin` refused: 400 `bad_view`); `DELETE /:id` → `{ id }`; `POST /:id/restore` → `ViewOut`. Each write revised (entity `saved_view`) in one transaction.

- [ ] **Step 1: Denial tests first** — the threat-model cases 1–4 and 7, each asserting status, code, `saved_view` + `revision` unchanged (a foreign view inserted directly with `owner_id` 7, shared and unshared). Run → FAIL.
- [ ] **Step 2: Behaviour tests** — create, list (own + shared, not others' unshared), rename, share, delete (gone), restore (back), revised with actor 0; seeded views for theatre and fiche are shared and owned by 0.
- [ ] **Step 3: Implement**, **Step 4: Run** `bun test packages` + `bun run check` + `rm -rf e2e/.tmp && bun run e2e` (the grid still boots from `/schema.views`), **Step 5: Commit** — `feat(engine): saved views — owner, shared, soft delete and restore`.

### Task 3: Theatre — matrix declaration, derived titles, the assignee switch

**Files:**
- Modify: `packages/theatre/src/datasets.ts` (toewijzing `matrix` per spec R2 with `away: { dataset: 'beschikbaarheid', across: 'persoon_id', label: 'reden', end: 'eind_at' }`; beschikbaarheid `date: 'start_at'`; titles `{ via: 'persoon_id', else: 'naam' }` and `{ via: 'persoon_id', else: 'reden' }`), `writers.ts` (R5), `seed.ts` ("Toewijzingen per activiteit", skin `matrix`, on `activiteit`; "Optie of bevestigd" on activiteit with `filters: { status: { $in: ['optie', 'bevestigd'] } }`; at least one Beschikbaarheid spanning the start of a seeded week). Side effect, accepted for 0d: with `date: start_at` the plain "Beschikbaarheden" grid view becomes dated and hides periods that started before the window.
- Create: `packages/theatre/test/matrix.test.ts`

**Interfaces:** the R5 branch, applied to `values` before the existing checks on update:
```ts
const sets = (k: string) => Object.hasOwn(values, k)
if (sets('persoon_id') && values.persoon_id != null && !sets('naam')) values.naam = null
if (sets('naam') && filled(values.naam) && !sets('persoon_id')) values.persoon_id = null
```

- [ ] **Step 1: Tests first** — the switch both ways; both set → "niet allebei"; switching onto a persoon already on that activiteit → duplicate; `?cells=1` on activiteit returns toewijzingen titled by persoon or naam; renaming a persoon changes those titles; `GET /api/views` serves "Toewijzingen per activiteit" as skin `matrix`. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Run** `bun test packages` + `bun run check` + `rm -rf e2e/.tmp && bun run e2e` (via titles reach the 0c flows: fix any grid break here only if trivial, else note it for Task 4), **Step 4: Commit** — `feat(theatre): the toewijzing matrix, titles through the person, and the assignee switch`.

### Task 4: Grid — the matrix and via titles

**Files:**
- Modify: `apps/grid/src/engine.ts` (`tableDefOf(source, sources)` builds `join`/`away` from `sources[source.matrix_join].matrix` and `types: ['grid','matrix']`; `away` maps to `MatrixAway` with `date_field` = the away dataset's `date`, `end_field` = `away.end`; `toRow` takes `row.title` and maps `cells` to `rollups.cells`; for a `title_via` source: `modelOf` and `arrangementOf` keep the `else` column as an ordinary writable field, `columnId`/`engineColumn`/`toEngineData` stop aliasing it to `title`, the model is `title_readonly`, and the `title` id is never offered for sort, group or filter), `api.ts` (`rows()` sends `cells=1` for a matrix view; a new `awayRows(away, window)` sends only the overlap `filter` `{ [date]: { $lte: to + 'T23:59:59' }, [end]: { $gte: from } }` — no window — and returns `[]` when the window lacks `from` or `to`; title-column callers at `api.ts` 66-118 follow `title_via`), `ui/App.tsx` (line 120 calls `awayRows`), `matrix/away.ts` (compare the first 10 characters of the date and end), tests
- Modify: `specs/step-0a/wp-assumptions.md` — a 0d block, matrix rows (30, 40, 48, 49, 50 and any other the matrix reaches) **first**, with numstat lines

- [ ] **Step 1: Tests first** — `tableDefOf` builds join/away; `rollups.cells` from `cells`; a cell create sends one id per relation (already the 0b wire format: assert it); clearing sends DELETE; a 422 reverts with the writer's message; an away period starting before the window marks the week; a via title is not editable and sorting never sends `title`; on Toewijzing `naam` is an editable field and the title is not. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run** grid tests + `bun run check` + `rm -rf e2e/.tmp && bun run e2e`, **Step 5: Commit** — `feat(grid): the matrix on the engine, and titles through a relation`.
- [ ] **Checkpoint:** the controller reports the matrix's ledger rows and line counts to Stefan before Task 5; above about 150 production lines of matrix rework, stop for his answer.

### Task 5: Grid — saved views on the engine

**Files:**
- Modify: `apps/grid/src/api.ts` (`savedViews` from `GET /api/views`; `createView`/`updateView`/`deleteView`/`restoreView` to the routes; `prefs`/`savePrefs` stay local), `engine.ts` (`toSchema`'s tables from every source, not from `s.views`; `toSavedViews` from `ViewOut`: `type` = `skin` (`table`→`grid`), `table` = `source`, `mine`/`editable`/`shared`/`owner`; a view's non-`$eq` filters are kept as `fixed` on the View (not dropped by `chipsOf`); `toStoredView`/`fromStoredView` map the arrangement: `filters` = chips merged per key with the view's `fixed` filters, `sort`, `group_by`, `visible_fields` = the declared, visible columns in order), `ui/views.ts` (widths, matrix picks and matrix hidden keys kept under a third per-view local prefix that `clearLocal` does not erase, merged back inside `arrangementOf` so `changed()` does not count them; "Save as new" copies them to the new id's key), `ui/useSavedViews.ts` (map `unknown_view`/`not_owner` to the existing flows), `packages/engine/src/app.ts` (**remove `views` from `/schema` in this task**), tests; ledger rows 11, 12, 14, 19, 21, 37, 38, 59

- [ ] **Step 1: Tests first** — boot with a `/schema` without `views`; the arrangement round-trips (hidden columns lose their position — asserted and documented); a seeded `$in` filter survives a Save; after Save + re-read, widths and picks are still there; "Save as new" opens the new view; delete + undo restores; the seeded matrix view opens as a matrix; `unknown_view`/`not_owner` drive the existing flows. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run** grid + engine tests, `bun run check`, `rm -rf e2e/.tmp && bun run e2e`, **Step 5: Commit** — `feat(grid): saved views on the engine`.

### Task 6: Grid — the parity items

**Files:**
- Modify: `grid/columns.ts` (a `datetime` kind: `Intl` short weekday/day/month + `HH:mm`; edits through `<input type="datetime-local">`; sorts on the text), `engine.ts` (engine `datetime` → that kind), `api.ts` (`rowsQuery` merges the View's `fixed` (from Task 5) with chips per key: `{ status: { $in, $eq } }`; `records()` pages with `limit = Number(import.meta.env.VITE_RECORDS_PAGE_SIZE) || 5000` and `offset` until `total`), `grid/newRow.ts` (title asked only when required and writable; a datetime `start_at` stays fillable as today's date at 09:00 inside the window, or asked — state which), `ui/Toolbar.tsx` ("+ n vaste filter(s)"), `i18n.ts`, tests; `playwright.config.ts` (`VITE_RECORDS_PAGE_SIZE=2` on the theatre Vite server); ledger rows 41, 42, 44, N1

- [ ] **Step 1: Tests first** — datetime display and edit; `rowsQuery` with a chip and a fixed filter on the same key keeps both; the toolbar count; `newRow` for activiteit asks `productie_id` first; `records()` with page size 2 and 5 rows makes 3 calls and returns 5. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run** grid tests + `bun run check` + `rm -rf e2e/.tmp && bun run e2e`, **Step 5: Commit** — `feat(grid): datetimes, fixed filters, + New without a title, paged relation options`.

### Task 7: The browser gate

**Files:**
- Create: `e2e/step-0d.spec.ts`
- Modify: earlier e2e specs only if the matrix seed, `shared` or the page size break them (state which)

- [ ] **Step 1: Write the nine flows** (the seven plus matrix-two-activities-undo and foreign-view-hidden; since cut to four, matrix-two-activities-undo merged into matrix-cell-persists); each uses its own rows; no sleeps.
- [ ] **Step 2: Run** `rm -rf e2e/.tmp && bun run e2e` → all pass; `bun run gate` → 0.
- [ ] **Step 3: Commit** — `test(e2e): step 0d gate in a real browser`.

Then stop: the Close (whole-branch review + security-sentinel, one fix wave), the report (matrix ledger rows first), and the proposed `docs/SPEC.md` diff (matrix declaration incl. `away.end` and `matrix_join`, title via relation, offset, SavedView `shared` without `scope`, last write wins also for views, the 0e permission-before-in-use requirement).
