# Step 0d — matrix, saved views, parity items: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The matrix skin runs on the engine (Toewijzing across persoon, down activiteit, writes through the writer); planners save, share, delete and restore views; the Toewijzing writer switches person↔name in one edit; Toewijzing and Beschikbaarheid show titles through their person; datetimes display, saved non-`$eq` filters apply, "+ New" skips the title, relation options page past 5000.

**Architecture:** The engine learns three generic shapes — a dataset's `matrix` declaration (served in `/schema`, cells returned by `GET /rows/<down>?cells=1` in one query), a title `{ via, else }` resolved on read, and `offset` on `/rows` — and engine-owned SavedView routes under `/api/views` with owner, `shared`, soft delete and restore, revised like rows. Theatre declares the matrix and the derived titles and normalises the assignee switch. The grid's adapter feeds the copied matrix and saved-view code from those routes, and four parity changes land in the grid.
First working version: Task 1 — `curl '127.0.0.1:4310/api/rows/<fixture down>?cells=1&from=…&to=…'` returns rows with cells and titles through a relation.

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm (bun-sqlite), React 19, Vite, Vitest, Playwright, Biome.

**Spec:** `specs/step-0d/spec.md` (parent: `docs/SPEC.md`).

**Simplest design:** For matrix cells the simplest design is the grid fetching the join rows with a `$in` on the down ids — rejected because `$in` is capped at 100 and a busy week breaks it; one engine query keyed on the down relation and the same window costs no more. For derived titles the simplest is a stored column — rejected (Stefan) because a rename leaves every assignment stale; resolving on read reuses the lookup path that already exists. For saved views the simplest is reusing the domain writer path — not possible, SavedView is an engine table with its own validation; it gets its own small route module instead, reusing the write guard, Revision and the filter compiler.

## Decisions

- Matrix declared by the domain, cells served by the engine; SavedView gains `shared`, widths and picks stay local; titles may come through a relation; `/rows` gains `offset`. — Stefan, 2026-10-05.
- Every existing database needs `--fresh` again (SavedView's DDL changes; ALTER stays the step 1–2 item, before the first import).
- Last write wins (0b) stands for views too.
- 0e requirement recorded: the permission check runs before the in-use check, with a test.

## Global Constraints

- `packages/engine` holds no domain word and imports no domain package.
- Domain words (keys, marks, Dutch labels and refusals) live in the theatre package.
- Every write route — rows and views — keeps the 0b guard: JSON content type, `Sec-Fetch-Site`, Host.
- The fiche package keeps running unchanged (its tests stay green).
- Out: auth, import, WordPress block, slots (and the matrix's open column), lifecycle, prefs, `share_token`/`public`.
- `docs/SPEC.md` is never committed by this plan; the diff is proposed at the end.
- Each task logs its start and end time in the Time log.

## Threat model

**Assets.** Saved views (another planner's work), the planning rows a matrix cell writes, the host process.

**Attacks.**
1. **Writing someone else's view** — `PATCH/DELETE /api/views/<id>` for a view the caller does not own → **`ownedView()` in `views.ts`: unshared → 404 `unknown_view`, shared → 403 `not_owner`; nothing written.** (Owner is the dev actor until auth; the rule and its tests exist now so auth only swaps the actor.)
2. **Forging ownership or audit** — a body with `owner_id`, `id`, `deleted_at`, `share_token`, `public` → **`viewBody()` keeps only `name`, `source`, `skin`, `filters`, `sort`, `group_by`, `visible_fields`, `shared`; the rest is dropped; owner set by the engine.**
3. **Injecting through a saved filter, sort or column list** — a view whose `filters` hold `{"titel) --":1}` or whose `sort` names an undeclared column, later replayed on every rows request → **`viewBody()` compiles `filters` with `filterCompile` + `resolveKey` against the source (same as `/rows`), and checks `sort`, `group_by`, `visible_fields` against declared columns; 400; nothing stored.**
4. **Oversized or hostile names** — 10 MB body, an 80-char-plus name, control characters → **the 64 kB write body cap (0b) plus a 16 kB view cap and name 1–80 characters after trim; names rendered as React text only.**
5. **Matrix cells as a bypass** — writing a cell through some new route → **there is none: cells write through `POST/PATCH/DELETE /api/rows/<join>` and its writer.**
6. **Unbounded cell reads** — `?cells=1` without a window → **400 `window_required`; the `/rows` limit applies to the down rows.**
7. **Cross-site view writes** — as 0b attacks 1–2 → **`writeGuard()` mounted on every write under `/api` (0b L3) covers `/views`; a test asserts it.**

**Mitigations — where they live.** `ownedView()`, `viewBody()` and the routes in `packages/engine/src/views.ts` (1–4, 7); `cellsOf()` in `packages/engine/src/rows.ts` (5, 6).

**Deferrals.** No real actors: the dev actor owns everything until auth, so attack 1 is enforced but unexercised by a second human. Prefs are not stored. `share_token`/`public` (publication) untouched.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Engine reads: title via, offset, matrix declaration + cells | `GET /api/rows/:source`, `/api/schema`, `validateDomain` | integration · `packages/engine/test/matrix.test.ts`, `packages/engine/test/rows.test.ts`, `packages/engine/test/validate.test.ts` · `bun test packages/engine` | matrix-cell-persists, relation-beyond-page |
| Engine saved views | `/api/views` routes | integration · `packages/engine/test/views.test.ts` · `bun test packages/engine` — denials first (attacks 1–4, 7): status, code, `saved_view` + `revision` unchanged | view-saved-after-reload |
| Theatre: matrix declaration, derived titles, assignee switch, matrix view seed | theatre through the routes | integration · `packages/theatre/test/matrix.test.ts` · `bun test packages/theatre` | matrix-cell-persists, person-to-name |
| Grid matrix | the app against `/api` | unit · `apps/grid/src/engine.test.ts`, `apps/grid/src/api.test.ts`, `apps/grid/src/matrix/*.test.ts(x)` · `bun run --filter @worktable/grid test` | matrix-cell-persists |
| Grid saved views | the app against `/api/views` | unit · `apps/grid/src/api.test.ts`, `apps/grid/src/ui/App.test.tsx`, `apps/grid/src/ui/views.test.ts` · grid test | view-saved-after-reload, in-filter-applies |
| Grid parity | the app | unit · `apps/grid/src/grid/columns.test.ts`, `apps/grid/src/grid/newRow.test.ts`, `apps/grid/src/api.test.ts` · grid test | datetime-shown, new-without-title, relation-beyond-page, in-filter-applies |
| Gate | `bun run gate` | e2e · `e2e/step-0d.spec.ts` · `bun run e2e` | all |

E2E flows: **matrix-cell-persists** — open "Toewijzingen per activiteit", type `b` in an empty person cell of an activiteit, reload, the cell shows ✓ and `GET /api/rows/toewijzing` holds it; type `x`… then clear: the toewijzing is soft-deleted. **view-saved-after-reload** — change a chip on Planning, "Save as new" named "Mijn planning", reload, the view is in the list, opens with the chip, `GET /api/views` holds it with `mine: true`. **person-to-name** — in Toewijzingen, type a name in the naam cell of a person row: one PATCH, the row shows the name, `persoon_id` is null. **datetime-shown** — Planning's Start cell reads a formatted date and `HH:mm`, not ISO. **in-filter-applies** — a seeded view with `status $in [optie, bevestigd]` shows only those, and the toolbar says "+ 1 vaste filter". **new-without-title** — "+ New" on Planning focuses Productie first. **relation-beyond-page** — the e2e Vite server sets `VITE_RECORDS_PAGE_SIZE=2` (the grid's relation page size; production default 5000), and the productie chip still lists every productie, read in several `limit=2&offset=…` requests the test counts.

## Review Focus

1. Another owner's view must not be writable (attack 1) → views denial tests.
2. A saved filter is compiled exactly like a `/rows` filter (attack 3) → views denial tests, in-filter-applies.
3. The assignee switch must not silently clear on an ambiguous body (both set) → theatre matrix tests.
4. Titles through a relation must not go stale on rename → engine title test renames the target and re-reads.
5. Cells must only be live join rows inside the window → engine matrix tests.

---

## Time log

| Task | Start | End |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |

---

### Task 1: Engine reads — title via relation, offset, the matrix declaration and cells

**Files:**
- Modify: `packages/engine/src/declare.ts` (`title: string | { via: string; else: string }`; `MatrixDecl`), `validate.ts` (title-via, matrix names/options/away), `params.ts` (`offset`, `cells`), `rows.ts` (title on every row; `cellsOf()`; offset), `app.ts` (`/schema` serves `matrix` on the join dataset and `matrix: <join>` on the down source), `packages/engine/test/fixture.ts` (a join dataset with a matrix declaration; a title via relation), tests `matrix.test.ts`, `rows.test.ts`, `validate.test.ts`

**Interfaces:**
- Produces: `/rows` rows gain `title: string`; `GET /rows/:source?offset=n` (integer ≥ 0, else 400 `bad_offset`); `GET /rows/<down>?cells=1&from&to` → each row gains `cells: Row[]` (live join rows whose `down` = row id), 400 `window_required` without a window, 400 `no_matrix` on a source no matrix declares as `down`; `/schema` `sources[join].matrix` and `sources[down].matrix_join`.

- [ ] **Step 1: Tests first** — title via relation resolves the target's title and falls back to `else`, and follows a rename of the target; `offset` pages with an exact `total`, `offset=-1`/`abc` 400; `cells=1` without window 400, on a non-down source 400, returns only live join rows in the window, one query regardless of row count (assert by result, not by spying SQL); `validateDomain` refuses a matrix naming an undeclared column, a `keys`/`marks`/`count` value outside `cell`'s options, an `away` whose `across` targets another dataset. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Run** `bun test packages` + `bun run check` (theatre and fiche green), **Step 4: Commit** — `feat(engine): titles through a relation, offset, and the matrix declaration with its cells`.

### Task 2: Engine saved views

**Files:**
- Create: `packages/engine/src/views.ts`, `packages/engine/test/views.test.ts`
- Modify: `saved-view.ts` (`shared` boolean, default false; English labels), `app.ts` (mount `/api/views` routes; `/schema` stops serving `views`), `migrate.ts`/`seedDomain` (seeded views owner 0, shared true), `declare.ts` (`SavedViewSeed.skin: 'table' | 'matrix'`), `index.ts`

**Interfaces:**
- Produces: `GET /api/views` → `{ views: ViewOut[] }` (own + shared, live, oldest first), `ViewOut = SavedViewRow & { mine: boolean; editable: boolean }`; `POST /api/views` → 201 `ViewOut`; `PATCH /api/views/:id` → `ViewOut`; `DELETE /api/views/:id` → `{ id }`; `POST /api/views/:id/restore` → `ViewOut`; errors 400 `bad_view` (naming the field), 404 `unknown_view`, 403 `not_owner`, 413 `view_too_large`; Revision rows with entity `saved_view`.

- [ ] **Step 1: Denial tests first** (status, code, `saved_view` + `revision` unchanged): another owner's unshared view 404 and shared 403 on PATCH/DELETE/restore (insert a view with `owner_id` 7 directly); a body's `owner_id`/`id`/`deleted_at`/`share_token`/`public` ignored; `filters` with an undeclared key, a bad operator, a `custom.x` on a query → 400; `sort`/`group_by`/`visible_fields` naming undeclared columns → 400; `source` unknown, `skin: 'matrix'` on a source without a matrix → 400; name empty/81 chars → 400; a view over 16 kB → 413; `source`/`skin` in a PATCH → 400; a cross-site `Sec-Fetch-Site` POST → 403. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — create, list (own + shared, not others' unshared), rename, share, delete (gone from the list), restore (back), each revised with the dev actor; `/schema` has no `views`.
- [ ] **Step 3: Implement**, **Step 4: Run** `bun test packages` + `bun run check`, **Step 5: Commit** — `feat(engine): saved views — owner, shared, soft delete and restore`.

### Task 3: Theatre — matrix declaration, derived titles, the assignee switch

**Files:**
- Modify: `packages/theatre/src/datasets.ts` (toewijzing `matrix` per R2; toewijzing and beschikbaarheid titles per R6), `writers.ts` (R5 normalisation), `seed.ts` ("Toewijzingen per activiteit", skin `matrix`, on `activiteit`; every seeded view `shared: true`; one seeded view "Optie of bevestigd" on activiteit with `filters: { status: { $in: ['optie', 'bevestigd'] } }` for the in-filter flow)
- Create: `packages/theatre/test/matrix.test.ts`

- [ ] **Step 1: Tests first** — the switch: PATCH `{persoon_id: 3}` on a name row clears naam; PATCH `{naam: 'Gast'}` on a person row clears persoon_id; PATCH `{persoon_id: 3, naam: 'Gast'}` is refused "niet allebei"; the switch onto a persoon already on that activiteit is refused as a duplicate; `?cells=1` on activiteit returns toewijzingen with titles from persoon or naam; `/schema` serves the declaration; renaming a persoon changes its toewijzingen' titles on the next read. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Run** `bun test packages` + `bun run check`, **Step 4: Commit** — `feat(theatre): the toewijzing matrix, titles through the person, and the assignee switch`.

### Task 4: Grid — the matrix on the engine

**Files:**
- Modify: `apps/grid/src/engine.ts` (`tableDefOf` gives `types: ['grid','matrix']` and `join`/`away` from `/schema`'s declaration, mapped to the grid's `MatrixJoin`/`MatrixAway`; `toRow` takes `row.title` and `cells` → `rollups.cells`), `api.ts` (`rows()` sends `cells=1` for a matrix view; matrix writes go through `create/update/remove` on the join dataset with relation values as ids — the 0b wire format), `ui/App.tsx` only where the adapter cannot reach, tests
- Modify: `specs/step-0a/wp-assumptions.md` — a 0d block; the matrix rows (30, 40, 48, 49, 50 and any other the matrix reaches) **first**, each moved to done with numstat lines or stated why it stays deferred

- [ ] **Step 1: Tests first** — `tableDefOf` builds the join/away from a declaration; a matrix row's `rollups.cells` come from `cells`; creating a cell sends `POST /rows/toewijzing` with `activiteit_id`, `persoon_id` (ids, not lists) and `state`; a name column creates with `naam`; clearing sends DELETE; a 422 refusal reverts the cell with the writer's message. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run** grid tests + `bun run check`, **Step 5: Commit** — `feat(grid): the matrix on the engine`.

### Task 5: Grid — saved views on the engine

**Files:**
- Modify: `apps/grid/src/api.ts` (`savedViews` from `GET /api/views`; `createView`, `updateView`, `deleteView`, `restoreView` to the routes; `prefs`/`savePrefs` stay local stubs), `engine.ts` (`toSavedViews` from `ViewOut` incl. `mine`/`editable`/`shared`/`owner`; arrangement ↔ SavedView fields per R4), `ui/useSavedViews.ts` only for the code mapping (`unknown_view` → the vanished flow, `not_owner` → the not-owner flow), tests; ledger rows 11, 12, 14, 19, 21, 37, 38, 59 updated

- [ ] **Step 1: Tests first** — the arrangement maps to and from `filters`/`sort`/`group_by`/`visible_fields` and back (widths and picks kept local); "Save as new" POSTs and the new view opens; Save PATCHes; delete + undo calls restore; `unknown_view` and `not_owner` drive the existing flows. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run**, **Step 5: Commit** — `feat(grid): saved views on the engine`.

### Task 6: Grid — the parity items

**Files:**
- Modify: `apps/grid/src/grid/columns.ts` (a `datetime` kind: display via `Intl` short weekday/day/month + `HH:mm`; edit through `<input type="datetime-local">`; sort on the text), `engine.ts` (engine `datetime` → that kind; saved non-`$eq` filters kept as `fixed` filters on the view), `api.ts` (`rowsQuery` merges fixed filters with chips; `records()` pages with `limit = import.meta.env.VITE_RECORDS_PAGE_SIZE ?? 5000` and `offset` until `total`), `grid/newRow.ts` (title asked only when required and writable), `ui/Toolbar.tsx` or the filter bar ("+ n vaste filter(s)"), `i18n.ts`, tests; ledger rows 42, 44, 41, N1 updated

- [ ] **Step 1: Tests first** — a datetime cell renders formatted and edits as `YYYY-MM-DDTHH:mm`; `rowsQuery` sends `{status: {$in: [...]}, ...chips}`; the toolbar shows the fixed-filter count; `newRow` for activiteit needs `productie_id` and `start_at`, not the title; `records()` with a page size of 2 and 5 rows makes 3 calls and returns 5. Run → FAIL.
- [ ] **Step 2: Implement**, **Step 3: Ledger**, **Step 4: Run**, **Step 5: Commit** — `feat(grid): datetimes, fixed filters, + New without a title, paged relation options`.

### Task 7: The browser gate

**Files:**
- Create: `e2e/step-0d.spec.ts`
- Modify: `playwright.config.ts` (the theatre Vite server gets `VITE_RECORDS_PAGE_SIZE=2`; it only changes how relation options are paged), earlier e2e specs only if the matrix seed or `shared` change breaks them (state which)

- [ ] **Step 1: Write the seven flows**; each uses its own rows; no sleeps.
- [ ] **Step 2: Run** `rm -rf e2e/.tmp && bun run e2e` → all pass; `bun run gate` → 0.
- [ ] **Step 3: Commit** — `test(e2e): step 0d gate in a real browser`.

Then stop: the Close (whole-branch review + security-sentinel, one fix wave), the report, and the proposed `docs/SPEC.md` diff (matrix declaration, title via relation, offset, SavedView `shared`, the 0e permission-before-in-use requirement).
