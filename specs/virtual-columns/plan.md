# Step 2b: Lookup Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dataset declares lookup columns, plain and inherited, that read, filter, sort, group and (inherited) edit like columns, so the one Planning view lives on Activiteiten and the dagplanning query goes.

**Architecture:** A `lookups` key beside `columns` on `DatasetDecl`, so DDL, import, owner and public projections never see a lookup. Each lookup is one correlated subquery (`engine/src/lookups.ts`), added to the row SELECT and resolved by filter, sort and group. Writes translate an inherited lookup to its `own` column at the top of `valuesOf`, so the writer and every check still run. The grid maps served lookups to fields. Theatre moves Mensen and the venue onto `activiteit`, puts Planning there and removes `dagplanning`.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, TypeScript; Bun tests (engine, theatre), Vitest (grid), Playwright (e2e).

**Spec:** `specs/virtual-columns/spec.md`. Design: `specs/virtual-columns/findings.md`. Spec of record: `docs/SPEC.md` (117e29a, Dataset row and step 2b).

**First working version:** Task 2. An Activiteiten view shows "Locatie" (via Tourstop, greyed when inherited) and Mensen in the running grid. Task 1 is the engine it stands on.

**Simplest design:** Keep `dagplanning` and relabel it (the parked `feature/one-planning`). Stefan rejected that: a new view on Activiteiten stays a plain grid ("this is not it"). The next simplest is a theatre-only SQL VIEW per dataset. That is still a second source, which is the confusion he named. The plan instead adds the narrowest engine shape that removes the second source:
- one hop;
- one subquery per lookup;
- no new table, route or column type;
- the write is a key rename before the existing checks.

Rollups and write-through edits are out until a screen needs them.

## Global Constraints

- `packages/engine` knows no domain word and imports no domain package (`bun run check`). The engine fixture for lookups uses invented generic names.
- No client data; `bun scripts/check-export-terms.ts` on every commit; commit by path, never `git add -A`.
- Dutch for user-facing strings (`apps/grid/src/i18n.ts`); English, generic names in the engine.
- `docs/SPEC.md` is already edited (117e29a). A task that finds the spec cannot hold stops and says why.
- The planner session on `~/laika-export/step2-copy.db` (engine :4341, grid :5181) is Stefan's. Never touch :4330/:5180 or the copy. After merge, Stefan runs `--seed-missing` on the copy himself (Task 5 prints the command).
- The gate is `bun run gate` (check, engine and theatre tests, grid vitest, Playwright). Machine load makes single e2e and vitest tests flake; rerun a failing test alone before calling it red.

## Threat model

Assets: fields of related records; the write path's checks.

| # | Threat | Mitigation | Test |
|---|---|---|---|
| 1 | An owner account reads a related record's field through a lookup. Owners otherwise read titles only. | Validation refuses `lookups` on a dataset with `owners`. Only owners have a scope other than `all` (`access.ts:63-69`). Views for owners and public views exist only on queries (`views.ts:311`, owner-views), so no lookup can be projected there. | T1 `refuses lookups on an owned dataset` |
| 2 | A lookup shows a soft-deleted related row's value. | The subquery requires `deleted_at IS NULL`. | T1 `a deleted target reads null` |
| 3 | An edit through an inherited lookup skips the writer, the transition check or the relation check. | `valuesOf` renames the key before `cutBody`, so everything after it (`writes.ts:466-484`) runs on `own`. Actions' updates take the same path. | T4 `inherited write goes through the writer` |
| 4 | SQL injection through a lookup key. | A key from a request only selects a declared lookup. Identifiers are code, asserted by `defineDataset`'s `IDENTIFIER`. Values are bound. | T3 `unknown key stays 400` |

## Review Focus

- A relation lookup whose target row was deleted: null value, no title, filter `$exists false` matches it (T1, T3).
- Sorting on a lookup with nulls: SQLite sorts nulls first ascending. The grid's own sort must not reorder them differently (T3 `sort on a lookup`).
- A write naming both `locatie` and `locatie_id` is 400 and writes nothing (T4).
- A step-2 database after `--seed-missing`:
  - the Planning system view moves onto activiteit;
  - the dagplanning system view is removed;
  - a user view on dagplanning is named and kept (T5).
- The one-hop rule: a lookup whose `field` is another lookup's name is refused, since `field` must be a column of the target (T1).

---

### Task 1: Engine — declare, validate and read lookups

**Files:**
- Modify: `packages/engine/src/declare.ts` (types; `defineDataset` asserts lookup names)
- Create: `packages/engine/src/lookups.ts`
- Modify: `packages/engine/src/validate.ts` (`checkLookups`, called from `validateDomain`'s dataset loop)
- Modify: `packages/engine/src/rows.ts` (`readRows`, `withLookups`, `EngineRow`), `packages/engine/src/writes.ts:565-570` (`rowOf` selects lookups too)
- Modify: `packages/engine/src/app.ts` (`/schema` serves `lookups`)
- Create: `packages/engine/test/fixtures/lookup-domain.ts`, `packages/engine/test/lookups.test.ts`

**Interfaces:**
- Produces, in `declare.ts`:
  - `interface LookupDecl { label: string; via: string; field: string; own?: string; from?: string }`
  - `DatasetDecl.lookups?: Record<string, LookupDecl>`
- Produces, in `lookups.ts`:
  - `lookupOf(source: Source, key: string): LookupDecl | undefined`: undefined for a query or an undeclared key.
  - `targetOf(source: DatasetDecl, lookup: LookupDecl): string`: `source.columns[lookup.via].relation`.
  - `lookupColumn(domain: Domain, source: DatasetDecl, name: string): ColumnDecl`: the target's `field` declaration with `nullable: true`, plus `readonly: true` unless `own`.
  - `lookupValue(source: DatasetDecl, name: string, table: SQLiteTable): SQL`: `(SELECT "t"."field" FROM "target" AS "t" WHERE "t"."id" = <table.via> AND "t"."deleted_at" IS NULL)`, wrapped in `COALESCE(<table.own>, …)` when `own`. Alias the inner table so a self-relation is unambiguous; use `sql.identifier` for names.
  - `lookupInherited(source: DatasetDecl, name: string, table: SQLiteTable): SQL`: `(<own> IS NULL AND <subquery> IS NOT NULL)`.
  - `lookupSelect(source: Source, table: SQLiteTable): Record<string, SQL>`: `{ [name]: value }`, plus `{ ['inherited:' + name]: inheritedFlag }` per inherited lookup; `{}` for a query.
  - `EngineRow.inherited?: string[]`: present when the source declares an inherited lookup.
- Produces, on `/schema`: `sources[name].lookups?: Record<string, ColumnDecl & { inherited?: true; from?: string }>`. Type, options, tones and relation come from `lookupColumn`.

- [ ] **Step 1: The fixture.** `lookup-domain.ts`:
  - `groep { naam }`, `item { naam, groep_id → groep }`, `regel { naam, item_id → item, groep_id → groep nullable }`;
  - on `item`: `lookups.groep_naam = { label: 'Groepnaam', via: 'groep_id', field: 'naam' }`;
  - on `regel`: `lookups.groep = { label: 'Groep', via: 'item_id', field: 'groep_id', own: 'groep_id', from: 'Item' }`;
  - writers that accept every create and update;
  - seeds: two groeps; an item in groep 1; two regels, one with its own groep 2, one without.
- [ ] **Step 2: Failing tests** in `lookups.test.ts`, through the app (`createEngine` + an editor session, as `links.test.ts` does):
  - `a plain lookup reads the related field`: `GET /rows/item` → `rows[0].groep_naam === 'Een'`.
  - `an inherited lookup reads own, else the relation`: the regel with its own groep → `groep === 2` and `inherited` lacks `'groep'`. The other → `groep === 1`, `inherited` contains `'groep'`, and `lookups.groep.title === 'Een'`.
  - `a deleted target reads null`: soft-delete the item (direct SQL `UPDATE item SET deleted_at = …`) → the inheriting regel's `groep === null`, `lookups.groep === null`, `inherited` lacks `'groep'`.
  - `schema serves lookups`: `sources.regel.lookups.groep` has `type: 'integer'`, `relation: 'groep'`, `inherited: true`, `from: 'Item'`, and no `readonly`. `sources.item.lookups.groep_naam` has `readonly: true`. `sources.regel.columns` has no `groep`.
  - `a write reply carries the lookup`: `PATCH /rows/regel/<own>` with `{ naam: 'x' }` → reply `groep === 2`.
- [ ] **Step 3: Failing validation tests** in `lookups.test.ts`. Each mutated copy of the fixture is refused with a `DomainError` naming the bad key:
  - `via` not a relation;
  - `field` not a target column;
  - `field` of type json;
  - `own` of another type or another relation;
  - a lookup named like a column or a link;
  - `refuses lookups on an owned dataset` (`owners: { owner: 'id' }`).
- [ ] **Step 4: Run** `bun test packages/engine/test/lookups.test.ts`. Expected: FAIL.
- [ ] **Step 5: Implement.**
  - `lookups.ts` as in Interfaces.
  - `checkLookups(domain, dataset)` in `validate.ts`.
  - `readRows` and `rowOf` select `{ ...getTableColumns(table), ...lookupSelect(source, table) }`.
  - `withLookups` copies each lookup value onto the row, adds relation titles for relation-typed lookups through `titlesOf`, and builds `inherited` from the `inherited:` flags. Flags are never copied onto the row.
  - `/schema` adds `lookups` for a dataset that declares any.
- [ ] **Step 6: Run** `bun test packages/engine` and `bun run check`. Expected: PASS, no existing test changed.
- [ ] **Step 7: Commit** `feat(engine): lookup columns on datasets — plain and inherited, read on every row and served in /schema`.

### Task 2: Grid and theatre — the lookup shows on every Activiteiten view

**Files:**
- Modify: `apps/grid/src/engine.ts` (`EngineSource.lookups`, `fieldOf` for lookups, `modelOf` fields, `toRow` takes `inherited` off the fields), `apps/grid/src/types.ts` (`Field.via?: string`, `Row.inherited?: string[]`), `apps/grid/src/grid/columns.ts:208-211` (a column's `via` from `field.via`)
- Modify: `packages/theatre/src/datasets.ts` (`activiteit`: `links.mensen`, `lookups.locatie`)
- Test: `apps/grid/src/engine.test.ts`, `apps/grid/src/grid/cells/Inherited.test.tsx`, `packages/theatre/test/lookups.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `/schema` `lookups` and the row's `inherited`.
- Produces:
  - `Field.via?: string`: the word for where an inherited value comes from.
  - `Row.inherited?: string[]`.
  - `Column.via` keeps its type `(row: Row) => string`: `field.via` when `row.inherited` contains the key, else `''`.
  - The old `Field.inherited` path stays until Task 5.

- [ ] **Step 1: Failing tests.**
  - `engine.test.ts`, `toSchema maps a served lookup to a field`: a source with `lookups.locatie` (`relation: 'organisatie'`, `inherited: true`, `from: 'Tourstop'`) yields `models.x.fields.locatie` with `type: 'relation'`, `via: 'Tourstop'` and no `readonly`. A plain lookup yields `readonly: true`.
  - `toRow keeps inherited off the fields`: `fields.inherited` is undefined and `row.inherited` equals `['locatie']`.
  - `Inherited.test.tsx`, `an inherited lookup reads via its word`: render the cell for a row with `inherited: ['locatie']`. It shows the title greyed with "via Tourstop". A row without the key shows it solid.
  - Theatre `lookups.test.ts`, on the theatre seed through the app:
    - `activiteit reads its venue through the tourstop`: an activity with a speelreeks and no own locatie has `locatie` equal to the speelreeks's `locatie_id`, and `inherited` contains `'locatie'`;
    - `mensen is a link on activiteit`: `/schema` `sources.activiteit.links.mensen.dataset === 'toewijzing'`.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test -- engine Inherited` and `bun test packages/theatre/test/lookups.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces. The `links.mensen` declaration is the one in `queries.ts` dagplanning, moved onto `activiteit`; dagplanning keeps its own until Task 5.
- [ ] **Step 4: Run** the same commands, then `bun run gate`. Expected: PASS.
- [ ] **Step 5: Look at it.** Start a scratch engine and grid on a fresh database: `bun packages/engine/src/serve.ts --domain @worktable/theatre --db <scratch>/t.db --fresh --port 4351` and vite on 5191 against it. Open Activiteiten, add "Locatie" and "Mensen" from the column picker, and take one screenshot into `specs/virtual-columns/`.
- [ ] **Step 6: Commit** `feat(grid,theatre): Activiteiten carries Mensen and the venue through its tourstop on every view`.

### Task 3: Filter, sort, group and saved views on a lookup

**Files:**
- Modify: `packages/engine/src/filter.ts` (`resolveKey` takes the domain and resolves a lookup), `packages/engine/src/rows.ts` (`whereOf`, `orderOf(source, table, params)`, `readIds` takes the domain), `packages/engine/src/params.ts:79` and `packages/engine/src/views.ts:40` (`hasColumn` accepts `lookupOf`), `packages/engine/src/history.ts:85` and `views.ts:103` (pass the domain)
- Test: `packages/engine/test/lookups.test.ts`

**Interfaces:**
- Consumes: `lookupOf`, `lookupValue`, `lookupColumn` (Task 1).
- Produces:
  - `filterWhere(input, source, table, domain, now?)`, with the domain added before `now`;
  - `readIds(db, domain, source, params, scope)`.

- [ ] **Step 1: Failing tests** in `lookups.test.ts`:
  - `filter on a lookup`: `GET /rows/regel?filter={"groep":1}` returns only the inheriting regel; `{"groep":{"$exists":false}}` after deleting the item returns it.
  - `filter on a text lookup`: `GET /rows/item?filter={"groep_naam":{"$like":"Ee"}}` returns the item.
  - `sort on a lookup`: `?sort=-groep` puts the own-groep-2 regel first.
  - `group on a lookup`: `?group=groep` returns 200, in group order.
  - `a saved view on a lookup`: `POST /views` with `filters: {groep: 1}`, `sort: ['groep']`, `group_by: 'groep'` and `visible_fields: ['groep']` is accepted, and its rows match.
  - `unknown key stays 400`: `?filter={"nope":1}` → 400 `bad_filter`; `?sort=nope` → 400 `bad_sort`.
  - `history filters on a lookup`: `GET /history/regel?filter={"groep":1}` → 200.
- [ ] **Step 2: Run** `bun test packages/engine/test/lookups.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `resolveKey` returns `{ expr: lookupValue(...), custom: null, numeric, type }`, with the type from `lookupColumn`.
  - `orderOf` maps a lookup key to `lookupValue`.
  - Both `hasColumn`s accept `lookupOf(source, key)`.
  - Thread the domain to every `filterWhere` and `readIds` caller.
- [ ] **Step 4: Run** `bun test packages/engine` and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): a lookup filters, sorts, groups and saves in a view like a column`.

### Task 4: Writing through an inherited lookup

**Files:**
- Modify: `packages/engine/src/lookups.ts` (`ownBody`), `packages/engine/src/writes.ts:467` (`valuesOf` calls it first)
- Modify: `apps/grid/src/engine.ts:386-394` (`toEngineData` reads a lookup's declaration for `wireValue`); a field with `via` is editable when the dataset is writable
- Test: `packages/engine/test/lookups.test.ts`, `apps/grid/src/api.test.ts`, `packages/theatre/test/lookups.test.ts`

**Interfaces:**
- Produces: `ownBody(dataset: DatasetDecl, body: Values): Values`.
  - It renames each inherited lookup key to its `own` key and drops plain lookup keys.
  - A body naming both an inherited lookup and its `own` is 400 `bad_value`, with the message `"<name>" and "<own>" name one value`.

- [ ] **Step 1: Failing tests.**
  - Engine:
    - `inherited write lands on own`: `PATCH /rows/regel/<inheriting>` with `{ groep: 2 }` → the reply has `groep === 2` and no `'groep'` in `inherited`, and `GET /revisions/regel/<id>` shows `groep_id`.
    - `null inherits again`: then `{ groep: null }` → `groep === 1`, and `inherited` contains `'groep'`.
    - `inherited write goes through the writer`: a fixture writer that refuses `groep_id === 99` gives 422 for `{ groep: 99 }`, and a nonexistent groep gives 400 `bad_relation`.
    - `the related row is untouched`: after the write, `GET /rows/item` shows the item's `groep_id` unchanged.
    - `both names are 400`: `{ groep: 2, groep_id: 2 }` → 400, nothing written.
    - `a plain lookup is dropped`: `PATCH /rows/item/1` with `{ groep_naam: 'x' }` → 200 with `changed: []`.
  - Grid `api.test.ts`, `an inherited lookup is written on the dataset`: editing `locatie` to `[7]` sends `PATCH /rows/activiteit/<id>` with `{ locatie: 7 }`.
  - Theatre, `overriding the venue leaves the tourstop`: after `PATCH /rows/activiteit/<a>` with `{ locatie: <org> }`, the speelreeks's `locatie_id` and a sibling activity's `locatie` are unchanged.
- [ ] **Step 2: Run** the three suites. Expected: FAIL.
- [ ] **Step 3: Implement** `ownBody` as the first line of `valuesOf`, and the grid change.
- [ ] **Step 4: Run** `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine,grid): an edit to an inherited lookup sets the record's own value; clearing it inherits again`.

### Task 5: One Planning on Activiteiten; queries are overviews

**Files:**
- Modify: `packages/theatre/src/seed.ts` (Planning on `activiteit`), `packages/theatre/src/queries.ts` and `src/index.ts` (remove `dagplanning`, drop `of` from the remaining queries, add the section `{ label: 'Overzichten', sources: ['productie_dag', 'voorstellingen', 'mijn_producties'] }`); delete `packages/theatre/src/queries/dagplanning.sql`
- Modify: `packages/engine/src/validate.ts:337-348` (a section may list a query without `of`), `validate.ts:358-365` and `declare.ts:40-41` (remove `inherited`), `packages/engine/src/seed-missing.ts` (`nameOrphans`)
- Modify: `apps/grid/src/types.ts:28`, `apps/grid/src/engine.ts:18,150`, `apps/grid/src/grid/columns.ts:167-172,208-211` (remove the query `inherited` path)
- Create: `specs/virtual-columns/real-data.md` (Stefan's commands for the copy)
- Test: `packages/theatre/test/seed-missing.test.ts`, `packages/engine/test/seed-missing.test.ts`, `packages/engine/test/validate.test.ts`, theatre and grid tests that named dagplanning or query `inherited`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - the seeded view `{ name: 'Planning', source_type: 'dataset', source: 'activiteit', skin: 'table', filters: { plandag: { $period: 'week' } }, sort: ['start_at'], group_by: 'plandag', visible_fields: ['start_at', 'omschrijving', 'soort', 'locatie', 'mensen', 'status'] }`, first in `views`;
  - `--seed-missing` lines `view "<name>" (<source>) has no source any more, left alone`.

- [ ] **Step 1: Failing tests.**
  - Theatre `seed-missing.test.ts`, on a database seeded from the one-planning seeds (Planning on dagplanning, plus a user view on dagplanning):
    - `--seed-missing` moves Planning onto activiteit (updates it, or adds it and removes the old one, whichever `seedViews` does by name and source);
    - it removes the dagplanning system view;
    - it names the user view with the orphan line and keeps it live.
  - Engine `validate.test.ts`: `a section lists a query without of`, and `a section listing a query with of is refused`.
  - Engine `seed-missing.test.ts`: `names a view whose source is undeclared`.
  - Theatre: `no dagplanning source` (`/schema` has no `dagplanning`), and `queries sit under Overzichten`.
- [ ] **Step 2: Run** `bun test packages`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Remove dagplanning and query `inherited` from theatre, engine and grid.
  - `Inherited.test.tsx` and `engine.test.ts` cases for the query shape are deleted, since the lookup cases from Task 2 replace them.
  - Retarget theatre tests that read `dagplanning` (`grid-ux.test.ts`, `writer.test.ts`, `step1.test.ts`, `history.test.ts`, `apply.test.ts`, `fixtures/step-1.sql`) to `activiteit` with `locatie`.
  - Write `real-data.md`:
    1. back up the copy (mode 0600);
    2. run `bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step2-copy.db --seed-missing`;
    3. read its view lines;
    4. restart :4341.
- [ ] **Step 4: Run** `bun test packages scripts`, `bun run --filter @worktable/grid test` and `bun run check`. Expected: PASS. `bun run parity` on the e2e fixture still passes (75b4e36 counts from activiteit).
- [ ] **Step 5: Commit** `feat(theatre,engine): one Planning on Activiteiten with Mensen and the inherited venue; dagplanning and query inheritance removed; queries under Overzichten`.

### Task 6: The browser suites follow Planning on Activiteiten

**Files:**
- Modify: e2e specs that name `dagplanning` (`e2e/dagplanning.spec.ts`, `grid-ux.spec.ts`, `step-1.spec.ts`, `react-aria.spec.ts`, `toolbar.spec.ts`, `title-line.spec.ts`, `rail-tree.spec.ts`, `ui-fit.spec.ts`, `step-0b/0d/0e.spec.ts`, `smoke/dagplanning.spec.ts`, `smoke/grid-toolbar.spec.ts`, `smoke/step-1.spec.ts`), `specs/CHECKS.md` (the rows those name)
- Modify: `apps/grid/src/ui/*.test.tsx`, `api.test.ts`, `store.test.ts`, `export/ics.test.ts` only where a fixture schema needs a `dagplanning` source that no longer exists for the behaviour under test

**Interfaces:**
- Consumes: Task 5's seeded Planning. Flows address the view by its name "Planning" (as 18405aa already does). A URL `#view=dagplanning` becomes the Planning view's key; an API path `/api/rows/dagplanning` becomes `/api/rows/activiteit`; the column "Locatie van" (`locatie_bron`) becomes the inherited cell's "via Tourstop".

- [ ] **Step 1:** Run `bunx playwright test` and list every failure. Each one is a flow that named the removed query.
- [ ] **Step 2:** Retarget each flow to Planning on activiteit, keeping what it asserts. A flow that asserted only the query itself becomes `dagplanning-is-gone @e2e` (the rail shows no Dagplanning; the queries sit under Overzichten). That covers `query-views-under-model`, `owner-has-no-dagplanning` and `dagplanning asks for a session`.
- [ ] **Step 3:** Update the matching `specs/CHECKS.md` rows' names, commands and files. Keep the count unless a flow became `dagplanning-is-gone`.
- [ ] **Step 4: Run** `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `test(e2e): flows follow Planning on Activiteiten`.

## Test map

| Unit | Seam | Tier | File | Command | e2e flows (shake-out) |
|---|---|---|---|---|---|
| T1 lookups read | `GET /rows`, `GET /schema`, PATCH reply | engine integration | `packages/engine/test/lookups.test.ts` | `bun test packages/engine/test/lookups.test.ts` | — |
| T1 validation | `validateDomain` | engine unit | same | same | — |
| T2 grid fields | `toSchema`, `toRow`, cell render | vitest | `apps/grid/src/engine.test.ts`, `grid/cells/Inherited.test.tsx` | `bun run --filter @worktable/grid test` | new view offers Locatie and Mensen |
| T2 theatre | `GET /rows/activiteit` | theatre integration | `packages/theatre/test/lookups.test.ts` | `bun test packages/theatre` | — |
| T3 filter/sort/group | `GET /rows`, `POST /views`, `GET /history` | engine integration | `packages/engine/test/lookups.test.ts` | as T1 | filter, sort, group on Locatie |
| T4 writes | `PATCH /rows`, grid `updateRow` | engine integration, vitest | `lookups.test.ts`, `apps/grid/src/api.test.ts` | as T1, grid | override and clear the venue |
| T5 one Planning | `--seed-missing`, `validateDomain`, `/schema` | theatre and engine integration | `seed-missing.test.ts`, `validate.test.ts` | `bun test packages` | no Dagplanning; Overzichten |
| T6 suites | browser | Playwright | `e2e/*.spec.ts` | `bunx playwright test` | — |

The step-2b gate flows (spec "Done when" 1-4) are written by `/shakeout` after the review, per the house process.
