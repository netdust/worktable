# Drawer actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A record an action makes opens in the drawer at once. The drawer stays live while an outside process has the record, and offers the next steps as buttons on the record and on each of its link items. Every one of these is declared by the domain, so a new button, state or action needs no engine change.

**Architecture:**
- The engine gains declarations:
  - a button and a condition on a lifecycle transition;
  - live states on a lifecycle;
  - a detail column on a link;
  - `opens` and a condition on an action.

  It then marks, on every row and link item it serves, which buttons and actions apply for the viewer. The server is the one judge; the grid renders what it marks.
- A button press is the existing PATCH with `expect`, and an action run is the existing action route. No new write path.
- The grid renders the marked buttons in every drawer and on link items. It polls an open drawer while its record is in a live state, opens an action's result, and opens a drawer from a dashboard list row.

**Tech Stack:** Bun, Hono, SQLite, TypeScript, React (apps/grid), Vitest, Playwright, bun:test.

**Spec:** `specs/drawer-actions/spec.md` (R1–R7; parent `specs/studio/spec.md`).

**Branch:** `feature/drawer-actions`, cut from `main` after `feature/selection-actions` has merged. It extends that branch's fixture domain, drawer link items and actions.

## Global Constraints

- `packages/engine` and `apps/grid` know no domain word. `bun run check` stays green; it scans `packages/engine` (fixtures included) and `packages/mcp` against theatre's and fiche's names only, so the grid's and the fixture's words are chosen neutral by hand.
- `/schema` does not serve the transitions themselves: the marks on each row carry the button labels (the spec's Constraints say so since the round-1 review).
- `docs/SPEC.md` changes first, in Task 1's first commit. The engine's surface gains:
  - a transition's `button` and `when`;
  - a lifecycle's `live`;
  - a link's `detail`;
  - an action's `opens` and `when`;
  - the `available` marks on served rows and link items.
- Existing lifecycle behaviour is unchanged: roles, `expect`, undo by inverse, hooks, tokens, the token page's `label`. Theatre declares no `button`, so its UI does not change. Its tests pass untouched.
- A button press writes through `api.update(..., expect)`, the existing path. An action run goes through the existing route. No new route.
- A drawer polls only while it is open and its record is in a live state: every 3 s, and it stops on close or on leaving the state. No list view polls.
- Dutch UI copy. The e2e lock: every Playwright run and the gate under `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate`.
- The fixture instance is selection-actions' (4314/5177), extended. No new ports.

## Threat model

**Assets:** the integrity of lifecycle transitions, and which records a viewer can learn about or act on.

**Attacks**
1. **A viewer is shown, and presses, a button for a transition their role may not make** → `available` is computed per viewer from the transition's roles. The press is an ordinary PATCH with `expect`, which the lifecycle and the writer judge as today, so a forged press of a hidden button is refused by the same rules. (`available.ts`; `writes.ts` unchanged.)
2. **A transition's `when` is taken for an access control**, so the domain relies on it to stop a write → by design, `when` decides only whether the button shows. The `declare.ts` doc says so.
   - **The stale-press race:** `expect` compares only the record's own lifecycle column, never a lookup in `when`. A button pressed from a drawer that has not yet re-read, e.g. "Niet nu" after the parent moved on, is judged only by the roles and the writer.
   - So a domain's writer must mirror every `when` that matters. That rule goes to studio's plan.
3. **An action is run on a record its `when` excludes**, through the route directly or the MCP → the route judges `when` with the same `availableOf` on the record read through `rowOf(store, dataset, id, scopeOf(actor, source))` (`writes.ts:717-726`). That read carries lookups, in the caller's scope, inside the transaction. It refuses 422 `condition_not_met` before `run`. (`actions.ts`.)
4. **The `available` marks leak what a viewer cannot read** → marks use the row exactly as read in the caller's scope (owners included, as GET /rows serves it). A key absent from that row never matches, not even `null`. The route uses the same read. Validation only checks that a condition names a column or lookup the source declares. (`available.ts`, `rows.ts`.)
5. **Polling becomes a load problem** (a stuck live state, many open tabs) → only an open drawer polls, every 3 s, one record plus its link items. It backs off to 15 s after 3 errors, and stops on 401, 403 or 404, on `rowOf` answering `null` (gone or out of scope), on close, or on leaving a live state, judged on the re-read row (Task 2's `fresh`). Cookie sessions have no read limit, so the bound is the grid's. (Grid `useLive`.)
6. **`opens` opens a record the viewer cannot read** → the grid opens it through Grid's existing `openRelated` (`Grid.tsx:318-326`), which reads with `rowOf` (the scoped GET) and shows the `recordGone` notice on a miss. (Grid.tsx.)

**Mitigations (where they live):**
- `packages/engine/src/available.ts` (new): availability per row and per link item, shared by the marks and the route.
- `actions.ts`: `when` refusals.
- `validate.ts`: declarations; conditions only on declared columns and lookups; `available` reserved.
- `apps/grid/src/grid/useLive.ts` (new): polling and its stops.
- `apps/grid/src/grid/Grid.tsx` `openRelated`: `opens`.

**Deferrals**
- A transition's `when` is not enforced on writes (attack 2, by design).
- No push from the server. Polling is the mechanism.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Declarations, validation, availability marks, action `when` (engine) | `/schema`, `GET /api/rows/:source`, `POST /api/actions/:name` | integration · `packages/engine/test/drawer-actions.test.ts` · `bun test packages/engine/test/drawer-actions.test.ts` | — |
| Drawer buttons and link-item buttons, the detail line (grid) | every drawer's DOM; App's write path | component · `apps/grid/src/grid/DrawerButtons.test.tsx`, `apps/grid/src/ui/App.test.tsx` (extended) · `bun run --filter @worktable/grid test -- DrawerButtons` and `-- App` | press-a-button, link-item-button |
| Live drawer and `opens` | `useLive`; App's `act` | component · `apps/grid/src/grid/useLive.test.ts`, `App.test.tsx` · `bun run --filter @worktable/grid test -- useLive` and `-- App` | action-opens-its-result, drawer-follows-an-outside-change |
| Selection bar disabled by `available` | the bar's DOM | component · `apps/grid/src/grid/Selection.test.tsx` (extended) · `bun run --filter @worktable/grid test -- Selection` | — |
| Dashboard list row opens a drawer (R7) | the dashboard's DOM | component · `apps/grid/src/dashboard/Dashboard.test.tsx` (extended, `describe('a list tile')`) · `bun run --filter @worktable/grid test -- Dashboard` | dashboard-row-opens-drawer |

Denial tests, each RED first:
- "a button is not marked for a role the transition does not list";
- "an action run on a record its when excludes is refused 422 and run is never called" (single and selection);
- "validation refuses a when on a column or lookup the source does not serve, or with an operator other than equality and $in";
- "the drawer stops polling on close and on leaving a live state".

## Review Focus

1. **A button for a transition the viewer may not make never shows**, and a forged press is refused as before → row 1 ("a button is not marked for a role…"), plus the existing lifecycle tests unchanged.
2. **An action is never run on a record its `when` excludes,** by any path (grid, route, MCP) → row 1 (the 422 tests, single and selection).
3. **Polling never runs without an open drawer on a live record** → row 3 ("stops on close", "stops on leaving a live state", "backs off after errors").
4. **After a press or an outside change, the drawer shows the current state, its buttons and its link items' buttons.** After an inline edit, it shows the row's own buttons; the reply carries no links, as today → rows 1–3: the write reply carries the marks, and the drawer prefers its re-read row. For role and state, a stale button is refused by `expect`. For a `when`, see threat 2.
5. **Theatre's UI is unchanged:** no `button`, so no drawer buttons → row 2 ("a transition with only a label shows no button").

---

## Architecture

**First working version:** Task 2. In the fixture instance, opening a record shows its declared buttons, and pressing one moves the record and re-reads the drawer. Task 1 is the engine seam it needs.

**Simplest design.** The simplest design is buttons computed by the grid from `/schema`'s transitions and the row's state. It fails on two counts:
- the per-row conditions, especially through lookups and on link items, would need a second rule engine in the grid;
- the grid and the server could then disagree.

So the server marks availability per row. The deciding reasons:
- link items carry no columns (`rows.ts:244`), so the grid could not judge their conditions;
- the action route needs the server-side evaluator for its 422 anyway.

One evaluator serves both. Polling, not push, because the engine has no push channel and only an open drawer needs it. Opening an action's result reuses Grid's `openRelated`.

**Files:**

| File | Responsibility |
|---|---|
| `packages/engine/src/declare.ts`, `index.ts` | the declarations below, exported |
| `packages/engine/src/available.ts` | `availableOf(domain, source, row, actor): { buttons: { to: string; label: string }[]; actions: string[] }` |
| `packages/engine/src/rows.ts` | each served row of a source with declared buttons or action conditions carries `available`; link rows are read with `lookupSelect(linked, scope)` (`cellsOf` unchanged, so the matrix payload does not grow), and link items carry their link record's `available` and the `detail` text (owners: only when its column is owner_visible, as `count`) |
| `packages/engine/src/actions.ts` | `when` checked per record before `run` (422 `condition_not_met`) |
| `packages/engine/src/app.ts` | `/schema` serves `live`, `detail`, and the actions' `opens`; the write `reply` carries `available` through the same `availableOf` |
| `packages/engine/src/validate.ts` | declarations checked; `available` added to `OVERWRITTEN` and `LOOKUP_RESERVED` |
| `packages/engine/test/fixtures/selection-domain.ts` | extended: a lifecycle with buttons (one with `when` through a lookup) and live states; the link dataset with a lifecycle and buttons; `detail`; a selection action with `opens` and `when` |
| `apps/grid/src/types.ts`, `engine.ts`, `api.ts` | `Row.available`, `LinkItem.available`/`detail`, `Model.live`, `ModelAction.opens`; `toRow` takes `available` out of `fields` |
| `apps/grid/src/grid/DrawerButtons.tsx` | the buttons for one record, and the press (through a `DrawerWrite` context App provides) |
| `apps/grid/src/grid/Drawer.tsx`, `drawer/Sections.tsx`, `drawer/PlaceRow.tsx` | the record's buttons; each link item's buttons and detail line |
| `apps/grid/src/grid/useLive.ts` | the poll for an open drawer |
| `apps/grid/src/grid/Grid.tsx`, `useOpenRow.tsx`, `calendar/Calendar.tsx`, `dashboard/Dashboard.tsx`, `dashboard/ListTile.tsx` | every drawer host passes `onDone` (which renders `DrawerButtons`) and wires `useLive`; list rows open a drawer; the matrix passes no `onDone`, so it stays out by construction |
| `apps/grid/src/ui/App.tsx` | the `DrawerWrite` context (press → `api.update` with expect → history with `refresh: onDone` → notice); `act`/`actOnSelection` resolve to `{ dataset, id } \| null` for Grid to open |
| `apps/grid/src/grid/Selection.tsx` | the bar disables an action when a ticked row's `available.actions` lacks it |
| `e2e/drawer-actions.spec.ts` | the flows |
| `docs/SPEC.md` | the surface |

### Task 1: Declarations, availability and the action condition (engine)

**Files:** Modify `docs/SPEC.md`, `packages/engine/src/declare.ts`, `index.ts`, `rows.ts`, `actions.ts`, `app.ts`, `validate.ts`, `test/fixtures/selection-domain.ts`. Create `packages/engine/src/available.ts`, `packages/engine/test/drawer-actions.test.ts`.

**Interfaces:**
- Produces:
  - `type Condition = Record<string, string | number | boolean | null | { $in: (string | number | boolean | null)[] }>`
  - The lifecycle transition gains `button?: string; when?: Condition`.
  - `LifecycleDecl.live?: string[]`
  - `LinkDecl.detail?: string` (a column of the link dataset)
  - `ActionDecl` and `SelectionActionDecl` gain `opens?: true; when?: Condition`.
  - Served rows carry `available?: { state: string | null; buttons: { to: string; label: string }[]; actions: string[] }`, present only on sources that declare a button or an action condition. `state` is the lifecycle value the marks were computed against, which the grid sends as `expect`. Link items carry `available` and `detail` the same way. The write `reply` carries `available` too.
  - `availableOf` drops a transition whose `to` equals the current state (a `'*'` from includes it).
  - The action route answers 422 `condition_not_met` when a record does not match.

- [ ] **Step 1: The docs commit:** `docs/SPEC.md`'s engine surface, per the Global Constraints. Commit: `docs: the engine's surface gains drawer buttons, live states, link details and action conditions`.
- [ ] **Step 2: Extend the fixture:**
  - a lifecycle on the parent with two buttons, one carrying `when` on a lookup, and one `'*'` transition with a button;
  - `live: [...]`;
  - the lifecycle, the buttons, `detail` and a writer `update` all go on the **new** owner link dataset below. `tie` and gather's ties stay untouched;
  - a **new** selection action with `opens: true` and a `when` on a lookup. `gather` stays as it is; it is used by `selection-actions.test.ts:78-94` and `packages/mcp/test/tools.test.ts:194-201`;
  - one transition with only `label`, which must show no button;
  - the **new** link dataset from `bundle` declares `owners` (its owner column points at bundle) and:
    - a lifecycle whose button carries a `when` on a lookup to the parent's state;
    - a writer `update`;
    - `detail`, with one owner_visible column and one not, so the owner's detail rule has a case.

    `tie` stays unchanged: `selection-actions.test.ts:154` needs an owner to get 404 on it.
- [ ] **Step 3: Write `drawer-actions.test.ts`:**
  - "a row is marked with the buttons its state, the viewer's role and the condition allow".
  - "a button is not marked for a role the transition does not list" (RED first).
  - "a transition with only a label shows no button".
  - "a link item carries its link record's buttons and its detail text".
  - "a link item's button whose when reads the parent through a lookup is marked only in the matching parent state".
  - "an action whose when names a lookup is marked and run alike": the mark and the route agree.
  - "a key absent from the caller's row never matches, not even null".
  - "an owner gets a link item's detail only when its column is owner_visible".
  - "a '*' transition does not offer a button to the state the record is already in".
  - "a PATCH reply carries the same available as GET /rows".
  - "a column or lookup named available is refused".
  - "/schema serves live, detail and opens".
  - "an action run on a record its when excludes is refused 422 and run is never called" (single and selection, RED first).
  - "validation refuses a when on a column or lookup the source does not serve, or with an operator other than equality and $in"; also "a live state the lifecycle does not have", "a detail column the link dataset does not have", and "an empty button label".
  - "a button press is an ordinary transition": a forged PATCH for a transition the role may not make is refused as before.
- [ ] **Step 4: Run** `bun test packages/engine/test/drawer-actions.test.ts`: FAIL.
- [ ] **Step 5: Implement:**
  - `available.ts` (pure: the transition's from, to and roles, plus the condition on the row as read). It marks no button when the state is not a string, because `expect` takes only a string;
  - the marks in `rows.ts`, on rows and on link items, with link rows read through `lookupSelect(linked, scope)`;
  - the 422 in `actions.ts`, inside the transaction:
    - `readRecord` runs first, with its 404 (actions.ts:101-108);
    - `run` still receives `readRecord`'s record;
    - `rowOf(store, dataset, id, scopeOf(actor, source))` is read only to judge `when`. It filters neither scope nor `deleted_at`, so it never replaces `readRecord`.
  - `available` on the write reply in `app.ts`;
  - the checks and the reserved key in `validate.ts`;
  - the exports, and the `declare.ts` doc stating that a transition's `when` decides only its button.
- [ ] **Step 6: Run** the file, `bun test packages scripts` and `bun run check`: PASS.
- [ ] **Step 7: Commit:** `feat(engine): drawer buttons, live states, link details and action conditions are declared and marked per row`.

### Task 2: Buttons in every drawer (first working version)

**Files:** Create `apps/grid/src/grid/DrawerButtons.tsx`, `DrawerButtons.test.tsx`. Modify `types.ts`, `engine.ts` (`toRow` takes `available` out of `fields`), `api.ts`, `grid/Drawer.tsx`, `drawer/Sections.tsx`, `drawer/PlaceRow.tsx`, `grid/Grid.tsx`, `grid/useOpenRow.tsx`, `calendar/Calendar.tsx` (its own drawer; its re-read is `setOpen(found)`), `dashboard/Dashboard.tsx`, `ui/App.tsx`, `ui/App.test.tsx`, `i18n.ts`, `e2e/drawer-actions.spec.ts`.

**Interfaces:**
- `DrawerButtons({ model, row, onDone })` reads `row.available.buttons`.
- `DrawerWrite` context (App): `press(model: string, id: number, available: Available, to: string, onDone): Promise<void>`. It works the same for a row and a link item. It calls `api.update(model, id, { [lifecycle]: to }, undefined, { [lifecycle]: available.state })`, pushes one history entry with `refresh: onDone`, shows a refusal as a notice, then calls `onDone` to re-read.
- `DrawerButtons` renders only where the host passes `onDone`.
- **Where a re-read lands.**
  - The hosts whose rows are App's store read them as today: the table, calendar, board, timeline, and the gallery, which now gets `store ? state.rows : result.rows` like the others (App.tsx:625-635). Their drawers keep following the store, so a later inline edit, place choice, drop or undo still repaints them.
  - `DrawerWrite` carries `fresh(model: string, row)`. App calls `store.replace(row)` only when `model` is the view's model, because `replace` patches by id alone (store.ts:304-307). A related drawer's record, of another dataset, never overwrites a store row.
  - Only the dashboard's drawer (`opened.row`, Dashboard.tsx:47) and Grid's related drawer (`related`, Grid.tsx:151) hold their own re-read row.
  - The dashboard's `onDone` also calls its `refresh` (Dashboard.tsx:39-40), so the tile's count follows.
- A successful press shows a notice with Undo (as `finished` does, App.tsx:544-547), calling the entry's `refresh`, so Undo is reachable where no store exists (the dashboard).

- [ ] **Step 1: Tests (RED first):**
  - "the drawer shows the row's marked buttons and no others".
  - "a press writes the transition with expect, re-reads, and makes one Undo entry" (App).
  - "a refused press shows a notice and leaves the row as it was" (App).
  - "each link item shows its buttons and its detail line".
  - "a transition with only a label shows no button".
  - "the board's, calendar's, related and dashboard drawers show the buttons too".
  - "a matrix drawer shows none".
  - "a press sends the marked state as expect", for a row and for a link item.
  - "Undo from a related drawer re-reads that drawer".
  - "a press in the board's and the calendar's drawer shows the new state and its next button" (not only that buttons appear).
  - "after a press, an inline edit in the same drawer shows its value".
  - "a press in a related drawer leaves the table's row with the same id as it was".
  - "a press on the dashboard's drawer offers Undo and updates the tile's count".
- [ ] **Step 2: Implement.** Every drawer host passes `onDone` to re-read its row. The table, the related record, `useOpenRow`'s and the dashboard's drawers are all wired. The matrix's drawers are left out.
- [ ] **Step 3: e2e:**
  - **press-a-button:** open a record, press a button, see the new state and the next button, Undo.
  - **link-item-button:** press a link item's button, see its state change in the list.
- [ ] **Step 4: Run** the grid tests, `bun run check` and the e2e file under the lock: PASS. Take a screenshot of a drawer with its buttons and a link item's button for the reviewer.
- [ ] **Step 5: Commit:** `feat(grid): declared transitions are buttons in every drawer and on link items`.

### Task 3: The live drawer, and an action opens its result

**Files:** Create `apps/grid/src/grid/useLive.ts`, `useLive.test.ts`. Modify every drawer host (`Grid.tsx`, `useOpenRow.tsx`, `calendar/Calendar.tsx`, `dashboard/Dashboard.tsx`), `grid/Drawer.tsx`, `ui/App.tsx`, `App.test.tsx`, `grid/Selection.tsx`, `Selection.test.tsx`, `i18n.ts`, `e2e/auth.ts` (a second account on the 4314 instance, with a role the transition lists), `e2e/drawer-actions.spec.ts`.

**Interfaces:**
- `useLive(model, row, reread: () => Promise<Row | null>): { busy: boolean }`. It polls every 3 s while `model.live` includes the re-read row's lifecycle value. It backs off to 15 s after 3 errors, and stops on 401, 403 or 404, on `null` from `rowOf`, on close, or on leaving a live state.
- `onAction`/`onSelection` resolve to `{ dataset, id } | null` for an action with `opens`: `created[0]`, or the acted-on record for a single action that created nothing. Grid opens it:
  - with `setDrawer(id)` only when `state.rows` already holds that id (the single action's own record), keeping the full table drawer;
  - otherwise with its existing `openRelated`, whose drawer carries R1, R2, R4 and R5 after Task 2, and which shows `recordGone` on a miss.
- The drawer hides an action that is missing from `row.available.actions` whenever `available` is present.

- [ ] **Step 1: Tests (RED first):**
  - `useLive`:
    - "polls while live";
    - "stops on close";
    - "stops on leaving a live state";
    - "backs off after errors and stops on 401, 403 and 404".
  - `useLive`: "stops when rowOf answers null", and "stops on leaving a live state" driven through a host built on useOpenRow (the board).
  - App and Grid:
    - "an action with opens opens the created record's drawer after the run", from the bar and from the drawer;
    - "a gone opened record shows the recordGone notice and opens nothing";
    - "the drawer leaves out an action its row is not marked for".
  - Selection: "an action is disabled with Past niet op N rijen when a ticked row's available.actions lacks it".
- [ ] **Step 2: Implement,** with a busy mark in the drawer head.
- [ ] **Step 3: e2e:**
  - **action-opens-its-result:** tick rows, run, and the result's drawer opens.
  - **drawer-follows-an-outside-change:** with the drawer open, the test moves the record's state through the API as a second account, and the drawer shows the new state and buttons within 5 s.
- [ ] **Step 4: Run** the grid tests, `bun run check` and the e2e file under the lock: PASS.
- [ ] **Step 5: Commit:** `feat(grid): a drawer stays live while an outside process has its record, and an action opens what it made`.

### Task 4: A dashboard list row opens its drawer

**Files:** Modify `apps/grid/src/dashboard/ListTile.tsx`, `dashboard/Dashboard.tsx`, `Dashboard.test.tsx` (`describe('a list tile')`), the fixture's views (a dashboard with a list tile over a dataset), `e2e/drawer-actions.spec.ts`.

- [ ] **Step 1: Tests:**
  - "a row of a list tile over a dataset opens its record's drawer, with buttons";
  - "a row of a list tile over a query does not";
  - "the tile's inline set button still works and does not open the drawer".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: e2e:** **dashboard-row-opens-drawer:** click a row in the tile, the drawer opens, press its button, and the tile's count updates.
- [ ] **Step 4: Run** the grid tests and the e2e file under the lock: PASS.
- [ ] **Step 5: Commit:** `feat(grid): a dashboard list row opens its record's drawer`.

## Close

1. `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate` green. Push.
2. The reviewer runs `/feature-review drawer-actions`.
3. One fix pass, kept as `specs/drawer-actions/review.md`.
4. `/shakeout` drives the five flows. Stefan's screenshots:
   - a drawer with buttons and link-item buttons;
   - the live drawer mid-change;
   - the dashboard row's drawer.
5. Push, then the final list. No merge, no operator verb.

**For studio's plan (not built here):**
- Each Site selection action makes the actie its first top-level create, so `created[0]` is the opdracht (`writes.ts:489-494` orders the parent first).
- The Te bevestigen tile reads a view on the actie dataset, not a query, so R7 opens its rows.
- actieSiteWriter mirrors the "Niet nu"/"Toch wel" `when` (threat 2).

**Execution mode:** Native, except Task 1, which runs subagent-driven. Rule fired: availability per viewer, and the action condition on a write route, a security boundary.
