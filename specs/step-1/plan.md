# Step 1: Speelreeks + Sjabloon + Rol, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A planner creates a Speelreeks at a venue, applies "speeldag op locatie", and gets every day's activities with the inherited venue in one batch. One server-side undo removes them all.

**Architecture:**
- The theatre package declares Rol, Speelreeks and Sjabloon, their writers and seeds, and one action, `sjabloon_toepassen`.
- The engine gains three generic things:
  - a `batch` table;
  - `POST /batches/:id/undo`, which also serves redo;
  - declared actions behind `POST /actions/:name`, running in one transaction under one batch.
- The grid's undo becomes a batch id, and the row drawer shows a dataset's actions.
- Inheritance is resolved in SQL views only.

**Tech Stack:** Bun 1.4, Hono 4, bun:sqlite, TypeScript, React 19 grid (Vitest), Playwright e2e.

**Spec:** `specs/step-1/spec.md` (R1–R9). The parent is `docs/SPEC.md`. Carry-over: `specs/step-1/carry-over.md`.

## Global Constraints
- `packages/engine` never names a domain word. `bun run check` runs the boundary, vocabulary and staged-export checks, Biome and typecheck, and, from Task 0, the export-terms check. New engine words must be English and generic: `batch`, `action`, `undo`, `input`, `changed`.
- Domain rules live in theatre writers and SQL views, never in the engine. Engine messages are English; the grid localises codes into Dutch. Writer messages are Dutch.
- Every write goes through a writer. Seeds bypass writers, so every seeded row is also run through its writer in a test.
- Custom fields stay in `custom` JSON, and no table is made for them.
- Fixtures are invented: `@example.test` addresses, invented names. No client data in the repo; the export-terms check flags it when run before a commit (it reads the staged diff only).
- Real data stays in `~/laika-export`. The migration and parity run on a copy, never on `~/laika-export/engine.db`. Nothing is written to the Laika planning database.
- A step is done when its gate passes in a real browser. Nothing is merged without Stefan, and nothing is pushed.
- `docs/SPEC.md` changes are proposed in `specs/step-1/spec.md` and committed only after Stefan sees the diff.

## Architecture notes
- **First working version:** Task 1 (the theatre datasets and the seeded "Speelreeksen", "Rollen" and "Sjablonen" views) is the first thing Stefan can open in the grid.
- **Simplest design:** the simplest apply is the grid posting the 28 creates one by one through the existing row route. It needs no engine change, but it fails R6: there is no single transaction and no single batch, so a refusal halfway leaves half a block and one undo cannot remove them. The plan does not use it. The engine part stays the smallest that meets R7: one table, two routes and one declaration key. It reuses the import's existing "many writer-checked creates under one batch" path (`import.ts:159-167`) instead of a new write pipeline. Undo by batch replaces the client-side before-image of 81b7a4b instead of living beside it, so the table grid has one undo mechanism, not two. The matrix keeps its own client-side undo, because it re-creates deleted join records and undoing a delete stays out of R7. This is a ruling for Stefan: Ruling: matrix undo stays client-side in step 1 — moving it would lose its undo of deletes — cost if wrong: two undo mechanisms until a later step.

## Threat model
**Assets:**
- write access to every dataset;
- the integrity of Revision as the audit trail;
- other accounts' work;
- the imported history (4,802 revisions in one import batch).

**Attacks and mitigations:**
1. **An owner runs an action on a row outside its scope.** The action reads the record and its inputs through the same owner scope as `GET /rows`, and a source the owner may not see answers 404 `unknown_source`. Each create goes through `writableOf(…, 'create', actor)`, `valuesOf` with the caller's scope, and the writer's role check (403 on a dataset that declares `owners`). In theatre, no step 1 dataset declares `owners`, so an owner meets the 404.
   - Lives in: `actions.ts` `runAction`.
   - Tested by: Task 3, where an owner gets 404 on an unseen source and 403 on a refused create, and nothing is written; and Task 4, where an owner gets 404 on `sjabloon_toepassen`.
2. **Undoing someone else's batch.** The batch's `actor_id` must equal the caller's; otherwise 403 `forbidden`.
   - Lives in: `batches.ts` `undoBatch`.
   - Tested by: an editor undoing another editor's batch gets 403.
3. **Undoing the import, or an old batch, wipes data.** Only `kind` ∈ {write, action, undo} can be undone. The import's batch has kind `import`, and a batch with no `batch` row predates the table; both answer 422 `not_undoable`.
   - Lives in: `undoBatch`.
   - Tested by: an import batch and a bare revision batch are both refused, and the row count is unchanged.
4. **Undo overwrites a later change.** Each column must still hold the batch's `new` value; otherwise 409 `changed_since`, with nothing written. The check runs inside the same `.immediate()` transaction as the writes.
   - Lives in: `undoBatch`.
   - Tested by: B edits after A's write, A's undo gets 409 naming the column, and B's value stays.
5. **Double undo, or a replayed redo.** `undone_by` is set inside the transaction; a second undo gets 409 `already_undone`.
   - Lives in: `undoBatch`.
6. **Undo bypasses writer rules.** Restores go through `writer.update` and removals through `writer.delete` and `inUse`, all through `valuesOf`.
   - Lives in: `undoBatch`.
   - Tested by: Task 4, where a Toewijzing added to one of the 28 makes the apply's undo answer 409 `in_use` and all 28 stay.
7. **Action input names a record the caller may not read.** Each `input` relation is resolved through the caller's scope (404 otherwise), and the writer re-checks.
   - Lives in: `runAction`.
8. **Cross-site POST to the new routes.** `writeGuard` already covers every POST (app.ts:78).
   - Tested by: new rows in the route matrix.

**Deferrals:**
- Undoing a delete: refused, not built.
- An action's run time is unbounded, but it is bounded by the declared Speelreeks length. The theatre writer refuses a Speelreeks longer than 31 days (invented, approval pending).

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Export-terms check | `bun run check` | unit · `scripts/check-export-terms.test.ts` · `bun test scripts` | none |
| Theatre datasets, writers, seeds, views (Rol, Speelreeks, Sjabloon, relation, dagplanning/voorstellingen) | `POST/PATCH/DELETE /api/rows/*`, `GET /api/rows/dagplanning` | integration · `packages/theatre/test/step1.test.ts` · `bun test packages/theatre` | speelreeks-end-before-start, speelreeks-delete-in-use |
| Batch table, write reply, undo by batch | `POST /api/batches/:id/undo`, write replies | integration · `packages/engine/test/batches.test.ts` · `bun test packages/engine` | undo-changed-since |
| Actions | `POST /api/actions/:name`, `/api/schema` | integration · `packages/engine/test/actions.test.ts` · `bun test packages/engine` | apply-template |
| Theatre action `sjabloon_toepassen` | `POST /api/actions/sjabloon_toepassen` | integration · `packages/theatre/test/apply.test.ts` · `bun test packages/theatre` | apply-template, apply-twice |
| Grid: batch undo, action button | store, history, drawer, App | unit · `apps/grid/src/grid/store.test.ts`, `apps/grid/src/ui/history.test.ts`, `apps/grid/src/grid/Drawer.test.tsx`, `apps/grid/src/grid/Grid.test.tsx`, `apps/grid/src/ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | apply-template, undo-changed-since |
| Migration on a copy and value parity | operator command | none, proven by command output in the report | none |

## Review Focus
1. The undo check and its writes run in one `.immediate()` transaction: a write landing between check and restore must be impossible (threat 4). Test map row 3.
2. An action is the caller's write: owner scope on the record and inputs, and the writer's role check on every create (threats 1 and 7). Test map row 4.
3. `kind = import` and pre-table batches are never undoable (threat 3). Test map row 3.
4. The engine stays domain-free: no `speelreeks`, `sjabloon`, `rol`, `kleur`, `items` or `datum` in `packages/engine`. Checked by `bun run check` (vocabulary).
5. Untimed items stay untimed: an item without `start_tijd` creates `start_at` null and no `eind_at`, on its own `datum` (carry-over). Test map row 5.
6. A query-row edit's batch is the target record's. Undo from Dagplanning restores the activity (the shakeout's query-view case). Test map rows 3 and 6, plus e2e `undo-changed-since` on Dagplanning.

---

### Task 0: The export-terms check (spec R9)
**Files:**
- Create: `scripts/check-export-terms.ts`, `scripts/check-export-terms.test.ts`
- Modify: `package.json` (`check` runs it after check-staged-export)

The check reads the term list and allow list from `~/laika-export/scan` (`WT_EXPORT_SCAN` overrides). It fails on any listed term in the staged diff's added lines or file names, naming only the file and the category. Without the list it prints "skipped" and passes. The tests use invented terms: a hit, a near-miss inside a longer word, an allowed term, a file name, and a missing list.

- [ ] Write the tests, then the script; run `bun test scripts/check-export-terms.test.ts` and `bun run check`. Commit: `chore(check): staged diffs may not hold names from the export`.

### Task 1: Theatre datasets, writers, seeds and views
**Files:**
- Modify: `packages/theatre/src/datasets.ts`, `packages/theatre/src/writers.ts`, `packages/theatre/src/seed.ts`, `packages/theatre/src/index.ts`, `packages/theatre/src/queries.ts`, `packages/theatre/src/queries/dagplanning.sql`, `packages/theatre/src/queries/voorstellingen.sql`
- Create: `packages/theatre/test/step1.test.ts`
- Modify: `packages/theatre/test/legacy-post-id.test.ts` narrows to the six imported datasets (Rol, Speelreeks and Sjabloon are not imported and get no `legacy_post_id`).
- Modify (vocabulary): `kleur` and `items` become theatre column words, so the engine's own tests may not use them. In `packages/engine/test/fixture.ts`, `rows.test.ts`, `filter.test.ts` and `import.test.ts`, the custom key `kleur` becomes `colour`. In `packages/engine/test/fixtures/refusal-domain.ts`, the label `Items` becomes `Entries`.

**Interfaces:**
- Produces:
  - datasets `rol`, `speelreeks` and `sjabloon`, with columns as spec R1, R2 and R5;
  - `activiteit.speelreeks_id` with `relation: 'speelreeks'`;
  - `dagplanning` columns `locatie_id` (relation organisatie, read-only) and `locatie_bron` (text, read-only);
  - `validateItems(items: unknown): void`, which refuses in Dutch, exported from writers;
  - seeded views "Speelreeksen", "Rollen" and "Sjablonen". "Rollen" and "Sjablonen" are invented, approval pending; without them seeded rates and templates cannot be seen in the grid.

Steps (one pass; the denial tests are written first):
- [ ] Write `step1.test.ts`, on the test engine as in `writer.test.ts`. It covers:
  - a Speelreeks with `eind_datum` before `start_datum` is refused ("Einde ligt voor de start.");
  - an unknown productie, and a deleted locatie, are refused;
  - an owner gets 404 `unknown_source` on `speelreeks`, `rol` and `sjabloon` through REST (none declares `owners`), and a direct writer call with an owner actor gets 403;
  - an Activiteit write with an unknown or deleted `speelreeks_id` is refused in Dutch ("Speelreeks bestaat niet."), through a `checkLive(ctx, 'speelreeks', …)` in the Activiteit writer;
  - a Speelreeks of exactly 31 days (start to end inclusive) is accepted and one of 32 is refused;
  - deleting a Speelreeks with a live activity gets 409 `in_use`, and deleting one without gets 200;
  - a Rol `dagtarief` PATCH by an editor gets 403 with "Alleen een beheerder wijzigt tarieven.", an editor's POST with `uurtarief` gets the same 403, the same by an administrator gets 200, and an editor's `naam` edit gets 200;
  - `validateItems` refuses: a bad soort, an `offset_dag` of -1, `start_tijd` "25:00", `duur` without `start_tijd`, and a `locatie_regel` other than `speelreeks`;
  - every seeded Sjabloon passes `validateItems`, and every seeded Rol row passes the Rol writer;
  - a `kleur` that is not `#rrggbb` is refused ("Ongeldige kleur.");
  - `/api/schema` marks `sjabloon` not writable;
  - Dagplanning `locatie_bron` is `speelreeks` for an activity without a locatie inside a Speelreeks with one, and `eigen` for an activity with its own locatie;
  - voorstellingen shows the inherited venue.
- [ ] Implement as spec R1–R5. The Sjabloon writer has only `create`, so it is not writable in the grid. The invented seeds are 4 Rol rows and the "speeldag op locatie" Sjabloon (spec R5 table). The e2e uses a venue the seed already has (`seed.ts:7-16`).
- [ ] Run `bun test packages/theatre`, then `bun run gate`. Commit: `feat(theatre): Rol, Speelreeks and Sjabloon; speelreeks_id is a relation; locatie inherits in the views`.

### Task 2: Engine, the batch table, the write reply and undo by batch
**Files:**
- Create: `packages/engine/test/batches.test.ts`
- Modify (existing tests that pin exact replies, revisions or engine tables): `packages/engine/test/writes.test.ts` (the 201 body gains `revision`; create revisions gain the `id` marker), `packages/theatre/test/parity.test.ts` (an exact 201 reply), `packages/engine/test/migrate.test.ts` (the `_migrations` source list gains `batch`), `packages/engine/test/validate.test.ts` (`ENGINE_TABLES` gains `batch`), `scripts/shakeout/edit-session.lib.ts` and `edit-session.test.ts` (`revisionProblems` expects the `id` marker on a create)
- Modify: `packages/engine/src/writes.ts` (`runWrite` returns `{ id, batch_id, changed }`; `create` writes a marker revision; `undoBatch` lives here, beside the internals it needs: `inUse`, `diff`, `update`, `liveRow`, `decodeAll`, `currentOf`), `packages/engine/src/import.ts` (records kind `import`), `packages/engine/src/revision.ts` (index `['batch_id']`), `packages/engine/src/engine-tables.ts` (the `batch` table), `packages/engine/src/app.ts` (the reply's `revision` and the route), `packages/engine/src/validate.ts` (reserve the column name `revision`), `packages/engine/test/route-matrix.test.ts`

**Interfaces:**
- The batch table: an engine dataset `batch` with the integer `id` every engine table has, plus `key` (text, made unique by `checks: ['UNIQUE (key)']` as `auth-tables.ts:63` does, since `indexes` emits plain indexes: the UUID that `revision.batch_id` already stores), `actor_id`, `kind` (write · action · undo · import), `at`, and `undone_by` (text, nullable).
- The batch row is written once, by its transaction's owner: `runWrite`, `importExport`, `runAction` and `undoBatch`. `create` and `revise` only take the key.
- A create is marked: `create` also writes one revision row with field `id`, old null, new the record's id. This is the same pattern as the `deleted_at` row of a delete. Undo treats a record as created only when its batch holds that marker; an edit that filled empty cells stays an edit.
- A PATCH that changes nothing writes no batch and answers `revision: { batch_id: null, changed: [] }`; the grid pushes no undo entry.
- Produces:
  - `undoBatch(store: Store, key: string, actor: Actor): { batch_id: string; affected: { dataset: string; id: number }[] }`;
  - row replies `{ ...row, revision: { batch_id, changed: string[] } }`;
  - `POST /batches/:id/undo` with errors `forbidden` 403, `not_undoable` 422, `already_undone` 409, `changed_since` 409 (`{ dataset, id, column, label }`), `in_use` 409.

Steps:
- [ ] Write `batches.test.ts` on the fiche or test fixture domain, not theatre. It covers:
  - undo restores an update and answers the new batch;
  - undo of a create soft-deletes it;
  - undo of an undo (redo) restores the edit;
  - redo after someone changed the row gets 409 `changed_since`;
  - B's later edit makes A's undo 409 `changed_since`, naming the column, and B's value stays;
  - another account's batch gets 403;
  - an import batch, and a batch with no `batch` row, get 422 and nothing changes;
  - a second undo gets 409 `already_undone`;
  - a delete batch gets 422;
  - an owner undoing its own batch on a source it can no longer see gets 404 `unknown_source`;
  - the reply's `revision.changed` lists exactly the columns the writer changed, including derived ones;
  - a declared column named `revision` is refused at validation;
  - undo of an edit that filled an empty cell restores null and keeps the record;
  - undo of a create on a dataset whose writer has no `delete` answers 405 `read_only` and changes nothing;
  - undo of a batch that created a parent and then a child removes the child first (reverse revision order);
  - a PATCH with no change answers `batch_id: null` and records no batch;
  - redo of an undo that removed created records answers 422 `not_undoable` (it holds deletes).
- [ ] Implement. Undo runs in one `.immediate()` transaction:
  1. Load the batch's revisions, grouped by record.
  2. Check that every column's current value equals `new`.
  3. Walk records in reverse revision order. A created record that is already gone (soft-deleted since) counts as changed: 409 `changed_since` naming `deleted_at`. A record with the create marker goes through `writableOf(…, 'delete', actor)`, `writer.delete` and `inUse`. Otherwise its `old` values go through `writableOf(…, 'update', actor)`, `valuesOf` with the caller's scope, and the writer's `update`.
  4. Record a new batch (kind `undo`) and set `undone_by`.
- [ ] Add route-matrix rows for `POST /batches/:id/undo`, per role and session-less.
- [ ] Run `bun test packages/engine`, then `bun run gate`. Commit: `feat(engine): batches, the write reply's changed columns, and undo by batch`.

### Task 3: Engine actions
**Files:**
- Create: `packages/engine/src/actions.ts`, `packages/engine/test/actions.test.ts`
- Modify: `packages/engine/src/declare.ts` (`ActionDecl` and `Domain.actions`), `packages/engine/src/validate.ts`, `packages/engine/src/app.ts` (route and `/schema` `actions`), `packages/engine/test/route-matrix.test.ts`

**Interfaces:**
- Consumes: the batch recording from Task 2.
- Produces:
  - `interface ActionDecl { label: string; on: string; input: Record<string, { relation: string; label: string }>; run(record: Values, input: Record<string, Values>, ctx: WriteContext): { dataset: string; values: Values }[] }`;
  - `POST /actions/:name` with body `{ id: number, input: Record<string, number> }`, answering 201 `{ batch_id, created: { dataset: string; id: number }[] }`;
  - `/schema` sources gain `actions: { name, label, input }[]`.

Steps:
- [ ] Write `actions.test.ts` with a test-domain action. It covers:
  - three creates land in one batch of kind `action`;
  - a writer refusal on the third create rolls back all three;
  - an owner gets 404 `unknown_source` on an action whose dataset it cannot see, and, on a test dataset that declares `owners`, 403 `forbidden` when a create targets a dataset its writer refuses to owners; nothing is written either way;
  - an unknown action gets 404;
  - an input naming an unreadable record gets 404;
  - undo by that batch removes all three;
  - `/schema` lists the action on its dataset;
  - validation refuses an action `on` a dataset without a writer.
- [ ] Implement it under one batch, reusing `contextOf`, `valuesOf` and `create`. Unlike the import, use the caller's scope, never `'all'`:
  - the record is read through `visibleSource` and `scopeOf(actor, source)`;
  - each input relation is resolved the same way;
  - each create goes through `writableOf(domain, dataset, 'create', actor)` and `valuesOf(…, scopeOf(actor, dataset))`.
- [ ] Add route-matrix rows. Run `bun test packages/engine`, then `bun run gate`. Commit: `feat(engine): declared actions run as the caller in one batch`.

### Task 4: The theatre action `sjabloon_toepassen`
**Files:**
- Create: `packages/theatre/src/actions.ts`, `packages/theatre/test/apply.test.ts`
- Modify: `packages/theatre/src/index.ts`

**Interfaces:**
- Consumes: `ActionDecl` from Task 3; `validateItems` and the datasets from Task 1.
- Produces: the action `sjabloon_toepassen` on `speelreeks`, label "Sjabloon toepassen", with input `sjabloon_id` (relation `sjabloon`, label "Sjabloon").

Steps:
- [ ] Write `apply.test.ts`. It covers:
  - a 4-day Speelreeks gets 28 activities; for each day, 6 are timed at 13:00, 14:00, 17:30, 18:30, 20:00 and 21:15 with ends from `duur`, and Overnachting has `start_at` null and `eind_at` null;
  - `datum` per day, `productie_id` and `speelreeks_id` from the reeks, `locatie_id` null, `status` optie;
  - Dagplanning `locatie_bron` is `speelreeks` for all 28;
  - one batch;
  - a second apply is refused with the R6 message;
  - an `offset_dag` of 1 on the last day lands the day after `eind_datum`;
  - an owner gets 404 `unknown_source` (speelreeks declares no `owners`);
  - after a Toewijzing is added to one of the 28, undoing the apply answers 409 `in_use`, and all 28 stay live.
- [ ] Implement `run`:
  - refuse when the reeks has live activities;
  - otherwise build the creates per day and per item; the Activiteit writer derives `plandag`.
- [ ] Run `bun test packages/theatre`, then `bun run gate`. Commit: `feat(theatre): apply a Sjabloon to a Speelreeks, every day, in one batch`.

### Task 5: The grid, batch undo and the action button
**Files:**
- Modify: `apps/grid/src/grid/store.ts`, `apps/grid/src/grid/hooks.ts`, `apps/grid/src/api.ts`, `apps/grid/src/engine.ts`, `apps/grid/src/i18n.ts`, `apps/grid/src/grid/Drawer.tsx`, `apps/grid/src/grid/Grid.tsx`, `apps/grid/src/ui/App.tsx`, `apps/grid/src/types.ts`, `apps/grid/src/matrix/store.ts` and `apps/grid/src/matrix/hooks.ts` (they unwrap `.row` from the new `{ row, batch }` return), `e2e/step-0e.spec.ts` (its undo flows wait for `POST /batches/:id/undo` instead of a PATCH, and `undo-time-on-untimed` and `undo-day-line-move` assert the restored cells and the reload instead of a body, so the gate stays green in this task)
- Create: `apps/grid/src/ui/history.ts`, `apps/grid/src/ui/history.test.ts`
- Tests: `apps/grid/src/grid/store.test.ts`, `apps/grid/src/grid/Drawer.test.tsx`, `apps/grid/src/grid/Grid.test.tsx` (its undo tests at :262, :664, :683 expect `POST /batches/<id>/undo` instead of the inverse write), `apps/grid/src/ui/App.test.tsx` (the history survives a reload and a navigation)

**Interfaces:**
- Consumes: write replies `revision`, `POST /batches/:id/undo`, `/schema` `actions`.
- Produces:
  - `toRow` destructures `revision` out of a row reply, so it never lands in `row.fields`;
  - `api.update` and `api.create` return `{ row: Row; batch: string | null }`; `updateThrough` keeps the PATCH reply's `revision.batch_id`;
  - one undo history per browser tab, held at app level (`apps/grid/src/ui/history.ts`), not in a view's store, so it survives a view's reload and navigation between views. Its entries are `{ batch: Promise<string | null>; model: string; id: number | null }`. An entry is pushed at paint, so an undo pressed before the answer waits for the batch. It is dropped when the edit is refused, when the reply's `batch_id` is null, and when the server answers `unknown_record` for the entry's row. The matrix keeps its own (ruling above).
  - `store.undo()` and `store.redo()` delegate to the history, and `StoreState.canUndo` and `canRedo` read its length, so Grid's keyboard effect (`Grid.tsx:127-128`) and the Toast need no change. After an applied action, the Toast offers undo through a notice (`notify` with an action, as `App.tsx:241` does).
  - `undo()` and `redo()` call `POST /batches/:id/undo`. Afterwards, when `entry.model` is the open view's model, the view re-reads the entry's row (`GET /rows/<model>?filter={"id":…}`) and hands it to a new store method `replace(row)`, which repaints it and updates `confirmed` (`store.ts:126`). Otherwise, or for an action (no row), the open view reloads through a reload counter in App's load effect deps (`App.tsx:181-196`);
  - `api.runAction(name, id, input)`;
  - Dutch errors: `changed_since` → "{label} is intussen gewijzigd; ongedaan maken kan niet." and `already_undone` → "Dit is al ongedaan gemaakt.".

Steps:
- [ ] Tests:
  - undo calls `POST /batches/<batch of the edit>/undo` and repaints by re-reading the affected rows;
  - a redo answered `not_undoable` drops the redo entry and shows the localised message;
  - redo undoes the undo batch;
  - an undo pressed before the edit's answer waits for its batch id;
  - `changed_since` keeps the entry, shows the Dutch message naming the column's label, and the row keeps the server's value;
  - a query-row edit's batch comes from the PATCH reply in `updateThrough`;
  - the drawer shows "Sjabloon toepassen" with a Sjabloon picker on a Speelreeks row only;
  - an applied action becomes one undo entry, and the views reload;
  - the entry survives the view's reload and a navigation Speelreeksen → Dagplanning → Speelreeksen, and Ctrl+Z there undoes the apply.
- [ ] Remove the 81b7a4b before-image widening (`widen`, `Written.data`, the `editable` option and the multi-column `updateThrough`), keeping `updateThrough`'s single-target PATCH.
- [ ] Run `cd apps/grid && bunx vitest run`, then `bun run gate`. Commit: `feat(grid): undo by batch on the server; a dataset's actions in the drawer`.

### Task 6: The step 1 gate in the browser
**Files:**
- Create: `e2e/step-1.spec.ts`

Flows, all on invented fixtures:
- **apply-template:** create a Speelreeks Mon–Thu at the invented venue, apply "speeldag op locatie" from the drawer, then in Dagplanning check that 28 rows appear on the 4 days, at the pattern's times, with Overnachting untimed and `locatie_bron` speelreeks. In Dagplanning, click a cell so the grid has focus, then one Ctrl+Z (the tab's undo history holds the apply) removes all 28. Reload, and none are back. The Revision rows of the 28 share one batch (read through `GET /api/revisions`).
- **apply-twice:** the second apply shows the R6 message.
- **speelreeks-delete-in-use:** delete in the drawer gets the in-use message.
- **speelreeks-end-before-start:** the Dutch refusal on the cell.
- **undo-changed-since**, on Dagplanning: two browser contexts: A edits a cell, B edits the same cell, A's Ctrl+Z shows the Dutch message naming the column, and B's value stays after a reload.

Steps:
- [ ] Write the flows, run `bunx playwright test e2e/step-1.spec.ts`, then `bun run gate` three times. Commit: `test(e2e): the step 1 gate`.

### Task 7 (operator): migration on a copy, parity and shakeout
- [ ] `cp ~/laika-export/engine.db ~/laika-export/step1-copy.db` (0600), then `bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step1-copy.db --create-admin <existing admin email>`. The expected output is a rebuild of `activiteit`, the new tables created, and `.pre-migrate` written.
- [ ] `bun scripts/shakeout/value-parity.ts --engine ~/laika-export/step1-copy.db --out-dir ~/laika-export/shakeout/step1`: 0 mismatches. Then data-profile and edit-session on a copy of the copy.
- [ ] Before that run, `scripts/shakeout/edit-session.ts` changes in two ways, with a test in `edit-session.test.ts`:
  - a dataset with no rows is reported as "skipped: no rows", not as a problem;
  - its undo step uses `POST /batches/:id/undo` instead of replaying PATCHes.
  Commit the script change (code only): `test(shakeout): the edit session skips empty datasets and undoes by batch`.
- [ ] Report the migration result and the four reports, by severity, counts only, to Stefan. No commit with names. The report also carries:
  - R4's finding: a greyed inherited display needs a declared engine hint;
  - the proposed `docs/SPEC.md` diff from the spec, shown before any commit.
