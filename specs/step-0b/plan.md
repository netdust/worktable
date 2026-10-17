# Step 0b — writes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writers become the only path into a table — routes, readonly columns, Revision rows in the same transaction, a CSRF-safe write guard — the Activiteit writer and a `writes:`-mapped stand-in query prove it, and the grid edits cells through them in a real browser.

**Architecture:** `packages/engine` gains `validateDomain` (startup), a `limit` + exact count on `/rows`, a writers module (`writes.ts`: cut, type-check, call the domain writer inside one SQLite transaction, append Revision rows, return the `/rows`-shaped row), the `revision` generic table, a temporary dev actor, and a write guard (JSON content type + `Sec-Fetch-Site`). `packages/theatre` registers the Activiteit writer and the `dagplanning` query. `apps/grid` maps writes through the adapter, routes mapped query columns to their target, and builds relation chip options from the target's rows.
First working version: Task 2 — `bun test packages/engine/test/writes.test.ts` shows a PATCH through a fixture writer storing the row and its Revision rows (`serve.ts` loads a module's default export, so the fixture is driven by the test, not curl).

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm (bun-sqlite), Zod, React 19, Vite, Vitest, Playwright, Biome.

**Spec:** `specs/step-0b/spec.md` (parent: `docs/SPEC.md`).

**Simplest design:** The simplest design is a generic PATCH that writes whatever columns arrive. It is not used: R4 makes the writer the only path and lets it refuse, and R10's rules (end-before-start, unknown productie, plandag) live in the domain. What is kept simple: the engine owns the transaction, the cut, the type check and the Revision rows, so a writer is a pure function of `(values, current, ctx) → values | refuse`; the grid routes a mapped query column itself (as `docs/SPEC.md` "Writes through a query" says) instead of a second engine route, then reloads the query row. The write guard checks the browser's own `Sec-Fetch-Site` header (refuse `same-site` and `cross-site`, allow `same-origin` and absent) instead of an Origin allowlist: no CLI flag, no per-environment config, and the grid's fetch through the Vite proxy is `same-origin`. Considered and rejected: an `--origin` allowlist (every dev and e2e server must pass its origin, and a forgotten flag makes every edit a 403).

## Decisions

- **Last write wins; no row versioning.** Two planners editing the same field: the later PATCH is stored, and both writes appear in Revision. There is no version column, no `If-Match`, no conflict answer. Lifecycle transitions (step 2) bring the one conditional update the spec asks for. — Stefan, 2026-10-05.
- **Foreign keys are enforced on the serving connection.** `PRAGMA foreign_keys = ON` is set by `migrate()` (`migrate.ts:51`) on the connection `serve.ts` passes to `createEngine`; `createEngine` sets it too, so writes never depend on `migrate` having run on that connection. A relation to a missing or soft-deleted row is refused before the INSERT/UPDATE (the FK alone does not see soft deletes).
- **A relation column an update does not touch is not re-checked;** a row may keep pointing at a productie soft-deleted later (soft-deleting productie has no route in 0b).

## Global Constraints

- `packages/engine` never imports `@worktable/theatre` or `@worktable/fiche`; `bun run check` enforces it. No domain word in the engine.
- Engine names English and generic; theatre names Dutch as in `docs/SPEC.md`. Refusal messages from the theatre writer are Dutch.
- Domain rules (refuse rules, day line) live in domain writers and SQL views, never in the engine.
- Writers are the only path into a domain table; `seedDomain` stays the one other path (fixtures, `--fresh` only).
- Server binds `127.0.0.1`; the Host rule stays; writes add the JSON + `Sec-Fetch-Site` rule (R9).
- The dev actor is `{ id: 0, role: 'admin' }`, defined only in `packages/engine/src/dev-actor.ts`, whose first line marks it temporary until auth.
- Out: actors/auth, lifecycle, record tokens, public create, board, import, Persoon, Organisatie, Toewijzing, Beschikbaarheid, saved-view saving, Productie writes, custom-field writes, undo UI.
- `docs/SPEC.md` is never committed by this plan; its proposed diff waits for Stefan.
- Each task logs its start and end time in the Time log.

## Threat model

**Assets.** The planning rows (integrity first: a write is now possible); the Revision trail (an audit that lies is worse than none); the host process.

**Attacks.**
1. **Cross-site write from a page the planner visits** — a hostile page sends `fetch('http://127.0.0.1:4310/api/rows/activiteit', {method:'POST', body: '{…}'})` as `text/plain` (a CORS-simple request, no preflight, correct Host) → **POST and PATCH require `Content-Type: application/json`, and every write route refuses `Sec-Fetch-Site: same-site` or `cross-site`, 415 / 403, before the body is read.** A preflight alone is not relied on: behind Vite, Vite's default CORS answers preflights for any localhost origin.
2. **Cross-site write through the Vite proxy** — a page on another local port sends a JSON PATCH to `127.0.0.1:5173/api/…`; Vite answers its preflight and forwards it, and `changeOrigin` rewrites Host → **the browser marks that request `Sec-Fetch-Site: same-site` (or `cross-site`), the proxy forwards the header untouched, and the engine refuses it 403 `forbidden_site`; a request carrying `Origin` without `Sec-Fetch-Site` is refused (older browsers fail closed).** Proven through the proxy in e2e.
3. **Writing columns the writer did not mean to expose** — a body with `id`, `deleted_at`, `created_at`, `custom`, `plandag` or an undeclared key → **`cutBody()` keeps only declared non-readonly columns; the rest is dropped before the writer sees it.**
4. **Wrong-typed values reaching SQLite** — `{"productie_id":"1 OR 1=1"}`, `{"start_at":{"a":1}}`, `{"status":[1]}`, a 1 MB string → **`checkValues()` checks each kept value against its column type and nullability (400 `bad_value`); values are bound parameters; Hono's body is read once with a size cap of 64 kB (413 `body_too_large`).**
5. **Bypassing the writer** — PATCH a dataset with no writer, a generic table (`revision`, `saved_view`, `_migrations`), or a query → **`writableOf()` resolves only domain datasets with a registered writer and that operation; everything else 404 `unknown_source` or 405 `read_only`.** A create missing a non-nullable, no-default column is 400 `bad_value` naming it, checked after the writer returns, never a 500 from the INSERT.
6. **A refusal or crash leaving half a write** — writer refuses after reading, or the Revision insert fails → **the writer call, the row write and the Revision rows run in one `sqlite.transaction`; `refuse()` throws and rolls back; tests assert the table and `revision` unchanged after a refusal.**
7. **Forged audit** — a body sets `actor_id`, `batch_id` or writes `revision` directly → **Revision rows are built by the engine from the stored diff with the dev actor; `revision` has no write route.**
8. **Resource exhaustion on reads** — `limit=99999999` → **`limit` capped at 5000, 400 above (R3).**

9. **DNS rebinding** — a page whose name rebinds to 127.0.0.1 sends its own Host → **the 0a Host check (`app.ts`, 403 `forbidden_host`) is what stops it, for reads and writes; it stays.** `Sec-Fetch-Site` does not: a rebound page is `same-origin` to itself.
10. **A relation to a row that is missing or soft-deleted** — `{"productie_id": 999}` or the id of a soft-deleted productie on any dataset → **`checkRelations()` runs on the values the writer returns, for every relation column of any dataset: 400 `bad_relation` naming the column; the writer's own refusal (e.g. theatre's Dutch message) comes first when it checks; never a 500 from the FK.**

**Mitigations — where they live.** `writeGuard()` in `packages/engine/src/write-guard.ts` (1, 2, 4's size cap via `hono/body-limit`); `cutBody()` / `checkValues()` / `checkRelations()` / `writableOf()` / `runWrite()` in `packages/engine/src/writes.ts` (3, 4, 5, 6, 7, 10); `app.ts` (direct) + Vite `allowedHosts` (proxied; `changeOrigin` hides the Host from the engine) (9); `parseRowsParams()` in `params.ts` (8).

**Deferrals.** No authentication: every write runs as the temporary dev actor, so any local process — and any page served from an allowed origin — can write; acceptable while bound to 127.0.0.1 with invented fixtures; auth replaces `dev-actor.ts` in step 0. No rate limit on writes, same reason. Pre-existing read exposure (0a): Vite's default CORS lets any page on a local port read `/api/rows` through the dev proxy; reads stay unguarded until auth. Non-browser clients (curl) send no `Sec-Fetch-Site` and are allowed: they cannot be driven by a web page. A writer's own code is trusted (domain code). Revision `old`/`new` are stored as JSON text of the stored values; no redaction (no secret columns exist). `records()` reads at most the `/rows` default of 5000 per target; paging comes with a source that large.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Write routes + guard + Revision + `/schema` `writable` (engine) | `POST/PATCH/DELETE /api/rows/…`, `GET /api/revisions/:dataset/:id`, `GET /api/schema` | integration · `packages/engine/test/writes.test.ts`, `packages/engine/test/write-guard.test.ts` · `bun test packages/engine` — denials first: attacks 1–7 each assert status, code, and table + `revision` unchanged | refused-edit (status-persists and revisions-recorded are gone: `edit-select-cell` in `e2e/react-aria.spec.ts` pins the Status pick and `writes.test.ts` "update writes one revision per changed field only…" the revision) |
| Grid writes (adapter, query routing, chip options, ledger) | the app against `/api` | unit · `apps/grid/src/engine.test.ts`, `apps/grid/src/api.test.ts`, `apps/grid/src/grid/store.test.ts`, `apps/grid/src/ui/App.test.tsx` · `bun run --filter @worktable/grid test` | refused-edit, day-line-move (status-persists and query-edit-lands are gone: `edit-select-cell` pins the cell commit, `store.test.ts` "a query-row edit's batch comes from the PATCH reply…" the query-row routing) |
| Activiteit writer + dagplanning | `@worktable/theatre` through the engine routes | integration · `packages/theatre/test/writer.test.ts` · `bun test packages/theatre` — refusals first | refused-edit, day-line-move (relation-pick: `edit-relation-cell`; clear-end: `edit-datetime-cell` and `writer.test.ts` "clearing only eind_at on a timed row is accepted…") |
| Declaration validation, real-date window, limit + count | `validateDomain(domain)`, `GET /api/rows/:source` | integration · `packages/engine/test/validate.test.ts`, `packages/engine/test/rows.test.ts` · `bun test packages/engine` | none (limit-refused is `rows.test.ts` "limit=%s is 400 bad_limit"; the charset case is `write-guard.test.ts` "application/json; charset=utf-8 is accepted") |
| Gate | `bun run gate` | e2e · `e2e/step-0b.spec.ts` · `bun run e2e` | refused-edit, day-line-move, cross-site-refused, rebound-host-refused (the other six flows are gone) |

E2E flows (Planning opens filtered on `status = bevestigd`; each flow names its seeded row by `omschrijving` from `seed.ts`, uses its own row, and removes the Status chip first when it changes a status, so order does not matter): **status-persists** (removed) — remove the Status chip, change one `optie` row to `bevestigd`, reload, the cell reads Bevestigd. **refused-edit** — on a `bevestigd` row set `eind_at` before `start_at`; the cell shows `Einde ligt voor de start.`; `GET /api/rows/activiteit` shows the old value. **query-edit-lands** (removed) — open "Dagplanning", change a row's status; `GET /api/rows/activiteit?filter={"id":…}` shows it. **revisions-recorded** (removed) — make its own status edit on a fresh row, then `GET /api/revisions/activiteit/<id>` holds exactly one row, field `status`, with the old and new values. **day-line-move** — on the `bevestigd` repetitie starting `2026-10-12T14:00`, set `start_at` to `2026-10-13T03:30`; its `plandag` reads `2026-10-12` and it stays under that header; then to `2026-10-13T06:00` and it moves under the 2026-10-13 header; `GET /api/revisions/activiteit/<id>` shows `start_at` and `plandag` revised. **limit-refused** (removed) — `page.request.get('/api/rows/activiteit?limit=5001')` is 400 `bad_limit`. **cross-site-refused** — a real browser case: a second static page served on `http://localhost:3999` (a tiny server started by the test) runs `fetch('http://127.0.0.1:5174/api/rows/activiteit/<id>', {method:'PATCH', headers:{'Content-Type':'application/json'}, body})` in Chromium; the browser sets `Sec-Fetch-Site` itself; the test asserts the response the page saw is 403 `forbidden_site` (or, if Vite's CORS blocks reading it, that the engine logged no write and the row is unchanged via `GET /api/rows/activiteit`) — plus `page.request.patch` with `Sec-Fetch-Site: same-site` as a direct check of the same path.

## Review Focus

1. A cross-site `text/plain` POST, and a same-site JSON PATCH through the Vite proxy (attacks 1–2) → `write-guard.test.ts` and the cross-site-refused flow.
2. A refusal after the writer read state must leave the table and `revision` unchanged (attack 6) → `writes.test.ts` refusal tests assert both.
3. An edit through `dagplanning`, and its undo, must land on the row named by `row[key]`, not `row.id` → routing is the grid's, so `apps/grid/src/grid/store.test.ts` "a query-row edit's batch comes from the PATCH reply…" asserts the PATCH path uses `row[key]` with a fixture where they differ.
4. A `start_at` crossing 05:00 must move `plandag` and the Revision must record both fields → `writer.test.ts` and the day-line-move flow.
5. A typo in a declaration (`date: 'plandg'`) must stop startup, not silently drop the window → `validate.test.ts`.

---

## Time log

| Task | Start | End | Estimate it counts against |
|---|---|---|---|
| 1 | 19:22 | 19:27 (incl. fix) | engine (validation, limit) |
| 2 | 19:28 | 19:38 (incl. fix; logged 19:41, its last commit is 19:37:22) | engine writes 3–5 d share |
| 3 | 19:39 (logged 19:43, its first commit is 19:39:17) | 19:47 (incl. fix) | theatre writers 1–2 d share |
| 4 | 19:48 | 19:59 | grid `writes:` 2–3 d share |
| 5 | 20:01 | 20:27 (incl. fix) | harness + gate |

Final review and security audit 20:28–20:35; final fix wave 20:56–21:22. Agent wall-clock, not human days.

---

### Task 1: Declaration validation, real-date window, /rows limit and exact count

**Files:**
- Create: `packages/engine/src/validate.ts`, `packages/engine/test/validate.test.ts`
- Modify: `packages/engine/src/migrate.ts` (call `validateDomain` first), `packages/engine/src/params.ts`, `packages/engine/src/rows.ts`, `packages/engine/src/declare.ts` (`ColumnDecl.readonly?: boolean`, `ColumnDecl.writes?: { dataset: string; field: string; key: string }`, `Domain.writers?: Record<string, Writer>` typed in Task 2 — declare `writers?: Record<string, unknown>` here and narrow in Task 2), `packages/engine/test/rows.test.ts`, the 0a `$contains` timing test
- Modify: `packages/engine/src/index.ts` (export `validateDomain`, `DomainError`)

**Interfaces:**
- Produces: `validateDomain(domain: Domain): void` throws `DomainError` (`.declaration`, `.name`) — checks R1 (writes targets: dataset declared, `field` a declared non-readonly column of it, `key` a column of the query; "has a writer" is checked in Task 2 once writers exist). `migrate()` calls it before any DDL.
- Produces: `RowsParams.limit: number` (default 5000); `readRows` returns `total` from `SELECT count(*)` over the same WHERE and applies `LIMIT`.

- [ ] **Step 1: Tests** — `validate.test.ts`: `title naming an undeclared column throws naming it`; `date naming an undeclared column throws`; `index column undeclared throws`; `relation to an undeclared dataset throws`; `writes to an undeclared dataset / field, to a readonly field, or key not a query column, throws`; `the theatre domain validates`. `rows.test.ts`: `from=2026-13-45 and from=2026-02-30 are 400 bad_window`; `limit=5001, limit=0, limit=abc are 400 bad_limit`; `limit=2 returns 2 rows and total counts all matching rows`; `default limit is 5000` (seed 5001 rows in the fixture, expect 5000 rows and total 5001). Re-measure the `$contains` timing test with the count in place and set its bound to the larger of 1000 ms and 2× the measured time, stating both in the report. Run → FAIL.
- [ ] **Step 2: Implement** — real date: parse `YYYY-MM-DD` and check `Date.UTC` round-trips (no `Date` local time). `limit`: integer 1–5000.
- [ ] **Step 3: Run** — `bun test packages` → pass; `bun run check` → 0.
- [ ] **Step 4: Commit** — `feat(engine): validate declarations at startup; real-date window; /rows limit with an exact count`.

### Task 2: Writers, write routes, write guard, Revision

**Files:**
- Create: `packages/engine/src/writes.ts`, `packages/engine/src/write-guard.ts`, `packages/engine/src/dev-actor.ts`, `packages/engine/src/revision.ts` (the generic table, declared like `saved-view.ts`), `packages/engine/test/writes.test.ts`, `packages/engine/test/write-guard.test.ts`
- Modify: `packages/engine/src/declare.ts` (`Writer`, `WriteContext`, `Actor`, `Domain.writers`), `packages/engine/src/validate.ts` (writes targets need a writer with `update`), `packages/engine/src/migrate.ts` (migrate `revision` after `saved_view`), `packages/engine/src/app.ts` (routes; `/schema` gains `writable: boolean` per source — a dataset with an `update` writer, or a query with a mapped column), `packages/engine/src/rows.ts` (export `withLookups`), `packages/engine/src/params.ts` (`ApiError` statuses 403, 405, 413, 415, 422), `packages/engine/src/index.ts` (export `refuse`, `WriteRefused`, `Writer`, `WriteContext`, `Actor`), `packages/engine/test/fixture.ts` (a writer on one fixture dataset; one without)

**Interfaces:**
- Produces:
  - `interface Actor { id: number; role: string }`; `DEV_ACTOR: Actor` in `dev-actor.ts`, first line `// TEMPORARY until auth (step 0): every write runs as this admin.`
  - `interface WriteContext { actor: Actor; current: Record<string, unknown> | null; find(dataset: string, id: number): Record<string, unknown> | null }` (`find` ignores soft-deleted rows)
  - `interface Writer { create?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown>; update?(values: Record<string, unknown>, ctx: WriteContext): Record<string, unknown>; delete?(ctx: WriteContext): void }`
  - `refuse(message: string): never` throws `WriteRefused`
  - `createEngine(sqlite, domain, { port })` (unchanged)
  - routes: `POST /api/rows/:dataset` → 201 + row; `PATCH /api/rows/:dataset/:id` → 200 + row; `DELETE /api/rows/:dataset/:id` → 200 `{ id }`; `GET /api/revisions/:dataset/:id` → `{ revisions: { field, old, new, actor_id, at, batch_id }[] }` oldest first; an undeclared dataset is 404 `unknown_source`, an id with no revisions is 200 with `[]`
  - errors: 400 `bad_body` / `bad_value`, 403 `forbidden_site`, 404 `unknown_source` / `unknown_record`, 405 `read_only`, 413 `body_too_large`, 415 `bad_content_type`, 422 `refused`
- `runWrite` order inside one `sqlite.transaction`: read current (404 if missing/soft-deleted) → `cutBody` → `checkValues` → writer (may `refuse`) → `checkValues` on what the writer returned (a writer may set readonly columns, never undeclared ones) → `checkRelations` (every relation column's value names a live row of its target, else 400 `bad_relation`) → on create, every non-nullable declared column without a default must be present (400 `bad_value` naming it) → diff the declared columns plus `deleted_at`, stored vs current (`id`, `created_at`, `updated_at` are never revised; a create revises every declared column it stores with a non-null value) → no changed field: write nothing, bump nothing, answer the current row → else INSERT/UPDATE (`updated_at` set; delete sets `deleted_at`) and one Revision row per changed field, shared `batch_id` (`crypto.randomUUID()`), `actor_id` from the actor, `old`/`new` as JSON text → return the row via the same row shape as `/rows` (reuse `withLookups`).

- [ ] **Step 1: Denial tests first** (`write-guard.test.ts`, `writes.test.ts`, each asserting status, code, and the target table + `revision` row counts and contents unchanged): `text/plain POST is 415`; `application/json; charset=utf-8 is accepted`; `Sec-Fetch-Site: cross-site and same-site are 403 forbidden_site on POST, PATCH and DELETE`; `Sec-Fetch-Site: same-origin and absent are accepted`; `a body-less DELETE needs no content type`; `body over 64 kB is 413`; `body not an object is 400 bad_body`; `id, deleted_at, custom, a readonly column and an undeclared key are dropped, not written`; `string into an integer column, object into a text column, null into a non-nullable column are 400 bad_value naming the column`; `PATCH a dataset without a writer, revision, saved_view, _migrations and a query is 404/405`; `PATCH an unknown or soft-deleted id is 404 unknown_record`; `a writer that refuses after find() leaves table and revision unchanged and answers 422 with its message`; `a create missing a non-nullable column is 400 bad_value naming it, not 500`; `on a fixture dataset whose writer does not check relations, a create and an update with a relation to a missing id and to a soft-deleted id are 400 bad_relation, never 500, and change nothing`; `the served connection reports PRAGMA foreign_keys = 1`; `a request with Host evil.example is still 403 forbidden_host on every write route`. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — `create returns 201 with the stored row and writes one revision per stored field with old null`; `update writes one revision per changed field only, sharing a batch_id, with actor_id 0`; `an update that changes nothing writes no revision`; `a writer-derived readonly column is stored and revised`; `delete is soft: the row leaves /rows, deleted_at is revised`; `GET /api/revisions returns them oldest first; unknown dataset 404`; `/schema marks a dataset with an update writer and a query with a mapped column writable, others not`; `validateDomain refuses a writes target whose dataset has no update writer`.
- [ ] **Step 3: Implement** per the Interfaces.
- [ ] **Step 4: Run** — `bun test packages/engine` pass; `bun run check` 0; start `serve.ts` on the theatre domain (no writer yet → 405) and paste a curl of a 415, a 403 (`-H 'Sec-Fetch-Site: cross-site'`) and a 405.
- [ ] **Step 5: Commit** — `feat(engine): writers as the only path in, with Revision rows and a write guard`.

### Task 3: Theatre — the Activiteit writer and the dagplanning query

**Files:**
- Create: `packages/theatre/src/writers.ts`, `packages/theatre/src/queries/dagplanning.sql`, `packages/theatre/test/writer.test.ts`
- Modify: `packages/theatre/src/datasets.ts` (`plandag` readonly), `packages/theatre/src/queries.ts` (`dagplanning`), `packages/theatre/src/index.ts` (`writers: { activiteit }`), `packages/theatre/src/seed.ts` (a SavedView "Dagplanning" on `dagplanning`, group `plandag`, sort `start_at`)

**Interfaces:**
- Consumes: Task 2's `Writer`, `refuse`, `WriteContext`; `plandag(startAt, 5)`.
- Produces: `activiteitWriter: Writer`; `dagplanning` query: `SELECT a.id AS id, a.id AS activiteit_id, a.productie_id, p.titel AS productie, a.omschrijving, a.soort, a.start_at, a.plandag, a.status FROM activiteit a JOIN productie p ON p.id = a.productie_id WHERE a.deleted_at IS NULL`, title `omschrijving`, date `plandag`, `status` and `start_at` declared `writes: { dataset: 'activiteit', field: <same>, key: 'activiteit_id' }`.

- [ ] **Step 1: Refusal tests first** (`writer.test.ts`, through the engine routes on a fresh theatre db, each asserting 422, the Dutch message, and activiteit + revision unchanged): `eind_at before start_at (on update of either side, against the merged row)`; `unknown productie_id`; `soft-deleted productie_id`; `status not in options`; `soort not in options`. Messages: `"Einde ligt voor de start."`, `"Productie bestaat niet."`, `"Ongeldige status."`, `"Ongeldige soort."`. Run → FAIL.
- [ ] **Step 2: Behaviour tests** — `create stores plandag from start_at`; `update of start_at from 2026-10-14T10:00 to 2026-10-15T03:30 stores plandag 2026-10-14 and revises start_at and plandag`; `update to 2026-10-15T06:00 stores plandag 2026-10-15`; `a sent plandag is dropped (readonly)`; `delete is soft`; `dagplanning serves writes on status and start_at in /schema`; `the theatre domain passes validateDomain with dagplanning's writes`.
- [ ] **Step 3: Implement**, **Step 4: Run** `bun test packages` + `bun run check`, **Step 5: Commit** — `feat(theatre): the Activiteit writer and the dagplanning query`.

### Task 4: Grid writes, query routing, relation chip options, ledger

**Files:**
- Modify: `apps/grid/src/engine.ts` (schema: `writable` from `/schema`; `Field.readonly` = column readonly, or a query column without `writes`; `title_readonly = !writable || titleColumn.readonly || (query && !titleColumn.writes)`), `apps/grid/src/types.ts` (`Field.readonly?: boolean`, `Field.writes?`), `apps/grid/src/api.ts` (`create`/`update` map the title field to the title column and the reply through `toRow`; a query model's mapped field is sent to its target with `row[key]`, then the query row is re-read), `apps/grid/src/grid/store.ts` + `grid/hooks.ts` (`StoreApi.update(model, id, data, row)` and `create(model, data)`: the unused `table` argument is dropped and the row takes its place — pays ledger row 45), `apps/grid/src/grid/columns.ts` (`editable` respects `field.readonly`), `apps/grid/src/grid/filter.ts` + `apps/grid/src/ui/App.tsx` (relation options from the target's records), `ui/App.tsx` also keeps "+ New" blocked on a query source, tests in `engine.test.ts`, `api.test.ts`, `grid/store.test.ts`, `ui/App.test.tsx`
- Modify: `specs/step-0a/wp-assumptions.md` — rows 9 (its writes half), 41, 44, 45, 46, 47, N1 and any other row the writes reach: move to "done in 0b: N lines" or state why it stays deferred; append a "0b" totals block (rows moved, production lines, test lines) without rewriting 0a's totals.

**Interfaces:**
- Consumes: Task 2/3 routes and `/schema` (`writable`, `columns[col].readonly`, `columns[col].writes`).
- Produces: `update(model, id, data, row)`. For a query model whose field is mapped, it PATCHes `/rows/<writes.dataset>/<row.fields[writes.key]>` with `{ [writes.field]: value }`, then re-reads the query row (`/rows/<query>?filter={"id":id}`): found → that row; not found (the edit moved it out of the query) or the re-read fails → the sent row with the field patched, because the write landed. Undo entries stay keyed on the grid row's id; an undo goes through `commit()`, which looks the row up at undo time, so `update` routes the undo by that row's `row[key]` to the same target record (R11's "undo refers to the target record"). Mapped writes assume the query's `id` is stable across the write (true for `dagplanning`, `id = a.id`).

- [ ] **Step 1: Tests** — `engine.test.ts`: `a readonly column and an unmapped query column are not editable`; `the title field maps to the title column on write`. `api.test.ts`: `update on dagplanning status sends PATCH /rows/activiteit/<row.activiteit_id> (fixture where id ≠ activiteit_id) and re-reads the query row`; `a re-read that finds no row, or fails, returns the patched row`; `a 422 reaches the store as {code:'refused', message}`. `store.test.ts`: `a refused update reverts the cell and keeps the writer's message on it`; `undo of a dagplanning edit PATCHes /rows/activiteit/<row[key]> with the old value (id ≠ key)`. `App.test.tsx`: `relation chip options list the target's rows even when the loaded rows hold one productie`; `+ New is blocked on a query view`. Run → FAIL.
- [ ] **Step 2: Implement.** The cell error shows `message` verbatim for `refused` (check `errorText` passes it through; adjust only if it replaces it).
- [ ] **Step 3: Ledger** — re-derive line counts with `git diff --numstat <task-4 base> HEAD -- apps/grid`.
- [ ] **Step 4: Run** `bun run --filter @worktable/grid test` + `bun run check`; start engine + Vite and curl a PATCH through the proxy without `Sec-Fetch-Site` (200) and with `Sec-Fetch-Site: same-site` (403).
- [ ] **Step 5: Commit** — `feat(grid): cell edits through the writers; query columns to their target; relation chips from the target`.

### Task 5: The browser gate

**Files:**
- Create: `e2e/step-0b.spec.ts`
- Modify: `e2e/step-0a.spec.ts` only if a 0a assertion now conflicts (state which)

- [ ] **Step 1: Write the seven flows** named in the Test map, each asserting rendered text and the API's answer; each flow uses its own activiteit row so order does not matter; no sleeps.
- [ ] **Step 2: Run** — `rm -rf e2e/.tmp && bun run e2e` → 10 passed (0a's 3 + 7); `bun run gate` → 0.
- [ ] **Step 3: Commit** — `test(e2e): step 0b gate in a real browser`.

Then stop: the Close (whole-branch review + security-sentinel, one fix wave) and the report.
