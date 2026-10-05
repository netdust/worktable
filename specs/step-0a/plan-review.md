# Plan review: step-0a, the read-only engine slice (re-review)
Reviewed-plan: a969ce750c69468f5c5f17caa82261b063c9b3d7 specs/step-0a/plan.md
Verdict: not ready. There is one Blocking finding, and it is a one-key fix: the B1 answer misses Biome's assist. There are three Should-fix findings. S1–S4 from the previous review are answered. S1 is answered in substance, but the `SavedView` shape it specifies is incomplete (S-A below).

## Previous findings: answered?
- **B1, answered in part.** The new `overrides` entry turns the formatter and the linter off, but Biome 2's `biome check` also runs the assist, and `organizeImports` still fails. See Blocking A1.
- **S1, answered.** Saved views now go through `SavedView.arrangement`, and the `defaults()` edit is gone from Step 4. Two loose ends: `grid/layout.ts` is still in Task 3's Modify list, and the field list for `toSavedViews` is incomplete (S-A).
- **S2, answered.** `savedViews`, `prefs` and `records` are each named with their rework. The engine ignores unknown params. Save and Save-as stay reachable and go to the ledger. More reachable writes are listed in N-B.
- **S3, answered.** There is a denial test for each input, plus the `IN_MAX_VALUES` cap. `FilterCompileError` becomes `ApiError(400,'bad_filter')`, and `custom` is `{}` on a query row.
- **S4, answered.** Task 1 adds only `test`, and Task 4 owns `gate`.
- **N1–N13, all answered** (N3/N4 wording, N5 mapping, N6 ruling, N7 all nine soorten, N8 `readFileSync`, N9 one `seedDomain`, N10 R3 pointer, N12 tsconfig wording, N13 the chromium install).

## Blocking

**A1. Turning the formatter and the linter off is not enough for `bun run check` to pass on the verbatim grid in Biome 2.5.15.**
- **Plan:** Task 3 Step 1 says "a `biome.json` `overrides` entry for `apps/grid/**` that turns the formatter and the linter off". Step 5 then says "`bun run check` → 0".
- **What I ran:** the repo's `biome.json` (`/home/ntdst/Sites/worktable/biome.json`, schema 2.5.15, no `assist` key, so the assist is on by default) with exactly that override (`"includes": ["apps/grid/**"], "formatter": {"enabled": false}, "linter": {"enabled": false}`), over the 7efef97 app copied with the plan's exclusions, using the repo's own `node_modules/.bin/biome` 2.5.15.
- **Result:** 20 errors remain, all `assist/source/organizeImports`, for example in `src/ui/views.test.ts`. The `check` script (`package.json:10`, `biome check .`) exits non-zero.
- **With the assist off as well:** adding `"assist": { "enabled": false }` to the same override gives a clean `biome check` ("Checked 1 file … No fixes applied", meaning every grid file is skipped).
- **Fix:** in Task 3 Step 1, the override turns off the formatter, the linter **and the assist**. The ledger row is unchanged.

## Should fix

**S-A. `toSavedViews` as specified leaves out the keys the grid reads from the view itself, and the date window goes off without any error.**
- **Plan:** Task 3 Interfaces says `toSavedViews` builds "`id`, `table`/`model` = source, `type: 'grid'`, `arrangement` …, `shared: true`, `mine: false`, `editable: false`, `owner`".
- **What the grid expects:** in the source, a saved view arrives already merged with its table.
  - `services/views/Rest/Json.php:83-94` (`Json::saved`) gives the table's keys first, then `key => (string) $saved['id']`, `label`, `table`, `table_label`, then the saved keys.
  - The grid's own fixture matches: `ui/App.test.tsx:956` has `key: String(id), id, label, table, table_label, model, date_field: 'date', type: 'grid', starting: false, …`.
- **Why it matters:** App takes the window and the filter menu from the open view object, not from its `TableDef`.
  - `ui/App.tsx:100` `const dated = Boolean(view?.date_field)`
  - `App.tsx:112` `const asked = dated ? range : {}`
  - `App.tsx:140` `view?.filters`
- **What breaks:** tsc forces `key` and `label`, but the plan does not say what they hold. tsc does not force `date_field`, because it is optional. Without it, Planning and "Per productie per dag" are not dated:
  - no week toolbar;
  - `from`/`to` are never sent, so `rowsQuery`'s window path is dead;
  - both seeded weeks render.
  - Task 4's premise "the grid shows the Monday–Sunday week of `from`" is false. The three flows would still pass, so the gate would not catch it.
- **What does hold:**
  - `isSaved` (`views.ts:34-36`: `id` is a number and `arrangement` is an object) holds.
  - `useLayout` → `layoutOf` → `arrangementOf` → `fromStored` (`grid/hooks.ts:12`, `views.ts:39-47`) applies the arrangement.
  - `groupTables` (`ui/tables.ts:12-21`) keeps a table only when `view.table === table.key`, so `TableDef.key` must equal the source name.
  - With `mine: false`, `onSave` is undefined (`App.tsx:197`), and the Toolbar's Save button falls through to `onSaveAs` (`Toolbar.tsx:44-50`).
- **Fix:** specify `toSavedViews(row) = { ...tableDefOf(row.source), key: String(row.id), label: row.name, table: row.source, table_label, type: 'grid', starting: false, id, arrangement, shared: true, owner, mine: false, editable: false }`, where the `TableDef` carries `date_field` = the source's `date`. Add an `engine.test.ts` case: "Planning's SavedView has key '<id>', label 'Planning', date_field 'plandag'".

**S-B. `rowsQuery` sends every layout sort key to a route that refuses undeclared keys.**
- **Plan:** Task 3 Interfaces: "`rowsQuery(view, layout, window)` (… sort, group …)". Threat model attack 3: "each sort and group key must be a declared column … else 400".
- **The grid's column ids:** `title`, a field key, `lookups.<field>.<name>` or `rollups.<key>` (`grid/columns.ts:10`).
- **What breaks:** a click on the title column header puts `{id:'title'}` in `layout.sort`. `rowsQuery` sends `sort=title`, the engine answers 400 `bad_sort`, and the sheet shows the error state.
- **Fix:** `rowsQuery` maps `title` to the source's title column and leaves out non-field ids, which the grid sorts on the client anyway. Add one `engine.test.ts` case for it.

**S-C. Task 1 uses a type that only Task 2 creates.**
- **Plan:** Task 1 Interfaces has `SavedViewSeed { … filters: FilterInput … }`, and Task 1 Step 4 runs `bun run check`, which typechecks.
- **The problem:** `FilterInput` comes from `packages/engine/src/filter-compile.ts`, which Task 2's Files creates. Task 1's Files does not.
- **Fix:** move the copy of `filter-compile.ts` (types and limits) into Task 1's Files, or type the field `Record<string, unknown>` in Task 1.

## Note

- **N-A. Cache the `/api/schema` promise, not its result.** App calls `schema()` and `savedViews()` in the same synchronous effect (`App.tsx:72,77`). If "the cached schema" is a variable filled when `schema()` resolves, `savedViews()` runs before that and finds nothing. Say "the memoised `/api/schema` promise" in Task 3 Step 4. `api.test.ts` then needs a reset between tests.
- **N-B. More saved-view writes are reachable than the plan names.**
  - "Duplicate" is offered on every saved view (`ui/ViewList.tsx:49`) and goes to `createView`.
  - "+ New view" (`Rail.tsx:43`, `onNewView`) goes to `create` → `createView`.
  - `savePrefs` fires 500 ms after any view switch (`useSavedViews.ts:42-46`; e2e flow 3 triggers it). Its 404 is swallowed.
  - The ledger sweep should find all three. Naming them in Step 4 next to Save / Save-as keeps the "reachable" column honest.
- **N-C. Leftover Modify entry.** Task 3 Files still lists `grid/layout.ts`, but no step changes it now that S1 is answered. Drop it, or the executor will look for an edit to make.
- **N-D. The seed row the e2e flow relies on is not pinned.**
  - planning-grouped-sorted asserts that "the 00:30 activity of 2026-10-14 sits under the 2026-10-13 header" on Planning, which opens filtered on `bevestigd`.
  - Task 1's seed says only "at least one start at 00:30". Pin it as `start_at 2026-10-14T00:30`, status `bevestigd`.
- **N-E. Element shape inside `$in`/`$nin` is not covered.** Folio's `filterCompile` checks only that `$in` is an array (`filter-compile.ts:85-87`). `{"status":{"$in":[{"a":1}]}}` would bind an object and give a 500. Attack 5's "values must be scalars" covers it in words, but the denial list tests only a top-level array and an object under `$eq`. Add `$in` holding an object to that test.
- **N-F. Use stable deps when the rows effect takes layout values.** The `layout` object changes identity on every width or hidden-column change (`grid/hooks.ts:13`). Keying on serialised filters, sort and group keeps "one refetch per chip change" true.
- **N-G.** Review Focus 4 cites "the grid's empty state", but only the Rows REST row tests the `[]` answer. That is fine as long as the reader knows the grid half is unproven.

## Premises checked
- Biome override with formatter and linter off makes `check` pass → repo `biome.json` + `package.json:10`, run with biome 2.5.15 → **does not hold** (20 organizeImports errors). With the assist also off → holds (A1).
- `overrides` with `includes` is valid in Biome 2.5 → biome 2.5.15 accepted it → holds.
- `SavedView.arrangement` drives the layout → `ui/views.ts:39-47`, `grid/hooks.ts:9-24` → holds.
- `isSaved` accepts the adapter's rows → `views.ts:34-36` → holds.
- Saved-view key shape → `Rest/Json.php:86` and `App.test.tsx:956` give `String(id)` → the plan does not specify it (S-A).
- Window driven by the view's own `date_field` → `App.tsx:100,112` → **does not hold** for `toSavedViews` as specified (S-A).
- `mine:false/editable:false` → Save falls through to Save-as → `App.tsx:197`, `Toolbar.tsx:44-50` → holds.
- `savedViews()`/`prefs()` called on mount → `App.tsx:77-78` → holds, with a promise cache (N-A).
- `records()` reachable through `useFilterNames` → `useFilterNames.ts:28` → holds. The engine ignores `search` → holds.
- `Filter.value` is a string, so `$eq` scalar chips round-trip → `grid/layout.ts:8-12`, `filter.ts:13-18` → holds.
- A relation scalar works in `filterValue` → `filter.ts:15` → holds.
- Sort ids sent as declared columns → `columns.ts:10` (`title`, `lookups.*`) → does not hold for every id (S-B).
- Folio `filterCompile`: unknown op, `$in` non-array and `$contains` limits throw `FilterCompileError`; an array or object value without an operator passes as `$eq` → `filter-compile.ts:72-73,81-111` → holds. The plan's own check in `compileFilter` is required, and the plan states it.
- Folio `$contains` two-arg `json_each` guard, path bound → `filter-to-drizzle.ts:84-89` → holds.
- `FilterInput` available to Task 1 → created in Task 2 → does not hold (S-C).
- Engine dynamic import of the domain by name passes the boundary check → `scripts/check-boundaries.ts:10-11` (string literals only) → holds.
- Copied grid `package.json` / `tsconfig.json` → its own `typescript ~6.0.2`, `types: ["vite/client","node"]`, does not extend the base; root `check` runs `--filter '*' typecheck` → holds as the plan states.
- Copied `index.html` mounts on `#ntdst-views-root` and `main.tsx` requires `window.ntdstViews` → both are in Task 3's Modify list → holds.
- Activiteit columns `plaats`, `status` (optie · bevestigd · geannuleerd) and the nine soorten → `docs/SPEC.md:136` → holds. `productie_dag` counts every soort → holds.
- R1–R11 each have a task, and threat-model attacks 1–6 each have a denial test → holds. Gaps are N-E and S-B.
- No `ARCHITECTURE-INVARIANTS.md` in the repo → none to check.

---

# Plan review: step-0a, the read-only engine slice
Reviewed-plan: c1d645563fec019a7ddee20905852aa46aea4f3a specs/step-0a/plan.md
Verdict: not ready (one Blocking finding. The fix is small, but the plan has to make a decision there before anyone executes it.)

## Blocking

**B1. The step "`bun run check` → 0 after WordPress-only rework" does not hold against the repo's Biome config.** Task 3 Step 5 says: "`bun run check` → 0 (`apps/grid` keeps its own `tsconfig.json` … so no rework comes from `noUncheckedIndexedAccess` that is not WordPress)". The plan only looks at the TypeScript side. Root `package.json:10` `check` runs `biome check .`, and `biome.json` lints and formats `**` with the recommended preset, single quotes, no semicolons and a line width of 120.

I ran the repo's `biome.json` over `services/views/app/src` @ 7efef97:
- 82 files fail formatting.
- 89 lint errors, mostly `useExhaustiveDependencies` (52) and a11y (28). Others include `noSwitchDeclarations`, `noUnsafeOptionalChaining` and `noVoidTypeReturn`. They are spread across `ui/App.tsx` (22), `matrix/Matrix.tsx` (11), `grid/Grid.tsx` (7), `space.ts` (6), and more.

That leaves the executor two bad options. It can let the gate fail (R11). Or it can rewrite about 170 diagnostics, many of them in code the plan says "stays as copied", which also inflates the grid-port number the slice exists to measure (spec header, R10).

Smallest change: in Task 3 Step 1, commit a `biome.json` `overrides` entry for `apps/grid/**`, with the formatter off and the offending lint rules off (or the linter off), together with the verbatim copy. List it in the ledger as "not WordPress, deferred". Alternatively, make a separate `biome check --write` commit that the time log counts outside the port number. Either way the plan has to say which.

## Should fix

**S1. Task 3 plans to put saved-view filters on `View`, but `View.filters` already means something else, and the grid has a seam for this.** The Interfaces line maps "saved views → `View` with `key: 'saved:<id>'`" and Step 4 says "`layout.ts` `defaults()`: starting chips from the view's filters".
- `View extends TableDef`, and `TableDef.filters?: string[]` is "The fields the '+ Filter' menu offers first" (`src/types.ts:38-39`). It holds field names, not values. A value like `{status:'bevestigd'}` has no place on `View`.
- The grid already carries filter/sort/group values for a saved view: `SavedView.arrangement: StoredArrangement` (`types.ts:71-90`) → `arrangementOf` → `fromStored` → `layoutOf` (`ui/views.ts:39-47`).

Smallest change: map engine SavedView rows to the grid's `SavedView`, with `arrangement` built from the row's filters, sort and group_by, `mine:false`, `editable:false`, `shared:true` and `owner` filled. Serve them through the copied `savedViews()` from the `/api/schema` response, and drop the `layout.ts defaults()` edit. This is also the simpler design (see N1).

**S2. "Saved-view CRUD, prefs … unreachable" is false for two reads and one button.**
- App calls `savedViews()` and `prefs()` on every mount (`ui/App.tsx:77-78`). They hit `/api/views` and `/api/views/prefs`. The engine answers with Hono's plain-text 404, and the rewritten `api.ts` has to turn that into an `{code,message}`.
- `records()` is reachable through `useFilterNames` (`ui/useFilterNames.ts:28`). It sends `?search=` (`api.ts`, `records`). The plan's Zod `parseRowsParams` does not say whether unknown params are refused or ignored.
- Changing a chip, which the e2e flow does, sets `modified` and shows Save / "Save as new" → `createView` (`App.tsx:196-201`, `Toolbar.tsx:49-50,68`).

Smallest change: in Task 3 Step 4, name each of these and its rework (S1 covers `savedViews`; `prefs` resolves to empty; `records` → `/api/rows/<model>` with unknown params ignored, decided in Task 2's `params.ts`). Mark them reachable in the ledger.

**S3. Several inputs that R5 says must be "400, never 500" have no handling and no test.** R5: "an unknown key, operator … is 400, never 500". Task 2 Step 1's denial list has none of these:
- **Unknown operator.** Folio's `filterCompile` throws a `FilterCompileError` (`filter-compile.ts:81-83`). The plan's `onError` maps only `ApiError`; anything else becomes 500.
- **`$contains` on a declared column.** The plan removes `COLUMN_KEYS`, and Folio's drizzle side then throws a plain `Error` (`filter-to-drizzle.ts:68-70`) → 500.
- **Wrong value shape**, e.g. `{"status":[1,2]}` or `{"status":{"$eq":{"a":1}}}`. This binds an array or object → bun:sqlite error → 500.
- **`$in`/`$nin` with no size cap** (`filter-compile.ts:85-87`). Attack 5 caps only `$contains`. A large `$in` exceeds SQLite's bound-variable limit → 500.
- **`custom.<key>` on a query.** `QueryDecl` has no `custom`, and `productie_dag.sql` has no `custom` column, so `table.custom` is undefined in `resolveKey`.

Smallest change: add one denial test for each of these to Task 2 Step 1, all `400 bad_filter`. Add a `$in` cap to attack 5. State that `compileFilter` turns `FilterCompileError` into `ApiError`. Also say what `custom` is for a query row: R5 shows `{ id, ...columns, custom }`, so either `{}` or omit it.

**S4. Gate ownership is split across two tasks.** Task 1 Files modifies the root `package.json` "(`gate`, `test` scripts)", and Task 4 Files defines `gate` again. Smallest change: keep only `test` in Task 1.

## Note

- **N1 (simplest design).** The paragraph says "the port number is only honest if the grid's real path (layout → server) is ported now". In the source, that path does not exist:
  - Filters, sort and group are applied in the browser (`grid/filter.ts:52` `filterRows`, `grid/useTable.ts:44`, `grid/group.ts:37-50`).
  - The rows effect is keyed on purpose so that a new arrangement does not refetch (`App.tsx:121-122`).

  The rejection of client-side-only filtering still holds, because R5 and R9 require server parameters. The stated reason should cite R9, not "the grid's real path".

  A simpler design the plan did not consider is S1's: reuse `SavedView.arrangement`. It also helps to know that the grid keeps filtering, sorting and grouping on the client, so server-side `group` ordering does not drive the headers the e2e test checks. `groupRows` re-ranks dates ascending itself.
- **N2. The rows effect needs `layout`, which App reads later.** `useLayout` and `layout` come after the rows effect (`App.tsx:135-138` vs `107-122`). Task 3 Step 4 needs to move them up. Expect one extra fetch per chip change, plus a store rebuild (`grid/hooks.ts:31-34`).
- **N3. e2e window.** `fromHash` ignores `to` and always returns the Monday–Sunday week of `from` (`ui/Window.tsx`, `fromHash`). `#from=2026-10-12&to=2026-10-25` therefore shows 12–18 Oct only (2026-10-12 is a Monday). The flows still pass, but the second seeded week never appears.
- **N4. e2e status flow.** You cannot pick another value on an active chip, because `Filters` leaves fields that already have a chip out of the "+ Filter" menu (`ui/Filters.tsx:15`). "Choose `optie` on the status chip" really means: remove the chip, then use "+ Filter" → Status: optie. Phrase the step that way.
- **N5. Type mapping gaps.** The grid's `FieldType` has no `datetime` or `json` (`types.ts:3-5`), and `kindOf` turns unknown types into `other` (`grid/columns.ts:65-86`). The Task 3 `toSchema` test lists the mapping without `datetime` (used by `start_at` and `eind_at`) or `json`. Name it: datetime → text sorts correctly as ISO text.
- **N6. R1 signature.** R1 lists a `relations` key in `defineDataset`. The plan folds relations into `ColumnDecl.relation`. That is a reasonable ruling, but the plan should state it as one.
- **N7. `productie_dag` counts.** R6 says "counts per soort". The SQL counts voorstelling, repetitie and opbouw/afbouw out of nine soorten. Either all of them, or a line saying the subset is intended.
- **N8. How the `.sql` file is read.** Task 1 does not show how `productie_dag.sql` becomes `sql: string`: an `import … with { type: 'text' }` plus a `*.sql` module declaration for tsc, or `readFileSync`.
- **N9. Seeding is in two places.** Views are seeded inside `migrate` when `saved_view` is empty, while domain rows are seeded only by `--fresh`. Pick one place.
- **N10. R3 has no home in the plan.** It is satisfied by the refusal (`MigrationError`). Add one line pointing R3 at Task 1's refusal test and at the end report, so the step 1–2 item is not lost.
- **N11. Localhost binding is the premise of the auth deferral, but only a manual `ss` check proves it.** That is acceptable for 0a. It is noted because the deferral rests on it.
- **N12. tsconfig wording.** "`apps/grid` keeps its own tsconfig.json; it does not extend the base". The current `apps/grid/tsconfig.json:2` does extend the base. The copied file replaces it, so say "replaced by the copied tsconfig". The copied one has `types: ["vite/client","node"]` and pins TypeScript `~6.0.2` against the root's `^7`.
- **N13. Playwright browser install is not a step.** Task 4 should say `bunx playwright install chromium`.
- **N14. Outside the plan:** `AGENTS.md` says custom fields live in a `velden` column declared in a "Veld table". The spec says `custom` and `Field`. The plan correctly follows the spec, but the owner should hear about the mismatch, since AGENTS.md itself says "tell the owner".

## Premises checked

- Engine CLI dynamic-imports the domain without tripping the boundary check → `scripts/check-boundaries.ts:10-11`: the regex matches only string-literal `import('…')`, so `import(name)` passes → holds. `@worktable/theatre` resolves through workspace symlinks after `bun install`; it is in `bun.lock` workspaces but not yet installed.
- `bun run check` = boundaries + biome + typecheck → `package.json:10` → holds. "→ 0 after WP-only rework" → `biome.json` vs copied src → does not hold (B1).
- Grid `Schema` / `Model` / `TableDef` / `View` / `Row` / `Lookup` shapes → `src/types.ts:17-23,28-65,153-190` → hold.
- Saved-view filters go through `View`/`defaults()` → `types.ts:38-39` (`filters` is `string[]`), `grid/layout.ts:31-40` (`filters: []`) → does not hold as written. The existing seam is `SavedView.arrangement` (`ui/views.ts:39-47`). See S1.
- App's rows effect can take layout deps → `ui/App.tsx:107-122,135-138` → holds with a reorder (N2).
- Filter chip path: `filterFields` gives select options from the model and relation options from the loaded rows → `grid/filter.ts:30-46` → holds. Choosing on an active chip → `ui/Filters.tsx:15` → does not hold as phrased (N4).
- Group headers ordered by plandag → `grid/group.ts:18-26,50` (client ranks date keys ascending) → holds.
- Window from the hash → `ui/Window.tsx` `fromHash` → partly: `to` is ignored (N3).
- Writes / saved-view / prefs unreachable → `App.tsx:77-78`, `useFilterNames.ts:28`, `Toolbar.tsx:49-50` → does not hold (S2).
- Copy excludes `dist/` → `dist/` is tracked at 7efef97 → the exclusion is needed and stated → holds.
- Folio `MAX_FILTER_CLAUSES = 50`, `CONTAINS_MAX_VALUES = 100` → `filter-compile.ts:14,22` → holds. No `$in` cap → line 85 → gap (S3).
- Folio two-arg `json_each` guard and bound path → `filter-to-drizzle.ts:84-89` and `40` → holds.
- `$contains` on a column after `COLUMN_KEYS` is removed → `filter-to-drizzle.ts:68-70` throws a plain `Error` → 500 (S3).
- Drizzle serving a SQL view through a runtime `sqliteTable` → a `select` from a named table reads a SQLite view → holds. `custom` on a query's table is undefined (S3).
- No `ARCHITECTURE-INVARIANTS.md` in the repo → none to check.
- Threat model 1–6 each have a test in Task 2 Step 1 → hold. The inputs in S3 are uncovered.
- Spec R1–R11 each have a task → hold. R3 points nowhere (N10), R6 counts are partial (N7), R1 `relations` key is folded (N6).

Filed note (author): N14 does not hold — `AGENTS.md:27` already reads "custom JSON column, declared in the Field table" since `01bae31`.
