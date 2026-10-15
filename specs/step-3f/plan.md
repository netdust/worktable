# Step 3f: the board's drag like Folio, and the four held shapes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board card lands exactly where the board showed it would, stays there after a reload, and can be rearranged by mouse and keyboard; the engine gains `position`, `long`, `flags`, a dataset `tone` and the `filled` group fact, and the grid uses each where the mockups draw it.

**Architecture:**
- Engine: `position` is an engine column on every domain dataset table (the engine's own tables are told apart by `reservedNames`, engine-tables.ts:98-109; no new declaration field). It is served on `/rows`, sorted nulls last (then the sort's other keys, then id), written through the PATCH path beside the domain writer (never handed to it), revised, undone, and masked in `/history`. The other four shapes are declarations: validated in `validate.ts` and served in `/schema`; the grid does the work.
- Grid board: `board/` holds the drag. `rank.ts` (Folio's `rankBetween`, copied with its tests), `drop.ts` (what a drop writes, pure: the ranks of the unranked cards above the slot, then the dropped card), `target.ts` (the slot under the pointer, pure), `useBoardDrag.ts` (dnd-kit sensors, collision, the live target, the writes), and `Board.tsx`/`Column.tsx`/`Card.tsx` render. The store learns a change that writes a second field in the same PATCH, and a step of several writes that one ⌘Z undoes. The page-level ⌘Z leaves `Workspace` for `ui/usePageUndo.ts`.
- Grid shapes: `useTones` and `useFlags` (small hooks next to the views that use them) read the tone dataset and the flag query through `/rows` in the caller's scope; each skin draws its mark. The Toolbar's single insight becomes a list, with a button for flags.

**First working version:** Tasks 1–3: the board drags on dnd-kit and the card lands where it was shown, on the preview. Stefan's complaint is the first thing fixed.

**Simplest design:** Keep react-aria's drag and add a rank: write the rank on drop, sort by it. That keeps the native HTML5 drag, with the browser's ghost and no cards moving aside, which is what Stefan called "not smooth"; the brief names dnd-kit and Folio (brief.md, "on dnd-kit"). The plan uses dnd-kit with Folio's mechanics (sensors, collision, rank, drop kinds) and the mockup's look, and adds what neither has: manual order keeps the previous sort for unranked cards, and a drop ranks the unranked cards above its slot first, so nothing moves but the dropped card (Folio's single write lands a card moved down in an unranked column at the top, and its switch to manual re-sorts the board). The four shapes stay declarations the grid reads through routes it already uses; no new route.

**Tech Stack:** Bun, Hono, Drizzle, SQLite (engine); React 19, `@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0, `@dnd-kit/utilities` ^3.2.2, Vitest + Testing Library, Playwright.

**Spec:** `specs/step-3f/spec.md` (contract: `docs/SPEC.md` "Step 3f adds five shapes", e31433b, 9337459, 089ad81, 5e1b4ee, d0f2369 and the drawer-band line after it; brief and rulings: `specs/step-3f/brief.md`)

**Execution:** subagent-driven (the orchestrator, 2026-10-15, by the policy's triggers: Task 1 touches the write gate, a security boundary, and eleven tasks outlive one context). One task at a time; no subagent runs Playwright while another one, or a gate, does.

## Global Constraints

- `packages/engine` knows no domain word; `bun run check` (vocabulary from theatre and fiche names) stays green. `position`, `long`, `flags`, `marks`, `tone`, `filled` are generic English.
- Domain rules stay in theatre: `kleur`, the conflicten columns, `bezetting`, `notities`.
- `position` charset `[0-9A-Za-z]`, at most 255 characters. Manual order is `[{ id: 'position', desc: false }, …the previous keys without position]`, nulls last (docs/SPEC.md, 5e1b4ee); a layout already sorting on `position` is manual and is not prepended again (params.ts:96-100 refuses a key named twice).
- Keyboard drag: KeyboardSensor with the board's own coordinates getter; Space lifts and drops, ↑↓ within a column, ←→ to the neighbour column at the same index, Escape cancels, Enter opens the card; announcements in Dutch through i18n (ruling Q2).
- No growth in `Workspace` (`ui/App.tsx`) or in `app.css`'s shared sections. One recorded exception: Task 9 wires the Toolbar's `onFlagged(source)` to Workspace's existing `openTable` (a prop, no state; ruling 2026-10-15); the UI-architecture feature after 3f takes it from there. New state lives in its view's hook; the board's CSS moves to `board/board.css`, and the react-aria drag rules are deleted in the same change (memory ui-code-has-a-place).
- Stefan's rules: no coloured rounded borders, one toolbar the same on every skin, no cockpit density, side panels only. Looks are copied from `design/*-prototype.html`.
- Strings are Dutch, in `i18n.ts`, generic (no theatre word in `apps/grid`).
- Commit by path, never `git add -A`; the untracked `*.url` files are never added.
- No full gate between tasks: each task runs its own tests and targeted e2e. The gate runs alone at the close; it never overlaps a shake-out or tree edits.
- Ports: e2e 4311/5174/4312/5175; scratch engine 4371, Vite 5197; never 4321/5181/5190 (the orchestrator's preview) or 4330/5180/4341 (Laika), never `~/laika-export`.

## Threat model

Surface: the PATCH path's column gate (a new writable engine column) and two read surfaces (flags, tones).

**Assets:** the shared order of a board (everyone sees one rank), the write path's integrity, conflict facts about other people (who is double-booked or away).

**Attacks:**
1. **An owner account reorders a shared board** by PATCHing `position` on its own row → **refused 403** in `valuesOf` for `role === 'owner'` (any kind), before the writer.
2. **A link actor writes `position`** → already refused 403 `column_not_owner_writable` by `linkWritable` (`access.ts:46-52`, `position` is not a declared owner-writable column); asserted, not assumed.
3. **A huge or malformed rank** (DoS on sort, or a value that breaks ordering, such as one ending in `0` that no rank can be placed beside) → `checkValues` refuses anything but `^[0-9A-Za-z]{0,254}[1-9A-Za-z]$` or null, 400 `bad_value`.
7. **A rank-only write that skips the row's rules** (an editor reordering a row outside its scope, or one its writer refuses to change) → a PATCH holding only `position` still runs `valuesOf`: the row is read in the caller's scope (404 outside it), the domain writer is called with the rest of the change (empty) so a writer that refuses the row refuses the move, and the write is revised under the caller's batch.
4. **Probing order through an owner view's sort** → a view for owners is query-only (`views.ts:415`) and a query has no `position`, so the sort is refused as not a column; asserted.
5. **An owner reads conflict flags** about other people → the grid reads flags through `/rows/<flag query>` in the caller's scope (an owner has no such source: 404); `/schema` serves a flag's `marks` only for datasets the caller can read, as `of` and `creates` are filtered.
6. **Undo restores a rank the actor may not write** → only a batch's maker undoes it (`writes.ts:722`), and `restore` goes through the same `valuesOf` gate; this arises only after a role change, and is not driven by a test (deferral below).

**Mitigations (where):** `writes.ts valuesOf` (owner gate, charset and trailing `0`, scope and writer on a rank-only write), `access.ts linkWritable` (unchanged), `views.ts:415` (owner views are queries; unchanged), `app.ts` `/schema` `flagsOf` (filter by readable), `/rows` scope (unchanged).

**Deferrals:** an editor can reorder any board it can edit (same as editing any field). An undo by a maker whose role became owner afterwards is gated by `valuesOf` but not tested. Two planners dropping at the same moment can get adjacent ranks in either order; the last write wins, as any edit.

## Review Focus

1. **Denied actor:** an owner's and a link's PATCH of `position` are refused through the route, and an owner view's sort on it is refused → Task 1 (`position.test.ts`).
2. **Empty / zero:** a column whose cards are all unranked (every board on day one): a move down ranks the cards above the slot and lands there after a reload → Task 2 (`drop.test.ts`), Task 4 e2e `board-reorder-fresh`.
3. **Mid-flow failure:** a refused drop (lifecycle on Bord toewijzingen) snaps back and shows its text; its own rank is unwritten (one PATCH with the column), and the ranks written before it encode the order shown, so the board's order is as it was → Task 1 (one batch), Task 2 (`store.test.ts`), Task 4 e2e `board-drag-refused`.
4. **Boundary:** a crowded column (60+ cards, scrolled): the slot's index from rects without the slot, steady under small mouse steps → Task 3 (`target.test.ts`), Task 4 e2e `board-slot-steady`.
5. **Wrong order / re-entry:** a sorted locked view after a within-column drop is manual only in the planner's layout, with the "changed" mark; revert restores the sort → Task 3, Task 4 e2e `board-sorted-to-manual`.
6. **Concurrent / double:** a second drop of the same card before the first answers queues on the record (`store.queued`), one ⌘Z per drop, each undoing its whole step → Task 2 (`store.test.ts`).
7. **Shape, not behaviour:** each shape is proven by its rendered result in the browser (marks, insight, tone, totals, NOTITIES), not by `/schema` alone → Tasks 6–10 e2e.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Engine `position` | `PATCH /rows/:d/:id`, `GET /rows/:d?sort=position`, `/history`, `/schema`, migrate | integration · `packages/engine/test/position.test.ts` · `bun test packages/engine/test/position.test.ts` | all board flows |
| Rank and drop | `rankBetween`, `byRank`, `dropOf` | unit · `apps/grid/src/board/rank.test.ts`, `board/drop.test.ts` · `bun run --filter @worktable/grid test board` | board-reorder-fresh, board-drop-between |
| Store: a second field, a step of several writes | `store.apply({ …, with })`, `store.applyStep(changes)`; `history` undo of a step | unit · `apps/grid/src/grid/store.test.ts`, `ui/history.test.ts` · grid vitest | board-undo-both, board-reorder-fresh |
| Board drag | render `Board`; `targetOf` | component · `board/Board.test.tsx`, unit · `board/target.test.ts` · grid vitest | board-drop-between, board-reorder, board-sorted-to-manual, board-sorted-cross-column, board-keyboard, board-drag-refused, board-slot-steady |
| Page undo | `usePageUndo` | component · `ui/usePageUndo.test.tsx` · grid vitest | board-undo-both, undo-from-the-page |
| `long` | `/schema` column, drawer NOTITIES | integration · `packages/engine/test/declarations.test.ts`; component · `grid/Drawer.test.tsx` | notities-block |
| `filled` | `checkFacts`; group head | integration · `declarations.test.ts`; unit · `grid/group.test.ts` | group-filled |
| `tone` | `checkTone`, `/schema`; `useTones` | integration · `declarations.test.ts`; unit · `ui/useTones.test.ts`; component · timeline, calendar | production-tone |
| `flags` | `checkFlags`, `/schema` `flagsOf`; `useFlags`, marks, band, insight | integration · `declarations.test.ts`, `packages/theatre/test/step3-queries.test.ts`; unit · `ui/useFlags.test.ts`; component · `grid/Drawer.test.tsx`, `ui/Toolbar.test.tsx` | conflict-marks-and-insight, conflict-band-negeren |
| Timeline overlap | `overlapsOf` | unit · `timeline/overlap.test.ts` | timeline-overlap |
| Tijd width | `columns.ts` WIDTH / `inDays` | unit · `grid/columns.test.ts` | planning-details, date-editors-fit (updated) |

All new e2e flows go in `e2e/step-3f.spec.ts`, `board-drag-refused` with them; the rewritten 3e flows stay in `e2e/step-3e.spec.ts`.

---

### Task 1: Engine `position`

**Files:**
- Modify: `packages/engine/src/ddl.ts:30-52` (append `position` TEXT NULL after `deleted_at` unless `reservedNames.has(d.name)`), `tables.ts:24-34` (Drizzle column), `validate.ts` (reserve `position` for columns, lookups, links), `params.ts:104-117` and `views.ts:181` (sort accepts `position` on a non-engine dataset; group and filter still refuse it), `rows.ts:63-74` (`position` orders nulls last), `rows.ts:129-140` (serve `position` on dataset rows), `writes.ts` (`cutBody`, `checkValues`, `encodeAll`, split `position` out before `writer.update` and merge after; dropped on create; owner refused in `valuesOf`), `history.ts:63-101` (`position` joins `shown` for dataset sources, so a position-only batch is listed; its change is `{ field: 'position', moved: true }` without old/new), `app.ts:272-307` (`/schema` source `position: true` on non-engine datasets)
- Modify (grid): `apps/grid/src/types.ts:381-393` (`HistoryEntry` change: `moved?: true`, `old` and `new` optional), `ui/HistoryPanel.tsx:126-131` and `grid/drawer/Sections.tsx:119-125` (a `moved` change reads `t('moved')` = "verplaatst", no arrow, no "zette … op"), `i18n.ts`
- Test: `packages/engine/test/position.test.ts`, `apps/grid/src/ui/HistoryPanel.test.tsx`, `grid/drawer/Sections.test.tsx`

**Interfaces:**
- Produces: `/rows` row `position: string | null` (the grid keeps it in `row.fields.position`, as `toRow` does with every served key, engine.ts:433-439); `sort=position` on datasets; PATCH body `{ <column>: v, position: 'Vk' }` → one batch; `/schema` `sources[].position: true`; history change `{ field: 'position', label, moved: true }`.

- [ ] **Step 1: Write the failing tests** in `position.test.ts`, on the engine test fixture:
  - migrating a fixture database whose dataset has rows adds `position` (null on every row), and `PRAGMA table_info` equals a fresh create's columns by name; engine tables (`saved_view`, `revision`) have no `position`;
  - a domain declaring a column, a lookup or a link named `position` is refused by `validateDomain`;
  - `GET /rows/<d>?sort=position` orders `['b', 'a', null(id 5), null(id 3)]` as a, b, 3, 5; `sort=position,-<a date column>` orders the unranked rows by that date descending, after the ranked ones; `sort=-position` puts the ranks in descending order, nulls still last; `filter` and `group` on `position` answer 400; a saved view with `sort: ['position', 'plandag']` on a dataset is accepted;
  - `PATCH { status: 'x', position: 'V' }` answers one `revision.batch_id` with both columns in `changed`; `POST /batches/:id/undo` restores both;
  - `PATCH { position: 'not a rank!' }`, a 256-character rank, `'V0'` and `'0'` answer 400 `bad_value`; null is accepted;
  - a rank-only PATCH on a row outside an owner-scoped caller's scope answers 404, and one on a row whose writer refuses every update answers that refusal;
  - an owner account's PATCH with `position` answers 403, and a link actor's answers 403 `column_not_owner_writable`; an owner view (query-only, views.ts:415) with `sort: ['position']` is refused as not a column;
  - `POST /rows/<d>` with `position` creates the row with `position` null;
  - `/history/<d>?filter={"id":N}` lists a position-only batch as `{ field: 'position', moved: true }` with no old or new value; `/schema` marks the dataset `position: true` and a query source not;
  - `HistoryPanel.test.tsx` and `Sections.test.tsx` (the drawer's Geschiedenis): a `moved` change reads "verplaatst" with no old → new.
- [ ] **Step 2: Run them to see them fail:** `bun test packages/engine/test/position.test.ts` — FAIL.
- [ ] **Step 3: Implement** in the files above. `position` orders as `(position IS NULL), position` (or `position DESC`), so nulls stay last either way. The writer never sees `position`: `valuesOf` splits it from `cut`, calls the writer, then merges it back into `stored`.
- [ ] **Step 4: Run** `bun test packages scripts` (theatre's migrate, history and parity tests see the new column too) and `bun run check` — PASS.
- [ ] **Step 5: Commit** `feat(engine): position, a rank on every dataset table — served, sorted nulls last, written in the edit's batch, never by an owner, a move in history`.

### Task 2: Rank, what a drop writes, and the store's step

**Files:**
- Create: `apps/grid/src/board/rank.ts` (Folio's `packages/shared/src/board-rank.ts` at 15bd9886, copied with a header naming its source, plus `byRank`), `board/rank.test.ts` (Folio's `board-rank.test.ts` copied, plus ours), `board/drop.ts`, `board/drop.test.ts`
- Modify: `apps/grid/src/grid/store.ts` (`Change.with?: Record<string, unknown>`; `applyStep(changes: Change[])`), `grid/store.test.ts`, `apps/grid/src/ui/history.ts` (`Entry.before?: Promise<string | null>[]`), `ui/history.test.ts`

`position` stays in `row.fields.position` (engine.ts:433-439 puts every served key there); no `Row` change.

**Interfaces:**
- Produces:
  - `rankBetween(lo: string | null, hi: string | null): string` (Folio's; throws on lo ≥ hi).
  - `byRank(a: Row, b: Row): number` — ranked before unranked, ranks ascending, 0 otherwise, so a stable sort keeps the server's order among unranked cards (the previous keys).
  - `dropOf(input: { manual: boolean; from: number | null; index: number; cards: Row[]; value: string | null }): Drop` — `cards` is the target column in its shown order with the dragged card removed, `index` the slot in it, `from` the dragged card's index in that same order before it was removed (null when the target is another column), `value` the target column's key.
    `type Drop = { kind: 'none' } | { kind: 'regroup'; value: string | null } | { kind: 'place'; ranks: { id: number; position: string }[]; position: string; value?: string | null; manual: boolean }`.
    - `from === index` (back on its own place, manual or sorted) → `none`.
    - Not manual and `from === null` → `regroup` (the column only).
    - Otherwise → `place`: `hi` is the smallest rank among `cards[index…]` (null when none); walking `cards[0…index-1]` with `lo = null`, a card keeps its rank when `lo < rank < hi`, else it gets `rankBetween(lo, hi)` and joins `ranks`; `lo` moves to its rank; the dropped card gets `rankBetween(lo, hi)`. `value` is set when `from === null`; `manual: false` asks the caller to switch the view to manual after the writes. On a sorted board this also re-ranks a ranked card above the slot whose rank runs against the shown order (without it `rankBetween` would see lo ≥ hi).
  - `store.apply({ id, field, value, with })`: `with` goes in the same PATCH, is painted and reverted with `field`. A reorder is `apply({ id, field: 'position', value })`; a regroup with a place is `apply({ id, field: column, value, with: { position } })`.
  - `store.applyStep(changes: Change[]): Promise<boolean>` — paints every change at once, before any PATCH; sends all but the last together (they are distinct records, each on its own queue), then the last (the dropped card) once they have answered; pushes ONE history entry at paint, whose `batch` resolves to the last landed write's batch and `before` holds the others that landed, and whose `refresh` re-reads every row the step wrote. A refused rank write cancels the last write: it and every unsent change are reverted. A refused last write is reverted; the ranks already written stay painted, since they encode the order shown. Answers whether the last write landed.
  - `history.undo()` of an entry with `before` undoes `batch`, then each of `before` last-first; its redo entry holds the undo batches the same way. The entry carries `ids`, every row the step wrote, and the store on screen re-reads them after an undo (it outlives the store that made the step). An undo that stops part-way keeps the undos done as the redo, leaves only the batches not yet undone for a retry, and re-reads the rows (rulings in the ledger, 2026-10-15).

- [ ] **Step 1: Write the failing tests:**
  - `rank.test.ts`: Folio's cases (ordering, 500 inserts at one spot stay unique and ordered, throws on lo ≥ hi); `byRank` keeps the given order among unranked rows.
  - `drop.test.ts`:
    - five unranked cards, card 1 dropped at index 2 of the other four: `ranks` holds the two cards above in their shown order and the dropped card's rank is above them; sorting the five by `byRank` (stable, server order) after applying gives the shown order with the card third;
    - a manual column of ranked cards then unranked ones: a drop between two ranked cards writes only the dropped card; a drop below the first unranked card ranks that card too;
    - a sorted column whose shown neighbours have descending ranks (ids 50 then 41, both ranked): no throw; the prefix is re-ranked so `lo < hi` holds, and every rank in `ranks` is below `hi`;
    - sorted board, other column → `regroup`, no ranks; sorted board, same column → `place` with `manual: false`; the own slot on a manual board → `none`.
  - `store.test.ts`: `apply` with `with` sends one `update(model, id, { state: 'b', position: 'V' })`, paints both, and one undo reverts both; a refusal reverts both and raises the error; `apply({ field: 'position' })` with a new rank writes; `applyStep` of three writes paints all three before any answer, sends the first two before the third, and one undo undoes all three and re-reads all three rows; a refusal of the third leaves the first two painted, reverts the third, and one undo undoes the first two; a refusal of the first reverts all three and sends no third; two `applyStep`s on one record queue.
  - `history.test.ts`: an entry with `before` undoes `batch` first, then `before` last-first, and redoes it.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test board store history` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command — PASS.
- [ ] **Step 5: Commit** `feat(grid): Folio's rank; a drop ranks the unranked cards above its slot so nothing else moves; the store writes a second field in one PATCH and a step that one ⌘Z undoes`.

### Task 3: The board on dnd-kit

**Files:**
- Modify: `apps/grid/package.json` (`@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0, `@dnd-kit/utilities` ^3.2.2), `board/Board.tsx` (lanes and layout only), `ui/App.tsx:623-624` (passes `onDrop` over the store and `onLayout`; no new state), `ui/hints.ts` (the board's footer hints name Space, the arrows and Escape), `i18n.ts` (the drag's Dutch announcements and instructions), `ui/app.css` (every `.nv-board*` rule moves to `board/board.css`; the react-aria drag rules `.nv-board__column:has(…[data-drop-target])`, `.nv-board__slot`, `.nv-board__grip` at app.css:5868, 5902-5945 are deleted; the rail's `[data-drop-target]` at :3882 stays)
- Create: `board/Card.tsx`, `board/Column.tsx`, `board/useBoardDrag.ts`, `board/target.ts` (+ `target.test.ts`), `board/board.css`
- Modify (tests): `apps/grid/src/skins.test.tsx:24-33, 50-85` (board columns and cards located without `grid`/`row`)
- Test: `board/Board.test.tsx`

The columns stop being react-aria GridLists: a column is a `section` with a list of sortable cards (`role="button"` each, opening on click and Enter), so dnd-kit's sensors alone handle the keys. Task 4 updates the e2e that find cards by `grid`/`row`.

**Interfaces:**
- Consumes: Task 2's `dropOf`, `byRank`, `store.apply`, `store.applyStep`; `Layout.sort`, `setLayout` from App (a locked view keeps it local, as today).
- Produces:
  - `Board` props: `onDrop?: (drop: Exclude<Drop, { kind: 'none' }>, id: number) => Promise<boolean>` (absent on a query or a read-only column: nothing drags), `onLayout?: (next: Layout) => void`. App's `onDrop` maps a `place` to `store.applyStep([...ranks as position writes, the dropped card's write])` and a `regroup` to `store.apply`; on a `place` with `manual: false` that landed, Board then calls `onLayout({ ...layout, sort: [{ id: 'position' }, ...layout.sort] })` — the writes first, the switch after, so a refused drop never switches.
  - `targetOf(cards: { id: number; top: number; height: number }[], y: number, dragged: number): number` — the slot index for content coordinate `y` from card rects measured without the slot (taken at drag start, each `rect.top - list.top`, read live through the list's top, since the board scrolls as a whole, app.css:5848-5856); skips the dragged card; a pure, non-decreasing function of y.

Which index decides a drop:
- within the dragged card's own column: the gap dnd-kit draws, `arrayMove(active, over)` over the column's shown order (Folio's `reorderSlotPosition`; the pointer and the gap disagree otherwise, kanban-view.tsx:64-73);
- in another column: `targetOf`;
- in a gutter (the pointer over no column): the last target, kept.

Mechanics, from Folio (`kanban-view.tsx` at 15bd9886), with two changes ruled for the keyboard:
- PointerSensor `{ distance: 5 }` (a click still opens the card). KeyboardSensor with `keyboardCodes: { start: ['Space'], end: ['Space'], cancel: ['Escape'] }` and a coordinates getter over the board's model: ↑↓ move the live target's index in its column, ←→ move it to the neighbour column at the same index (clamped), returning that slot's screen point.
- Collision: with pointer coordinates, `pointerWithin` on the column droppables, then `closestCenter` among the cards of the dragged card's own column; without them (a keyboard drag, core.esm.js:479, 2916), the live target. Over another column no card is reported, so its cards never transform.
- `MeasuringStrategy.Always`; the card's key includes its column value; `DragOverlay` with `dropAnimation={null}`, portalled to the body, the card with `transform: rotate(2deg)` and `box-shadow: var(--shadow-pop)` (`board-prototype.html:356`); sortable cards use `animateLayoutChanges: () => false`.
- `accessibility.announcements` and `screenReaderInstructions` in Dutch from i18n (lift, over a column and place, drop, cancel), naming the card's title and the column's label.

Look, from the mockup (`board-prototype.html:342, 355-357, 852-863`):
- within the dragged card's own column, manual or sorted: the sortable gap drawn as the slot box (accent 12%, card height);
- across columns, the source card stays as a 35% ghost; on a manual board the target column is tinted (`.col.drop`, accent-subtle 60%) and holds a card-height slot box with the column's label at `targetOf`'s index; on a sorted board, the tint only;
- `body` cursor `grabbing` while dragging.

A manual board orders each column's cards with `byRank`, so the painted ranks show at once. On a sorted board, the dropped column is ordered with `byRank` from the drop until `onDrop` answers (cleared when it answers false), so the card sits at its slot at once, before the switch re-reads the rows.

- [ ] **Step 1: Write the failing tests:**
  - `target.test.ts`: four cards at tops 0, 108, 216, 324 (height 100): y 150 → 1, y 170 → 2; y from 0 to 500 in 1px steps gives a non-decreasing index; the dragged card's rect is skipped.
  - `Board.test.tsx`, through dnd-kit's keyboard path (keydowns with `code` on the card itself, one macrotask after the lift, core.esm.js:1158, 1353-1361):
    - on a manual board: Space, ↓, Space calls `onDrop` with a `place` whose position is above the next card; Space, ←, Space calls it with the left column's value;
    - on a sorted board: Space, ↓, Space calls `onDrop` with a `place`, `manual: false`, and the card is at its slot before `onDrop` resolves; then `onLayout` with `{ id: 'position', desc: false }` first and the previous keys after; when `onDrop` answers false, `onLayout` is not called and the column's order is back; Space, ←, Space calls `onDrop` with a `regroup` and `onLayout` not; Space, Space on its own place calls nothing;
    - Escape calls nothing; Enter on a card opens its row; a board without `onDrop` lifts nothing on Space;
    - the live region announces the lift in Dutch with the card's title.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test board` — FAIL.
- [ ] **Step 3: Implement** in the files above; `Board.tsx` keeps lanes and layout, `useBoardDrag` owns the sensors, the active card, the live target and the drop.
- [ ] **Step 4: Run** `bun run --filter @worktable/grid test` and `bun run --filter @worktable/grid typecheck` — PASS. On the scratch servers (4371/5197), drive it by mouse in small steps: the card moves, the slot sits where it lands, nothing else moves, it stays after a reload. Time a drop that ranks 30 unranked cards above its slot; above about a second, report the measured time to the orchestrator before adding anything.
- [ ] **Step 5: Commit** `feat(grid): the board drags on dnd-kit — cards make room, the slot is where the card lands, nothing else moves, keyboard drag in Dutch; its CSS beside it`.

### Task 4: The page's ⌘Z in its own hook, and the board's e2e

**Files:**
- Create: `apps/grid/src/ui/usePageUndo.ts`, `ui/usePageUndo.test.tsx`, `e2e/step-3f.spec.ts`
- Modify: `ui/App.tsx:400-416` (the effect becomes `usePageUndo(saves)`), `e2e/step-3e.spec.ts` (`board-drag` :147-216: its `dragTo` (:163), one pointer move that dnd-kit takes as the activation only (core.esm.js:1545-1547), becomes stepped `page.mouse` moves, and its keyboard part and `title-line-insight` :707-710 move from react-aria's Enter-Enter to Space, arrows, Space; `board-drag-refused` moves to `e2e/step-3f.spec.ts`, un-fixme'd and crowded; `groep-everywhere` :117/:121/:122 and `board-column-plus-in-window` :285 locate board columns and cards without react-aria's `grid`/`row` roles; :122's absence check locates the column section, so it cannot pass for want of a role), `e2e/step-3c.spec.ts:341/:346` and `e2e/step-3d.spec.ts:183/:216` (the same locators), `specs/CHECKS.md` (rows for the moved and rewritten flows)

**Interfaces:**
- Produces: `usePageUndo(saves: { undo: () => Promise<void>; redo: () => Promise<void> } | null): void` — ⌘Z / ⇧⌘Z on the document unless prevented, unless the target is in `input, textarea, select, [contenteditable="true"]` or inside `[role="dialog"]`.

- [ ] **Step 1: Write the failing tests:**
  - `usePageUndo.test.tsx`: ⌘Z on the body calls undo; ⇧⌘Z calls redo; from inside a `role="dialog"` element and from a `select` it calls neither; a prevented event calls neither.
  - `e2e/step-3f.spec.ts`, each on invented records in its own far-future week (no week shared between flows, none in August 2028 or the week of 2029-03-26, where 043a5bc leaves seed drift; `workers: 1` and a `--fresh` database, playwright.config.ts:5, :20), page.mouse in small steps. A manual board is a view the flow owns, created through `POST /api/views` on Activiteiten with `skin: 'board'`, `sort: ['position']` and a plandag condition on its week (the 3c precedent, "e2e Bord activiteiten", step-3c.spec.ts:344), deleted in `finally`. No assertion reads a sort chip (there is none, bar.ts:62-77): a board's order is read from its cards, its sort from the view's stored layout, and the switch from the toolbar's "changed" mark (App.tsx:593-596). A sorted board is a view the flow makes through an administrator's request context (`state('admin')`, e2e/auth.ts): shared, `skin: 'board'`, sort `plandag, start_at`, its week as a stored filter, so the editor sees it locked with no local change and the mark means the switch (narrowing a locked view with `openWeek` is itself a local change, ui/views.ts:79-89); deleted in `finally`:
    - `board-drop-between`: a card dropped between cards 2 and 3 of another column of a manual board lands there; after a reload it is still there.
    - `board-reorder`: a reorder within a column stays after a reload.
    - `board-reorder-fresh`: on a column of unranked cards, card 1 moved down to the third place is third at once and after a reload, and no other card of the board changed place.
    - `board-sorted-to-manual`: on the flow's sorted board, with invented cards whose ids run against their dates, the mark absent at first, the full order of every column is read; a within-column drop shows the "changed" mark and the planner's stored layout sorts `position` then `plandag, start_at`; every column's order, read again at once and after a reload, differs from the first reading only by the dropped card; revert brings the date order back, with the week still applied (it is the view's own filter).
    - `board-sorted-cross-column`: on the flow's sorted board, hovering another column shows its tint and no slot box; after the drop and a reload the card sits at its sorted index in the new column, no "changed" mark, and the stored layout's sort is unchanged.
    - `board-slot-steady`: over a crowded target column (60+ cards, scrolled), moving the mouse down in 4px steps, the slot's index read at each step never decreases.
    - `board-undo-both`: after a cross-column drop below unranked cards (so the step also ranks them), one ⌘Z (focus on the page; again with focus on a drawer button) restores the column, the place and every rank written: the full order of both columns is as before the drop, also after a reload.
    - `board-keyboard`: Space lifts, ↑ ↓ ← → move, Space drops; Escape cancels and nothing is written.
  - `e2e/step-3f.spec.ts` `board-drag-refused` (moved from step-3e, its `test.fixme` dropped): on Bord toewijzingen with 60+ invented toewijzingen and the target column scrolled, Bevestigd → Geweigerd by mouse and by keyboard is refused with "statuswijziging is niet toegestaan", the card is back in Bevestigd, and the full order of both columns is as it was, also after a reload.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test usePageUndo` and `bunx playwright test e2e/step-3f.spec.ts e2e/step-3e.spec.ts e2e/step-3c.spec.ts e2e/step-3d.spec.ts -g "board|groep-everywhere|title-line-insight|skins-open|drawer-in-slot"` (scratch servers stopped first) — the hook test FAILS; the e2e that Task 3 already satisfies pass, the undo ones fail.
- [ ] **Step 3: Implement** `usePageUndo` and replace the effect in `Workspace`.
- [ ] **Step 4: Run** both again — PASS. If `board-slot-steady` cannot be made steady, stop: show the orchestrator the trace and fall back to Folio's line only on its word.
- [ ] **Step 5: Commit** `feat(grid): the page's ⌘Z leaves Workspace for its own hook and skips dialogs; test(e2e): the board's drag flows, 3e's drag tests on dnd-kit, the refusal on a crowded board`.

### Task 5: Planning's Tijd cell (C1)

**Files:**
- Modify: `apps/grid/src/grid/columns.ts` (the width `inDays` gives the day-line's Tijd column, or `WIDTH.datetime`, whichever the browser shows is the cut column), `grid/columns.test.ts`, `e2e/grid-ux.spec.ts:484` (`planning-details`), `e2e/ui-fit.spec.ts:258` (`date-editors-fit`)

- [ ] **Step 1:** On the scratch servers, open Planning grouped by day and measure which column clips "wo 14/10 00:…" and the text's width; record both in the commit message.
- [ ] **Step 2: Write the failing tests:** `columns.test.ts`: that column's default width is at least the measured width plus the cell's padding; `planning-details`: the Tijd cell's `scrollWidth <= clientWidth`.
- [ ] **Step 3: Run** them — FAIL. **Step 4: Implement** the width; `date-editors-fit`'s editor bounds follow the wider cell. **Step 5: Run** — PASS. **Commit** `fix(grid): Planning's Tijd cell fits its day and time`.

### Task 6: `long` and the NOTITIES block (E2, G1)

**Files:**
- Modify: `packages/engine/src/declare.ts` (`ColumnDecl.long?: true`), `validate.ts` (only on `text`, not with options or relation), `packages/engine/test/declarations.test.ts`; `apps/grid/src/engine.ts:150-169` (`long` → `textarea`), `grid/drawer/derive.ts:45` (a long text leaves the props), `grid/Drawer.tsx` (its block after the link sections, `Section` with the field's label, the value as a paragraph, edited in place with `LongTextEditor`; empty: `t('notesEmpty')`), `grid/Drawer.test.tsx`; `packages/theatre/src/datasets.ts:135` (`long: true`)
- Test: `e2e/step-3f.spec.ts` › `notities-block`

- [ ] **Step 1: Failing tests:** a `long` on an integer column is refused; `/schema` serves `long: true`; the drawer of a row with notities shows a NOTITIES section after Mensen holding the text, and not a props line; editing it writes `notities`; e2e `notities-block` types a note in an invented activity's drawer and reads it after a reload.
- [ ] **Steps 2–5:** run (FAIL), implement, run `bun test packages/engine` and grid vitest and the e2e (PASS), commit `feat: long text — the engine serves it, the drawer shows it as its own block (Q1)`.

### Task 7: `filled` group totals (E5, G7)

**Files:**
- Modify: `packages/engine/src/declare.ts:59-63` (`| { kind: 'filled'; link: string; label: string }`), `validate.ts:577-583` (`checkFacts`: the link exists on the source; no column read), `declarations.test.ts`; `apps/grid/src/types.ts:301-304`, `grid/group.ts:60-65` (sum `crewOf` over the group's rows → `"have/need"`, '' when need is 0), `grid/GridBody.tsx:91-94` (label then number), `grid/group.test.ts`; `packages/theatre/src/datasets.ts:12-15` (`{ kind: 'filled', link: 'mensen', label: 'bezetting' }`)
- Test: `e2e/step-3f.spec.ts` › `group-filled`

- [ ] **Step 1: Failing tests:** a `filled` naming an unknown link is refused; `group.test.ts` sums 2/3 and 1/2 to `3/5` and hides a group with no items; e2e `group-filled`: Planning grouped by day shows "bezetting h/n" on a day of invented activities with known places.
- [ ] **Steps 2–5:** run, implement, run, commit `feat: the filled group fact — bezetting have/need on a group's head (Q11)`.

### Task 8: A dataset's tone (E4, G6)

**Files:**
- Modify: `packages/engine/src/declare.ts` (`DatasetDecl.tone?: string`), `validate.ts` (an options column whose every option has a tone), `app.ts:303` (serve `tone`), `declarations.test.ts`; `packages/theatre/src/datasets.ts:82-100` (`kleur`: options `rose violet amber sky teal green slate` with Dutch labels, tones the same, nullable; `tone: 'kleur'`), `seed.ts` (each production a kleur); `apps/grid/src/engine.ts`, `types.ts` (`TableDef.tone`)
- Create: `apps/grid/src/ui/useTones.ts` (+ test): `useTones(models, dataset): Map<number, Tone> | null` — reads `/rows/<dataset>` once (id and the tone column) in the caller's scope; null when the dataset has no tone or the read is refused
- Modify: `timeline/Timeline.tsx:119` and `calendar/Calendar.tsx:41-49` (a lane whose relation's target has a tone takes it, else `laneTone(index)`), `grid/Drawer.tsx:154-165` (the subline's space bar), `board/Card.tsx` (the card line of a relation to a toned dataset)
- Test: `apps/grid/src/timeline/Timeline.test.tsx` (create), `calendar/Calendar.test.tsx`; `e2e/step-3f.spec.ts` › `production-tone`

- [ ] **Step 1: Failing tests:** a `tone` naming a column without tones is refused; `useTones` maps ids to tones and returns null on a 404; the timeline lane of a production with kleur `violet` carries `--lane: var(--tone-violet)`; e2e `production-tone`: on Tijdlijn tourstops each production's lane has its kleur, and changing a production's kleur changes its lane after a reload.
- [ ] **Steps 2–5:** run, implement, run, commit `feat: a dataset's tone — productie's kleur colours its lanes, bars and card lines (Q6)`.

### Task 9: Flags (E3, G2–G4)

**Files:**
- Modify: `packages/engine/src/declare.ts` (`QueryDecl.flags?: { marks: Record<string, string>; tone: string }`), `validate.ts` (`checkFlags` beside `checkOf`: each key a declared dataset, each column an integer column of the query, `tone` an options column with a tone per option), `app.ts:295-296` (`flagsOf`: marks only for datasets the caller can read), `declarations.test.ts`; `packages/theatre/src/queries/conflicten.sql` (`speelreeks_id` in `tw`, every `alle` branch and the final select), `queries.ts:79-116` (`speelreeks_id` column relating to speelreeks; `flags: { marks: { activiteit: 'activiteit_id', toewijzing: 'toewijzing_id', speelreeks: 'speelreeks_id' }, tone: 'ernst' }`), `packages/theatre/test/step3-queries.test.ts`
- Modify (grid schema): `apps/grid/src/engine.ts:63-71, 261-292` (`EngineSource.flags`, carried by `tableDefOf`/`toSchema`), `types.ts:131-168` (`TableDef.flags?: { marks: Record<string, string>; tone: string }`)
- Create: `apps/grid/src/ui/useFlags.ts` (+ test): `useFlags(tables, scope, window): { marksOf(dataset: string, id: number): Flag[]; count(dataset: string, ids: number[]): number; source: string; label: string } | null`, `Flag = { text: string; tone: Tone; label: string; marks: Record<string, number> }`. Each skin that marks calls it for its own window; Workspace does not. `apps/grid/src/grid/drawer/Alert.tsx` (the band, moved out of `matrix/Panel.tsx:77-92`, used by both drawers)
- Modify: `ui/Toolbar.tsx:13-27, 94` (`Shown.flagged?: { count: number; label: string; source: string }`: the skin reports it as it reports its rows; the Toolbar draws it beside `insight` as a button calling `onFlagged(source)`), `ui/App.tsx` (passes `onFlagged={(s) => openTable(tables.find((t) => t.key === s))}`, useSavedViews.ts:83-86: the recorded exception, a prop and no state), `board/Card.tsx`, `timeline/Timeline.tsx`, `calendar/Calendar.tsx` (Event), `matrix/Matrix.tsx:590` (cell), `grid/Grid.tsx` (reports `flagged` through `onShown`, App.tsx:632), `dashboard/WeekTile.tsx:57` (the alert badge: the tone option's label, the flag's text as title), `grid/Drawer.tsx` (the band in the `alert` slot with "Negeren" only, which hides it in the open drawer; "Iemand anders kiezen" stays in the matrix cell drawer, ruling 2026-10-15), `grid/drawer/Sections.tsx` (a flagged person in Mensen marked), `matrix/Panel.tsx` (uses `Alert`)
- Test: `apps/grid/src/ui/Toolbar.test.tsx`, `grid/Drawer.test.tsx`; `e2e/step-3f.spec.ts` › `conflict-marks-and-insight`, `conflict-band-negeren`

- [ ] **Step 1: Failing tests:** a mark to an unknown dataset, to a text column, or a tone without tones is refused; `/schema` serves a flag's marks only to a reader of the marked dataset; conflicten rows carry `speelreeks_id`; `useFlags` marks by id and counts the view's rows; the Toolbar renders the flag insight as a button whose press calls `onFlagged` with the flag query's key; `Grid.tsx` reports `flagged` through `onShown` like the skins (G3 on table views); e2e `conflict-marks-and-insight`: one invented person confirmed on two timed, overlapping activities of two different productions in the flow's week (conflicten lists such a pair from both sides, codes 1 and 7, conflicten.sql:34-52, ernst `conflict`) marks both activities' cards on Per status with "Conflict", the title line reads "2 Conflicten", and its button opens Conflicten with the space unchanged; `Drawer.test.tsx`: the record drawer's band offers "Negeren" and no "Iemand anders kiezen"; the matrix cell drawer still offers both (its existing test, through the shared `Alert`); `conflict-band-negeren`: the activity's drawer shows the band, "Negeren" hides it, closing and opening the drawer shows it again.
- [ ] **Steps 2–5:** run, implement, run, commit `feat: flags on a query — conflicten marks cards, bars, events and cells, counts in the title line, and shows in the drawer (Q2)`.

### Task 10: The timeline's overlap (G5)

**Files:**
- Create: `apps/grid/src/timeline/overlap.ts` (+ test): `overlapsOf(rows: Row[], lane: (r: Row) => string, from: (r: Row) => number, to: (r: Row) => number, cancelled: (r: Row) => boolean): Set<number>`
- Modify: `timeline/Timeline.tsx` (the warn mark and its title, `timeline-prototype.html:857-860`; `Shown.overlaps` carries the count), `ui/Toolbar.tsx` ("N overlap" beside the other insights, from `shown.overlaps`)
- Test: `e2e/step-3f.spec.ts` › `timeline-overlap`

- [ ] **Step 1: Failing tests:** two bars in one lane overlapping by a day are both in the set; touching bars are not; a bar whose status is toned `bad` is left out; bars in different lanes are not; e2e `timeline-overlap`: two invented overlapping tourstops of one production show the mark and "2 overlap"; cancelling one clears both.
- [ ] **Steps 2–5:** run, implement, run, commit `feat(grid): the timeline counts and marks overlapping bars in a lane (Q2)`.

### Task 11: Seed dates (C2) — done

Landed before the plan's tasks as 043a5bc (ruled by the orchestrator, 2026-10-15): four flows no longer lean on the seed's fixed dates or the day of the month.

### Carried to later features

- Workspace re-renders on every grid-store notification (≈26 ms per render in dev, 66 renders on a 30-card drop before coalescing): UI-architecture feature.

---

## Close

1. `bun run gate` alone.
2. `/feature-review step-3f` (superpowers' reviewer, `security-sentinel` for Task 1's write gate), kept as `specs/step-3f/review.md`.
3. One fix pass, each fix RED→GREEN.
4. `/shakeout step-3f`, once: the e2e flows above, one screenshot per surface, `specs/CHECKS.md` registered.
5. `bun run gate` alone, the final gate. The orchestrator drives the preview before merging.
