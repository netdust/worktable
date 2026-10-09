# Plan review: virtual-columns (step 2b, lookup columns)

Reviewed-plan: 39312c5b2ae18db79fb7259170c742f14b86d637
Verdict: not ready

Filed by the controller from the plan-reviewer's report (the reviewer is read-only).

## Blocking

**B1. The inner-table alias does not keep the correlated subquery correct inside the SELECT list.** Probed against drizzle 0.45.3 on bun-sqlite: in select fields drizzle prints a column inside a `sql` template without its table (`… WHERE "t"."id" = "parent_id"`), while WHERE and ORDER BY qualify it. SQLite binds the bare name to the inner alias whenever the target has a column of that name — always on a self-relation; the probe returned null where 'Een' was expected. The same holds for `own` in COALESCE and the inherited flag. Fix: print the outer side as `${sql.identifier(source.name)}.${sql.identifier(via)}` (verified), and add a fixture case where the target has a column named like `via` (a self-relation).

**B2. The grid's saved-view round trip and filter kinds read `source.columns` only.** `apps/grid/src/engine.ts:268-271` `fieldsOf` (columns + links), `fromStoredView` (279-283) drops unknown `visible_fields`, `toStoredView` (319-322) builds from `fieldsOf`, `kindOf` (250-258) types a lookup as text. A seeded `locatie` loses its place, show/hide of a lookup is never saved, a stored `{locatie: 7}` reads back as an eq chip. Fix: `fieldsOf` and `kindOf` read `source.lookups`; vitest for the round trip and `kindOf`.

## Should fix

- **S1.** The fixture's `naam`/`groep_naam` fail `scripts/check-vocabulary.ts:46-70` (theatre words in `packages/engine`). Use English generic names.
- **S2.** A lookup may be named `id`, `custom`, `created_at`, `updated_at`, `deleted_at`, `lookups`, `inherited`, `cells` (or `title`, `revision`, `links`, `validate.ts:107-111`) and overwrite a row key. Refuse them; add `inherited` to OVERWRITTEN for columns too.
- **S3.** `seedViews` keys on name+source (`seed-missing.ts:147-191`): on a one-planning database Planning is added on activiteit (new id) and the dagplanning one removed; on a main-era step-2 database (Stefan's copy, likely) Planning on activiteit is updated in place and Dagplanning removed. Assert both shapes; seed old views by direct SQL; run `nameOrphans` after `removeUndeclared`.
- **S4.** The Task 2 scratch engine needs `--link-secret-file` (`serve.ts:211-212`; persoon declares `record_link`).
- **S5.** The Review Focus line on grid sort cites an engine-only test; the grid re-sorts by `column.text` (`grid/useTable.ts:9-21`), as for plain relations today. Drop it or test it in the grid.
- **S6.** Task 5 misses `packages/engine/test/fixtures/space-domain.ts:3,69` and `packages/engine/test/declarations.test.ts:51,105-113,131-160`, which use query `inherited`.

## Minor

- **M1.** `withLookups` also runs on raws without lookup selects (`cellsOf`/`linksOf` via `pointingAt`, `history.ts:113-114`): leave a lookup out when its key is absent from the raw.
- **M2.** `domain` before `now` breaks `packages/engine/test/filter.test.ts:17,102`; put `domain` last or list the file.
- **M3.** A boolean field comes back 0/1 from the subquery; decode by type or refuse boolean.
- **M4.** `ownBody` in `valuesOf` also applies to import and seeds; say so.
- **M5.** Line drift: `scopeOf` is `access.ts:65-71`; public-only-on-queries `views.ts:322`, for-owners `views.ts:348`.
- **M6.** Until Task 3, a view holding the lookup cannot be saved (`views.ts:40-44`); note it at the first working version.
- **M7.** Threat 3 claims the transition check but no fixture lifecycle covers `own`; use two ids for the writer refusal (99, 422) and `bad_relation`.
- **M8.** `real-data.md`: stop :4341 before `--seed-missing`, then restart.
- **M9.** OpenAPI does not list lookups; the spec does not require it.
- **M10.** Task 6 Step 1 overclaims ("each failure is a renamed flow"); a failure may be a regression. Several specs reach Planning by name without the string.

## Premises checked

All file:line premises hold except: the alias correlation (B1), grid sufficiency (B2), the fixture vocabulary (S1); line drift in M5. drizzle `select({...getTableColumns(t), ...sql})` on bun-sqlite works (probed). Removing a query leaves its SQL view in the database (`migrate.ts:66-89`), harmless. `sjabloon_toepassen` leaves `locatie_id` null, so applied rows inherit (`actions.ts:40`). The grid tree places a section-listed query without `of` generically (`ui/tables.ts:25-48`).

## Coverage

R1 Task 1 (names: S2); R2 Tasks 1, 3; R3 Task 4; R4 Tasks 2, 4 (B2); R5 Tasks 2, 5 (S3); R6 Task 5 (S6). Retarget: theatre ~62 references in 7 files + fixture; e2e 9 specs, CHECKS.md 24 rows; grid unit fixtures self-contained.

## Simplest design

Honest; no simpler design meets R4/R5. `title: { via, else }` is prior art for a one-hop inherited read.
