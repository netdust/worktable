# Plan review — step-3f: the board's drag like Folio, and the four held shapes (second review)
Reviewed-plan: 50add160a1743eaed1e645475310cf0715362d01
Verdict: not ready

The core of the revision holds:
- **The `dropOf` walk is sound.** I copied Folio's `rankBetween` and probed the walk on 200k random columns: ranked and unranked cards, duplicate ranks, manual and sorted boards, any drag source and slot.
  - It never called `rankBetween` with lo ≥ hi.
  - On a manual board, the resulting `[position, prev…]` order always equalled the shown order with the card at its slot.
  - On a sorted board with no ranks, the result was exact.
  - On a sorted board holding ranks, the result was exact up to and including the dropped card. Ranked cards after the slot moved, which is the SPEC's known limit.
  - Script: /tmp/claude-1000/-home-ntdst-Sites-worktable/6f88ed6d-2ef2-4d71-afc9-26145384f906/scratchpad/walk.ts
- **The engine sort is feasible.** `orderOf` (rows.ts:63-74) builds one `asc`/`desc` per key and then `id`. A `position` key can emit `(position IS NULL)` before it. `parseSort` (params.ts:104-117) and `columnsOf` (views.ts:131-144, :181) only need `position` accepted as a key.

Three things block: two premises are false in source, and one fixture makes two B5 proofs fail or prove nothing.

## Status of the first review's findings
- **K1** — resolved. The walk plus the drop.test.ts case with descending ranks covers it; the probe confirms.
- **K2** — resolved as written: no sort chip is asserted any more. But the signal that replaced it does not work on the plan's fixture → **B1** below.
- **S1, S2, S3, S8, S9, S12, S13** — resolved.
- **S4** — resolved: store.test has "two applySteps on one record queue".
- **S5** — partly. The count now goes through `Shown`. The open path is false → **B2**.
- **S6** — partly. HistoryPanel is now covered; the type file is wrong and the drawer's history is missing → **S4** below.
- **S7** — partly. Ruling Q3 names the path, but the picker it opens does not exist → **B3**.
- **S10** — partly. The e2e list is now given; skins.test.tsx, the `-g` pattern and `dragTo` are missed → **S6** below.
- **S11** — resolved for the manual-board flows. The sorted-board flows' fixture → **B1**.
- **N1–N4, N7, N8** — resolved. **N5** reworded. **N6** needs no action.

## Blocking

**B1. The "changed" mark is already on before the drop, so `board-sorted-cross-column` cannot pass and `board-sorted-to-manual` proves nothing.**
- **Where:** plan.md:199 ("the switch from the toolbar's 'changed' mark (App.tsx:593-596)"), :203 and :204 ("the seeded Per status narrowed to the flow's week").
- **Why:**
  - Narrowing a locked view is itself a local change. `openWeek` (e2e/tree.ts:42-50) lands the week as a link condition. Workspace stores it in the planner's layout: App.tsx:270-302, "It is a local change".
  - `changed(view)` compares the filters too (ui/views.ts:79-89). So "Terugzetten", which is the whole "changed" mark (Toolbar.tsx:83-86), is there before any drop.
- **Consequences:**
  - "No 'changed' mark" in `board-sorted-cross-column` always fails.
  - "The drop shows the mark" in `board-sorted-to-manual` passes vacuously.
  - "Revert brings the date order back" fails too: revert clears the whole local layout, the week included, so the invented cards leave the board.
- **Smallest change:**
  - Give both flows a sorted board view that opens locked with no local change. Either the flow creates it as the administrator, `shared: true`, with sort `plandag,start_at` and the week as a stored filter, so the editor sees it colleague-locked; or it becomes a system-owned board view in e2e/fixture-views.ts, whose insert hard-codes `'table'` (:25).
  - Assert the switch through the stored local layout's `sort`.
  - After revert, re-narrow before reading the order.

**B2. The flag insight's button cannot open the flag query's view through the hash.**
- **Where:** plan.md:258, Task 9: "sets `location.hash` to `#view=<source>`, which Workspace already follows".
- **Source:**
  - Workspace follows a hash change only when it carries `f`: `if (!linked || f === null) return` (App.tsx:276-278).
  - View keys are saved-view ids, not source names (engine.ts:395). `#view=conflicten` matches no view and falls back to the first dashboard (App.tsx:239).
  - Adding `f=[]` would land an empty condition as a local change on Conflicten.
- **Smallest change:**
  - Toolbar gets `onFlagged(source)`. Workspace passes `(s) => openTable(tables.find(t => t.key === s))` (useSavedViews.ts:83-86).
  - Record this one-line Workspace prop as the exception to the "no growth" constraint, and add App.tsx to Task 9's files.
  - Toolbar.test asserts the handler gets the source.

**B3. G4's "Iemand anders kiezen" opens a picker that does not exist.**
- **Where:** plan.md:258 ("opens that place's persoon picker in the Mensen section, which lists its kandidaten through `options_from`") and :261.
- **Source:**
  - The record drawer's Mensen is `LinkSection`, a static list with no picker and no write (grid/drawer/Sections.tsx:26-62).
  - The only kandidaten pickers are the matrix's, on the matrix store (matrix/Panel.tsx:203-224, Matrix.tsx:187-222), and action inputs (Drawer.tsx:355-356).
  - `RelationPicker` takes `candidates` (cells/RelationPicker.tsx:37).
- **What Task 9 lacks:** it neither builds the picker nor designs the write. The tests stop at "opens".
- **Smallest change:**
  - Task 9 builds a per-place `RelationPicker` in `LinkSection` for the flagged place. Its candidates come from `optionsFrom(<the link dataset's person column>.options_from, <the place row>)`; the section already reads the place rows at :33-35.
  - A pick PATCHes the place's person column and pushes a history entry whose `refresh` re-reads the section.
  - Drawer.test adds "a pick writes the place's person". The e2e picks and checks after a reload.
  - Write it generically (the drawer's link dataset), never "toewijzing", per the Global Constraint at :30.

## Should fix

**S1. The drop does not show at once: the card snaps back for the length of the step.**
- **Where:** plan.md:126 (`applyStep` "writes in order, each its own PATCH"), :155 (the switch after the writes) and :174 (only a manual board orders by `byRank`).
- **Source:** `commit` paints each change only when it starts (store.ts:191-194). So:
  - The dropped card, always the last write, stays at its old place for N sequential round trips.
  - On a sorted board, nothing reorders until the writes land, `onLayout` switches and the rows are re-read.
- **Why it matters:** this is Stefan's "ends up on a different place", shown transiently. It contradicts B2's "in one look" and B5's "then".
- **Change:**
  - `applyStep` paints every change before the first PATCH, and on a refusal reverts the unsent ones too.
  - Board orders the dropped column by `byRank` from the drop until `onDrop` answers, and clears that on false.
  - store.test: every change painted before any answer. Board.test: on a sorted board, the card sits at its slot before `onDrop` resolves.
  - The e2e's "read again at once" (:203) becomes a poll.

**S2. The undo of a step repaints only one row.**
- `repaint` re-reads only `entry.id` (store.ts:245-250). The step's other rows keep their painted ranks while the server's are null again.
- **Example:** five unranked cards; card 1 moved down to third, then ⌘Z. The board shows B, C, A, D, E until a reload. The next drop computes from the stale ranks and writes only one card, which lands elsewhere after a reload.
- `board-undo-both` (:206) misses this: its drop is cross-column, where the stale ranks happen to encode the old order.
- **Change:**
  - The step's entry carries `refresh` that re-reads every id it wrote; `repaint` already prefers `refresh` (:246). Redo uses the same path.
  - store.test: an undo of a step re-reads each written row.
  - Add a ⌘Z check to `board-reorder-fresh`.

**S3. A step whose last write is refused loses its landed batches.**
- **Where:** plan.md:126, "batch the last write's … the entry keeps the batches that landed".
- **Source:**
  - `history.step` returns early and drops the entry when `batch` resolves to null (history.ts:57-62).
  - `apply`'s pattern drops the entry too (store.ts:306-307).
- **Change:**
  - Say that `batch` resolves to the last landed write and `before` holds the rest.
  - Say what a partly failed undo of a step does: an `already_undone` 409 on a retry (writes.ts:725).

**S4. A move in history: wrong type file, and the drawer's Geschiedenis is missing.**
- **Where:** plan.md:87 changes `ui/history.ts`. That file is the undo stack. The change type is `HistoryEntry.changes` in types.ts:381-393.
- The record drawer renders `entry.changes[0]` as "zette <label> op <new>" (Sections.tsx:119-125). Every rank write would read "zette … op —" on each ranked card.
- **Change:** in Task 1, replace `ui/history.ts` with `types.ts` (`moved?: true`, old and new optional) and add `grid/drawer/Sections.tsx` with a test.

**S5. G3's count never shows on table views.**
- SPEC:141 says "the title line shows how many of the view's rows are flagged". Task 9 (:257-258) reports `flagged` only from Card, Timeline, Calendar, Matrix and WeekTile.
- The table `Grid` also reports through `onShown` (App.tsx:632), yet Planning would never show "N Conflicten".
- **Change:** add `grid/Grid.tsx` to Task 9's reporters, with a test.

**S6. Tests the GridList removal breaks are not listed or run.**
- apps/grid/src/skins.test.tsx:24-33 and :50-85 locate board columns and cards by `grid`/`row`. Task 3 (:146-148) does not list it.
- Task 4 Step 2's `-g "board|groep-everywhere|title-line-insight"` (:209) runs neither test whose locators Task 4 changes: `skins-open` (step-3c.spec.ts:276, covering :341/:346) and `drawer-in-slot` (step-3d.spec.ts:173, covering :183/:216).
- step-3e `board-drag` drags with `dragTo` (:163), a single pointer move. dnd-kit's PointerSensor starts on that move and returns without `onMove` (@dnd-kit/core 6.3.1 core.esm.js:1545-1547), so the card drops in place. Task 4 rewrites only its keyboard part.
- **Change:**
  - Add skins.test.tsx to Task 3.
  - Add `skins-open|drawer-in-slot` to the `-g` pattern.
  - Make `board-drag`'s mouse part use stepped `page.mouse` moves.

**S7. `dropOf` cannot return `none` for the card's own index.**
- **Where:** plan.md:120-124.
- Its input is `{ manual, same, index, cards, value }`, and `cards` excludes the dragged card, so its original index is unknown.
- **Change:** add `from: number | null` (its index in its own column's shown order; null across columns).

## Note

- **N1. The walk writes more than the ruling's words.** It re-ranks already-ranked cards above the slot when they are out of order on a sorted board (plan.md:123). Ruling Q1 and SPEC:139 say it ranks "the still-unranked cards". Without this the walk would throw, and it narrows the known limit. One line for the orchestrator to acknowledge.
- **N2. Some ranks the engine accepts cannot be built around.** `^[0-9A-Za-z]{1,255}$` accepts ranks that `rankBetween` cannot place a key below or beside: `rankBetween(null, '0')` and `rankBetween('a', 'a0')` throw (Folio board-rank.ts `midpoint`). Only an API or import write can store them. Either `dropOf` treats such a neighbour as unranked, or the engine refuses a trailing `0`, which needs a SPEC line first.
- **N3. A drop back on the card's own place on a sorted board** still yields `place` with `manual: false`. It switches the board to manual and ranks every card above. Consider `none`.
- **N4. The switch's sort key.** `[{ id: 'position' }, …]` (plan.md:26, :155) lacks `desc`. `SortKey` requires it and `parse` drops a stored layout without it (grid/layout.ts:6-9, :88); typecheck will catch it. Also skip the prepend when the sort already holds `position`: `keysProblem` refuses a key named twice (params.ts:96-100).
- **N5. A simpler, faster write order.** The rank writes touch distinct records, and `rankBetween` output never fails validation. They could be sent at once, with the dropped card's write last. That makes the ~30-card case one round trip deep instead of N.
- **N6. `groep-everywhere` goes vacuous.** step-3e.spec.ts:122 `getByRole('grid', { name: 'Optie' })).toHaveCount(0)` passes for any reason once the role is gone. Locate the section instead.
- **N7. Task 11 is already done.** It (plan.md:274-276) landed as 043a5bc. The far-future weeks must also avoid the windows that commit leaves: August 2028 and 2029-03-26.
- **N8. Execution mode.** The plan recommends native (:20). Task 1 touches a security-boundary path, and eleven tasks likely outlive one context — both are your triggers for subagent-driven. Your call at handoff.

## Premises checked
- `dropOf` walk never calls `rankBetween(lo ≥ hi)` and gives the shown order → probe, 200k cases → holds; sorted boards up to the slot only (known limit)
- `position` first, then the previous keys, nulls last → rows.ts:63-74, params.ts:104-117, views.ts:131-144/:181 → holds (feasible)
- `toRow` keeps `position` in `fields` → engine.ts:433-444 → holds
- `apply` returns early on an unchanged field (S3 of the first review) → store.ts:300 → holds; the plan now writes `field: 'position'`
- `applyStep` paints as the old design did → store.ts:183-194 (paint at each commit's start) → does not hold for an optimistic step (S1 above)
- Undo repaints the step's rows → store.ts:245-250 (only `entry.id`) → does not hold (S2 above)
- History keeps a step whose last write is refused → history.ts:57-62 → does not hold (S3 above)
- Keyboard: the activator must be the target; the listener is added in a `setTimeout`; `pointerWithin` returns [] without coordinates; `handleMove` always dispatches → core.esm.js:1158, 1353-1361, 479, 1305-1311, 2590-2602 → holds
- Pointer: the activating move moves nothing → core.esm.js:1545-1547 → so step-3e's `dragTo` drops in place
- The "changed" mark marks the switch on a narrowed Per status → views.ts:79-89, App.tsx:270-302, e2e/tree.ts:42-50 → does not hold (B1)
- Workspace follows `#view=<source>` → App.tsx:276-278, engine.ts:395 → does not hold (B2)
- The Mensen section has a per-place person picker → Sections.tsx:26-62 → does not hold (B3)
- The drawer is not a dialog, so `usePageUndo` still fires from a drawer button → SidePanel.tsx `aside` → holds; QuickCreate is a `Dialog` (QuickCreate.tsx:107-109) → holds
- HistoryEntry lives in `ui/history.ts` → types.ts:381-393 → does not hold (S4); drawer Geschiedenis at Sections.tsx:119-125 → not covered
- The writer accepts a position-only update (an empty `cut`) → theatre writers.ts:79-133, 175-205 → holds
- Seeded boards: Per status sorted `plandag, start_at`; Bord toewijzingen `activiteit_id`, no filter → seed.ts:467-485 → holds
- Geweigerd is the right-hand neighbour of Bevestigd → datasets.ts:242-249 → holds
- `options_from` KANDIDATEN on the toewijzing person column → datasets.ts:232 → holds
- app.css:3882 (rail), :5848-5856, :5868 and :5902-5945 → holds
- App.tsx:400-416 (⌘Z effect) and :621-624 (Board props) → holds
- The board's period keys do not clash: ←→ step a period only on a calendar or timeline → App.tsx:326 → holds
- The C2 sweep is still to do → 043a5bc → does not hold (already landed, N7)

## Resolution (author, 2026-10-15)

The plan was revised after this review to blob 8c94ab0b713895047547480e2a59193558df0ff3. The orchestrator ruled that no third review is needed.
- B1, S1–S7, N3–N7: fixed in the plan as the review proposed.
- B2: Toolbar `onFlagged(source)` wired to Workspace's `openTable`, recorded as the one exception to "no growth in Workspace" (ruling 2).
- B3: the record drawer's band offers "Negeren" only. "Iemand anders kiezen" stays in the matrix cell drawer. Making the record drawer's Mensen section editable is deferred (ruling 1 (c); docs/SPEC.md).
- N1: acknowledged in the SPEC (d0f2369).
- N2: the engine refuses a rank ending in `0` (d0f2369), with a Task 1 test.
- N8: subagent-driven (ruling 4).
- Task 1's threat model now also covers rank-only writes through scope and writer, and the trailing `0`.

---

## The first review (blob fbc1455), kept for its findings

# Plan review — step-3f: the board's drag like Folio, and the four held shapes
Reviewed-plan: fbc1455f41077142baa3d56c9363aefe5caaf115
Verdict: not ready

The plan has two blocking problems:
1. On a sorted board, a drop inside a column ranks the card against its neighbours in sort order. That throws on the seed's own Per status board.
2. Two e2e flows assert on a sort chip that does not exist.

Most of the plan's file:line premises hold, and so does the engine `position` write path (see Premises checked). The main Should-fix work is the keyboard and collision design (S1, S2) and the gaps in the Task 9 files (S5).

## Blocking

**K1. A drop inside a column on a sorted board throws, so B5 has no working design.**
- **Where:** Task 2 Interfaces, `dropOf`: "`cards` is the target column in display order … `position = rankBetween(effectiveRank(cards[index-1]), effectiveRank(cards[index]))`; same column and not manual → `auto-manual-reorder`". Task 3 Outcomes uses the same rule.
- **Why it breaks:** on a sorted board the display order is the view's sort, not the rank order:
  - Per status sorts by `['plandag','start_at']` (packages/theatre/src/seed.ts:482).
  - Bord toewijzingen sorts by `['activiteit_id']` (seed.ts:472).
- **Evidence:**
  - Folio's `rankBetween` throws when lo ≥ hi (folio packages/shared/src/board-rank.ts, `rankBetween` guard).
  - I copied the function and probed it: `rankBetween(eff(50), eff(41))` throws "lo must be < hi".
  - I migrated and seeded an in-memory theatre DB. Bucketed per status per month in `plandag,start_at` order, 6 of 24 adjacent activity pairs have descending ids.
  - So the first drop inside a column on the seed's Per status throws in the drop handler. That is exactly the path worktable-ac will drive on the preview.
- **Even without the throw:** after the switch to `position`, the column re-sorts by rank or id, so the card's neighbours change.
- **Why tests miss it:** drop.test.ts's sorted-board case never puts neighbours out of rank order. The e2e passes only because invented records are created in date order.
- **Smallest change:**
  - Define the auto-manual rule, e.g. take `cards` in `byRank` order (the order the column shows once manual) and keep the dropped slot index.
  - Add drop.test.ts cases with display neighbours out of rank order.
  - Get the orchestrator's reading of "the card stays where it was dropped" (spec B5, proof `board-sorted-to-manual`) for when the other cards re-sort.

**K2. There is no sort chip.**
- **Where:** Task 4 e2e `board-sorted-to-manual` ("switches the sort chip to manual") and `board-sorted-cross-column` ("the sort chip is unchanged"). The spec proof (spec.md:59) has the same wording.
- **Source:**
  - The chip row has scope, filters, group, period, skin, +Kolom, count and Kolommen, and nothing else (apps/grid/src/ui/bar.ts:62-77). ChipBar.tsx has no sort.
  - The only sort control is the table header (grid/GridHeader.tsx:30), and a board has no table header.
  - `sortedBy` (i18n.ts:51) is unused.
  - No task builds a chip, and no requirement asks for one.
- **Smallest change:** assert on things that exist:
  - the card order after a reload;
  - the stored layout's `sort`;
  - the "changed" mark (Toolbar `local`, App.tsx:593-596).
  
  If Stefan wants a visible manual-order indicator, the spec needs a line first.

## Should fix

**S1. Keyboard drag: the plan contradicts spec B8, and its collision rule cannot change column by keyboard.**
- **Contradiction with B8:** spec B8 says "KeyboardSensor and sortableKeyboardCoordinates". Task 3 instead uses "a coordinates getter over the board's own model".
  - The deviation is probably needed: `sortableKeyboardCoordinates` picks targets by comparing rects (`collisionRect.top < rect.top`, @dnd-kit/sortable 10.0.0 sortable.esm.js:688-716). Under jsdom's all-zero rects it returns nothing, so no ↓ or ← test can move a card.
  - But the plan must say it deviates, and the orchestrator must rule on it.
- **Collision rule fails for keyboard:** the plan uses `pointerWithin` on the columns first.
  - `pointerWithin` returns [] when there are no pointer coordinates (@dnd-kit/core core.esm.js:479).
  - A KeyboardEvent has no clientX, so pointer coordinates are always null under KeyboardSensor (core.esm.js:2916, 2977).
  - Result, in the browser and in jsdom alike:
    - `over` is always a card in the source column, so ←→ never changes column.
    - The column tint never shows.
    - The gap follows closestCenter's guess, not the model index.
- **Can jsdom drive Board.test.tsx at all?** Yes, but only if all three hold:
  - The keydowns carry `code` ('Space', 'ArrowDown') and target the activator node itself (core.esm.js:1353-1361).
  - The test waits one macrotask after the lift; the sensor adds its keydown listener in a `setTimeout` (core.esm.js:1158).
  - The drop and the slot are resolved from the plan's live target, not from `over`.
- **Default keys clash:** dnd-kit's default `keyboardCodes` lift on Enter and drop on Enter or Tab (core.esm.js:1098-1102). Enter would then lift a card instead of opening it (Board.test.tsx, "opens a card's row with Enter").
- **Smallest change:**
  - Say that with no pointer coordinates the collision returns the live target.
  - Say that the keyboard getter returns that slot's screen coordinates.
  - Set `keyboardCodes` to `{ start: ['Space'], end: ['Space'], cancel: ['Escape'] }`.
  - Record the B8 deviation for the orchestrator.

**S2. The plan does not say which index decides a drop inside a column.**
- `dropOf` takes one `index`. Task 3 draws the in-column gap with the sortable but has `targetOf` measure pointer slots.
- Folio documents that the pointer and the gap disagree inside a column, the "lifts, drags, snaps back" bug (kanban-view.tsx:64-73; `reorderSlotPosition` in board-drag.ts uses arrayMove).
- **Smallest change:**
  - Inside a column: index = arrayMove(active, over), i.e. the gap dnd-kit draws.
  - Across columns: index = `targetOf`.
  - In the gutter (pointer inside no column): keep the last target. Falling back to the own column makes the source column reopen its gap whenever the pointer crosses a gutter.

**S3. Where `position` lives in the grid, and why a plain reorder writes nothing.**
- Task 2 adds `Row.position` and an engine.ts "lift". But `toRow` already puts every unknown key into `fields` (engine.ts:433-439), and the store's read, write and revert all work on `fields` (store.ts:90-98, 220-225).
- Task 3's reorder is `apply({ id, field: column, value, with: { position } })` with an unchanged `value`. `apply` returns early when the field's value is unchanged (store.ts:300), so nothing is written.
- **Smallest change:**
  - Keep position in `fields.position` and drop the `Row.position` change.
  - Reorder: `apply({ id, field: 'position', value })`.
  - Regroup-reorder: `apply({ id, field: column, value, with: { position } })`.
  - Add store tests for the plain reorder and for a refusal that reverts the `with` field.

**S4. Review Focus 6 points at a test Task 2 never writes.**
- RF6 says "a second drop … queues on the record (`store.queued`) → Task 2 (`store.test.ts`)".
- Task 2 Step 1's store tests cover only `with`: the send, the paint, the undo and the refusal.
- Add the queued case.

**S5. Task 9's file list misses App.tsx, engine.ts and types.ts.**
- The Toolbar's insight is computed in Workspace (App.tsx:453) and passed in at :585.
- "Opens the flag query's view" needs `setActiveKey` (App.tsx:198).
- `useFlags` needs the query's `flags` from /schema, which `toSchema`/`tableDefOf` do not carry (engine.ts:261-292). This conflicts with the Global Constraint "no growth in Workspace".
- **Smallest change:**
  - Add engine.ts and types.ts (`TableDef.flags`) to Task 9.
  - Route the count through `Shown`, as Task 10 does for overlap, and open the view through the hash Workspace already follows. Otherwise, record a one-line Workspace exception.

**S6. A move in history has no grid rendering.**
- Task 1 changes a history change to `{ field: 'position', label, moved: true }` with no old or new value.
- HistoryPanel renders `old → new` (apps/grid/src/ui/HistoryPanel.tsx:126-131), and no task touches it or ui/history.ts.
- The engine has no Dutch label to give.
- Today a position-only batch does not appear in /history at all: `latest` counts only shown fields (history.ts:97-101).
- **Fix:** add a "verplaatst" line in i18n plus a HistoryPanel test.

**S7. G4's "Iemand anders kiezen" has no test and no path.**
- Task 9's tests cover only "Negeren".
- The candidates picker lives in the matrix cell drawer (matrix/Panel.tsx:203-224) and reads the matrix store. The record Drawer has no way to open it.
- **Fix:**
  - Say what the button does from an activity's or a person's drawer.
  - Add a Drawer.test.tsx case: the button shows only when the flag marks a matrix join row, and is absent otherwise.

**S8. conflict-marks-and-insight expects marks that a same-production pair cannot produce.**
- `marks` names one column per dataset (SPEC:141).
- A double booking within one production gives one conflicten row (code 1). Its `activiteit_id` is only one of the two activities; the other sits in `ander_activiteit_id` (conflicten.sql:34-41).
- The pair is repeated from the other side only across productions (code 7, :43-52).
- So "marks both activities' cards … '2 Conflicten'" holds only for a pair across two productions where both activities are timed. Untimed gives `waarschuwing`, not "Conflict" (:35).
- **Fix:** specify a timed pair across two productions in the e2e.

**S9. The rank test asserts something Folio's `rankBetween` and the SPEC both rule out.**
- Task 2's `rank.test.ts` expects a drop "below the last unranked row" to sort "before a later-created one (id 100)".
- The copied `rankBetween(eff(40), null)` returns `'zzzzzzzzV'`, which sorts after eff(100) (probe).
- docs/SPEC.md:139 records exactly this as its known limit.
- **Fix:** assert only that the result is > eff(last), plus the known limit.

**S10. Do the board columns stay react-aria GridLists?**
- Task 3 creates Column.tsx and Card.tsx and drops `.nv-board__grip`, but does not say.
- **If they stay:** GridList's arrow keys and `usePress` compete with dnd-kit's sensors on the same rows.
- **If they go:** these e2e lose their `grid`/`row` locators, but Task 4 updates only step-3e's drag flows:
  - step-3c.spec.ts:341, :346
  - step-3d.spec.ts:183, :216
  - step-3e groep-everywhere (:117, :121)
  - step-3e board-column-plus-in-window (:285)
- **Wrong target in Task 4:** it says `undo-from-the-page` uses react-aria's Enter-Enter. That test edits a grid cell (step-3e.spec.ts:547-589). The keyboard drops are in `board-drag` (:193-211) and `title-line-insight` (:707-710).
- **Fix:** decide, and list the specs each choice affects.

**S11. The manual-board e2e flows have no setup.**
- Both seeded boards are sorted and locked (seed.ts:472, :482).
- Each test starts from editor.json's storage, so no manual layout carries over from an earlier test.
- These flows need one: `board-drop-between`, `board-reorder`, `board-reorder-fresh`, `board-undo-both`, `board-keyboard`.
- Give each its own setup: either a view the test owns, created with `sort: ['position']` (3c precedent: "e2e Bord activiteiten", step-3c.spec.ts:344), or an auto-manual drop first.
- Give each flow its own far-future week; 3e reused `DRAG_WEEK` (step-3e.spec.ts:132).
- Otherwise invented records avoid the seed: `workers: 1` and a `--fresh` database (playwright.config.ts:5, :20).

**S12. Task 1 runs only the engine's tests.**
- `position` changes every theatre and fiche table and every row.
- Exact column lists will move (e.g. engine/test/migrate.test.ts:73), and so will theatre migrate, history and parity tests.
- Step 4 should run `bun test packages`.

**S13. `DatasetDecl.engine?: true` is a new public field.**
- It is not on the SPEC freeze list (docs/SPEC.md:130).
- `validateDomain` would have to refuse it on domain datasets, as it refuses `checks` (validate.ts:603).
- The engine already knows its own tables: `engineTables` and `reservedNames` (engine-tables.ts:98-109).
- **Fix:** have `columnSpecs`/`tableOf` test `reservedNames.has(d.name)`. That adds no new field.

## Note

- **N1. Race between the layout switch and the write.**
  - Auto-manual calls `onLayout` first, then the write. The sort change re-reads the rows (App.tsx:382, `asks`), and `useGridStore` builds a new store for each set of rows it loads (grid/hooks.ts:33-36).
  - If the GET is served before the PATCH commits, the card shows at its old rank until a reload.
  - Write first, then switch the layout on success. That also avoids going manual on a refused write.
- **N2. Board scrolling.** Board columns never scroll on their own; the whole `.nv-board` scrolls (app.css:5848-5856). `targetOf` should read the list's top live, not `list.scrollTop`.
- **N3. CSS deletion scope.** Do not delete `[data-drop-target]` everywhere: app.css:3882 is the rail's view reorder, which is out of scope. Limit the deletion to `.nv-board*` (app.css:5868, 5902-5945).
- **N4. The "Simplest design" reason is partly inaccurate.**
  - It says the react-aria alternative had "no cross-column slot". 3e drew a DropIndicator slot and a custom drag preview (Board.tsx:84-85).
  - The choice still binds through brief.md:11 ("on dnd-kit") and the memory note. Fix the stated reason, not the choice.
- **N5. Two threats are thin.**
  - Threat 4 cannot happen: views for owners are query-only (views.ts:415), and queries have no position. Its refusal is "not a column". `ownerVisible` is at views.ts:398-402, not 405-425.
  - Threat 6 can arise only after a role change, since only a batch's maker undoes it (writes.ts:722). No test drives it.
- **N6. OpenAPI and /revisions.** `/schema?format=openapi` lists only declared columns (openapi.ts:52-53), so `position` will not appear. `/revisions/:d/:id` still serves the raw rank (writes.ts:668-684), which the SPEC's history-only wording allows.
- **N7. Spec file mismatch.** The spec puts `board-drag-refused` in e2e/step-3f.spec.ts (spec.md:53, 62); the plan keeps it in step-3e.spec.ts. Align one.
- **N8. Missing test file.** Task 8's "component · timeline" test has no file: timeline/ holds only layout.test.ts. Add it to Create.

## Premises checked
- App.tsx:624 passes no `onMove` for a query → holds
- ddl.ts:30-52 `columnSpecs`; a nullable `position` takes the ALTER path (schema-diff.ts:78, 90-100) → holds
- tables.ts:24-34 `tableOf`; rows.ts:63-74 `orderOf`; rows.ts:129-140 serves only `source.columns` → holds
- params.ts:104-117 sort only (group uses `hasColumn`, :119-123); views.ts:181 → holds
- `position` write path:
  - cutBody drops undeclared keys today (writes.ts:97-99) → holds
  - checkValues (:122-129) and encodeAll (:175-178) need a case for it → holds
  - splitting it out before `writer.update` is feasible, and theatre writers accept an update without it (writers.ts:69-100) → holds
  - `restore` goes through `valuesOf` (:794), so undo restores both fields in one batch → holds
  - `revise`/`asJson` handle an undeclared field (:493-496), and `planUndo` compares through `asJson` (:767) → holds
- history.ts:63-101: position must join `shown`, since it is filtered out today → holds
- access.ts:46-52 `linkWritable` runs before `runWrite` (app.ts:61) → holds
- views.ts:405-425 `ownerVisible` → does not hold (it is at :398-402)
- app.ts:272-307 /schema; App.tsx:400-416 the ⌘Z effect; App.tsx:623-624 the Board props → holds
- engine.ts:150-169; `textarea` field type (types.ts:5); `LongTextEditor` (cells/Text.tsx:43); derive.ts:45; Drawer.tsx:154-165; Panel.tsx:77-92 → holds
- declare.ts:59-63; validate.ts:577-583; types.ts:301-304; GridBody.tsx:91-94; `dagFacts` used only by activiteit (datasets.ts:115) → holds
- datasets.ts:82-100 and :135; TONES (declare.ts:24); `--tone-*` (theme.css:48-55); `--shadow-pop` (theme.css:57) → holds
- Timeline.tsx:119; Calendar.tsx:41-49; Toolbar.tsx:94; Matrix.tsx:590; WeekTile.tsx:57 → holds
- queries.ts:79-116; validate.ts:208-215; speelreeks's title is a string (datasets.ts:336) → holds
- i18n `dismiss` "Negeren", `chooseOther`, `keepIt` (i18n.ts:42, 192, 196) → holds
- Mockup board-prototype.html:342, 355-357, 852-863 → holds
- Folio kanban-view.tsx:274, 325-336; board-drag.ts; board-reorder.ts skips null neighbours → holds
- Effective rank between neighbours: between ids 40/41, 39/40 and 9/10, and above the first → holds; the five-unranked case lands third → holds
- Effective rank "below the last unranked, before id 100" → does not hold (S9)
- Display-order neighbours on a sorted board have ascending ranks → does not hold (K1)
- A sort chip exists → does not hold (K2)
- `undo-from-the-page` uses react-aria Enter-Enter → does not hold (S10)
- "dnd-kit's keyboard path, which jsdom drives" → holds only under the conditions in S1
- `pointerWithin` finds a column during a keyboard drag → does not hold (S1)
- e2e isolation: `workers: 1`, a `--fresh` database, far-future weeks → holds; manual-board setup is missing (S11)
- columns.ts:49 and :283; grid-ux.spec.ts:484; ui-fit.spec.ts:258 → holds
- The C2 sweep report exists (`seed-date-sweep.md`, in a session scratchpad) → holds

The probe scripts are in /tmp/claude-1000/-home-ntdst-Sites-worktable/6f88ed6d-2ef2-4d71-afc9-26145384f906/scratchpad/:
- probe.ts: the `rankBetween` cases
- seedorder.ts: the seed's id order
