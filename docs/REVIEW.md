# Planning Engine — review against the code

Oct 4, 2026 · @Stefan

Step 0 is not two to three days but 8–12: the table store is not a drop-in behind the repositories, because the grid, the writes and the titles all treat a record id as a wp\_posts row, and ntdst-core's data model has no seam for a second backend. Read-only review of "Planning Engine — Architecture" against the laika checkout; nothing was changed. Paths: B/ = ntdst-baseline/services/views/, core/ = ntdst-core/api/, atl/ = atelier/services/planning/.

## 1. Rows

RowQuery builds no SQL of its own: it runs the ntdst-core Data chain over WP\_Query, and it can only read a declared CPT model, never a table or a SQL view.

- `RowQuery::build` = `ntdst_data()->get($model)->limit(-1)->withMeta()` plus `where` / `whereRelated` (`B/Query/RowQuery.php:43-63`).
- The chain is `new WP_Query` (`core/Data.php:2017`). Field filters become `meta_query` clauses (`Data.php:1174-1180`); `whereRelated` is a REGEXP over the serialised id list (`:1317-1320`).
- Gate: `Rows::get` → `Models::isDeclared` (`B/Rest/Rows.php:49`) → `ntdst_data()->isRegistered($model)` (`B/Models.php:42`; `Data.php:2411`).
- Rows are shaped from a `WP_Post` or a chain row plus `get_post_status($id)` (`Rows.php:151-163`).
- Window and filters run in SQL as meta clauses. Sort and search run in PHP after a full load (`RowQuery.php:153, 218`; `limit(-1)` at `:43`).

## 2. Lookups and rollups

Both are computed in PHP, never as a join; a SQL view could replace them only once the engine can read one.

- **Lookups**: one batched query per relation for all rows — `whereIn('ID')->withMeta()` (`B/Query/Lookups.php:64-69`) — plus one `get_post_status` per record (`:94`).
- **Rollups**: N+1, one chain query per row per rollup (`B/Query/Rollups.php:28-53`; the docblock says so at `:14`). A matrix load costs two queries per activity: the confirmed count and the `cells` list.
- Everything assumes posts: `Rows.php:151-163`, `Lookups.php:65-66, 94`, `Writes.php:150` (`get_post_type($id) === $model`), `Writes.php:169` (`instanceof WP_Post`), `Models.php:100, 123`.

## 3. Writes

A per-column `writes: {dataset, field, key}` target is a client-side change — `columnsFor` plus the store's `send` — because the server dispatcher already accepts a write to any declared model with a writer; about a day with its caveats.

One grid edit, end to end:

1. `Grid.tsx:116-123` → `store.apply({id, field})`.
2. Store: `commit` → `queued` → `send` → `api.update(model, id, {[field]: value}, table)` (`B/app/src/grid/store.ts:152-154`; `model` is fixed per store, `:56`).
3. `PATCH rows/{model}/{id}?table=` (`api.ts:74-76`).
4. `Writes::update` → `target` (declared model, `Writers::for`, `Rows::table`) → `id` (the post type must equal the model) → `clean` (only the model's fields) → `writer->update` (`B/Rest/Writes.php:52-173`).
5. The `ntdst/baseline/views/writers` filter (`B/Writers.php:28`) → `atl/PlanningWriters.php:24-39` → `AssignmentRepository::update` → `refuse()` → `Data::update` (`atl/AssignmentRepository.php:43-49`).

The smallest change:

- Carry the target on `Column` in `columnsFor` (`grid/columns.ts:189`).
- Route on it in the store's `send` / `Change` (`store.ts:6-13, 152-157`): PATCH `rows/{dataset}/{row[key]}`.
- Caveat: drop `?table=`, or `Rows::table` refuses it as `views_wrong_table` (`Rows.php:191-193`).
- Caveat: the answer is the target record, not the grid row (`store.ts:182`).
- Caveat: undo and the confirmed state are keyed by the row id (`store.ts:109, 244`).

## 4. Matrix

The "extern" half of the doc's rule fits; the "open" half fights the current model and is step 2 work, not a rendering tweak.

Today:

- A join row with a person becomes a `record:<id>` column; one with only a name becomes a `name:<normalised>` column (`B/app/src/matrix/columns.ts:31-53`).
- A row with neither is in no column — not rendered, not counted (`onColumn`, `:60-63`) — and the writer refuses it outright: `person_or_name` (`atl/AssignmentRepository.php:182-184`).
- No role field (`atl/AssignmentModel.php:35-41`).
- One cell shows one join; the lowest id wins (`columns.ts:65-72`).
- No drag-and-drop in `matrix/*`: only keys, paste and fill-down (`store.ts:382-411`).

The open column needs four things the matrix lacks:

1. Join rows with neither person nor name allowed, which means changing `refuse`.
2. A role field.
3. A many-joins-per-cell column type.
4. Drag-and-drop, with "consume" as an update of `person` on an existing join; `created()` only creates (`store.ts:142-149`).

## 5. Table store

The repositories' own surface is small enough for about a day, but "only the storage call changes" is false: with the grid, the hooks and the ids working it is 5–8 days.

| Method | As used | Activity | Assignment | Absence |
| --- | --- | --- | --- | --- |
| find | `(int, 'publish'\|'any')` → WP\_Post | ✓ | ✓ | ✓ |
| create, update | `(array)` → WP\_Post | ✓ | ✓ | ✓ |
| delete | `(int)`, trashes | ✓ | ✓ | ✓ |
| where | `(field, scalar \| [op, val])` with `>=`/`<=`; `('post_status','any')` | ✓ | ✓ | ✓ |
| whereRelated | `(field, int)` | ✓ | ✓ | ✓ |
| whereIn / whereNotIn | `('ID', list)` | ✓ | ✓ |  |
| orderBy | `('ID')` or a meta field | ✓ | ✓ | ✓ |
| limit, withMeta, get | `limit(-1)` | ✓ | ✓ | ✓ |
| count | `()` |  | ✓ |  |

Sources: `atl/ActivityRepository.php:26-112`, `AssignmentRepository.php:160-347`, `AbsenceRepository.php:369-435`. `between` is not a chain method; it is the repositories' own name for two `where` calls.

What makes it bigger:

- **The grid reads these models through the chain directly** — `RowQuery`, `Rollups`, `Lookups` — and needs `>`/`<`/`!=`, status lists, `count`, `getSchema` and `isRegistered`.
- **Callers require a `WP_Post`** (`Writes.php:169`, `PlanningTitles:101-125`) and ask `wp_posts` about the ids: `get_post_type`/`get_post_status` in `Writes.php:150`, `Rows.php:161`, `Lookups.php:400`, `atl/RelationTargets.php:357`. A table id can collide with a real post id.
- **Core has no backend seam**: `register()` always creates `NTDST_Data_Model` and calls `register_post_type`; `get()` is typed to that class (`Data.php:2217, 2263, 2383-2402`).
- **Write logic must be shared, not copied**: validation, sanitising, and the six `ntdst/model/*` hooks that `PlanningTitles` and Polylang listen on (`Data.php:658-764`).
- **Lost or redone**: the wp-admin screens and the metabox save path (`MetaboxGenerator.php:1959-1981`, `ActivityColumns.php:449-484`), and the seed script, which writes posts and postmeta (`bin/seed/glimworm.php`).

## 6. Extraction

Moving the views module out of baseline is a day or two of rewiring: it leans on baseline's boot, admin shell, three support classes and four filter names, and laika's tests hard-code about 100 of its identifiers.

What the module takes from baseline:

- **Boot**: baseline's module registry (`ntdst-baseline.php:90, 107`) and `ntdst/baseline/booted` (`B/ViewsService.php:63`).
- **Admin shell**: `ntdst/baseline/admin/apps` with `Shell` in bare layout (`B/AdminApp.php:26-45`; `AdminUIService.php:102`).
- **Support classes**: `Config::merge`, `support\FieldKinds`, `support\AssetUrl`.
- **Filter names**: `ntdst/baseline/views/{config, labels, writers, manifest}`.
- **Gate scripts**: INV-1, 2, 7 and 9–13 police it from `bin/check-invariants.sh:81-102`; `bin/check-app-build.sh` rebuilds the app.

What breaks in laika when it moves:

- laika's config and labels filters (`laika-core/views.php:18, 73`) and atelier's writers filter (`atl/PlanningWriters.php:24`).
- The module toggle `$modules['views'] = true` (`laika-core.php:34`).
- The `dist/` asset paths, asserted by `AdminPageTest.php:75`.
- The composer dependency on baseline (`^2.14`).
- About 100 test references to `ntdst-views/v1`, `ntdst-views-root`, `ntdst_view` and `ntdst_views_prefs`; most survive if the slug, namespace and post type keep their names.

## 7. Gates

netdust-gates has no product scenarios — only workflow evals (`netdust-gates/evals/cases.json`, 12 cases about planning and reviewing), eight generic edge classes (`skills/policy/edge-classes.md`) and the shake-out tooling — so the closest scenarios are laika's own e2e flows, and every gate is new test work.

| Step | Closest existing scenario | Fit |
| --- | --- | --- |
| 0. Engine extracted | `tests/E2E/planning.spec.ts`, `views-grid.spec.ts`, `views-matrix.spec.ts`; nothing for tables or a second domain | partial |
| 1. Speelreeks + Sjabloon + Rol | `views-matrix.spec.ts` matrix-block (a UI undo); no template batch | partial |
| 2. Slot-first + Beschikbaarheid | `views-matrix.spec.ts` matrix-absence-warning (shades and refuses nothing, the opposite of "excludes"); no invite, no signed link | partial |
| 3. Queries + views on queries | `views-saved.spec.ts` (saved views); `views-grid.spec.ts` inline edit with a refusal; no SQL-view write, no conflict types | partial |
| 4. Publicatie + Bijlage | `performances.spec.ts` ics-feed; `polylang-paths.spec.ts` (/fr ics); no snapshot, no diff | partial |
| 5. Veld | none | none |
| 6. Registration | none; no signed-link actor, and `bin/e2e.sh` seeds none | none |
| 7. Settlement | `views-grid.spec.ts` Planning export with xlsx read-back (`support/xlsx-read.ts`) | partial |

## Doc claim vs code

Three claims block step 0 as written; the rest cost a day or are wording.

| Doc claim | Code reality | Severity |
| --- | --- | --- |
| Table store = the same chain surface; "only the storage call changes" | The grid (`RowQuery`, `Rollups`, `Lookups`), `Writes` and `PlanningTitles` read through the chain and treat ids as `wp_posts` (`get_post_type`/`get_post_status`, `instanceof WP_Post`); core has no backend seam (`Data.php:2217, 2383`) | blocks |
| Step 0 is 2–3 days | Store with the grid working 5–8; extraction 1–2; `writes:` \~1; migration and seed \~1 | blocks (the plan) |
| A query is exposed to the grid "exactly like a dataset" | Rows serve only `isRegistered` CPT models (`Models.php:42`); no read path for a table or a SQL view | blocks until the store lands |
| Repositories "keep their rules" | They do, but the `ntdst/model/*` hooks (PlanningTitles, Polylang FieldSync), validation and sanitising live in `NTDST_Data_Model` and must be shared | costs a day |
| `writes: {dataset, field, key}` per column | Fits client-side (`columnsFor` + store `send`); the server already accepts it; caveats: `?table=`, the returned row, undo keys | costs a day |
| Move the views module out of baseline | Depends on baseline's boot, shell, `Config`, `FieldKinds`, `AssetUrl`, four filter names, the INV scripts and the app build gate; \~100 laika test references | costs a day |
| Matrix "open" column; drop consumes one open row by role | Rows with neither person nor name are refused (`AssignmentRepository.php:182`) and invisible; no role field; one join per cell; no drag-and-drop | costs a day+ (step 2) |
| `persoon_id` null = open slot | The writer forbids it today (`person_or_name`) | costs a day (step 2) |
| Gates pass "in a real browser (netdust-gates)" | netdust-gates has no product scenarios; every gate is new laika e2e work; step 6 needs a signed-link actor `bin/e2e.sh` does not seed | costs a day per step |
| Writers go "through the same views/writers filter atelier already uses" | True, but it is named `ntdst/baseline/views/writers` and the name changes on extraction | cosmetic |
| Matrix "extern" columns for free-text names | Already exist as `name:` columns, without a group | cosmetic |
| Relations are serialised id arrays matched by REGEXP | Correct (`Data.php:1317-1320`); callers read `[0]` of a list (`AssignmentRepository.php:223`) | cosmetic |
| A private CPT "buys a wp-admin list the grid has replaced" | The admin screens, metabox save and `ActivityColumns` are live; dropping them is a decision, not a no-op | cosmetic |
| The surface is "where / whereIn / between / orderBy" | `between` isn't a method; the real set includes `whereRelated`, `whereNotIn`, `count`, `find('any')` (which includes trash) and trash-on-delete | cosmetic |

## Verdict on step 0

Step 0 is 8–12 days, not two to three. The extraction is a day or two of renaming and rewiring. The table store is the real work: 5–8 days to keep the grid, the hooks and the wp-admin paths working. Add about a day each for the `writes:` columns and for the migration with the seed.

The single riskiest assumption is that the table store is a drop-in behind the repositories ("only the storage call changes"). The grid reads these models through `ntdst_data()->get()` directly. Much of baseline and atelier treats a record id as a `wp_posts` row (`Writes.php:150, 169`, `Rows.php:161`, `Lookups.php:400`, `RelationTargets.php:357`, `PlanningTitles`). And ntdst-core's `NTDST_Data_Model` has no seam for a second backend. Step 0 is therefore a change inside core's data layer, not a new class beside it.
