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
