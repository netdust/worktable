# editable-board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board offers exactly the edits its shape means: a card dragged to another column writes the column, but on a lifecycle column only to a column the viewer's role may reach (the others greyed, taking no drop); a board on a query drags through its `writes` column; "+" creates with one undo.

**Architecture:** Most of the board row of R3 already exists (step 3e/3f: drag writes the column through the store, optimistic paint, snap back with the Dutch refusal, one undo, manual order, keyboard drag, "+" with the column's value). This plan closes four gaps. The engine serves, per viewer, the transitions their role may make (`/schema` lifecycle `transitions`); the board computes which lanes a dragged card can reach and skips the rest in collision, keyboard steps and the drop, drawing them greyed; the old "no drag on a derived lifecycle board" rule goes; a lifecycle with button transitions stays button-only; a query board drags through its `writes` column as a sorted board; "+" on a dataset board leaves an undo step.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, Zod, Biome, TypeScript; React + vitest + dnd-kit in `apps/grid`; Playwright e2e.

**Spec:** `specs/work-model/spec.md` (R3, the board row, with the 2026-11-06 rulings: greyed unreachable columns, button lifecycles stay button-only, query boards drag through `writes`, always sorted). `docs/SPEC.md` carries the same since this plan's first commit (Skins: board; Work model: *Editable skins*, Board). This replaces step 3f's B9.

**First working version:** Task 2 — on theatre's "Bord toewijzingen" (toewijzing.state, a lifecycle board), lifting a Bevestigd card greys the columns no transition reaches, and a drop there does nothing. Task 1 is what it stands on.

## Global Constraints

- The engine stays domain-free: no Dutch domain word in `packages/engine`, `packages/mcp` or `apps/grid/src`; `bun run check` enforces it.
- The engine stays the authority: every drop is an ordinary write through the writer and `checkTransition` (writes.ts:314-332) with its `expect`; the served transitions only decide what the grid offers, never what the engine accepts. The existing refusals (422 `transition_not_allowed`, 409 `transition_lost`) and their Dutch texts stay.
- A lifecycle with button transitions (`lifecycle_buttons`) offers no drag, as `pressedOnly` (grid/columns.ts:281) decides today. Studio's Opdrachten board keeps its declared `drag: false`.
- On a lifecycle board the "Geen" lane (`value: null`) is never reachable.
- A board column's lifecycle is the effective one: its own model's lifecycle, or, on a query, the target model's lifecycle when the column `writes` to that model's lifecycle column (e.g. theatre's `persoon_dag.state` → `toewijzing.state`). Greying, the "Geen" rule and the button-only rule apply through `writes` exactly as on the dataset board.
- A query board is always sorted: no `position`, no ranks, no manual order, no within-column reorder; a drop is a regroup through the `writes` column only.
- Undo: one ⌘Z per drop and per "+"; a refused write leaves no step.
- No colours from Orbit; the greyed state uses worktable's own tokens (memory: no coloured rounded borders, text-colour focus ring).
- No calendar, timeline, gallery or grid edits (their own plans). No change to how a lifecycle is declared. Two shared pieces change on purpose: `canSet` (board drag and "+") resolves a button lifecycle through `writes`, while the grid's `columnsFor`/`pressedOnly` stays as it is; and `updateThrough` sends `expect` for a target's lifecycle column, which also protects a grid cell edit through a query (stale state answers 409 instead of overwriting).
- Engine names are English and generic; Studio names are Dutch. No client data; fixtures are invented. Gate: `bun run gate`. Comments only for a non-obvious why, one line (house rule).

## Threat model

**Assets.** Row integrity under a lifecycle (only declared transitions, only by roles that may make them); what a viewer learns about the lifecycle; the write path of a query (only through `writes`).

**Attacks and mitigations**
1. A client ignores the greying and sends a drop to an unreachable state, or forges the served transitions → nothing changes server-side: `checkTransition` judges every PATCH with the actor's role (writes.ts:304-332); a test sends the forbidden PATCH directly and expects 422.
2. The served transitions leak what another role may do → `/schema` serves every role only the transitions whose `roles` include it (an owner user included: owners are declared on transitions and `checkTransition` lets them make those); a link account never reads `/schema` (403 by `confineLinkActor`, record-link.ts:64-81, held by record-link.test.ts:269-278). A test reads `/schema` as administrator, editor and owner.
3. A query board's drop writes a column the query does not map → the grid offers drag only on a board column whose field has `writes`, and `updateThrough` (api.ts:326-340) PATCHes only that mapped field on the target dataset (plus `expect` when it is the target's lifecycle column). The engine has no query write route (writableOf answers 405, writes.ts:71-75): the PATCH is an ordinary dataset write, judged by `cutBody`, `checkTransition` and the role, so a client gains nothing by bypassing the board.
4. A stale board (the row moved under the viewer) drops on a state no longer reachable → the `expect` is sent as today (api.ts:301-305) and the engine answers 409 `transition_lost`; the grid re-reads (store.ts:288-291), unchanged.

**Deferrals.** A transition's `when` condition gates only its button (declare.ts:331-354), so it is not part of what the board offers. An inherited lookup chosen as the group column stays as it is today (passes `canSet`); not changed here. When a query's `writes` target is not served to the viewer, `lifecycleOf` returns null and every lane is offered; the engine still refuses an unreachable write (threat 1), so this is display only.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Served transitions | `GET /schema` lifecycle (denial: each role sees only its own transitions) | integration · `packages/engine/test/lifecycle.test.ts` · `bun test packages/engine/test/lifecycle.test.ts` | none — proven by tests |
| Reachable lanes on the board | `reachable()`, `useBoardDrag` collision, keyboard step and land, `Column` look | unit (vitest) · `apps/grid/src/board/reachable.test.ts`, `apps/grid/src/board/Board.test.tsx`; e2e · `e2e/step-3f.spec.ts` (board-drag-refused becomes board-drag-not-offered and board-drop-stale) · `bun run --filter @worktable/grid test`; `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag-not-offered|board-drop-stale"` | board-drag-not-offered, board-drop-stale (registered in CHECKS.md by Task 2, which edits :152; `/shakeout` adds no second row) |
| Lifecycle board drag rule | `boardNeed` (grid engine.ts:302-307), `draggable`/`canSet` (App.tsx:798-801) | unit (vitest) · `apps/grid/src/engine.test.ts`, `apps/grid/src/ui/offered.test.tsx` · same | none — proven by tests |
| Query board drag | `App.tsx:487`/`:734` offer, `updateThrough`, "+" through `createThrough` | unit (vitest) · `apps/grid/src/ui/offered.test.tsx`, `apps/grid/src/board/Board.test.tsx`, `apps/grid/src/api.test.ts` · same | query-board-drag (Studio "Op tafel"; registered by `/shakeout`) |
| "+" undo | `onCreated` (App.tsx:765-773) | unit (vitest) · `apps/grid/src/ui/App.test.tsx` · same | board-column-plus-undo (registered by `/shakeout`) |

## Review Focus

- A forbidden transition sent directly (bypassing the board) is still 422 (row 1, threat 1); a stale drop is 409 `transition_lost`, the card re-read, and on a manual board one ⌘Z undoes the edit before it (row 2, threat 4).
- `/schema` serves each role only its own transitions, an owner user its declared ones (row 1, threat 2).
- While a card is dragged, an unreachable lane takes no drop by mouse or keyboard (←→ skips it), is drawn greyed, and the "Geen" lane on a lifecycle board is never a target (row 2).
- A lifecycle with buttons still offers no drag; a derived board on a lifecycle without buttons now drags (row 3).
- A query board drags only through a `writes` column, sends only the mapped field, never a `position`, and its "+" presets the target field (row 4, threat 3).
- A query board whose `writes` column is a target's lifecycle column greys unreachable lanes, never targets "Geen", and does not drag when the target declares buttons (row 4, B1).
- "+" leaves exactly one undo step; a refused create none (row 5).

## Simplest design

The simplest design is to keep today's behaviour (any lane accepts the drop, the engine refuses after), which fails the approved "not offered" rule. The next simplest, used here, serves the role's transitions and filters lanes in the grid: one served list, one pure function, and three call sites in the drag hook. Asking the engine per card which states it may reach (an `available` per row) was rejected: `available` is served only where buttons or `when` actions are declared (available.ts:28-32), which are exactly the boards that do not drag, and it would add a payload to every row of every lifecycle dataset for an answer the declaration plus the role give once.

---

### Task 1: The engine serves the viewer's transitions

**Files:**
- Modify: `packages/engine/src/app.ts` (`servedLifecycle` :189-192 gains the `actor`; called at :377)
- Test: `packages/engine/test/lifecycle.test.ts` (the `/schema` case :436-441; its own `ticket` fixture :32-38 gains an administrator-only transition)

**Interfaces:**
- Produces: `/schema` source `lifecycle.transitions?: { from: string[] | '*'; to: string }[]`, only the transitions whose `roles` include the viewer's role (a link account never reads `/schema`, so no branch for it).

- [ ] **Step 1: Write the failing tests** on the `ticket` fixture: an editor gets exactly the editor's transitions as `{from, to}`; an administrator gets its own; an owner user gets the owner's declared transition (b→c); the administrator-only transition is absent for an editor; a forbidden PATCH by an editor is still 422 `transition_not_allowed` (the backstop).
- [ ] **Step 2: Run** `bun test packages/engine/test/lifecycle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `servedLifecycle`, beside `buttons`; `roles` and `button`/`when` are not served.
- [ ] **Step 4: Run** the same command plus `bun test packages/engine` and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): /schema serves the transitions the viewer's role may make`.

### Task 2: The board offers only reachable lanes

**Files:**
- Create: `apps/grid/src/board/reachable.ts`
- Modify: `apps/grid/src/engine.ts` (`EngineSource.lifecycle` :96, `modelOf` :239-241; remove the lifecycle `drag:false` in `boardNeed` :302-307), `apps/grid/src/types.ts` (`Model` lifecycle fields :105-106, :113-116), `apps/grid/src/board/Board.tsx` (the only caller of `useBoardDrag`, :73: passes the effective lifecycle and the dragged card's state; computes `manual` :71), `apps/grid/src/board/useBoardDrag.ts` (`collide` :138, `step` :166, `land` :230), `apps/grid/src/board/Column.tsx` (`ColumnLook` :12-17), `apps/grid/src/board/board.css`, `apps/grid/src/ui/App.tsx` (`canSet`/`draggable` :798-801 gain `models`, at both call sites), `apps/grid/src/engine.test.ts` (:809-811), `apps/grid/src/ui/offered.test.tsx` (:107), `e2e/step-3f.spec.ts` (`board-drag-refused` :641-777 split into `board-drag-not-offered` and `board-drop-stale`), `specs/CHECKS.md` (:152: the two new greps and descriptions replace the old row, so `scripts/check-checks.ts` in `bun run check` finds them)
- Test: `apps/grid/src/board/reachable.test.ts`, `apps/grid/src/board/Board.test.tsx`

**Interfaces:**
- Produces: `canSet(model, column, models)` and `draggable(view, model, column, models)` in App.tsx, refusing a column whose effective lifecycle has button transitions; `export function lifecycleOf(model: Model, column: string, models: Record<string, Model>): { model: Model; column: string } | null` — the effective lifecycle of a board column (its own, or its `writes` target's when that is the target's lifecycle column); `export function reachable(life: ReturnType<typeof lifecycleOf>, from: string | null, to: string | null): boolean` — true for any lane when `life` is null; else `to !== null` and `to === from` (staying is a reorder, not a transition) or some served transition has `to` and `from` either `'*'` or containing `from`.

- [ ] **Step 1: Write the failing tests:** `reachable` per case (non-lifecycle column, `'*'`, listed `from`, unlisted, the null lane, the same lane); on a lifecycle board a lifted card draws the unreachable lanes with the greyed look and its own lane plain; a pointer drop on an unreachable lane writes nothing and leaves no undo step, also when the pointer first crosses a reachable lane (Bevestigd past Geannuleerd to an unreachable one: no request); ←→ with the keyboard skips unreachable lanes; a reachable drop writes as today with one undo; a derived board on a lifecycle without buttons now drags (the `boardNeed` test flips); a lifecycle with buttons still does not drag; `canSet` through `writes` blocks a query board over a button lifecycle.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement:** serve `transitions` into `Model.lifecycle_transitions`; pass the dragged card's state to the hook; filter `droppableContainers` in `collide`, and when the pointer is over an unreachable lane re-aim to the card's own place (`aim(from)`, `last.current = []`) instead of keeping the previous aim (useBoardDrag.ts:149-150); skip in `step`; return `kind: 'none'` in `land` for an unreachable lane; a `blocked` flag on `ColumnLook` with a CSS state (muted header and body, no drop tint) in worktable's tokens; drop the lifecycle clause of `boardNeed`. Rewrite `board-drag-refused` in two parts. Not offered: the Bevestigd → Geweigerd drag is no longer possible by mouse or keyboard (the card stays, no request is sent; → from Bevestigd skips Geweigerd and the announcement names the next reachable lane). Stale: load the board, move the row by API to a state from which the target lane is no longer valid, then drop on a lane reachable from the shown state; expect 409 `transition_lost`, the card re-read, and on the manual board the existing "one ⌘Z undoes the edit before" assertion (so the refused-write path keeps its e2e).
- [ ] **Step 4: Run** the command plus `bun run check`; then look at "Bord toewijzingen" in a throwaway theatre engine and grid, and lift a Bevestigd card.
- [ ] **Step 5: Commit** `feat(grid): a lifecycle board offers only the lanes a transition reaches`.

### Task 3: A query board drags through its `writes` column

**Files:**
- Modify: `apps/grid/src/ui/App.tsx` (`boardDrops` :487 drops `!model.query`, and "+" :734 on a query is offered only when `model.creates === field.writes.dataset` and the viewer may write that target (`served.writable[target.key]`, as `createBlocked` checks, App.tsx:456-457): `canSet` already refuses a query column without `writes`, since `isReadonly` marks it readonly, engine.ts:158-159), `apps/grid/src/api.ts` (`updateThrough` :326-340), `apps/grid/src/board/Board.tsx` (`manual` :71 false for a query; the "+" preset :83 keyed by `writes.field`), `apps/grid/src/board/drop.ts` (a `sorted` input on `dropOf` :46-61 turns a drop in the card's own column into `none`, so a query board never writes `position`)
- Test: `apps/grid/src/ui/offered.test.tsx`, `apps/grid/src/board/Board.test.tsx`, `apps/grid/src/api.test.ts`

- [ ] **Step 1: Write the failing tests:** a board on a query whose board column `writes` to a dataset column offers drag and "+", one whose column has no `writes` offers neither; its drop is a regroup through `updateThrough` with only the mapped field, and with `expect` when that field is the target's lifecycle column; within a column a query board does not reorder (no rank write, no switch to manual); "+" on a query board is offered only when the query's `creates` is the `writes` target (Studio "Op tafel": `creates: taak`, status writes `taak.status`) and goes through `QuickCreate` (App.tsx:765-772) with the lane value under the target field; a query with `writes` and no `creates` (theatre's `persoon_dag`) offers drag but no "+"; a query board whose `writes` column is a target's lifecycle (theatre's `persoon_dag.state`) greys unreachable lanes, never targets "Geen", and does not drag when the target declares buttons; a refused write snaps back as on a dataset board.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** dropping `!model.query` for drag, and the `creates === writes.dataset` condition for "+"; never-manual for a query board in `Board.tsx`/`drop.ts`; `updateThrough` adds the `expect`; the "+" preset keyed by `writes.field` into `QuickCreate`.
- [ ] **Step 4: Run** the command plus `bun run check`; then on a throwaway Studio make a board on "Op tafel" grouped by status and drag a card to Bezig.
- [ ] **Step 5: Commit** `feat(grid): a board on a query drags through its writes column`.

### Task 4: "+" on a board leaves one undo step

**Files:**
- Modify: `apps/grid/src/ui/App.tsx` (`onCreated` :765-773)
- Test: `apps/grid/src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing tests:** "+" in a dataset board's column creates the row with the column's value, and one ⌘Z removes it; the same holds for every `QuickCreate` (the single `onCreated` at App.tsx:768 serves the calendar's quick create too); a refused create leaves no step; a query's create keeps its undo (already pushed through `target`).
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** pushing the create's batch into `history` for a dataset source too.
- [ ] **Step 4: Run** the command plus `bun run check` and `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(grid): a board's "+" can be undone`.

## Not in this plan

Calendar, timeline, gallery and grid edits (their own plans); a per-row `available` for drag; `when` conditions on drag; a quick title field in place of the "+" dialog (the calendar plan's open question); the inherited-lookup group column.
