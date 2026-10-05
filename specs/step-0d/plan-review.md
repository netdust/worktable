# Plan review: step 0d (matrix, saved views, parity items)
Reviewed-plan: 8a4216030c08fdd211dd8c8fbed2bf1d56f29f3b specs/step-0d/plan.md
Verdict: not ready

## Blocking

**B1. The away half of the matrix (R1/R2) cannot work on today's source, and no task fixes it.**
- **Plan:** Task 1 adds a `MatrixDecl` with `away` but never gives its shape. Task 3 declares `away: { dataset: beschikbaarheid, across: persoon_id, label: reden }`. No task touches Beschikbaarheid's `date`.
- **Source:**
  - `packages/theatre/src/datasets.ts:141-152`: `beschikbaarheid` has no `date`, and `start_at`/`eind_at` are `datetime` columns.
  - `apps/grid/src/ui/App.tsx:120` fetches away rows with `rows({ model: away.model, table: away.table }, asked, null)`. With `layout` null, `api.ts:82` sends `from`/`to` without condition, and `params.ts:66` answers 400 `no_date_column`. That rejects the whole `Promise.all`, so the matrix view shows an error, not a matrix.
  - Even with `date: 'start_at'`, `rows.ts:23-31` filters on `substr(date,1,10)` within the window. A period that starts before the week and runs into it is never returned.
  - `matrix/away.ts:13-15` compares the raw value with a `YYYY-MM-DD` day. `'2026-10-05T09:00' <= '2026-10-05'` is false, so the first day of every period is not marked.
  - The spec says "a declared end column", but neither the spec's `away { dataset, across, label }` nor the plan's `MatrixDecl` says where that column is declared. So `MatrixAway.end_field` has no source.
- **Smallest change:**
  - Task 1 decides where `end` lives (for example `away: { dataset, across, label, end }`), and validates that the away dataset has a `date` and that `end` is a declared column.
  - Task 1 also says how the away rows for a window are read: an overlap (`date <= to AND end >= from`), either in the engine or as a filter the adapter sends.
  - Task 3 gives `beschikbaarheid` `date: 'start_at'`.
  - Task 4 maps `end_field`, slices to the day in `away.ts`, and adds a test for a period that starts before the window.

**B2. Removing `views` from `/schema` (Task 2) breaks the grid's boot, and Task 5 does not repair it.**
- **Plan:** Task 2 says "`/schema` stops serving `views`". Task 5 changes only `savedViews` and `toSavedViews`.
- **Source:** `apps/grid/src/engine.ts:107` `usedSources = (s) => [...new Set(s.views.map(...))]`, called from `toSchema` (`:112`). The grid's declared tables come from `s.views`. Without the key, `s.views.map` throws, `schema()` rejects, and App shows the "unserved" error (`App.tsx:73-77`). After that, `groupTables` (`ui/tables.ts:12-21`) gets no tables.
- **Smallest change:**
  - Task 5 adds `engine.ts` `toSchema`/`usedSources` to its files: tables from every source (`groupTables` already drops tables that have no view), or from `GET /api/views`.
  - Task 5 adds a boot test with a `/schema` that has no `views`.
  - Either move the `/schema` removal from Task 2 into Task 5, or keep serving both until Task 5, so no commit leaves the app unable to boot.

## Should fix

**S1. Nothing maps a saved view's `skin` to the grid's `type`, so the seeded matrix view would open as a plain grid.**
- **Source:** `engine.ts:162` hardcodes `type: 'grid'` in `toSavedViews`. App only renders the matrix when `view.type === 'matrix'` (`App.tsx:119,133`). `join`/`away` come from `tableDefOf(view.source, source)` (`engine.ts:103-104`), which gets only one source, not the join dataset's declaration.
- **Change:**
  - Task 4 or 5 maps `skin: 'matrix'` to `type: 'matrix'` and `table` to `table`, and back on create (`NewView.type` to `skin`).
  - `tableDefOf` takes the sources map so it can build `join`/`away` from the join dataset.
  - Add a test that the seeded "Toewijzingen per activiteit" opens as a matrix.

**S2. Under R4, saving a view wipes its widths and picks, and matrix hidden columns can't be saved.**
- **Source:**
  - `ui/views.ts:78-81` `clearIfSent` → `clearLocal` (`:72-75`) erases this browser's layout and picks (`clearLayout` and `clearPicked`) after every save.
  - The server keeps no widths or picks, so after Save plus reload both are gone.
  - `changed()` (`:60-70`) counts widths, so a width-only change still shows as unsaved.
  - In a matrix, `layout.hidden` holds `record:<id>`/`name:<x>` keys (`matrix/Matrix.tsx:154-155`, `matrix/columns.ts:56-58`). Mapping those to `visible_fields` fails R3's "must name declared columns" check, so every Save on a matrix with a hidden person returns 400.
  - `visible_fields` also can't say where a hidden column sits in the order (today `arrangementOf` in `engine.ts:139-148` returns `order: []`).
- **Change:** Task 5 states where widths, picks and matrix hidden keys persist across a save (a separate local key per view id that `clearLocal` leaves alone, or the adapter merges them back into the returned arrangement). It sends only declared columns in `visible_fields` and states that hidden columns lose their position. Add a test: save, re-read the view, widths and picks are still there.

**S3. The plan contradicts the spec on the 16 kB cap's status.**
- Spec R3: "the whole view is at most 16 kB … each failure is 400 with its code."
- Plan Task 2 Interfaces and Step 1: "413 `view_too_large`".
- The order of the two caps is right: the 64 kB `bodyLimit` in `write-guard.ts:15-18` runs first, then the view check.
- **Change:** use 400 (or have Stefan rule and record the decision in the spec). Also say what is measured: the merged view as stored, not the PATCH body.

**S4. The plan names the down source's `/schema` marker two ways, and one of them contradicts the spec.**
- Task 1 Files: "`matrix: <join>` on the down source". Task 1 Interfaces: `sources[down].matrix_join`. Spec R1: "marks the down source `matrix: <join dataset name>`".
- **Change:** pick one. `matrix_join` avoids one key carrying two types, but then it needs a spec amendment in the end-of-plan diff.

**S5. R6 has no grid-side task for a non-string `title`.**
- **Plan:** Task 4 only says "`toRow` takes `row.title`". The plan never says what `/schema` serves as `title` for a `{via, else}` dataset.
- **Source:** these grid callers treat `source.title` as a column name:
  - `engine.ts` lines 91, 95, 96 (`title_label` and `title_readonly`), 119 (`columnId`), 139 (`arrangementOf`), 198 (`toEngineData`), and the `titleColumn` used by `rowsQuery` (206-223);
  - `api.ts` lines 66-72, 81-82, 96, 104, 115, 118.
- With an object there, sorting or grouping on `title` sends `[object Object]` (400 `bad_sort`), and `title_readonly` is wrong. R6 also says "not editable in the grid" and "filterable and sortable only through its columns", and no test covers either.
- **Change:**
  - Task 1 fixes the `/schema` shape (for example `title` stays the `else` column plus `title_via`, or the raw object).
  - Task 4 lists the callers above, makes a via title read-only and drops `title` from the sort and group ids.
  - Add a test: a Toewijzing title is not editable, and sorting does not send `title`.

**S6. R10's merge of chips and fixed filters overwrites on a shared key.**
- **Plan:** Task 6 Step 1 expects `rowsQuery` to send `{status: {$in: [...]}, ...chips}`.
- **Source:** a chip on `status` (`engine.ts:215`, `{ $eq }`) would replace the fixed `$in` through the object spread. `filterCompile` accepts several operators per key (`filter-compile.ts:57-82`).
- **Change:** merge per key (`{status: {$in, $eq}}`) and test a chip and a fixed filter on the same column. Task 5's arrangement-to-`filters` mapping, which is built before Task 6 introduces `fixed`, must also carry the fixed filters through a save. Name that in Task 6's files.

**S7. Two tasks each own the seeded views' `shared` flag.**
- Task 2 sets it in `seedDomain` (owner 0, shared true). Task 3 sets "every seeded view `shared: true`" in theatre's `seed.ts`.
- **Change:** keep it in the engine (`seedDomain`, `migrate.ts:73-80`), so fiche gets it too, and drop it from Task 3.

**S8. The steps say what, not how.**
- Every task's "Step 2: Implement" has no code. Tasks 3-7 have no `Interfaces`: the `MatrixDecl` type, the `ViewOut` to `SavedView` mapping, the R5 writer branch, and the `fixed` field on `View` are all unshown.
- For subagent-driven execution, which the security path (views) calls for, write at least:
  - the `MatrixDecl` and title types;
  - the `views.ts` signatures (`viewBody`, `ownedView`);
  - the R5 normalisation code;
  - the arrangement mapping functions.

## Note

- **Matrix writes already go out in the 0b wire format.** `toEngineData` → `wireValue` (`engine.ts:190-192`) already turns the matrix store's `[id]` lists (`matrix/store.ts:143-144`) into one id. Task 4's "relation values as ids" needs a test, not a change. The cells need no `status`: the matrix reads `fields[cell_field]` (`Matrix.tsx:115,166`), and `Lookup.status: ''` is harmless. Activiteit's `plandag` is a `date` (`datasets.ts:76`), so it works as the matrix's row date.
- **Simplest design: the rejection of runWrite reuse is overstated.** `runWrite` (`writes.ts:290-315`) takes any `{dataset, writer}`, and `savedView` is a `DatasetDecl`. It also brings `cutBody` (which drops undeclared keys), json encoding, Revision and soft delete for create, update and delete. Only restore needs its own path, because `liveRow` hides deleted rows. Alternatively, export `revise`, which `views.ts` needs anyway (it is private today).
- **`resolveKey` is private** (`filter.ts:11`). Validate saved filters with the exported `filterWhere(input, source, tableOf(source))`, which compiles and resolves keys in one call, rather than calling `filterCompile` and `resolveKey` separately.
- **`saved_view` already has `scope`** (default `'shared'`, `saved-view.ts:22`). Adding `shared` next to it leaves a dead column. Drop `scope` in the same DDL change, which needs `--fresh` anyway.
- **`titlesOf` in `rows.ts:46-53` selects `target.title` as a column.** A relation that targets a via-title dataset would break it. Task 1 should have `validateDomain` refuse that (and refuse `via` naming a non-relation column), with tests. Put the title in `withLookups`, not `readRows`, so `rowOf` write responses carry it too.
- **`offset` keeps the count exact.** The count in `rows.ts:89` uses the same `where` without limit, and the `id` tiebreak keeps pages stable.
- **`import.meta.env.VITE_RECORDS_PAGE_SIZE` is a string.** Use `Number(...) || 5000`.
- **Task 3 lands `{via}` titles before Task 4 teaches the grid to read them.** Run the 0c e2e (it reads toewijzing) at the end of Task 4, or put the theatre title change and the grid change in one task.
- **Size.** Task 1 is three features (title via relation, offset, the matrix declaration with cells and `/schema`). Splitting it into 1a (title, offset) and 1b (matrix) would keep each within one implementer. Tasks 2-7 are a reasonable size.
- **Task 3 tests.** Add an assertion that `GET /api/views` serves the seeded "Toewijzingen per activiteit" as skin `matrix`.

## Premises checked

- `DatasetDecl.title: string` → `packages/engine/src/declare.ts:20` → holds. Union is feasible; `validate.ts:53` and `rows.ts:49` must change, and both are in Task 1.
- `withLookups` resolves relation titles that the title-via can reuse → `rows.ts:56-78` → holds.
- `/rows` has a limit and an exact total, and offset can be added → `params.ts:43-50`, `rows.ts:80-93` → holds.
- `writeGuard` is mounted on every `/api` write and would cover `/views` → `app.ts:46` (`app.on([...], '/*', writeGuard())`) → holds, if the views routes are mounted on the same `app`.
- 64 kB body cap in the 0b guard → `write-guard.ts:5,15-18` → holds.
- "reusing … the filter compiler + `resolveKey`" → `filter.ts:11` (private), `filter.ts:97` (`filterWhere` exported) → partly holds.
- `saved_view` has `owner_id`, soft delete and no `shared` → `saved-view.ts:22-23`, `ddl.ts:36` → holds.
- Dev actor id 0 → `dev-actor.ts:4` → holds.
- Revision helper reusable → `writes.ts:259` (`revise` not exported) → needs an export.
- `/schema.views` only feeds saved views → `apps/grid/src/engine.ts:107,112` → does not hold (B2).
- The grid's `MatrixJoin`/`MatrixAway` can be fed from the declaration → `types.ts:116-138` → holds except `MatrixAway.end_field`/`date_field` (B1).
- Beschikbaarheid gives a date range for away → `packages/theatre/src/datasets.ts:141-152` → does not hold (B1).
- Column titles through `records()` of the relation target → `App.tsx:35-41` → holds.
- Matrix writes need a change from `[id]` lists → `engine.ts:190-192` → already converted (Note).
- The saved view's `type` drives the matrix → `engine.ts:162` hardcodes `'grid'` → not addressed (S1).
- Refusal codes `views_unknown_saved`/`views_not_owner` → `ui/useSavedViews.ts:107-108,174-175` → hold; the remap to `unknown_view`/`not_owner` belongs in Task 5 as planned.
- `clearIfSent`/`isSaved`/`picked` survive local widths and picks → `ui/views.ts:34-36,72-81` → does not hold (S2).
- `newRow` asks for the title first → `grid/newRow.ts:28` → holds; Task 6 owns the fix. `start_at` must stay "fillable" under the new datetime kind (`newRow.ts:9`).
- Theatre's Toewijzing writer refuses "both" and "neither" → `packages/theatre/src/writers.ts:218-227` → holds.
- `VITE_*` env on the theatre Vite server → `playwright.config.ts:15-16` → holds; a slot exists for the new env var.

---
Answered by the author in the rewritten plan: B1 (`away.end`, Beschikbaarheid `date: start_at`, overlap read in the adapter, day slicing in `away.ts`, a before-the-window test), B2 (`/schema` keeps `views` until Task 5; tables from every source; boot test; every grid task ends with the e2e suite), S1 (skin→type, `tableDefOf(source, sources)`, matrix-opens test), S2 (widths, picks and matrix hidden keys under a per-view local key `clearLocal` leaves; hidden columns lose their position, documented), S3 (400 `view_too_large`, measured on the stored view), S4 (`matrix_join`, spec amended), S5 (`title` + `title_via` in `/schema`; via titles read-only and never sorted, grouped or filtered; callers listed), S6 (per-key merge; fixed filters survive a save), S7 (`shared` only in `seedDomain`), S8 (types, signatures and the R5 branch written out). Notes: runWrite reuse weighed in the simplest-design paragraph; `filterWhere` used; `scope` dropped; via-title targets refused by `validateDomain`; title in `withLookups`; `Number(...) || 5000`; Task 1 split into 1a and 1b; Task 3 asserts the seeded matrix view.
