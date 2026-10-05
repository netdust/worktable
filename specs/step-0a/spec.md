# Step 0a — read-only engine slice

The first slice of build step 0 in `docs/SPEC.md`: datasets and queries declared in code, tables and views migrated from those declarations, rows served over REST, and the ntdst-baseline grid ported to read them. Read-only. Its purpose is the number behind the grid-port estimate: the report at the end decides whether step 0's 9–13 days hold.

Branch: `feature/step-0a`. Port source: ntdst-baseline `feature/views-saved` @ `7efef97` (a superset of `d884568`, the copy Laika runs; the only branch with `?table=`).

## Requirements

### R1 Declarations
`defineDataset({ name, label, title, date?, columns, relations, indexes, custom })` and `defineQuery({ name, label, title, date?, sql, columns })`, exported by `packages/engine`. A query's view exposes an `id` column. `title` is the row's display column (skin need, option A).
Source: "Engine: defineDataset and defineQuery declarations" · title column: Stefan chose option A, 2026-10-05.

### R2 Migrations from declarations
At startup the engine generates SQL from the declarations and records each source's name and SQL hash in a `_migrations` ledger. A new dataset gets `CREATE TABLE` (real columns, foreign keys, declared indexes, a `custom` JSON column, `id`, `created_at`, `updated_at`, `deleted_at`). A dataset whose hash changed stops startup with a message naming it. A query's SQL becomes `CREATE VIEW`; on a changed hash the view is dropped and recreated. Drizzle is the runtime query builder over `sqliteTable` objects built from the same declarations; no drizzle-kit, no hand-made schema.
Source: "migrations for tables and views generated from them" · approach (a), approved 2026-10-05.

### R3 ALTER and table rebuild — planned, not built here
Changing a declared dataset (add, drop, retype a column) needs ALTER and SQLite's table rebuild. It is not in 0a: the refusal in R2 is its placeholder. It is a planned item for build steps 1–2, the first steps that change existing datasets (step 1 turns Activiteit's plain `speelreeks_id` into a foreign key, which SQLite can only add by rebuilding the table; step 2 gives Toewijzing `rol_id` and a nullable `persoon_id`), and gets its own plan before step 1.
Source: Stefan, 2026-10-05: "note ALTER and table rebuild as a planned step 1–2 item, not a footnote".

### R4 GET /schema
Every declared source with its kind (dataset · query), label, title column, date column and columns (type, label, options, relation target), plus the SavedView rows.
Source: "Hono routes GET /schema".

### R5 GET /rows/:source
One route for a dataset and a SQL view. Parameters: `filter` (Folio's filter input as JSON, compiled by `filterCompile` to the AST, then to SQL against declared columns; `custom.<key>` compiles to `json_extract` on the custom column), `sort` (`-start_at,titel`), `group` (orders by the group column first), `from` / `to` (the window on the source's date column). An unknown source is 404; an unknown key, operator or a window on a source without a date column is 400, never 500. Rows return flat — `{ id, ...columns, custom }` — with `lookups: { <relation column>: { id, title } }` resolved through the target dataset's title column.
Source: "GET /rows/:source (source is a dataset or a SQL view; params for filter AST, sort, group, window). Generalise the filter compiler from Folio's filter-to-drizzle.ts to any dataset with a custom column."

### R6 Theatre package
Productie and Activiteit with the spec's columns; a column pointing at a dataset 0a does not declare (`organisatie_id`, `speelreeks_id`, `locatie_id`) is a plain nullable integer, its relation added when that dataset is; one SQL view, `productie_dag` (Activiteit grouped per productie × plandag, counts per soort); invented fixtures. `plandag` comes from one pure function `plandag(startAt, dayLineHour)` in the theatre package, used by the seed now and by the Activiteit writer later. Seeds include two SavedView rows: Planning on `activiteit` (group `plandag`, sort `start_at`, filter on status) and one on `productie_dag`.
Source: "Theatre package: Activiteit and Productie only, plus one SQL view over them, with invented fixtures." · plandag: Stefan, 2026-10-05: "share one pure plandag function between seed and writer".

### R7 SavedView
The one generic table 0a creates, with the spec's columns (name, source_type, source, skin, filters, sort, group_by, visible_fields, scope, owner_id, share_token, format, public). Read only, through `/schema`.
Source: invented — approved 2026-10-05 (design section 2: the views the grid opens come from SavedView rows).

### R8 Engine entry
`bun packages/engine/src/serve.ts --domain @worktable/theatre --db <file>` loads the domain module by the configured name; the engine never imports a domain package. The server binds to 127.0.0.1 only.
Source: invented — approved 2026-10-05 (design section 2) · localhost: Stefan, 2026-10-05: "bind to localhost".

### R9 Grid port
Copy the TypeScript and React of the views app, tests included, into `apps/grid`. Remove every WordPress assumption (nonce, `wp.apiFetch`, `rest_route`, `?table=`, boot config, post-shaped rows). `api.ts` uses `fetch` against `/api`, proxied by Vite to the engine. An adapter maps flat engine rows to the grid's `Row` and sources plus SavedViews to its `Model` / `TableDef` / `View`. The layout's filters, sort and group go to the server. Writes, saved-view CRUD, prefs and the matrix stay as copied code, unreachable (nothing is writable); nothing new is built or stubbed for them.
Source: "Grid: copy the TypeScript and React from ntdst-baseline/services/views/app. Remove every WordPress assumption (nonce, wp.apiFetch, ?table=, boot config). Point it at the engine REST, read-only."

### R10 WordPress-assumption ledger
`specs/step-0a/wp-assumptions.md`: every WordPress assumption found in the copied code — reachable or not — with file:line, what it assumes, and its rework (done in 0a, or deferred with the step that pays it). Each task's start and end time logged in the plan, for the time-against-estimate report.
Source: "Every WordPress assumption found in the copied grid code, and how much of it needed rework" · Stefan, 2026-10-05: "log deferred WordPress assumptions in unreachable code too".

### R11 Gate
`bun run gate` = `bun run check`, the engine's `bun test`, the grid's Vitest, and Playwright. Playwright starts the engine on a freshly seeded database plus Vite, and proves in a real browser: Planning shows day headers in plandag order with rows by `start_at`; choosing a status chip leaves only that status and the request carries the filter; the `productie_dag` view loads through `/rows/productie_dag`. Then stop.
Source: "Gate: in a browser, the grid loads the seeded Planning table grouped by day, sorted by start and filtered by status, and a view on the SQL view loads through the same route. Stop there."

## Out
Writes, auth, lifecycle, record tokens, import, other datasets, the other four generic tables, anything WordPress. Source: "Do not build writes, auth, lifecycle, record tokens, import, other datasets or anything WordPress."

## Pending outside this spec
`docs/SPEC.md` carries an uncommitted edit adding the title column to Skin needs (shape table and contract item 4). It is committed only on Stefan's approval.

## Report (at the end)
WordPress assumptions and their rework (the grid-port number) · how declarations became tables and why · time spent against the estimate · anything in `docs/SPEC.md` that cannot be built as written.
