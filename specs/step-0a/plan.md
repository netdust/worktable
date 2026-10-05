# Step 0a — read-only engine slice: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declared datasets and queries migrate to SQLite and serve rows over `GET /api/rows/:source`; the ntdst-baseline grid, ported with every WordPress assumption removed, reads them in a real browser.

**Architecture:** `packages/engine` turns `defineDataset` / `defineQuery` values into generated DDL (ledgered by hash) and runtime Drizzle tables, compiles Folio's filter AST against them, and serves Hono routes bound to 127.0.0.1. `packages/theatre` declares Productie, Activiteit, `productie_dag` and seeds. `apps/grid` is the views app copied whole, its `api.ts` and boot rewritten against the engine through an adapter.
First working version: Task 2 — `bun packages/engine/src/serve.ts --domain @worktable/theatre --db /tmp/t.db --fresh` and `curl 127.0.0.1:4310/api/rows/activiteit` returns seeded rows.

**Tech Stack:** Bun 1.3, Hono 4, drizzle-orm (bun-sqlite), Zod, React 19, Vite, Vitest, Playwright, Biome.

**Spec:** `specs/step-0a/spec.md` (parent: `docs/SPEC.md`).

**Simplest design:** The simplest thing that meets the ask is the grid's own client-side filtering against an engine that returns every row of a source. It is not used because R5 and R9 require filter, sort, group and window as route parameters and the layout sent to the server; the grid today applies all three in the browser (`grid/filter.ts`, `grid/useTable.ts`, `grid/group.ts`) and keeps doing so on the rows it receives, so server and client agree and the client still draws the group headers. Saved views reuse the grid's own `SavedView.arrangement` seam (`ui/views.ts`) instead of a new one. Everything else is the simplest available: one generated-DDL migrator, no drizzle-kit, one adapter file between engine and grid, unreachable grid code left as copied.

## Global Constraints

- `packages/engine` never imports `@worktable/theatre` or `@worktable/fiche`; `bun run check` enforces it. The engine loads the domain by a name given at runtime.
- Engine names English and generic; theatre names Dutch as in `docs/SPEC.md`.
- Queries are SQL views; they store nothing.
- Custom fields live in each dataset's `custom` JSON column. Never a table for them.
- Server binds `127.0.0.1` only.
- No writes, auth, lifecycle, record tokens, import, other datasets, other generic tables, WordPress code.
- Copy from Folio only the filter AST compiler (`packages/shared/src/filter-compile.ts`, `apps/server/src/lib/filter-to-drizzle.ts` @ `15bd9886`); from ntdst-baseline only `services/views/app` @ `7efef97`, never PHP.
- Fixtures are invented. No client data.
- `docs/SPEC.md` is never committed by this plan; its pending edit waits for Stefan.
- Each task logs its start and end time in the Time log below.

## Threat model

**Assets.** The engine database file (all planning rows); the host process (a 500 or a hang is a denial of service for the planner).

**Attacks.**
1. **SQL injection through a filter key** — a caller sends `filter={"titel) OR 1=1 --":1}` or `{"custom.x') --":1}` → **keys resolve only against the source's declared columns; `custom.<key>` requires `^[A-Za-z0-9_]+$` and passes the JSON path as a bound parameter; anything else is 400.**
2. **SQL injection through a value** — `filter={"status":"x' OR '1'='1"}` → **every value is a Drizzle bound parameter, never interpolated.**
3. **Injection through `sort` / `group`** — `sort=titel;DROP TABLE activiteit` → **each sort and group key must be a declared column of the source (custom keys not sortable in 0a); else 400.**
4. **Source selection beyond declarations** — `/rows/_migrations`, `/rows/sqlite_master`, `/rows/saved_view` → **`:source` resolves only against declared dataset and query names; anything else is 404.**
5. **Resource exhaustion and malformed filters** — 500 keys, `$contains` or `$in` with 10k values, an unknown operator, a value of the wrong shape (`{"status":[1,2]}`, `{"status":{"$eq":{"a":1}}}`), `$contains` on a declared column, `custom.<key>` on a query → **Folio's `MAX_FILTER_CLAUSES = 50` and `CONTAINS_MAX_VALUES = 100` kept, plus `IN_MAX_VALUES = 100` for `$in` / `$nin`; values must be scalars (arrays only for `$in` / `$nin` / `$contains`); `$contains` only on `custom.<key>`, one subquery per `$contains` key; `custom.<key>` only on a dataset; malformed JSON and every `FilterCompileError` become 400 `bad_filter`.**
6. **Window injection** — `from=2026-01-01' OR 1=1` → **`from` / `to` must match `^\d{4}-\d{2}-\d{2}$`, bound as parameters.**
7. **DNS rebinding through the Host header** — a web page rebinds its own name to 127.0.0.1 and reads `/api/rows/*` from the browser → **Host allowlist middleware in `app.ts`, 403 otherwise; Vite pinned to 127.0.0.1.**

**Mitigations — where they live.** `filterCompile()` in `packages/engine/src/filter-compile.ts` and `resolveKey()` / `compileFilter()` in `packages/engine/src/filter.ts`, which converts every `FilterCompileError` into `ApiError(400, 'bad_filter')` (1, 2, 5); `parseRowsParams()` in `packages/engine/src/params.ts` (3, 6); `sourceOf()` in `packages/engine/src/registry.ts` (4); the Host allowlist middleware in `createEngine()` in `packages/engine/src/app.ts` and `server.host` in `apps/grid/vite.config.ts` (7).

**Deferrals.** No authentication or actor scoping: 0a is read-only and bound to 127.0.0.1, so only local processes and pages served from 127.0.0.1/localhost:<port> may read every row; `vite --host` or a proxy on another interface breaks this deferral — acceptable for a dev slice with invented fixtures; auth is step 0's magic-link and actor work. No rate limiting, same reason. No row cap or pagination: fixtures are ~25 rows; a cap or `limit` lands in step 0 before the Laika import. A query's own SQL is trusted: it is code in a domain package, not input. CLI arguments and environment (`--domain`, `--db`, `ENGINE_URL`) are operator input, trusted like a domain's own SQL.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Grid port (copy, WP removal, adapter, layout → server) | the app rendered against `/api` | unit · `apps/grid/src/**/*.test.ts(x)` (ported suite) + `apps/grid/src/engine.test.ts` · `bun run --filter @worktable/grid test` | planning-grouped-sorted, planning-status-filter, query-view-loads |
| Rows REST + filter compiler + params | `GET /api/rows/:source`, `GET /api/schema` | integration · `packages/engine/test/rows.test.ts`, `packages/engine/test/filter.test.ts` · `bun test packages/engine` — denials first: attacks 1–6 each assert 400/404 and that the database is unchanged | planning-status-filter |
| Migrator (R3's refusal) | `migrate(sqlite, domain)` | integration · `packages/engine/test/migrate.test.ts` · `bun test packages/engine` | none — proven by flow |
| plandag | `plandag(startAt, dayLineHour)` | unit · `packages/theatre/test/plandag.test.ts` · `bun test packages/theatre` | planning-grouped-sorted |
| Theatre declarations, view, seeds | `@worktable/theatre` default export | none — configuration over the engine; proven by flow | all three |
| Gate | `bun run gate` | e2e · `e2e/step-0a.spec.ts` · `bun run e2e` | all three |

E2E flows: **planning-grouped-sorted** — open Planning; day headers appear in plandag order; inside a day rows run by `start_at`. **planning-status-filter** — the Planning view opens filtered on `status = bevestigd`; removing that chip and adding Status: optie shows only optie rows and the `/api/rows/activiteit` request carries `filter` with `optie`. **query-view-loads** — open "Per productie per dag"; rows load from `/api/rows/productie_dag`.

## Review Focus

1. Filter keys and values from the query string reaching SQL (attacks 1–3) → Test map row "Rows REST", the six denial tests.
2. A night activity (start 00:30) grouped under the previous day's header, not the calendar date → plandag tests (`01:00 → previous day`) and the seed has one such row that the e2e flow sees under the right header.
3. A window asked of a source with no date column → 400 `no_date_column`, Rows REST test.
4. A filter that matches nothing → 200 with `{ rows: [], total: 0 }`, Rows REST test (the grid's empty state for it is copied code, not proven in 0a).
5. A declared dataset whose generated DDL changed against an existing database → startup refuses naming the dataset, never silently keeps the old table → Migrator test.

---

## Time log

| Task | Start | End | Estimate it counts against |
|---|---|---|---|
| 1 | 17:46 | 17:48 | engine 3–5 d |
| 2 | 17:49 | 17:57 | engine 3–5 d |
| 3 | 17:59 | 18:17 (incl. 1-min review fix) | grid 2–3 d |
| 4 | 18:20 | 18:38 | harness + gate 1 d |

Reviews and fixes: per-task reviews ran between tasks; final review and security audit 18:40–18:45; final fix wave 18:46–19:00. Times are agent wall-clock, not human days.

---

### Task 1: Declarations, migrator, plandag, theatre package

**Files:**
- Create: `packages/engine/src/filter-compile.ts` (Folio's `filterCompile`, `FilterAST`, `FilterInput`, limits — copied, `COLUMN_KEYS` removed, `IN_MAX_VALUES = 100` added, then `biome check --write` on it to the repo's style; Task 2 consumes it), `packages/engine/src/declare.ts`, `packages/engine/src/ddl.ts`, `packages/engine/src/migrate.ts`, `packages/engine/src/tables.ts`, `packages/engine/src/saved-view.ts`, `packages/engine/test/migrate.test.ts`
- Create: `packages/theatre/src/plandag.ts`, `packages/theatre/src/datasets.ts`, `packages/theatre/src/queries/productie_dag.sql`, `packages/theatre/src/queries.ts`, `packages/theatre/src/seed.ts`, `packages/theatre/test/plandag.test.ts`
- Modify: `packages/engine/src/index.ts`, `packages/theatre/src/index.ts`, `packages/engine/package.json`, `packages/theatre/package.json` (deps: `drizzle-orm`, `zod`; theatre depends on `@worktable/engine`), root `package.json` (`test` script: `bun test packages`)

**Interfaces:**
- Produces (`@worktable/engine`):
  - `type ColumnType = 'text' | 'integer' | 'real' | 'boolean' | 'date' | 'datetime' | 'json'`
  - `interface ColumnDecl { type: ColumnType; label: string; nullable?: boolean; default?: string | number | boolean | null; options?: Record<string, string>; relation?: string /* dataset name */ }`
  - `interface DatasetDecl { kind: 'dataset'; name: string; label: string; title: string; date?: string; columns: Record<string, ColumnDecl>; indexes?: string[][]; custom: boolean }`
  - `interface QueryDecl { kind: 'query'; name: string; label: string; title: string; date?: string; sql: string; columns: Record<string, ColumnDecl> }` — `columns` must include `id`
  - Ruling: R1's `relations` are declared per column as `ColumnDecl.relation` — one place for a column and its target; a many-to-many is not needed before step 2.
  - `defineDataset(d: Omit<DatasetDecl, 'kind'>): DatasetDecl`, `defineQuery(q: Omit<QueryDecl, 'kind'>): QueryDecl`
  - `interface SavedViewSeed { name: string; source_type: 'dataset' | 'query'; source: string; skin: 'table'; filters: FilterInput; sort: string[]; group_by: string | null; visible_fields: string[] }`
  - `interface Domain { datasets: DatasetDecl[]; queries: QueryDecl[]; seed(insert: (dataset: string, rows: Record<string, unknown>[]) => void): void; views: SavedViewSeed[] }`
  - `migrate(sqlite: Database, domain: Domain): void` — throws `MigrationError` (`.source` = dataset name) on a changed dataset hash; this refusal is R3's placeholder, and the end report names ALTER/rebuild as the step 1–2 item
  - `seedDomain(sqlite: Database, domain: Domain): void`
  - `tableOf(decl: DatasetDecl | QueryDecl): SQLiteTable` (runtime Drizzle table; a view is read through `sqliteView`-free `sqliteTable` of its declared columns)
- Produces (`@worktable/theatre`): `plandag(startAt: string, dayLineHour: number): string`; default export `Domain`.

- [ ] **Step 1: Write the tests**

`plandag.test.ts` — `plandag('2026-10-12T20:30', 5) === '2026-10-12'`; `('2026-10-13T01:00', 5) === '2026-10-12'`; `('2026-10-13T05:00', 5) === '2026-10-13'`; `('2026-10-13T04:59', 5) === '2026-10-12'`; `('2027-01-01T02:00', 5) === '2026-12-31'`; `('2026-03-29T03:00', 5) === '2026-03-28'` (DST night is wall-clock, not UTC). Input is local wall-clock `YYYY-MM-DDTHH:mm`; arithmetic on the string date, no `Date` time zone.

`migrate.test.ts` (on `new Database(':memory:')` with a two-dataset, one-query test domain declared in the test, not theatre):
- `creates each dataset table with id, custom, created_at, updated_at, deleted_at and its declared columns` — `PRAGMA table_info`
- `creates declared indexes and foreign keys` — `PRAGMA index_list`, `PRAGMA foreign_key_list`
- `creates the query as a view` — `sqlite_master` type `view`
- `records each source and its hash in _migrations`
- `a second run with the same declarations changes nothing`
- `a changed dataset declaration throws MigrationError naming it and leaves the table as it was`
- `a changed query SQL recreates the view`
- `creates saved_view`
- `seedDomain inserts the domain's rows and its saved views` (in `migrate.test.ts`)

- [ ] **Step 2: Run, expect FAIL** — `bun test packages/theatre packages/engine` → module not found.

- [ ] **Step 3: Implement**

`ddl.ts`: `datasetDdl(d: DatasetDecl): string[]` and `viewDdl(q: QueryDecl): string[]` — pure, deterministic text (the hash input). Column types: text/date/datetime/json → `TEXT`, integer/boolean → `INTEGER`, real → `REAL`; `relation` → `REFERENCES <dataset>(id)`; `custom` → `custom TEXT NOT NULL DEFAULT '{}'`. Identifiers are declaration names, validated `^[a-z][a-z0-9_]*$` at `define*` time (throw on others).
`migrate.ts`: one transaction; `_migrations(source TEXT PRIMARY KEY, hash TEXT, applied_at TEXT)`; SHA-256 of the joined DDL via `Bun.CryptoHasher`; datasets before queries; `saved_view` is an engine-owned dataset declared in `saved-view.ts` (spec's columns) migrated the same way; `migrate` only creates; seeding — domain rows and SavedView rows alike — is `seedDomain(sqlite, domain)`, run by `serve.ts --fresh` and by the tests, in one place.
`theatre/datasets.ts`: Productie (title `titel`; status options ontwikkeling · actief · archief; `organisatie_id` plain integer) and Activiteit (title `omschrijving`, date `plandag`; `productie_id` relation `productie`; soort, status, bron options from the spec; `speelreeks_id`, `locatie_id` plain integers; index `[['plandag']]`), both `custom: true`, labels Dutch.
`queries.ts` reads the file with `readFileSync(new URL('./queries/productie_dag.sql', import.meta.url), 'utf8')`. `productie_dag.sql`: `SELECT MIN(a.id) AS id, a.productie_id, p.titel AS productie, a.plandag, COUNT(*) AS activiteiten, SUM(a.soort = 'voorstelling') AS voorstellingen, SUM(a.soort = 'repetitie') AS repetities, SUM(a.soort = 'opbouw') AS opbouw, SUM(a.soort = 'afbouw') AS afbouw, SUM(a.soort = 'reis') AS reis, SUM(a.soort = 'overnachting') AS overnachting, SUM(a.soort = 'maaltijd') AS maaltijd, SUM(a.soort = 'vergadering') AS vergadering, SUM(a.soort = 'andere') AS andere FROM activiteit a JOIN productie p ON p.id = a.productie_id WHERE a.deleted_at IS NULL GROUP BY a.productie_id, a.plandag`; declared with title `productie`, date `plandag`, `productie_id` relation `productie`.
`seed.ts`: 3 invented producties, ~25 activiteiten over two weeks from 2026-10-12, every status present, `start_at 2026-10-14T00:30` with status `bevestigd` (the e2e flow reads it under the 2026-10-13 header) and one at 23:00; `plandag` from `plandag(start_at, 5)`. Views: "Planning" (activiteit, group `plandag`, sort `['start_at']`, filters `{ status: 'bevestigd' }`, visible fields `productie_id, soort, start_at, eind_at, status, plaats`) and "Per productie per dag" (query `productie_dag`, sort `['plandag']`).

- [ ] **Step 4: Run, expect PASS** — `bun test packages/theatre packages/engine` → all pass; `bun run check` → exit 0.
- [ ] **Step 5: Commit** — `feat(engine): declarations and migrations from them; theatre productie, activiteit, productie_dag`.

### Task 2: Rows REST, filter compiler, serve

**Files:**
- Create: `packages/engine/src/filter.ts`, `packages/engine/src/params.ts`, `packages/engine/src/registry.ts`, `packages/engine/src/rows.ts`, `packages/engine/src/app.ts`, `packages/engine/src/serve.ts`, `packages/engine/test/filter.test.ts`, `packages/engine/test/rows.test.ts`
- Modify: `packages/engine/package.json` (`hono`)

**Interfaces:**
- Consumes: Task 1's `Domain`, `migrate`, `tableOf`.
- Produces:
  - `createEngine(sqlite: Database, domain: Domain): Hono` — routes under `/api`
  - `GET /api/schema` → `{ sources: Record<string, { kind: 'dataset' | 'query'; label: string; title: string; date: string | null; columns: Record<string, ColumnDecl> }>; views: SavedViewRow[] }` where `SavedViewRow = SavedViewSeed & { id: number }` (filters parsed from JSON)
  - `GET /api/rows/:source?filter=<json>&sort=a,-b&group=col&from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ rows: EngineRow[]; total: number }`, `EngineRow = { id: number; custom: Record<string, unknown> /* {} for a query */; lookups: Record<string, { id: number; title: string } | null>; [column: string]: unknown }`
  - errors → `{ code: string; message: string }` with 400 (`bad_filter`, `bad_sort`, `bad_group`, `bad_window`, `no_date_column`) or 404 (`unknown_source`)
  - CLI: `bun packages/engine/src/serve.ts --domain <module> --db <file> [--port 4310] [--fresh]` (`--fresh` deletes the file, migrates, seeds); `Bun.serve({ hostname: '127.0.0.1' })`

- [ ] **Step 1: Write the denial tests first** (`rows.test.ts`, engine from Task 1's test domain plus seeded rows, via `app.request`) — each asserts the status, the error `code`, and that `SELECT count(*)` of every table is unchanged:
  - `filter key outside the declared columns is 400 bad_filter` — `{"titel) OR 1=1 --":1}`
  - `custom key with a quote is 400 bad_filter` — `{"custom.x') --":1}`
  - `value with SQL is matched literally` — `{"status":"x' OR '1'='1"}` → 200, `total` 0
  - `sort on an undeclared key is 400 bad_sort` — `titel;DROP TABLE x`
  - `group on an undeclared key is 400 bad_group`
  - `unknown, internal and generic sources are 404 unknown_source` — `_migrations`, `sqlite_master`, `saved_view`
  - `51 filter keys is 400; $contains with 101 values is 400; $in with 101 values is 400; malformed JSON is 400`
  - `unknown operator $regex is 400 bad_filter`
  - `$contains on a declared column is 400 bad_filter`
  - `array value without $in, object value under $eq, and an object inside $in are 400 bad_filter`
  - `custom.key on a query is 400 bad_filter`
  - `window with a non-date is 400 bad_window`; `window on a source without date column is 400 no_date_column`
  Run → FAIL (no module).

- [ ] **Step 2: Write the behaviour tests** (`rows.test.ts`, `filter.test.ts`):
  - `rows of a dataset come back flat with custom parsed and lookups by relation title`
  - `filter $eq, $in, $ne, $gt, $exists on columns; custom.key compiles to json_extract` (Folio's test cases ported to a declared source)
  - `sort -start_at orders descending; group plandag orders by plandag before sort`
  - `from/to keeps rows whose date column is inside the inclusive window`
  - `a view is served through the same route with its declared relation lookups`
  - `a filter matching nothing is 200 with rows [] and total 0`
  - `rows with deleted_at set are not returned` (datasets only)
  - `schema lists every declared source and the saved views with parsed filters`

- [ ] **Step 3: Implement**
`registry.ts` `sourceOf(name): DatasetDecl | QueryDecl | null` over the domain's declarations only. `params.ts` `parseRowsParams(source, query): RowsParams | ApiError` with Zod for shape; parameters it does not know (the grid's `search`) are ignored, not refused. `filter.ts` `compileFilter(ast: FilterAST, source, table): SQL | undefined` — `resolveKey()` maps a declared column to `table[col]`, `custom.<key>` to ``sql`json_extract(${table.custom}, ${'$.' + key})` ``; `$contains` keeps Folio's two-arg `json_each` guard. `rows.ts` runs one select with where/order/window and one `count(*)`, then one `IN` query per relation for lookups. Hono `onError` maps thrown `ApiError` to its status; anything else 500 with `code: 'internal'` and no SQL in the message.

- [ ] **Step 4: Run, expect PASS** — `bun test packages/engine` → all pass; `bun run check` → 0. Then `bun packages/engine/src/serve.ts --domain @worktable/theatre --db /tmp/wt.db --fresh &` and `curl -s '127.0.0.1:4310/api/rows/activiteit?group=plandag&sort=start_at' | head -c 400` shows rows; `ss -ltn | grep 4310` shows `127.0.0.1:4310` only.
- [ ] **Step 5: Commit** — `feat(engine): GET /api/schema and /api/rows/:source with the filter AST, sort, group and window`.

### Task 3: Grid port and the WordPress-assumption ledger

**Files:**
- Create: `apps/grid/` ← `services/views/app` @ `7efef97` (`src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, deps from its `package.json`; not `dist/`, not `src/node_modules/`, not `package-lock.json`), commit as copied first
- Create: `apps/grid/src/engine.ts` (adapter), `apps/grid/src/engine.test.ts`, `specs/step-0a/wp-assumptions.md`
- Modify: `apps/grid/src/api.ts`, `main.tsx`, `types.ts`, `ui/App.tsx`, `vite.config.ts` (proxy `/api` → `ENGINE_URL ?? http://127.0.0.1:4310`), `index.html`, `apps/grid/package.json` (`dev`, `test`, `typecheck`); whatever the ledger finds
- Delete: `apps/grid/src/index.ts` (skeleton)
- Modify: `biome.json` (override for `apps/grid/**`)

**Interfaces:**
- Consumes: Task 2's `/api/schema` and `/api/rows/:source` shapes.
- Produces (`engine.ts`): `toSchema(s: EngineSchema): Schema` (sources → `models`, one `TableDef` per source a saved view uses, no starting `views`, `writable` all false); `toSavedViews(s: EngineSchema): SavedView[]` (each row → `{ ...tableDefOf(source), key: String(row.id), label: row.name, table: source, table_label: source label, type: 'grid', starting: false, id: row.id, arrangement, shared: true, owner: { id: 0, name: '' }, mine: false, editable: false }`, as `Json::saved` merges a saved view with its table; `tableDefOf` gives `key` = source name and `date_field` = the source's `date`, which is what makes the view dated; `arrangement` built from its filters (`{field, value}` chips from `$eq` scalars), sort (`-x` → `desc`), `group_by` and `visible_fields` (as `hidden` = the other columns)); `toRow(r: EngineRow, title: string): Row` (`title` from the title column, `fields` = the other columns, `lookups` as `{ id, title, status: '', fields: {} }`); `rowsQuery(view: View, layout: Layout, window: Partial<DateWindow>, titleColumn: string): Record<string, string>` (the caller in `api.ts` takes `titleColumn` from the memoised schema, as for `toRow`) (filter JSON from layout chips as `$eq`; sort with `title` mapped to the source's title column and `lookups.*` / `rollups.*` ids left out — the grid sorts those on the client; group; from/to).

- [ ] **Step 1: Copy and commit verbatim** — with it, a `biome.json` `overrides` entry for `apps/grid/**` that turns the formatter, the linter and the assist off (`organizeImports` fails 20 files otherwise — plan-review A1; the copied code fails 82 format and 89 lint checks under this repo's config, none WordPress — plan-review B1); the ledger lists it as "repo lint on the copied grid: not WordPress, deferred". `git commit -m "chore(grid): copy ntdst-baseline services/views/app @ 7efef97 verbatim"` so the rework is the next diff.
- [ ] **Step 2: Write the ledger** — `specs/step-0a/wp-assumptions.md`, one row per assumption: `file:line · what it assumes · reachable? · rework (done in 0a: lines changed / deferred: to step N)`. Sweep with `grep -rnE "nonce|apiFetch|wp\.|rest_route|wp-json|ntdstViews|Boot|table:|publish|draft|post|capability|title_readonly|status"` over `src/` including tests, then read `api.ts`, `types.ts`, `App.tsx`, `space.ts`, `useSavedViews.ts`, `views.ts`, `matrix/*`, `grid/store.ts`, `grid/newRow.ts`, `grid/columns.ts`, `export/*`, `i18n.ts`. Unreachable code is logged too, marked deferred with the step that reaches it.
- [ ] **Step 3: Write `engine.test.ts`** — `toSchema maps a dataset's columns to model fields by type (text→text, datetime→text (ISO text sorts correctly), json→json, integer→int, real→float, boolean→bool, date→date, options→select, relation→relation)`; `toRow takes title from the declared title column`; `toSavedViews builds the arrangement: Planning opens with the status chip bevestigd, sort start_at, group plandag`; `Planning's SavedView has key '<id>', label 'Planning', table 'activiteit', date_field 'plandag'`; `rowsQuery maps a title sort to the source's title column and drops lookups.* and rollups.* ids`; `rowsQuery sends chips as $eq filter JSON, sort with - for desc, group and the window`. Run `bun run --filter @worktable/grid test` → FAIL.
- [ ] **Step 4: Rework** — `api.ts`: `fetch('/api' + path)`, errors from the engine's `{code, message}`; `rows()` takes the layout and calls `rowsQuery`; no `window.wp`, `window.ntdstViews`, `rest_route`, `?table=`. `main.tsx`: mount on `#root`, App boots from `schema()` (Boot type and boot props removed; App shows its spinner until the schema answers). `savedViews()` resolves to `toSavedViews` of the memoised `/api/schema` promise (not its result: App calls both in one effect; `api.test.ts` resets it between tests); `prefs()` resolves to `{ order: {}, last: {} }`; `records(model, search)` calls `/api/rows/<model>` (the engine ignores `search`; the grid filters titles itself). `App.tsx`: move `useLayout` / `layout` above the rows effect and add `JSON.stringify` of the layout's filters, sort and group to its deps, so widths and hidden columns do not refetch (one refetch and a store rebuild per chip change, accepted). Save and "Save as new", "Duplicate" (`ViewList.tsx`), "+ New view" (`Rail.tsx` → `createView`) and the debounced `savePrefs` after a view switch (404 swallowed) stay as copied and fail into the copied error handling (no `/api/views` route) — reachable, logged in the ledger, deferred to the SavedView-writes step. Ported tests that encode WordPress (e.g. `api.test.ts`'s apiFetch mocks) are rewritten to the new seam, each listed in the ledger. Everything unreachable stays as copied.
- [ ] **Step 5: Run, expect PASS** — `bun run --filter @worktable/grid test` → all pass; `bun run check` → 0 (the skeleton's `apps/grid/tsconfig.json` is replaced by the copied one, which does not extend the base, so no rework comes from `noUncheckedIndexedAccess`; the grid keeps its own `typescript ~6.0.2` dev dependency for its `typecheck`).
- [ ] **Step 6: Commit** — `feat(grid): read the engine's REST; every WordPress assumption removed or ledgered`.

### Task 4: The browser gate

**Files:**
- Create: `playwright.config.ts`, `e2e/step-0a.spec.ts`
- Modify: root `package.json` (`@playwright/test`; `e2e`: `playwright test`; `gate`: `bun run check && bun test packages && bun run --filter @worktable/grid test && bun run e2e`)

**Interfaces:**
- Consumes: Task 2's CLI, Task 3's `vite` dev server.

- [ ] **Step 1: Write the three flows** in `e2e/step-0a.spec.ts` against `webServer`: engine `--fresh --db e2e/.tmp/e2e.db --port 4311`, Vite on 5174 with `ENGINE_URL=http://127.0.0.1:4311`, window navigated to `#from=2026-10-12` (the grid shows the Monday–Sunday week of `from`; `to` is ignored):
  - **planning-grouped-sorted** — group headers' days ascend; within each group `start_at` cells ascend; the 00:30 activity of 2026-10-14 sits under the 2026-10-13 header
  - **planning-status-filter** — every row's status reads `bevestigd`; remove the status chip, then "+ Filter" → Status → optie; `page.waitForRequest` on `/api/rows/activiteit` has a `filter` containing `optie`; every row reads `optie`
  - **query-view-loads** — open "Per productie per dag"; the response for `/api/rows/productie_dag` is 200 and the grid shows its rows
- [ ] **Step 2: Run** — `bunx playwright install chromium` once, then `bun run e2e` → 3 passed. Then `bun run gate` → exit 0.
- [ ] **Step 3: Commit** — `test(e2e): step 0a gate in a real browser`.

Then stop: the Close (`make review` equivalent, `/shakeout`) and the report to Stefan.
