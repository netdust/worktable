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

**Spec:** `specs/step-1/spec.md` (R1–R8). The parent is `docs/SPEC.md`. Carry-over: `specs/step-1/carry-over.md`.

## Global Constraints
- `packages/engine` never names a domain word. `bun run check` runs the boundary, vocabulary, staged-export and export-terms checks, plus Biome and typecheck. New engine words must be English and generic: `batch`, `action`, `undo`, `input`, `changed`.
- Domain rules live in theatre writers and SQL views, never in the engine. Engine messages are English; the grid localises codes into Dutch. Writer messages are Dutch.
- Every write goes through a writer. Seeds bypass writers, so every seeded row is also run through its writer in a test.
- Custom fields stay in `custom` JSON, and no table is made for them.
- Fixtures are invented: `@example.test` addresses, invented names. No client data in the repo; the export-terms check enforces it.
- Real data stays in `~/laika-export`. The migration and parity run on a copy, never on `~/laika-export/engine.db`. Nothing is written to the Laika planning database.
- A step is done when its gate passes in a real browser. Nothing is merged without Stefan, and nothing is pushed.
- `docs/SPEC.md` changes are proposed in `specs/step-1/spec.md` and committed only after Stefan sees the diff.

## Architecture notes
- **First working version:** Task 1 (the theatre datasets and the seeded "Speelreeksen", "Rollen" and "Sjablonen" views) is the first thing Stefan can open in the grid.
- **Simplest design:** the simplest apply would be a theatre-only script that inserts rows. It would bypass writers, Revision batches and undo, which R6 and R7 require, so the plan does not use it. The engine part stays the smallest that meets R7: one table, two routes and one declaration key. It reuses the import's existing "many writer-checked creates under one batch" path (`import.ts:159-167`) instead of a new write pipeline. Undo by batch replaces the client-side before-image of 81b7a4b instead of living beside it, so there is one undo mechanism, not two.

## Threat model
**Assets:**
- write access to every dataset;
- the integrity of Revision as the audit trail;
- other accounts' work;
- the imported history (4,802 revisions in one import batch).

**Attacks and mitigations:**
1. **An owner runs an action on a row outside its scope.** The action reads the record through the same owner scope as `GET /rows`. A source the owner may not see answers 404, and each create goes through `writableOf(…, 'create', actor)` and the writer's role check (theatre's `forPlanners` → 403).
   - Lives in: `actions.ts` `runAction`.
   - Tested by: an owner gets 404 on the record and 403 on the create, and nothing is written.
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
   - Tested by: undoing a create whose record has since gained a referencing row gets 409 `in_use`.
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
| Theatre datasets, writers, seeds, views (Rol, Speelreeks, Sjabloon, relation, dagplanning/voorstellingen) | `POST/PATCH/DELETE /api/rows/*`, `GET /api/rows/dagplanning` | integration · `packages/theatre/test/step1.test.ts` · `bun test packages/theatre` | speelreeks-end-before-start, speelreeks-delete-in-use |
| Batch table, write reply, undo by batch | `POST /api/batches/:id/undo`, write replies | integration · `packages/engine/test/batches.test.ts` · `bun test packages/engine` | undo-changed-since |
| Actions | `POST /api/actions/:name`, `/api/schema` | integration · `packages/engine/test/actions.test.ts` · `bun test packages/engine` | apply-template |
| Theatre action `sjabloon_toepassen` | `POST /api/actions/sjabloon_toepassen` | integration · `packages/theatre/test/apply.test.ts` · `bun test packages/theatre` | apply-template, apply-twice |
| Grid: batch undo, action button | store and drawer | unit · `apps/grid/src/grid/store.test.ts`, `apps/grid/src/grid/Drawer.test.tsx` · `cd apps/grid && bunx vitest run` | apply-template, undo-changed-since |
| Migration on a copy and value parity | operator command | none, proven by command output in the report | none |

## Review Focus
1. The undo check and its writes run in one `.immediate()` transaction: a write landing between check and restore must be impossible (threat 4). Test map row 2.
2. An action is the caller's write: owner scope on the record and inputs, and the writer's role check on every create (threats 1 and 7). Test map row 3.
3. `kind = import` and pre-table batches are never undoable (threat 3). Test map row 2.
4. The engine stays domain-free: no `speelreeks`, `sjabloon`, `rol`, `offset` or `datum` in `packages/engine`. Checked by `bun run check` (vocabulary).
5. Untimed items stay untimed: an item without `start_tijd` creates `start_at` null and no `eind_at`, on its own `datum` (carry-over). Test map row 4.
6. A query-row edit's batch is the target record's. Undo from Dagplanning restores the activity (the shakeout's query-view case). Test map row 5, plus e2e `undo-changed-since` on Dagplanning.

---

### Task 1: Theatre datasets, writers, seeds and views
**Files:**
- Modify: `packages/theatre/src/datasets.ts`, `packages/theatre/src/writers.ts`, `packages/theatre/src/seed.ts`, `packages/theatre/src/index.ts`, `packages/theatre/src/queries.ts`, `packages/theatre/src/queries/dagplanning.sql`, `packages/theatre/src/queries/voorstellingen.sql`
- Create: `packages/theatre/test/step1.test.ts`

**Interfaces:**
- Produces:
  - datasets `rol`, `speelreeks` and `sjabloon`, with columns as spec R1, R2 and R5;
  - `activiteit.speelreeks_id` with `relation: 'speelreeks'`;
  - `dagplanning` columns `locatie_id` (relation organisatie, read-only) and `locatie_bron` (text, read-only);
  - `validateItems(items: unknown): void`, which refuses in Dutch, exported from writers;
  - seeded views "Speelreeksen", "Rollen" and "Sjablonen".

Steps (one pass; the denial tests are written first):
- [ ] Write `step1.test.ts`, on the test engine as in `writer.test.ts`. It covers:
  - a Speelreeks with `eind_datum` before `start_datum` is refused ("Einde ligt voor de start.");
  - an unknown productie, and a deleted locatie, are refused;
  - a Speelreeks longer than 31 days is refused;
  - a write by an owner gets 403;
  - deleting a Speelreeks with a live activity gets 409 `in_use`, and deleting one without gets 200;
  - a Rol `dagtarief` PATCH by an editor gets 403 with "Alleen een beheerder wijzigt tarieven.", the same by an administrator gets 200, and an editor's `naam` edit gets 200;
  - `validateItems` refuses: a bad soort, an `offset_dag` of -1, `start_tijd` "25:00", `duur` without `start_tijd`, and a `locatie_regel` other than `speelreeks`;
  - every seeded Sjabloon passes `validateItems`, and every seeded Rol and Speelreeks fixture passes its writer;
  - `/api/schema` marks `sjabloon` not writable;
  - Dagplanning `locatie_bron` is `speelreeks` for an activity without a locatie inside a Speelreeks with one, and `eigen` for an activity with its own locatie;
  - voorstellingen shows the inherited venue.
- [ ] Implement as spec R1–R5. The Sjabloon writer has only `create`, so it is not writable in the grid. The invented seeds are 4 Rol rows, the "speeldag op locatie" Sjabloon (spec R5 table) and, for the e2e, one invented venue Organisatie.
- [ ] Run `bun test packages/theatre`, then `bun run gate`. Commit: `feat(theatre): Rol, Speelreeks and Sjabloon; speelreeks_id is a relation; locatie inherits in the views`.

### Task 2: Engine, the batch table, the write reply and undo by batch
**Files:**
- Create: `packages/engine/src/batches.ts`, `packages/engine/test/batches.test.ts`
- Modify: `packages/engine/src/writes.ts` (`runWrite` and `create`/`revise` record the batch and return `{ id, batch_id, changed }`), `packages/engine/src/import.ts` (records kind `import`), `packages/engine/src/revision.ts` (index `['batch_id']`), `packages/engine/src/engine-tables.ts` (the `batch` table), `packages/engine/src/app.ts` (the reply's `revision` and the route), `packages/engine/src/validate.ts` (reserve the column name `revision`), `packages/engine/test/route-matrix.test.ts`

**Interfaces:**
- Produces:
  - `undoBatch(store: Store, batchId: string, actor: Actor): { batch_id: string; changed: { dataset: string; id: number; columns: string[] }[] }`;
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
  - an owner undoing outside its scope gets 404 or 403;
  - the reply's `revision.changed` lists exactly the columns the writer changed, including derived ones;
  - a declared column named `revision` is refused at validation.
- [ ] Implement. Undo runs in one `.immediate()` transaction:
  1. Load the batch's revisions, grouped by record.
  2. Check that every column's current value equals `new`.
  3. Per record: a create (all `old` null) goes through `writer.delete` and `inUse`; otherwise `old` values go through `valuesOf` and the writer's `update`.
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
  - an owner gets 404 on an out-of-scope record and 403 on the create, and nothing is written;
  - an unknown action gets 404;
  - an input naming an unreadable record gets 404;
  - undo by that batch removes all three;
  - `/schema` lists the action on its dataset;
  - validation refuses an action `on` a dataset without a writer.
- [ ] Implement it, reusing `contextOf`, `valuesOf` and `create`, as `import.ts:159-167` does, under one batch.
- [ ] Add route-matrix rows. Run `bun test packages/engine`, then `bun run gate`. Commit: `feat(engine): declared actions run as the caller in one batch`.

### Task 4: The theatre action `sjabloon_toepassen`
**Files:**
- Create: `packages/theatre/src/actions.ts`, `packages/theatre/test/apply.test.ts`
- Modify: `packages/theatre/src/index.ts`

**Interfaces:**
- Consumes: `ActionDecl` from Task 3; `validateItems` and the datasets from Task 1.
- Produces: the action `sjabloon_toepassen` on `speelreeks`, with input `sjabloon_id` (relation `sjabloon`, label "Sjabloon").

Steps:
- [ ] Write `apply.test.ts`. It covers:
  - a 4-day Speelreeks gets 28 activities; for each day, 6 are timed at 13:00, 14:00, 17:30, 18:30, 20:00 and 21:15 with ends from `duur`, and Overnachting has `start_at` null and `eind_at` null;
  - `datum` per day, `productie_id` and `speelreeks_id` from the reeks, `locatie_id` null, `status` optie;
  - Dagplanning `locatie_bron` is `speelreeks` for all 28;
  - one batch;
  - a second apply is refused with the R6 message;
  - an `offset_dag` of 1 on the last day lands the day after `eind_datum`;
  - an owner is refused.
- [ ] Implement `run`:
  - refuse when the reeks has live activities;
  - otherwise build the creates per day and per item; the Activiteit writer derives `plandag`.
- [ ] Run `bun test packages/theatre`, then `bun run gate`. Commit: `feat(theatre): apply a Sjabloon to a Speelreeks, every day, in one batch`.

### Task 5: The grid, batch undo and the action button
**Files:**
- Modify: `apps/grid/src/grid/store.ts`, `apps/grid/src/grid/hooks.ts`, `apps/grid/src/api.ts`, `apps/grid/src/engine.ts`, `apps/grid/src/i18n.ts`, `apps/grid/src/grid/Drawer.tsx`, `apps/grid/src/ui/App.tsx`, `apps/grid/src/types.ts`
- Tests: `apps/grid/src/grid/store.test.ts`, `apps/grid/src/grid/Drawer.test.tsx`

**Interfaces:**
- Consumes: write replies `revision`, `POST /batches/:id/undo`, `/schema` `actions`.
- Produces:
  - `StoreApi.undo(batchId: string): Promise<{ batch_id: string }>`;
  - `api.runAction(name, id, input)`;
  - an undo entry `{ id, batch: string }`;
  - Dutch errors: `changed_since` → "{label} is intussen gewijzigd; ongedaan maken kan niet." and `already_undone` → "Dit is al ongedaan gemaakt.".

Steps:
- [ ] Tests:
  - undo calls `POST /batches/<batch of the edit>/undo` and repaints from the reply's rows;
  - redo undoes the undo batch;
  - an undo pressed before the edit's answer waits for its batch id;
  - `changed_since` keeps the entry, shows the Dutch message naming the column's label, and the row keeps the server's value;
  - a query-row edit's batch comes from the PATCH reply in `updateThrough`;
  - the drawer shows "Sjabloon toepassen" with a Sjabloon picker on a Speelreeks row only;
  - an applied action becomes one undo entry, and the views reload.
- [ ] Remove the 81b7a4b before-image widening (`widen`, `Written.data`, the `editable` option and the multi-column `updateThrough`), keeping `updateThrough`'s single-target PATCH.
- [ ] Run `cd apps/grid && bunx vitest run`, then `bun run gate`. Commit: `feat(grid): undo by batch on the server; a dataset's actions in the drawer`.

### Task 6: The step 1 gate in the browser
**Files:**
- Create: `e2e/step-1.spec.ts`
- Modify: `e2e/step-0e.spec.ts` (the undo flows assert the batch route instead of the PATCH body)

Flows, all on invented fixtures:
- **apply-template:** create a Speelreeks Mon–Thu at the invented venue, apply "speeldag op locatie" from the drawer, then in Dagplanning check that 28 rows appear on the 4 days, at the pattern's times, with Overnachting untimed and `locatie_bron` speelreeks. One Ctrl+Z removes all 28. Reload. The Revision rows of the 28 share one batch (read through `GET /api/revisions`).
- **apply-twice:** the second apply shows the R6 message.
- **speelreeks-delete-in-use:** delete in the drawer gets the in-use message.
- **speelreeks-end-before-start:** the Dutch refusal on the cell.
- **undo-changed-since:** two browser contexts: A edits a cell, B edits the same cell, A's Ctrl+Z shows the Dutch message naming the column, and B's value stays after a reload.

Steps:
- [ ] Write the flows, run `bunx playwright test e2e/step-1.spec.ts`, then `bun run gate` three times. Commit: `test(e2e): the step 1 gate`.

### Task 7 (operator): migration on a copy, parity and shakeout
- [ ] `cp ~/laika-export/engine.db ~/laika-export/step1-copy.db` (0600), then `bun packages/engine/src/serve.ts --domain @worktable/theatre --db ~/laika-export/step1-copy.db --create-admin <existing admin email>`. The expected output is a rebuild of `activiteit`, the new tables created, and `.pre-migrate` written.
- [ ] `bun scripts/shakeout/value-parity.ts --engine ~/laika-export/step1-copy.db --out-dir ~/laika-export/shakeout/step1`: 0 mismatches. Then data-profile and edit-session on a copy of the copy.
- [ ] Report the migration result and the four reports, by severity, counts only, to Stefan. No commit with names.
