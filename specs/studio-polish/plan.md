# Studio polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid offers only what a person can do, and says it the way a person reads it, through a few generic engine declarations and grid fixes that studio then declares.

**Architecture:**
- **Engine:** eight small declarations, and one served fact (`lifecycle.buttons`):
  - **enforced:** a column's `written_by`, a dataset's `created_by`, attachments' `deleted_by`;
  - **presentation:** a board's `drag`, a column's `footer`, a transition button's `primary`, a link's `meter`;
  - **selection:** a query's `selectable`.

  The enforced ones are judged in one place, `answeredOf` in `writes.ts`, which every row write reaches: REST, `createAs`, `updateAs`, the action token and undo. They are also judged in the two attachment delete paths. The import and seed-missing pass an explicit trusted flag through the exported `valuesOf`.
- **Grid:** honours them, and fixes generic rough edges.
- **Studio:** declares what it needs.

No new route.

**Tech Stack:** Bun, Hono, SQLite, TypeScript, React (apps/grid), Vitest, Playwright, bun:test.

**Spec:** `specs/studio-polish/spec.md` (R1–R19; parent `specs/studio/spec.md`). R17 and R18 came from the plan reviews; R19 came from Stefan.

**Branch:** `feature/studio-polish`, cut from `main` (d1d3613).

## Global Constraints

- `packages/engine` and `apps/grid` know no domain word. `check-vocabulary` scans only `packages/engine` and `packages/mcp`, so the grid's words are checked by review.
- `docs/SPEC.md` changes first (Task 1's first commit): the engine surface gains the eight declarations, the served `lifecycle.buttons`, the `service_only` refusal, the trusted flag, and `available.buttons[].primary`.
- "A person" is any actor whose kind is not `service`: kind `user`, kind `link`, and a kind-less actor. The value names are `written_by: 'service'`, `created_by: 'service'` and `deleted_by: 'person'`.
- The import and `--seed-missing` are trusted. They call `valuesOf(…, { trusted: true })` (`import.ts:163`, `seed-missing.ts:57`), which passes the flag on to the private `answeredOf`. No route can pass it, and `restore` (`writes.ts:859`) never passes it. So `written_by` and `created_by` do not refuse those two.
- Dutch UI copy. The grid maps `service_only` to "Dit wordt automatisch bijgehouden en kan je niet zelf wijzigen."
- Theatre and fiche declare none of the new shapes. Their behaviour changes only by R8–R14, R17 and R19, and every existing test those change is named in its task.
- Every Playwright run and every gate run go under `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate`. Read the gate's result before any push. Delete scratch specs under `e2e/.tmp` before a gate.

## Rulings (plan-level)

- `Ruling: R17 — a lifecycle column whose transitions declare buttons is changed through its buttons only: the grid offers no inline select for it in a table, and no drag on a board grouped by it. The engine still accepts the PATCH, which the lifecycle and the writer judge. — why: the Opdrachten table's Status cell offers every option while studio's writer allows a person only Bevestigen and Annuleren (plan review N5) — cost if wrong: a theatre-like domain that declares buttons loses inline status edits; theatre declares none.`
- `Ruling: written_by is judged on the keys the caller sends, before the writer runs. A writer must not fill a written_by column on a person's write; validation cannot see that, and the declare.ts doc says so — why: plan review S8 — cost if wrong: such a batch's undo would answer 403.`
- `Ruling (revised in round 2): R10 shows one pill per tone, bad before warn, and only those two tones. A pill counts every row whose option has that tone, and is labelled by its option, or by its options joined with " · " when the tone has several present (e.g. "Geweigerd · Geannuleerd 3") — why: spec R10 ("both show when both are present") and theatre's Toewijzing, which has two bad options (plan review N3, round 2 S4) — cost if wrong: theatre's parked views gain a red pill, which Stefan sees in the shake-out.`
- `Ruling: onderhoud declares every column written_by service, beyond R16's created_by — why: its writer refuses every update, so the Onderhoudslog offered inline edits that always fail (round 1 N5) — cost if wrong: none.`
- `Ruling (revised in round 3): R18 needs no engine shape. Studio's site and onderhoud writers drop their delete. /schema then serves deletable false (app.ts:325), the drawer offers no Verwijderen (Grid.tsx:404, pinned by Grid.test.tsx:1177), and writableOf answers 405 read_only on both delete paths, REST DELETE and the undo of a create (writes.ts:74, from app.ts:77 and :825). noServiceDeletes passes a writer without delete through unchanged (writers/index.ts:11) — why: an existing engine rule already says "not deletable" (round 3 N1) — cost if wrong: none.`
- `Ruling: R15 offers only the of-dataset's selection actions that carry no when, because query rows carry no available marks — why: plan review N4 — cost if wrong: none; studio's four actions have no when.`
- `Ruling: R9 re-reads the history after a press, after an undo, and after a live poll whose lifecycle value changed. A plain row replacement does not — why: plan review N7 — cost if wrong: one extra read per change.`
- `Ruling: R13 keeps code 'unknown' and gives it the Dutch message, so the undo history's KEPT rule still holds (ui/history.ts:67) — why: plan review S6 — cost if wrong: none.`

## Threat model

**Assets:**
- columns and rows only an outside process may write (studio's registry and health facts, its maintenance log);
- attachments a service must not remove.

**Attacks**
1. **A person writes a `written_by` column** by a forged PATCH or POST, a board drop, an action's `updates`, the action token, or an undo → `answeredOf` refuses it with 403 `{ code: 'service_only' }` before the writer, for every kind but `service`, unless trusted. Every one of those paths reaches `answeredOf` (`writes.ts:599-629`; `createAs`/`updateAs`; `action-token.ts:182`; `restore` at `:859`).
2. **A person creates a row of a `created_by` dataset** by a forged POST, a quick create or an action's create → the same check in `answeredOf`'s create path. An undo never creates: an undo of a delete is refused 422 before any write (`writes.ts:799-804`). The import and seed-missing are trusted; the seed bypasses writers (`migrate.ts:146-148`).
3. **A service deletes a `deleted_by: 'person'` attachment**, either by `DELETE /api/attachments/file/:id` (`attachments.ts:298-305`) or by undoing its own upload (`undoAttachments`, which sets `deleted_at`: `attachments.ts:400-431`) → both refuse it with 403 `service_only` before the soft delete.
4. **A selectable query's ids are trusted as the dataset's records** → the route is unchanged, and each id is re-read as the caller (`readRecord`). Validation allows `selectable` only with `of`. Only actions without a `when` are offered.
5. **`/schema` serves a column read-only to a person** → presentation only. The enforcement is attack 1's.

**Mitigations:** `writes.ts` `answeredOf` (attacks 1–2), `attachments.ts` remove and undo (3), `validate.ts` (the shapes and their combinations, below), `app.ts` (per-viewer `readonly`).

**Deferrals:** the writers' own checks stay as a second net. They refuse twice; harmless.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Who may write and the shapes (engine) | `PATCH`/`POST /api/rows`, actions, undo, `DELETE /api/attachments/file/:id`, `/schema`, rows' `available` | integration · `packages/engine/test/column-writers.test.ts` · `bun test packages/engine/test/column-writers.test.ts` | — |
| The grid honours R1, R2, R4–R7, R14, R17 | table, board, drawer, toolbar, dashboard and composer DOM | component · the grid's existing files, extended · `bun run --filter @worktable/grid test` | no-edit-on-worker-columns, no-new-where-not-allowed (`e2e/studio.spec.ts`, `--grep "no-edit-on-worker-columns\|no-new-where-not-allowed"`) |
| Grid fixes R8–R13, R19 | drawer, toolbar, title line, errors, row lines | component · Drawer, App, insight, api tests; R11 in e2e at 1440 px | toolbar-at-1440 (`e2e/studio.spec.ts --grep toolbar-at-1440`) |
| Selection on a selectable query (R15) | a query view's bar | component and integration · Selection, App and the engine file | tick-on-a-query-view (`e2e/studio.spec.ts --grep tick-on-a-query-view`) |
| Studio's declarations (R16) and its writers without delete (R18) | `/schema`, seeded views, drawer, `DELETE /api/rows`, undo | integration · `packages/studio/test/seed.test.ts`, `ownership.test.ts` · `bun test packages/studio` | the changed studio rows |

Denial tests, RED first:
- "a person's PATCH, POST and action update of a written_by column are refused 403 service_only, and the writer never runs";
- "a person's create on a created_by dataset is refused 403, by REST and through an action";
- "a service's DELETE, and a service's undo of its own upload, of a deleted_by person attachment are refused 403";
- "the import and seed-missing still write and create";
- the validation refusals.

## Review Focus

1. **A person never writes a `written_by` column or creates a `created_by` row, by any path; a service still does; the import and seed-missing still do** → row 1.
2. **No control is offered that the server refuses:** inline edit, drag, "+ Nieuw", board "+", quick create, dashboard quick action, composer, a status select with declared buttons, or Verwijderen on a site or log row → row 2 and its flows.
3. **Theatre's and fiche's grids keep their behaviour, except R8–R14 and R17, with every changed test named** → rows 2 and 3.
4. **A selection from "Sites met aandacht" acts on exactly the ticked sites** → row 4.
5. **Bevestigen is visibly primary, and the live mark never reads as a status** → rows 2 and 3, and the screenshot.

---

## Architecture

**First working version:** Task 2. On studio's harness instance:
- Sites shows the worker's columns read-only, with no "+ Nieuwe site";
- the Sites board does not drag;
- the Onderhoudslog offers no edit and no "+ Nieuw";
- the Opdrachten Status cell is not an inline select;
- Bevestigen stands out.

**Simplest design.** Hiding controls by naming studio's columns in the grid is forbidden (the domain-free engine). The writers' existing refusals still offer the controls. So the engine learns one generic fact, who may write a column or create a row, which it enforces in the single planning function and serves per viewer. The rest are one-field declarations and generic grid fixes.

**Files:**

| File | Responsibility |
|---|---|
| `packages/engine/src/declare.ts`, `index.ts` | the eight declarations; the `written_by` doc (judged on the sent keys; writers must not fill it) |
| `packages/engine/src/writes.ts` | `valuesOf(…, options?: { trusted?: true })` passing to `answeredOf`; the 403 `service_only` for `written_by` and `created_by` |
| `packages/engine/src/import.ts`, `seed-missing.ts` | pass `{ trusted: true }` |
| `packages/engine/src/attachments.ts` | the 403 in `remove` and in `undoAttachments` |
| `packages/engine/src/available.ts` | `buttonsOf` emits `primary` |
| `packages/engine/src/app.ts` | `servedColumn` marks a `written_by` column `readonly` for a non-service viewer and serves `footer`; serves `created_by`, `board.drag`; `lifecycle` gains `buttons: true` when any transition declares a button (R17); `servedLink` adds `meter`; queries serve `selectable` |
| `packages/engine/src/validate.ts` | the shapes, plus: `selectable` only with `of`; `footer` only on number columns; `primary` only with `button`; no `written_by` with `owner_writable`; no `written_by` on a lifecycle column with button transitions; no query `writes` mapping onto a `written_by` column; no query `creates` naming a `created_by` dataset |
| `apps/grid/src/types.ts`, `engine.ts` | `Field.footer`, `Model.created_by`, `Model.lifecycle_buttons`, `Board.drag`, `Link.meter`, `Available.buttons[].primary`, `Model.selectable` |
| `apps/grid/src/ui/App.tsx`, `dashboard/Dashboard.tsx`, `dashboard/Composer.tsx` | R2: no create controls for a person on a `created_by` model; R14 |
| `apps/grid/src/board/Board.tsx`, `ui/App.tsx:680` | R4 and R17 (a board grouped by the lifecycle column with `lifecycle_buttons`): no drag |
| `apps/grid/src/grid/columns.ts` | R17: no inline select on the lifecycle column when `Model.lifecycle_buttons`; R5: `fieldColumn` copies `footer` onto the grid `Column` so `sums()` can see it |
| `apps/grid/src/grid/group.ts` | R5: `sums()` skips `footer: 'none'`, which serves the foot, the group bands and the Excel total |
| `apps/grid/src/grid/DrawerButtons.tsx` | R6 |
| `apps/grid/src/grid/drawer/Sections.tsx`, `grid/cells/Links.tsx` | R7, in the drawer head and the cell's bar |
| `apps/grid/src/grid/Drawer.tsx`, `i18n.ts`, `ui/insight.ts`, `ui/Toolbar.tsx`, `api.ts`, `app.css`, `ui/theme.css` | R8–R13, R19 (a row-line token between subtle and default, light and dark) |
| `apps/grid/src/grid/Grid.tsx`, `Selection.tsx` | R15 |
| `packages/studio/src/datasets.ts`, `queries.ts` | R16 |

### Task 1: The engine's declarations and who may write

**Files:** as in the table's engine rows. Create `packages/engine/test/column-writers.test.ts`. Extend the engine's `selection-domain.ts` fixture with **new** datasets and columns only, because it backs `drawer-actions.test.ts`, `selection-actions.test.ts` and two e2e instances; no existing dataset changes. Or give the new test a fixture of its own.

**Interfaces:**
- `ColumnDecl.written_by?: 'service'`
- `ColumnDecl.footer?: 'sum' | 'none'` (integer or real columns only)
- `DatasetDecl.created_by?: 'service'`
- `AttachmentsDecl.deleted_by?: 'person'`
- `BoardDecl.drag?: false`
- a transition's `primary?: true`, only with `button`
- `LinkDecl.meter?: false`
- `QueryDecl.selectable?: true`, only with `of`
- `valuesOf(…, options?: { trusted?: true })`, passed on to the private `answeredOf`
- the refusal is HTTP 403 `{ code: 'service_only', message }`
- `/schema` per viewer:
  - a `written_by` column carries `readonly: true` for a non-service viewer;
  - `footer` on columns;
  - `created_by` on the source;
  - `board.drag`;
  - `lifecycle.buttons: true` when any transition declares a button;
  - `link.meter`;
  - `selectable` on queries.
- rows' `available.buttons[]` carry `primary` when declared.

- [ ] **Step 1: The docs commit.**
- [ ] **Step 2: Tests (RED first for the denials).** Each denial in the Test map's list.
  - Also: "a service's PATCH and POST answer 200/201".
  - Also: "/schema serves readonly per viewer, lifecycle.buttons and the other shapes".
  - Also: "a row's available.buttons carries primary".
  - Also: each validation refusal in the Files table.
- [ ] **Step 3: Implement.** Run the file, `bun test packages scripts` and `bun run check`: PASS.
- [ ] **Step 4: Commit:** `feat(engine): who may write a column or create a row, and the grid's presentation shapes`.

### Task 2: The grid honours the shapes; studio declares them (first working version)

**Files:** the grid rows for R1, R2, R4–R7, R14, R17, `i18n.ts` (`service_only`), their tests, and `packages/studio/src/datasets.ts` (R16 except `selectable`).

**Interfaces:**
- **Consumes:** Task 1's served JSON.
- **Studio declares:**
  - site: naam, in_registry and the health columns are `written_by: 'service'`; `created_by: 'service'`; screenshots `deleted_by: 'person'`.
  - onderhoud: `created_by: 'service'`, every column `written_by: 'service'` (Ruling), and its writer drops `delete` (R18).
  - site: its writer drops `delete` (R18).
  - actie: its board `drag: false`; Bevestigen `primary: true`.
  - statuscode, responstijd_ms and tls_dagen: `footer: 'none'`.
  - actie.sites: `meter: false`.

- [ ] **Step 1: Tests.**
  - **Grid:**
    - "a read-only-to-you column offers no inline edit and its board does not drag" (no new code needed: `columns.ts:179`, `App.tsx:680`; the test pins it);
    - "a board with drag false does not drag; cards open";
    - "a created_by service model offers a person no + Nieuw, board +, quick create, dashboard quick action or composer create";
    - "a lifecycle column with button transitions has no inline select and no board drag" (R17, read from `lifecycle_buttons`);
    - "footer none totals nothing in the foot, the group band and the Excel total";
    - "a primary button renders filled";
    - "meter false shows no count in the drawer head or the cell's bar";
    - R14 "a query view without creates shows no + Nieuw";
    - "service_only reads in Dutch".
  - **Existing tests that change:**
    - `apps/grid/src/ui/App.test.tsx:1649-1655` ("+ New is blocked on a query view", theatre's Dagplanning): R14 removes the button. Assert its absence.
    - `packages/studio/test/ownership.test.ts:68, 102, 124, 168`, and the admin pass of `:163` (the PATCH): now the engine's 403 `service_only`, not the writer's message. The worker pass of `:163` still gets the writer's `LOG_FIXED`.
    - R18: `ownership.test.ts:103` (admin DELETE site), `:164` (both passes of DELETE onderhoud) and `:195-197` (worker DELETE site): now 405 `read_only`.
    - Studio test: "the undo of the sync's site create answers 405 read_only, and the row stays".
    - `packages/studio/test/seed.test.ts:117-120` is a `/schema` test, so its new assertion is `created_by: 'service'` on site and onderhoud, replacing the stale `new_label` assertion.
    - `e2e/studio.spec.ts:414-444` (sites-board-and-gallery, CHECKS.md:202) and `:543-566` (person-cannot-take-worker-steps, CHECKS.md:205): assert no drag.
  - **e2e:** `no-edit-on-worker-columns` and `no-new-where-not-allowed` in `e2e/studio.spec.ts`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the grid tests, `bun test packages/studio`, `bun run check`, and `flock … bunx playwright test e2e/studio.spec.ts`. Take a screenshot of the Sites table and an opdracht drawer.
- [ ] **Step 4: Commit:** `feat(grid): offer only what a person can do; studio declares it`.

### Task 3: Grid fixes

**Files:** `apps/grid/src/grid/Drawer.tsx`, `drawer/Sections.tsx` (HistorySection), `ui/insight.ts`, `ui/Toolbar.tsx`, `api.ts`, `i18n.ts`, `app.css`, and their tests.

- [ ] **Step 1: Tests:**
  - **R8:** "the live mark reads Volgt live".
  - **R9:** "a press, an undo, and a live poll that changed the state re-read the history", in the table, related, board and dashboard drawers.
  - **R10:** "one pill per tone, bad before warn". This includes theatre's Toewijzing case: with geweigerd, geannuleerd and uitgenodigd present, it shows "Geweigerd · Geannuleerd N" and "Uitgenodigd M".
  - **R11 (e2e at 1440 px, `toolbar-at-1440`):**
    - a long save error is truncated, and the toolbar's height does not change;
    - "+ Nieuw" does not cover an open drawer's title.
  - **R12:** "the drawer's actions sit under its buttons".
  - **R19:** "a table row's separator uses the stronger row-line token" (a component test on the computed class or token; the shake-out screenshot at 150% device scale shows it).
  - **R13:** "a fetch that cannot reach the server reads Geen verbinding met de server. Probeer het opnieuw., with code unknown", through `api.ts` and `uploadAttachment`.
  - **Existing tests that change:**
    - R8: `apps/grid/src/grid/useLiveHost.test.tsx:39,44`; `e2e/drawer-actions.spec.ts:89,95,151`; `e2e/studio.spec.ts:205`.
    - R10: `apps/grid/src/ui/insight.test.ts:15-21` (the return becomes a list).
    - R13: `apps/grid/src/api.test.ts:85-87`.
    - R12: `e2e/step-1.spec.ts:194`, `step-2.spec.ts:208` and `ui-fit.spec.ts:414` find the action by role and are expected to stay green. `action-inputs.spec.ts:276-277` measures the alert against the action's own button and is expected to stay green. Confirm each in the ledger.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the grid tests, `bun run check`, and the changed e2e under the lock.
- [ ] **Step 4: Commit:** `fix(grid): the live mark, history, worst tone, toolbar, actions on top, a Dutch connection error`.

### Task 4: Tick on a selectable query view

**Files:** `apps/grid/src/grid/Grid.tsx`, `Selection.tsx`, `ui/App.tsx`, `engine.ts`, `packages/studio/src/queries.ts`, tests, `e2e/studio.spec.ts`.

**Interfaces:**
- **Consumes:** `Model.selectable`, and the `of` model's actions.
- **Produces:** a selectable query view offers its `of` dataset's selection actions that have no `when`. The query row's drawer offers none.

- [ ] **Step 1: Tests:**
  - "a selectable query view offers its dataset's selection actions without when; a non-selectable one offers none";
  - "ticked rows run as the dataset's records": one `runSelection` with the query rows' ids;
  - Studio: "sites_aandacht is selectable, and its ids are site ids";
  - e2e `tick-on-a-query-view`: in Sites met aandacht, tick two, run Gezondheid checken, and the opdracht opens with exactly those two.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the grid tests, `bun test packages/studio`, and the e2e under the lock.
- [ ] **Step 4: Commit:** `feat(grid): tick rows on a selectable query view; studio's Sites met aandacht`.

## Close

1. The gate under the lock is green and read; then push.
2. The reviewer runs `/feature-review studio-polish`, with security-sentinel.
3. One fix pass; `specs/studio-polish/review.md` verbatim.
4. `/shakeout` drives the four flows and the changed studio rows. Stefan's screenshots:
   - Sites with read-only worker columns and no "+ Nieuwe site";
   - an opdracht drawer with a primary Bevestigen and "Volgt live";
   - Sites met aandacht with rows ticked;
   - a theatre view with its new pill (R10's visible change).
5. Push, then the final list. No merge, no operator verb.

**Execution mode:** Native, except Task 1, which runs subagent-driven. Rule fired: the engine's write, create and delete refusals are an access rule.
