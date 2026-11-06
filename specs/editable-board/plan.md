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
- A query board is always sorted: no `position`, no ranks, no manual order, no within-column reorder; a drop is a regroup through the `writes` column only.
- Undo: one ⌘Z per drop and per "+"; a refused write leaves no step.
- No colours from Orbit; the greyed state uses worktable's own tokens (memory: no coloured rounded borders, text-colour focus ring).
- No calendar, timeline, gallery or grid edits (their own plans). No change to how a lifecycle is declared.
- Engine names are English and generic; Studio names are Dutch. No client data; fixtures are invented. Gate: `bun run gate`. Comments only for a non-obvious why, one line (house rule).

## Threat model

**Assets.** Row integrity under a lifecycle (only declared transitions, only by roles that may make them); what a viewer learns about the lifecycle; the write path of a query (only through `writes`).

**Attacks and mitigations**
1. A client ignores the greying and sends a drop to an unreachable state, or forges the served transitions → nothing changes server-side: `checkTransition` judges every PATCH with the actor's role (writes.ts:304-332); a test sends the forbidden PATCH directly and expects 422.
2. The served transitions leak what another role may do → `/schema` serves only the transitions whose `roles` include the viewer's role, and nothing for an owner or a link account that cannot write the dataset; a test reads `/schema` as each role.
3. A query board's drop writes a column the query does not map → the grid offers drag only on a board column whose field has `writes`, and `updateThrough` (api.ts:327-340) sends only that mapped field (plus `expect` when it is the target's lifecycle column); the engine's query write path refuses anything else (existing).
4. A stale board (the row moved under the viewer) drops on a state no longer reachable → the `expect` is sent as today (api.ts:301-305) and the engine answers 409 `transition_lost`; the grid re-reads (store.ts:288-291), unchanged.

**Deferrals.** A transition's `when` condition gates only its button (declare.ts:331-354), so it is not part of what the board offers. An inherited lookup chosen as the group column stays as it is today (passes `canSet`); not changed here.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Served transitions | `GET /schema` lifecycle (denial: an owner, a link account and an editor see only their own role's transitions) | integration · `packages/engine/test/lifecycle.test.ts` · `bun test packages/engine/test/lifecycle.test.ts` | none — proven by tests |
| Reachable lanes on the board | `reachable()`, `useBoardDrag` collision, keyboard step and land, `Column` look | unit (vitest) · `apps/grid/src/board/reachable.test.ts`, `apps/grid/src/board/Board.test.tsx` · `bun run --filter @worktable/grid test` | board-drag-not-offered (changes `e2e/step-3f.spec.ts` board-drag-refused; registered by `/shakeout`) |
| Lifecycle board drag rule | `boardNeed` (grid engine.ts:302-307), `draggable`/`canSet` (App.tsx:798-801) | unit (vitest) · `apps/grid/src/engine.test.ts`, `apps/grid/src/ui/offered.test.tsx` · same | none — proven by tests |
| Query board drag | `App.tsx:487`/`:734` offer, `updateThrough`, "+" through `createThrough` | unit (vitest) · `apps/grid/src/ui/offered.test.tsx`, `apps/grid/src/board/Board.test.tsx`, `apps/grid/src/api.test.ts` · same | query-board-drag (Studio "Op tafel"; registered by `/shakeout`) |
| "+" undo | `onCreated` (App.tsx:765-773) | unit (vitest) · `apps/grid/src/ui/App.test.tsx` · same | board-column-plus-undo (registered by `/shakeout`) |

## Review Focus

- A forbidden transition sent directly (bypassing the board) is still 422, and a stale drop still 409 with a re-read (row 1, threats 1 and 4).
- `/schema` serves each role only its own transitions; an owner and a link account get none (row 1, threat 2).
- While a card is dragged, an unreachable lane takes no drop by mouse or keyboard (←→ skips it), is drawn greyed, and the "Geen" lane on a lifecycle board is never a target (row 2).
- A lifecycle with buttons still offers no drag; a derived board on a lifecycle without buttons now drags (row 3).
- A query board drags only through a `writes` column, sends only the mapped field, never a `position`, and its "+" creates through the query's `creates` (row 4, threat 3).
- "+" leaves exactly one undo step; a refused create none (row 5).

## Simplest design

The simplest design is to keep today's behaviour (any lane accepts the drop, the engine refuses after), which fails the approved "not offered" rule. The next simplest, used here, serves the role's transitions and filters lanes in the grid: one served list, one pure function, and three call sites in the drag hook. Asking the engine per card which states it may reach (an `available` per row) was rejected: it adds a read per drag for an answer the declaration already holds, and `when` gates only buttons.

---

### Task 1: The engine serves the viewer's transitions

**Files:**
- Modify: `packages/engine/src/app.ts` (`servedLifecycle` :189-192)
- Test: `packages/engine/test/lifecycle.test.ts` (the `/schema` case :436-441)

**Interfaces:**
- Produces: `/schema` source `lifecycle.transitions?: { from: string[] | '*'; to: string }[]`, only the transitions whose `roles` include the viewer's role, and absent when the viewer may not write the dataset.

- [ ] **Step 1: Write the failing tests:** an editor reads the theatre fixture's lifecycle and gets exactly the editor's transitions as `{from, to}`; an administrator gets its own (a superset where declared); an owner and a link account get no `transitions` key; a transition declared for administrators only is absent for an editor; a forbidden PATCH by an editor is still 422 `transition_not_allowed` (the backstop).
- [ ] **Step 2: Run** `bun test packages/engine/test/lifecycle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `servedLifecycle`, beside `buttons`; `roles` and `button`/`when` are not served.
- [ ] **Step 4: Run** the same command plus `bun test packages/engine` and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): /schema serves the transitions the viewer's role may make`.

### Task 2: The board offers only reachable lanes

**Files:**
- Create: `apps/grid/src/board/reachable.ts`
- Modify: `apps/grid/src/engine.ts` (`EngineSource.lifecycle` :96, `modelOf` :239-241; remove the lifecycle `drag:false` in `boardNeed` :302-307), `apps/grid/src/types.ts` (`Model` :117-118), `apps/grid/src/board/useBoardDrag.ts` (`collide` :236-262, `step` :264-278, `land` :228-244), `apps/grid/src/board/Column.tsx` (`ColumnLook` :8-12), `apps/grid/src/board/board.css`, `apps/grid/src/engine.test.ts` (:809-811), `e2e/step-3f.spec.ts` (`board-drag-refused` :641-777)
- Test: `apps/grid/src/board/reachable.test.ts`, `apps/grid/src/board/Board.test.tsx`

**Interfaces:**
- Produces: `export function reachable(model: Model, column: string, from: string | null, to: string | null): boolean` — true for any lane when `column` is not the model's lifecycle; else `to !== null` and `to === from` (staying is a reorder, not a transition) or some served transition has `to` and `from` either `'*'` or containing `from`.

- [ ] **Step 1: Write the failing tests:** `reachable` per case (non-lifecycle column, `'*'`, listed `from`, unlisted, the null lane, the same lane); on a lifecycle board a lifted card draws the unreachable lanes with the greyed look and its own lane plain; a pointer drop on an unreachable lane writes nothing and leaves no undo step; ←→ with the keyboard skips unreachable lanes; a reachable drop writes as today with one undo; a derived board on a lifecycle without buttons now drags (the `boardNeed` test flips); a lifecycle with buttons still does not drag.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement:** serve `transitions` into `Model.lifecycle_transitions`; pass the dragged card's state to the hook; filter `droppableContainers` in `collide`, skip in `step`, return `kind: 'none'` in `land` for an unreachable lane; a `blocked` flag on `ColumnLook` with a CSS state (muted header and body, no drop tint) in worktable's tokens; drop the lifecycle clause of `boardNeed`. Rewrite `board-drag-refused` to "not offered": the Bevestigd → Geweigerd drag is no longer possible by mouse or keyboard (the card stays, no request is sent), keeping its reload and undo assertions.
- [ ] **Step 4: Run** the command plus `bun run check`; then look at "Bord toewijzingen" in a throwaway theatre engine and grid, and lift a Bevestigd card.
- [ ] **Step 5: Commit** `feat(grid): a lifecycle board offers only the lanes a transition reaches`.

### Task 3: A query board drags through its `writes` column

**Files:**
- Modify: `apps/grid/src/ui/App.tsx` (`boardDrops` :487, "+" :734, `draggable`/`canSet` :798-801), `apps/grid/src/api.ts` (`updateThrough` :327-340), `apps/grid/src/board/drop.ts` (a query board is never manual), `apps/grid/src/ui/hints.ts` (:11-13 follows `boardDrops`)
- Test: `apps/grid/src/ui/offered.test.tsx`, `apps/grid/src/board/Board.test.tsx`, `apps/grid/src/api.test.ts`

- [ ] **Step 1: Write the failing tests:** a board on a query whose board column `writes` to a dataset column offers drag and "+", one whose column has no `writes` offers neither; its drop is a regroup through `updateThrough` with only the mapped field, and with `expect` when that field is the target's lifecycle column; within a column a query board does not reorder (no rank write, no switch to manual); "+" on a query board creates through the query's `creates` with the lane value mapped to the target field; a refused write snaps back as on a dataset board.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** replacing `!model.query` with "the board column has `writes`" at both sites; never-manual for a query board in `drop.ts`; `updateThrough` adds the `expect`; the "+" preset mapped through `writes.field` into `createThrough` (App.tsx:471).
- [ ] **Step 4: Run** the command plus `bun run check`; then on a throwaway Studio make a board on "Op tafel" grouped by status and drag a card to Bezig.
- [ ] **Step 5: Commit** `feat(grid): a board on a query drags through its writes column`.

### Task 4: "+" on a board leaves one undo step

**Files:**
- Modify: `apps/grid/src/ui/App.tsx` (`onCreated` :765-773)
- Test: `apps/grid/src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing tests:** "+" in a dataset board's column creates the row with the column's value, and one ⌘Z removes it; a refused create leaves no step; a query board's "+" keeps its undo (already pushed through `target`).
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** pushing the create's batch into `history` for a dataset source too.
- [ ] **Step 4: Run** the command plus `bun run check` and `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(grid): a board's "+" can be undone`.

## Not in this plan

Calendar, timeline, gallery and grid edits (their own plans); a per-row `available` for drag; `when` conditions on drag; a quick title field in place of the "+" dialog (the calendar plan's open question); the inherited-lookup group column.
