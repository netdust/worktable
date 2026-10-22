# Selection actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person ticks rows in a table view, or takes everything the view shows, and runs a domain's action on them as one batch. A dataset can stay out of the tree, and its records still open, read-only, from the table drawer's link list. `+ Nieuw` on any view of a query that creates, the calendar included, asks what the new record needs. The MCP can start a selection action.

**Architecture:** One more action shape, added beside today's single-record action. It is declared with `many: true`, posted with `ids`, and runs once on every record, each read as the caller, in one transaction and one batch. The grid gains a selection column and an action bar on table views of datasets that declare such an action. It also gains a drawer button that runs the action on the open record. A `listed: false` dataset flag keeps a dataset out of the tree. Two small grid paths close the gaps that flag opens: a link item opens its record read-only through `openRelated`, and every view of a query with `creates` uses the existing QuickCreate path with the target model. No domain word reaches the engine or the grid. The browser proof runs on a test-only fixture domain served as a third harness instance.

**Tech Stack:** Bun, Hono, SQLite, TypeScript, React (apps/grid), Vitest, Playwright, bun:test, `@modelcontextprotocol/sdk` (packages/mcp).

**Spec:** `specs/selection-actions/spec.md` (R1–R7; parent `specs/studio/spec.md`).

**Branch:** `feature/selection-actions`, cut from `main` **after** `feature/studio-mcp` has merged. R7 changes `packages/mcp`, which exists only there until then.

## Global Constraints

- `packages/engine` and `apps/grid` know no domain word. `bun run check` stays green, but it scans only `packages/engine` against theatre's and fiche's words. So the fixture's and the grid's words are chosen neutral by hand: no studio, theatre or fiche word.
- `docs/SPEC.md` changes first, in Task 1's first commit. "The engine's surface" gains the selection action, the `ids` body, the 500 cap and `listed: false`.
- The single-record `ActionDecl`, `POST /api/actions/:name` with `{ id, input }`, `/schema`'s action shape for single actions, and theatre's and fiche's behaviour stay unchanged, with one exception: R5's clickable link item also shows in theatre's table drawers. It shows only where `RelationContext.openRelated` is set, so `drawer/Sections.test.tsx` and every drawer outside the grid stay as they are. Their existing tests pass untouched, except `App.test.tsx:1540`, which Task 4 rewrites.
- A selection run is all-or-nothing: one transaction, one batch, one notice, one Undo.
- The cap is 500 ids per run, the same number in the engine, the grid and the MCP.
- UI copy is Dutch: "{n} geselecteerd", "Selectie wissen", "Maximaal 500 tegelijk".
- Datetime and API conventions are as in `docs/SPEC.md`. `bun test`'s timeout is 5 s.
- Every Playwright run and the gate run under `flock /home/ntdst/.cache/worktable-e2e.lock`, because the harness ports are fixed.
- The new harness instance uses ports 4314 (engine) and 5177 (grid) and the cookie `wt_session_selection_e2e`. studio-domain owns 4313/5176.
- No client data in fixtures.

## Threat model

**Assets:** records outside the caller's scope or view, and the integrity of what a run writes. Also the undo of a batch.

**Attacks**
1. **An owner or record link posts ids it cannot see** (another owner's record, an owner-hidden source), or anyone posts a deleted row, to reach or write them → every id is read through `readRecord` as the caller, as a single action reads its record. Any miss is a 404 on the whole run, before `run` is called. `actions.ts` `runSelection`, which reads each id inline inside the transaction. Editors and administrators see every record (`access.ts:75`); a space is a view filter, never a scope (`docs/SPEC.md`).
2. **A caller floods the route** with a huge, duplicated or malformed `ids` → `idsOf` (and `inputOf` for `input`) refuses the run with 400 before any read when the ids:
   - are not an array, or are empty;
   - number more than 500;
   - include a non-integer or a value ≤ 0;
   - include a duplicate.
3. **Shape confusion:** `{ id }` is posted to a selection action, or `{ ids }` to a single one, to slip past a check written for the other → `idOf`/`idsOf` refuse the wrong shape with 400 (a body carrying both keys is refused by each). `matrix.open.fill` may not name a selection action (`validate.ts` `checkMatrix`).
4. **A link record kept out of the tree is opened** by someone who could not read it in the tree → the drawer opens it read-only through the existing `openRelated`, which reads `GET /rows` as the caller. The drawer's link list gains no write. Removing a link stays where it is today: the parent row's links cell → `links.remove` → `removeRow` on the link dataset, through its writer. `listed: false` hides nothing from the API, by design, and is never an access control.
5. **An owner or a record link runs a selection action** → `visibleSource(action.on)` plus `inScope` per record, as a single action. An owner link's half is stopped there; a record link's half is stopped by the link fence (`record-link.ts`), which keeps a record-link session off `/api/actions` altogether. No new actor path.
6. **The MCP sends ids that reach further than its token can see** → the same route and the same checks. The MCP validates the shape client-side too (1–500 positive integers), but the server is the control.

**Mitigations (where they live):**
- `packages/engine/src/actions.ts`: `idOf`, `idsOf`, `inputOf`, `runSelection` (the per-id read is inline in it).
- `packages/engine/src/validate.ts`: `checkActions` and `checkMatrix` (fill ≠ selection), `checkSections` (no unlisted dataset), and no query declared `of` an unlisted dataset.
- `apps/grid/src/grid/Selection.tsx`: the cap in the UI.
- `packages/mcp/src/client.ts`: `assertIds`.

**Deferrals**
- A run is all-or-nothing. There is no per-record partial success, by design (the anti-goal "N batches").
- The 500 cap is per request. A script can send many requests. Service accounts have a per-account rate limit (`rate-limit.ts`); cookie sessions have none, as for every other route.
- `listed: false` is navigation only. A person who knows a dataset's name can still open its views through the API. That is not a secret, and access stays with the source's own rules.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Selection action in the engine (declare, actions, app, validate) | `POST /api/actions/:name` `{ ids, input }`; `/schema` | integration · `packages/engine/test/selection-actions.test.ts` · `bun test packages/engine/test/selection-actions.test.ts` | — |
| Grid selection and action bar (Selection.tsx, Grid wiring) | the table view's DOM | component · `apps/grid/src/grid/Selection.test.tsx` · `bun run --filter @worktable/grid test -- Selection` | select-and-run, select-all-in-view |
| A run from App (`act` with ids: one request, one notice, one Undo) | App with `api` mocked | component · `apps/grid/src/ui/App.test.tsx` (extended) · `bun run --filter @worktable/grid test -- App` | select-and-run, run-from-drawer |
| Drawer: selection action on one record; link item opens its record read-only | the drawer's DOM; App's `act` | component · `apps/grid/src/grid/Drawer.test.tsx` (extended), `apps/grid/src/ui/App.test.tsx` · `bun run --filter @worktable/grid test -- Drawer` and `-- App` | run-from-drawer, link-opens-record |
| Out of the tree (`listed: false`) | `/schema`; the Rail | integration · `packages/engine/test/selection-actions.test.ts` · as row 1; component · `apps/grid/src/ui/Rail.test.tsx` · `bun run --filter @worktable/grid test -- Rail` | tree-hides-link-table |
| `+ Nieuw` on a query that creates (R6), table and calendar | `+ Nieuw` on a query view | component · `apps/grid/src/ui/QueryCreate.test.tsx` · `bun run --filter @worktable/grid test -- QueryCreate` | add-from-query |
| MCP `ids` (R7) | the `action` tool | integration · `packages/mcp/test/tools.test.ts` (extended) · `bun test packages/mcp` | — |
| The selection fixture instance | harness boot | scaffold, proven by the flows | all of the above |

Denial tests, each RED first:
- engine: "an id outside the caller's scope fails the whole run and writes nothing" (as an owner); "no ids, 501 ids, a duplicate, a zero or a string are refused before any read"; "a single action refuses ids, a selection action refuses id"; "validation refuses a matrix fill that names a selection action"; "validation refuses a section that lists an unlisted dataset"
- MCP: "ids outside 1–500 positive integers are refused before a request"

## Review Focus

1. **One unreadable id among many fails the whole run, with nothing written.** → row 1, "an id outside the caller's scope fails the whole run and writes nothing" (an owner's run with another owner's id).
2. **A ticked row the person can no longer see is never acted on.** The selection is pruned to the shown ids whenever the rows change: filter, search, space, period window, or a reload after a write. → row 2, "a ticked row that leaves the view leaves the selection".
3. **After a run the selection clears, the view reloads, and one Undo removes everything the run made.** → row 3 (`App.test.tsx`), "a run is one batch: one notice, and its Undo removes every record it created". Also e2e select-and-run.
4. **Exactly 500 runs, and 501 is blocked in the UI and refused by the server.** → rows 1 and 2: "500 ids run" and the 501 test in the engine; "500 runs; 501 disables the buttons with Maximaal 500 tegelijk" in the grid.
5. **An action with required inputs asks them once for the whole selection,** not once per record. → row 3 (`App.test.tsx`), "inputs are asked once and sent once".

---

## Architecture

**First working version:** Task 2. In the selection fixture instance (grid on 5177), a person ticks rows of the test dataset and runs its selection action from the bar. One notice appears, and Undo takes the run back. Task 1 is the engine seam it needs, and the engine's security surface, so it is ordered first.

**Simplest design.** The simplest design that meets the ask is the grid looping today's single action over each ticked id. It needs no engine change, but it produces N batches, N notices and N undos (an anti-goal), and a failure halfway leaves half a run. Studio's request must be one record holding all its sites. So the plan adds the smallest engine shape that makes a run one transaction: a `many: true` action that receives every record. The rest is grid wiring:
- R5's link opening reuses `openRelated`, read-only.
- R6 sends every view of a query that creates through the existing QuickCreate path.

No new route and no drawer field editor.

**Files:**

| File | Responsibility |
|---|---|
| `packages/engine/src/declare.ts`, `index.ts` | `SelectionActionDecl` (exported from `index.ts`); `Domain.actions` union; `DatasetDecl.listed?: false` |
| `packages/engine/src/actions.ts` | `idsOf`, `recordsOf`, `runSelection`; `actionsOn` serves `many` |
| `packages/engine/src/app.ts` | `/schema` serves `listed: false`; the existing route dispatches on the action's shape |
| `packages/engine/src/validate.ts` | `checkActions` and `checkMatrix` for selection actions; `checkSections` refuses an unlisted dataset; a query may not be `of` an unlisted dataset |
| `packages/engine/src/openapi.ts` | a selection action's body: `ids` (1–500) and `input` |
| `packages/engine/test/fixtures/selection-domain.ts` | a test-only domain:<br>- a dataset with an `owners` column and a selection action that creates one parent record, linked to every selected record through a link dataset that is `listed: false` and carries a long text field<br>- a query that `creates` in a dataset with a required date, seeded as a calendar view |
| `apps/grid/src/types.ts`, `engine.ts`, `api.ts` | `ModelAction.many`, `TableDef.listed`; `runAction(name, id, input)` unchanged, plus `runSelection(name, ids, input)` |
| `apps/grid/src/grid/ActionInputs.tsx` | the drawer's private `Action` input UI, moved here and exported, so the drawer and the bar share it |
| `apps/grid/src/grid/Selection.tsx` | `useSelection(rowIds)`, pruned to the shown ids on every change, and `SelectionBar` |
| `apps/grid/src/grid/Grid.tsx`, `GridBody.tsx`, `GridHeader.tsx` | the checkbox column and the header box, only when the model has a selection action |
| `apps/grid/src/grid/Drawer.tsx`, `drawer/PlaceRow.tsx` | selection actions on the open record; a link item opens its record |
| `apps/grid/src/ui/App.tsx`, `dashboard/QuickCreate.tsx`, `ui/tables.ts`, `ui/Rail.tsx` | `act` for many; every view of a query with `creates` → QuickCreate with the target model, which now hands back its batch; the tree skips `listed: false` |
| `apps/grid/src/i18n.ts` | the Dutch strings |
| `packages/mcp/src/tools.ts`, `src/client.ts` | `action` takes `id` or `ids` |
| `playwright.config.ts`, `e2e/auth.ts`, `e2e/global-setup.ts`, `e2e/selection.spec.ts` | the third instance and the flows |
| `docs/SPEC.md` | the engine's surface |

### Task 1: The engine's selection action and `listed: false`

**Files:**
- Modify: `docs/SPEC.md` (the engine's surface), `packages/engine/src/declare.ts`, `index.ts`, `actions.ts`, `app.ts`, `validate.ts`, `openapi.ts`
- Create: `packages/engine/test/selection-actions.test.ts`, `packages/engine/test/fixtures/selection-domain.ts`

**Interfaces:**
- Produces:
  - `export interface SelectionActionDecl { label: string; on: string; many: true; input: Record<string, ActionInput>; run(records: Values[], input: Record<string, InputValue>, ctx: WriteContext): ActionResult }`
  - `Domain.actions?: Record<string, ActionDecl | SelectionActionDecl>`
  - `DatasetDecl.listed?: false`
  - `/schema`: each served action carries `many: true` when it is one; a source carries `listed: false` when declared.
  - The route: `POST /api/actions/:name` takes `{ ids: number[], input }` for a selection action. It answers 201 `{ batch_id, created, notices }`, as today.
  - `selection-domain.ts` default-exports a `Domain`. Its words come from no domain package, chosen by hand. It has an `owners` column and a seeded owner account path, as `packages/engine/test/actions.test.ts:200` uses one.
  - `/schema?format=openapi` describes a selection action's body as `ids` (1–500 integers) and `input`.
- Consumes: `readRecord`, `contextOf`, `createAs`, `updateAs`, `recordBatch` from today's `actions.ts` and `writes.ts`.

- [ ] **Step 1: The docs commit.** Edit `docs/SPEC.md`'s engine surface: selection actions (`many`, `ids`, 1–500, one batch, each id read as the caller) and `listed: false` (navigation only). Commit: `docs: the engine's surface gains selection actions and listed: false`.
- [ ] **Step 2: Write `selection-actions.test.ts`** against `selection-domain.ts`, with `testEngine`-style setup as the engine's other tests use:
  - "a selection action runs once on every id, in one batch": 3 ids → `run` receives 3 records in id order; one `batch_id`; undo by the same account removes every created record.
  - "an id outside the caller's scope fails the whole run and writes nothing": an owner sends its own id and another owner's id → 404 `unknown_record`, and the row counts are unchanged.
  - "a deleted id fails the whole run" → 404.
  - "no ids (`{}` and `{ ids: [] }`), 501 ids, a duplicate, a zero or a string are refused before any read" → 400 `bad_body`; `run` never called.
  - "500 ids run": the cap is inclusive.
  - "the OpenAPI document gives a selection action an ids body".
  - "a single action refuses ids, a selection action refuses id" → 400 each.
  - "a refusal inside run rolls back every create" → 422, and the counts are unchanged.
  - "/schema serves many on a selection action and listed: false on its source".
  - "validation refuses a matrix fill that names a selection action", "validation refuses a section that lists an unlisted dataset", "validation refuses a query of an unlisted dataset", and "validation refuses options_from on a selection action's input" → `DomainError`.
- [ ] **Step 3: Run it.** `bun test packages/engine/test/selection-actions.test.ts`: FAIL (no shape yet).
- [ ] **Step 4: Implement.**
  - `idsOf(body)` validates the cap and the shape.
  - `recordsOf` reads each id with `readRecord` inside the transaction.
  - `runSelection` mirrors `runAction`: one key, `createAs` and `updateAs` per step, `recordBatch` with kind `action`.
  - `runAction` dispatches on `'many' in action`.
  - `actionsOn` serves `many`.
  - `/schema` serves `listed`.
  - `validate.ts` gets the four checks (matrix fill, sections, query `of`, `options_from`), and `openapi.ts` the body.
  - `index.ts` exports `SelectionActionDecl`.

  Every caller of `ActionDecl.run`, including the matrix fill, narrows on the shape.
- [ ] **Step 5: Run it.** The file passes; `bun test packages scripts` shows no other failures; `bun run check` exits 0.
- [ ] **Step 6: Commit:** `feat(engine): a selection action runs once on many records, each read as the caller`.

### Task 2: Selecting rows in the table (first working version)

**Files:**
- Create: `apps/grid/src/grid/Selection.tsx`, `Selection.test.tsx`, `apps/grid/src/grid/ActionInputs.tsx` (the drawer's `Action` moved here)
- Modify: `apps/grid/src/types.ts`, `engine.ts`, `api.ts`, `grid/Grid.tsx`, `GridBody.tsx`, `GridHeader.tsx`, `grid/Drawer.tsx` (imports `ActionInputs`), `ui/App.tsx`, `ui/App.test.tsx`, `i18n.ts`, `playwright.config.ts`, `e2e/auth.ts`, `e2e/global-setup.ts`
- Create: `e2e/selection.spec.ts`

**Interfaces:**
- Consumes: Task 1's `/schema` `many`, and the route with `ids`.
- Produces:
  - `useSelection(rowIds: number[]): { selected: Set<number>; toggle(id): void; all(): void; clear(): void }`. On every change of `rowIds` (filter, search, space, period window, a reload), `selected` is pruned to the ids still shown. `all()` takes every shown id, folded groups included.
  - `SelectionBar({ count, actions, onRun, onClear })`, using `ActionInputs` for an action's inputs. `ActionInputs`' `record` is optional: the bar has no single record, and Task 1 refuses `options_from` on a selection action's inputs.
  - The checkbox sits in the row-number (`#`) cell region (`GridHeader.tsx:44, 51`; `GridBody.tsx:145`), outside the tanstack columns. The keyboard model's column indexes and copy-paste stay as they are (`Grid.tsx:288-308`). It is labelled for assistive tech: on a model with a selection action, `aria-hidden` moves from the `#` cell to a span around the number. A model without one keeps today's attributes (`Grid.test.tsx:117-121`).
  - `runSelection(name: string, ids: number[], input): Promise<{ batch }>` in `api.ts`. `runAction(name, id, input)` is unchanged, so the matrix and its tests are untouched.

- [ ] **Step 1: Add the instance.**
  - `playwright.config.ts` gets a third web server pair:
    - `serve.ts --domain ./packages/engine/test/fixtures/selection-domain.ts --db e2e/.tmp/selection.db --port 4314 --fresh --outbox e2e/.tmp/outbox-selection --app-url http://127.0.0.1:5177 --cookie-name wt_session_selection_e2e`
    - the grid on 5177
  - `e2e/auth.ts` and `global-setup.ts` gain the instance and one administrator and one editor.
- [ ] **Step 2: Write `Selection.test.tsx`:**
  - "a table of a model with a selection action shows a checkbox per row and in the header; a model without one shows none".
  - "ticking two rows shows 2 geselecteerd and one button per selection action".
  - "the header box selects every row the view shows, search applied".
  - "a ticked row that leaves the view leaves the selection": the rows change (a search, or a reload after a write) and `selected` keeps only the shown ids.
  - "the header box takes rows in folded groups too".
  - "Selectie wissen empties the selection and hides the bar".
  - "500 runs; 501 disables the buttons with Maximaal 500 tegelijk".
  In `ui/App.test.tsx`, where `api` is already mocked:
  - "a filter, space or period change clears ticked rows the view no longer shows" (those causes live in App).
  - "inputs are asked once and sent once": one `runSelection` call with every id.
  - "a run is one batch: one notice, and its Undo removes every record it created".
- [ ] **Step 3: Run** `bun run --filter @worktable/grid test -- Selection` and `-- App`: FAIL.
- [ ] **Step 4: Implement** `Selection.tsx` and the wiring. In `App.tsx`:
  - `act` takes a target. A selection run pushes one history entry, notifies once, then clears and reloads.
  - The checkbox column follows the grid's existing visual language, and the bar sits above the grid body.
- [ ] **Step 5: Write `e2e/selection.spec.ts`:**
  - **select-and-run:** tick two rows, run, one notice, the created parent shows in its view, Undo removes it.
  - **select-all-in-view:** filter, take all, run, and the parent's link count equals the filtered count.
- [ ] **Step 6: Run** the grid tests and `bun run check`, then `flock /home/ntdst/.cache/worktable-e2e.lock bunx playwright test e2e/selection.spec.ts`: PASS. Take one screenshot of the bar with rows ticked for the reviewer.
- [ ] **Step 7: Commit:** `feat(grid): tick rows or take the whole view and run a selection action as one batch`.

### Task 3: The drawer: one record, and a link item opens its record

**Files:**
- Modify: `apps/grid/src/grid/Drawer.tsx`, `drawer/PlaceRow.tsx` (rendered by `LinkSection` in `drawer/Sections.tsx`), `Drawer.test.tsx`, `ui/App.test.tsx`, `e2e/selection.spec.ts`

**Interfaces:**
- Consumes: `runSelection(name, [row.id], input)` from App's `act`; `RelationContext.openRelated(target, id)`, which opens the record read-only.

- [ ] **Step 1: Extend `Drawer.test.tsx`:**
  - In `App.test.tsx`: "a drawer run sends the open record alone", one `runSelection` call with `[row.id]`.
  - "a link item opens the link's own record": clicking it calls `openRelated(<link dataset>, <link row id>)`.
- [ ] **Step 2: Run them:** FAIL.
- [ ] **Step 3: Implement.** Selection actions join the drawer's action buttons where single actions show today (the table view's own drawer only, spec R4). In the table's drawer, a link item becomes a button that opens its record, read-only, through `openRelated` (spec R5). No drawer gains a field editor.
- [ ] **Step 4: Add the e2e flows:**
  - **run-from-drawer:** open a record, run, and the parent holds exactly that one.
  - **link-opens-record:** open a parent, click a link item, and read the link record's long text field. `openRelated` closes the parent's drawer. Then, in the parent row's links cell, remove that link with × (then Verwijderen if asked), as `e2e/dagplanning.spec.ts:205` removes one, and the parent's link count drops by one.
- [ ] **Step 5: Run** the grid tests, `bun run check`, and the e2e file under the lock: PASS.
- [ ] **Step 6: Commit:** `feat(grid): the drawer runs a selection action on its record, and a link item opens its record`.

### Task 4: Out of the tree, and adding from a query

**Files:**
- Modify: `apps/grid/src/ui/tables.ts`, `ui/Rail.tsx`, `ui/App.tsx`, `ui/App.test.tsx`, `dashboard/QuickCreate.tsx`, `apps/grid/src/types.ts`, `engine.ts`, `i18n.ts` (the `pickFirst` string goes with its branch)
- Test: `apps/grid/src/ui/Rail.test.tsx` (extended), `apps/grid/src/ui/QueryCreate.test.tsx` (new), `e2e/selection.spec.ts`

**Interfaces:**
- Consumes: `/schema`'s `listed: false`; `QuickCreate({ label, model, tables, scope, window, preset, onClose, onCreated })`; App's `quickAdd` (`App.tsx:390`), `onAdd` (`:578`), `made`/`createBlocked` (`:415-433, 671-676`).
- Produces: QuickCreate's `onCreated(batch)` hands back the create's batch. On the query path App pushes it into history, so one Undo removes the record.

- [ ] **Step 1: Write the tests:**
  - "the tree leaves out a listed: false dataset, and its section neighbours keep their order".
  - "+ Nieuw on a table view of a query that creates opens QuickCreate for the target when the new record still needs fields": `made.needs` is non-empty (the title included). The dialog asks them, saves into the target, the query reloads, and Undo removes the record.
  - "+ Nieuw on a calendar view of a query that creates does the same": the calendar shows `+ Nieuw` and its window presets the date.
  - "when nothing is needed, + Nieuw still creates at once, and `missing` stays blocked", as today.
  - Rewrite `App.test.tsx:1540` ("waits for a pick the dataset needs, and says which") as "+ Nieuw opens QuickCreate asking Productie": the `pickFirst` block goes.
  - "a record added on a calendar keeps its day": the calendar's day reaches QuickCreate as `preset`, so an optional date field that `newRow` would fill is not dropped.
  - "on a scoped target with a space selected, the query's dialog still asks the space", filled in with the selected one.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.**
  - `sectionsOf` and the unlabelled tail skip `listed: false`.
  - In `App.tsx`, every view of a query with `creates` (any skin) takes the existing quick-create path with `model={target}` and `label={newLabel(target)}`, opened when `made.needs` is non-empty. Only the fields `made` filled that the dialog does not ask go in as `preset`: in practice the calendar's day on an optional date field. The title, the required fields and the space stay asked, filled in by QuickCreate's own `madeFrom` (`QuickCreate.tsx:84, 88`).
  - `createBlocked` keeps `readOnly` and `missing`; its `pickFirst` branch (`App.tsx:674-675`) goes.
  - `QuickCreate.onCreated(batch)` passes its batch. App pushes it into history on the query path only, so the other skins' quick creates keep today's behaviour.
- [ ] **Step 4: Add the e2e flows:**
  - **tree-hides-link-table:** the link dataset is not in the tree; its records open from a parent's drawer.
  - **add-from-query:** on the query's calendar view, + Nieuw asks the title, with the date filled in from the calendar, the row appears, and Undo removes it.
- [ ] **Step 5: Run** the grid tests, `bun run check`, and the e2e file under the lock: PASS.
- [ ] **Step 6: Commit:** `feat(grid): a dataset can stay out of the tree, and + Nieuw on a query asks what its record needs`.

### Task 5: The MCP takes ids

**Files:**
- Modify: `packages/mcp/src/tools.ts`, `packages/mcp/src/client.ts`, `packages/mcp/test/tools.test.ts`

**Interfaces:**
- Consumes: Task 1's route.
- Produces: the `action` tool takes `{ name, id?, ids?, input? }` with exactly one of `id`/`ids`. `assertIds(ids)` allows 1–500 positive safe integers with no duplicates. Its message is English.

- [ ] **Step 1: Tests, against the engine's selection fixture through `testEngine`:**
  - "action with ids runs a selection action as one batch".
  - "both id and ids, or neither, is refused before a request".
  - "ids outside 1–500 positive integers are refused before a request".
- [ ] **Step 2: Run** `bun test packages/mcp`: FAIL.
- [ ] **Step 3: Implement.** The tool's description says a selection action takes `ids`.
- [ ] **Step 4: Run** `bun test packages/mcp` and `bun run check`: PASS.
- [ ] **Step 5: Commit:** `feat(mcp): the action tool starts a selection action with ids`.

## Close

`flock /home/ntdst/.cache/worktable-e2e.lock bun run gate` green. Push. The reviewer runs `/feature-review selection-actions`. One fix pass, `specs/selection-actions/review.md`, `/shakeout` driving the six flows on the selection instance, push again, then the final list to the reviewer. No merge, and no operator verb.

**Execution mode:** Native, except Tasks 1 and 5, which run subagent-driven. Rule fired: input parsing and per-record scope on a write route, and the MCP's input checks. Both are security-boundary units.
