# Plan review — editable-board
Reviewed-plan: 59885a9d738440fec6483c87c8e758f162130b4a specs/editable-board/plan.md
Verdict: not ready (one Blocking finding, and the fix is small)

## Blocking

**B1. A query board over a lifecycle column has no greying, no "Geen" rule and no button-only rule.**
- **Plan:** Task 2 Interfaces says `reachable(model, column, …)` is "true for any lane when `column` is not the model's lifecycle". Task 3 Step 3 swaps `!model.query` for "the board column has `writes`".
- **Source:** `packages/theatre/src/queries.ts:146-149`. The `persoon_dag` query's `state` `writes: { dataset: 'toewijzing', field: 'state' }`, which is toewijzing's lifecycle column (`packages/theatre/src/datasets.ts:279-288`). A query `Model` carries no `lifecycle`, `lifecycle_transitions` or `lifecycle_buttons` (`apps/grid/src/engine.ts:239-241` sets them only from the source's own lifecycle).
- **What goes wrong:** `pressedOnly(model, key)` (`apps/grid/src/grid/columns.ts:281`) reads the query model only, so it never stops this drag.
- **Result:** after Task 3, a board on `persoon_dag` grouped by `state` drags into every lane, the unreachable ones and "Geen" included, and the engine refuses afterwards. That breaks ruling 1 ("on a lifecycle column the columns no transition reaches are greyed and take no drop"). If the target lifecycle has buttons, it also breaks ruling 2 (button-only). Ruling 3 is the change that makes this surface draggable, and no task covers it.
- **Smallest change:**
  - Task 2: resolve the lifecycle through `field.writes`. `reachable` (and `canSet`'s `pressedOnly` check) should look at `models[writes.dataset]` when `writes.field` is that model's lifecycle. One way is to pass `models` in, or to compute the effective lifecycle model once in Board.
  - Task 3 Step 1: add a test on a query board whose `writes` column is a target's lifecycle column. It should cover greyed lanes, a "Geen" lane that is never a target, and no drag when the target declares buttons.
  - Add one Review Focus line pointing at row 4.

## Should fix

**S1. Owners are denied transitions that their role is declared to make.**
- **Plan:** Task 1 Step 1 says "an owner and a link account get no `transitions` key". Threat 2 says "nothing for an owner or a link account that cannot write the dataset".
- **Source:** owners are declared on transitions, in `packages/theatre/src/datasets.ts:285-286` (uitgenodigd→bevestigd/geweigerd, roles include `owner`) and in the test fixture at `packages/engine/test/lifecycle.test.ts:36` (b→c, `roles: ['owner']`).
  - An owner *user* (not a link) is not restricted to `owner_writable` columns. `linkWritable` (`packages/engine/src/access.ts:53-59`) runs only for `actor.kind === 'link'` (`packages/engine/src/app.ts:87`). So that user can make b→c through `checkTransition`.
- **Conflict with the spec:** `docs/SPEC.md:83` says "only to a column one of the viewer's role's declared transitions reaches".
- **Result:** with none served, `reachable` greys every lane for an owner who may make a declared transition.
- **Smallest change:** serve every role its own filtered transitions; the role filter already closes the leak in threat 2. Leave them out only for `actor.kind === 'link'`, which may never write the state (`packages/engine/src/validate.ts:285-294`, "never … its state"). Change Task 1 Step 1 and the threat 2 test to match. Also state the absence rule exactly, because "may not write the dataset" is not a test you can run.

**S2. Rewriting `board-drag-refused` loses the only e2e that drives a refused drop on the board.**
- **Plan:** Task 2 Step 3 says "Rewrite `board-drag-refused` to 'not offered' … keeping its reload and undo assertions."
- **Source:** `e2e/step-3f.spec.ts:671-677` (the snap-back `back()`) and `:701-772`. The manual-board sub-step depends on a 422 refusal after the rank writes above the slot have landed. That is the proof that "a refused write leaves no step", and that one ⌘Z after it undoes the earlier edit.
- **Why it cannot be kept:** once Task 2 greys the lanes, no board drop can produce that 422, so those undo assertions cannot be kept as written.
- **What is left untested:** R3's "snaps back with the writer's refusal" and the plan's own Review Focus line "a stale drop still 409 with a re-read" have no grid or e2e test. Test map row 1 tests the engine only.
- **Smallest change:** in the same Task 2 rewrite, keep the refusal path by making it stale. Load the board, move the row by API to a state from which the target lane is no longer valid, then drop on a lane that is reachable from the *shown* state. Expect a 409 `transition_lost`, the card re-read, and on the manual board the same "one ⌘Z undoes the edit before" assertion. Point the stale-drop Review Focus line at row 2.

**S3. Threat 3 relies on an engine path that does not exist.**
- **Plan:** threat 3 says "the engine's query write path refuses anything else (existing)".
- **Source:** the engine has no query write route. `writableOf` (`packages/engine/src/writes.ts:71-75`) answers 405 `read_only` for any query, and the grid's `updateThrough` (`apps/grid/src/api.ts:326-340`) PATCHes `/rows/<target dataset>/<id>` directly.
- **Why it still holds:** the real mitigation is that this PATCH is an ordinary dataset write, judged by `cutBody`, `checkTransition` and the role. A client could already send it without any query. No task builds on the false claim, which is why this is not Blocking.
- **Smallest change:** reword the mitigation to that. The grid-side test "sends only the mapped field" stays.

## Note

**N1. The reason given for rejecting a per-row answer is wrong.** The Simplest design paragraph rejects a per-row `available` because "it adds a read per drag". But `available` is already a per-row mark that comes back with the rows read (`packages/engine/src/available.ts:54-70`, `packages/engine/src/rows.ts:287`), so no extra read is involved. The true reasons are these:
- `available` is served only where `declaresMarks` holds (buttons or `when` actions, `available.ts:28-32`), and those are exactly the boards that do not drag.
- It would add a payload to every row of every lifecycle dataset, for an answer that the declaration plus the role already give once.

The design chosen is still the simpler one; only the stated reason needs fixing.

**N2. Simpler Task 3 gate.** `canSet` already means "has `writes`" on a query. `isReadonly` (`apps/grid/src/engine.ts:158-159`) marks every query column without `writes` as readonly, and `fieldOf` serves that (`:185`). So Task 3 can simply drop `!model.query` at `apps/grid/src/ui/App.tsx:487` and `:734` and let `draggable`/`canSet` decide. No new predicate is needed. B1 still needs its `pressedOnly`-through-`writes` fix.

**N3. File lists and anchors.**
- `apps/grid/src/board/Board.tsx` is missing from Task 2's Files. It is the only caller of `useBoardDrag` (`apps/grid/src/board/Board.tsx:73`), so it must pass the model or transitions and the card state. It also computes `manual` (`:71`), which Task 3 needs.
- Some anchors are stale: `useBoardDrag.ts` has `collide` at :138, `step` at :166 and `land` at :230 (the file is 276 lines; the plan says :236/:264/:228). `ColumnLook` is at `Column.tsx:12-17`, not :8-12. The `Model` lifecycle fields are at `types.ts:105-106` and `:113-116`, not :117-118.
- Task 2 Step 1 tests "a lifecycle with buttons still does not drag", which lives in `apps/grid/src/ui/offered.test.tsx:107`. That file is listed in row 3 but not in Task 2's Files.

**N4.** Task 1 Step 1 says "the theatre fixture's lifecycle". `packages/engine/test/lifecycle.test.ts` uses its own invented `ticket` fixture (`:32-38`), and engine tests should not import theatre. Use `ticket`, and add an administrator-only transition to it so the "absent for an editor" case can be tested.

**N5.** Task 3 Step 3 says "the '+' preset mapped through `writes.field` into `createThrough` (App.tsx:471)". But a board lane's "+" goes through `setQuick` and then `QuickCreate` (`apps/grid/src/ui/App.tsx:734`, `:765-772`), not `createThrough`. Say which one is used. Either way the preset key must become the target field (`apps/grid/src/board/Board.tsx:83` presets `{ [column]: lane.value }` with the query's column name).

**N6.** Task 4 changes the single `onCreated` at `App.tsx:768`, which every `QuickCreate` in the workspace uses (for example the calendar's quick create), not just the board's "+". That is consistent with R3's "one undo like any create", but the test should name it.

## Premises checked
- `servedLifecycle` serves column/live/buttons and takes no actor → `packages/engine/src/app.ts:189-192`, called at `:377` → holds (Task 1 must add the `actor` parameter)
- `checkTransition` judges each PATCH by role; 409 on `expect`, 422 otherwise → `packages/engine/src/writes.ts:304-332` → holds
- `when` gates only buttons → `packages/engine/src/declare.ts:331-354`, `packages/engine/src/available.ts:35-51` → holds
- `/schema` lifecycle test → `packages/engine/test/lifecycle.test.ts:436-441` → holds
- "Owner gets no transitions; it cannot write" → `packages/theatre/src/datasets.ts:285-286`, `packages/engine/src/app.ts:87` → does not hold (S1)
- "The engine's query write path refuses anything else" → `packages/engine/src/writes.ts:71-75`, `apps/grid/src/api.ts:326-340` → does not hold (S3)
- `EngineSource.lifecycle` → `apps/grid/src/engine.ts:96` → holds
- `modelOf` lifecycle mapping → `apps/grid/src/engine.ts:239-241` → holds
- `boardNeed` lifecycle `drag:false` → `apps/grid/src/engine.ts:302-307`; test at `apps/grid/src/engine.test.ts:809-811` → holds
- `Model` lifecycle fields → `apps/grid/src/types.ts:105-106`, `:113-116` → holds (anchor off)
- `collide` / `step` / `land` in `useBoardDrag` → `apps/grid/src/board/useBoardDrag.ts:138`, `:166`, `:230` → holds (anchors off)
- `ColumnLook` → `apps/grid/src/board/Column.tsx:12-17` → holds (anchor off)
- `drop.ts` has no query or never-manual notion; a sorted within-column drop becomes a `place` → `apps/grid/src/board/drop.ts:42-61` → holds (the change is needed)
- `boardDrops` excludes queries → `apps/grid/src/ui/App.tsx:487` → holds
- "+" excludes queries → `apps/grid/src/ui/App.tsx:734` → holds
- `draggable` / `canSet` → `apps/grid/src/ui/App.tsx:798-801` → holds
- `createThrough` pushes history → `apps/grid/src/ui/App.tsx:471-479` → holds
- `onCreated` pushes only for `target`, so a dataset "+" has no undo → `apps/grid/src/ui/App.tsx:768-772`, `apps/grid/src/dashboard/QuickCreate.tsx:99-102` → holds
- `update` sends `expect` for a dataset → `apps/grid/src/api.ts:301-318` → holds
- `updateThrough` sends no `expect` today → `apps/grid/src/api.ts:326-340` → holds
- Store re-reads on `transition_lost` → `apps/grid/src/grid/store.ts:288-291` → holds
- `pressedOnly` → `apps/grid/src/grid/columns.ts:281` → holds (reads its own model only; see B1)
- Hints follow `boardDrops` → `apps/grid/src/ui/hints.ts:11-13` → holds
- `board-drag-refused` → `e2e/step-3f.spec.ts:641-777` → holds (S2 on what the rewrite loses)
- "Bord toewijzingen" is a declared board on a lifecycle without buttons, so it drags today → `packages/theatre/src/datasets.ts:227`, `:279-288`; `packages/theatre/src/seed.ts:467` → holds
- Studio "Op tafel" `status` writes `taak.status`, which has no lifecycle → `packages/studio/src/queries.ts:58-76` → holds
- Test files exist (`offered.test.tsx`, `Board.test.tsx`, `api.test.ts`, `App.test.tsx`, `engine.test.ts`); grid test and gate commands → `apps/grid/package.json:8`, root `package.json:18` → holds
- Step 3f B9 is the rule being replaced → `specs/step-3f/spec.md:19` → holds
- `docs/SPEC.md` carries the 2026-11-06 board rulings → `docs/SPEC.md:83` (Work model, *Editable skins*) → holds
