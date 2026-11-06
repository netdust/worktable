# Plan review — editable-board (second review)
Reviewed-plan: 054e575015bece83845f813d6423bb5fdd21e2c2 specs/editable-board/plan.md
Verdict: not ready. There is one Blocking finding, and it is a one-line fix. With that and the four Should-fix items, the plan is ready.

Note: the working-tree `specs/editable-board/plan-review.md` hashes to ce18536…, not the 59885a9… you gave. Its own `Reviewed-plan` line is 59885a9…, which is the plan sha it reviewed, so that is probably what you meant. I reviewed the plan at 054e575 against that file.

## First-review findings, status

- **B1 (lifecycle through `writes`):** fixed.
  - Global Constraints line 21 states the rule.
  - Task 2 Interfaces add `lifecycleOf(model, column, models)`, and `pressedOnly` resolves through `writes`.
  - Task 3 Step 1 adds the `persoon_dag.state` test, and a Review Focus line points at row 4.
- **S1 (owners served):** fixed for owner users. The link-account half introduced a false premise; see Blocking P1.
- **S2 (stale-drop e2e):** fixed in Task 2 Step 3, and Review Focus points at row 2. The rewrite misses its CHECKS.md registration; see Should fix SF2.
- **S3 (threat 3 wording):** fixed. Threat 3 now names `writableOf` 405 and the ordinary dataset PATCH.
- **N1 (rejection reason):** fixed. The Simplest design paragraph now gives the `declaresMarks` and payload reasons.
- **N2 (simpler Task 3 gate):** adopted. Task 3 Files drop `!model.query` and rely on `isReadonly`.
- **N3 (files and anchors):** fixed. `Board.tsx` and `offered.test.tsx` are listed, and every anchor now matches the source (checked below).
- **N4 (fixture):** fixed. The plan uses the `ticket` fixture and adds an administrator-only transition.
- **N5 (QuickCreate preset):** half fixed. It is named `QuickCreate` and keyed by `writes.field`, but the QuickCreate model is the query's `creates` dataset, not the `writes` target; see Should fix SF1.
- **N6 (single `onCreated`):** fixed. Task 4 Step 1 names the calendar's quick create.

## Blocking

**P1. A link account never reads `/schema`, so the "no `transitions` key" test and branch cannot exist.**
- **Plan:**
  - Task 1 Step 1: "a link account gets no `transitions` key".
  - Task 1 Interfaces: "absent for an actor of kind `link`".
  - Threat 2: "no `transitions` key to an actor of kind `link` … a test reads `/schema` as administrator, editor, owner and link".
  - Test map row 1 and Review Focus line 2 say the same.
- **Source:**
  - `packages/engine/src/record-link.ts:64-81`: `OPEN_TO_LINKS` has no `GET /api/schema`, and `confineLinkActor` sends every other route a 403.
  - `packages/engine/src/auth.ts:300` installs it on `/*`.
  - `packages/engine/test/record-link.test.ts:269-278` already asserts "403 on /schema …".
- **Effect:** the link case of the test cannot be written as stated. A `kind === 'link'` branch in `servedLifecycle` would be dead code. The first review's S1 suggested that branch, and it was wrong on this point.
- **Smallest change:**
  - Task 1 serves every actor that reads `/schema` its role-filtered transitions, with no link branch.
  - Threat 2's link clause becomes: "a link account never reads `/schema` (403, `confineLinkActor`; held by `record-link.test.ts:269-278`)".
  - Remove "link" from the Task 1 Step 1 test list, the Interfaces line, row 1's denial text and Review Focus line 2. The ticket fixture also has no `record_link`, so a link session would need fixture work the plan does not plan.

## Should fix

**SF1. "+" on a query board without `creates`, or whose `creates` is not the `writes` target, is offered and can only fail.**
- **Plan:**
  - Task 3 Files: "+" at `:734` drops `!model.query`.
  - Task 3 Step 1: "+" "goes through `QuickCreate` … with the lane value under the target field".
- **Source:**
  - `QuickCreate`'s model is `target ?? model` (`apps/grid/src/ui/App.tsx:765-766`), with `target = models[model.creates]` (`:454`).
  - `persoon_dag` declares no `creates` (`packages/theatre/src/queries.ts:123-131`), but its `state` writes `toewijzing.state` (`:146-149`).
  - `writable` is true for any query with a `writes` column (`packages/engine/src/app.ts:57-60`, `apps/grid/src/ui/App.tsx:424`).
- **What goes wrong:** after Task 3, a `persoon_dag` board grouped by `state` shows a "+" that POSTs to `/rows/persoon_dag`, and the engine answers 405 `read_only` (`writes.ts:71-75`).
- **Smallest change:** in Task 3, offer "+" on a query board only when `model.creates === field.writes.dataset`, with the preset `{ [writes.field]: lane.value }`. Add one test: a query with `writes` and no `creates` offers drag but no "+". Studio "Op tafel" (`creates: taak`, `status` writes `taak.status`, `packages/studio/src/queries.ts:57-76`) still gets its "+".

**SF2. Renaming `board-drag-refused` breaks `bun run check` unless CHECKS.md moves with it.**
- **Plan:** Task 2 Step 3 rewrites it, and Test map row 2 names the flows `board-drag-not-offered` and `board-drop-stale`.
- **Source:**
  - `specs/CHECKS.md:152` registers `` `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag-refused @e2e"` `` and describes a 422 refusal.
  - `scripts/check-checks.ts` (in `bun run check`, root `package.json:14`) fails when a registered grep matches no test.
- **What goes wrong:** if the title changes, Task 2 Step 4's `bun run check` goes red. If it does not change, the CHECKS.md row describes behaviour that no longer exists.
- **Smallest change:**
  - Add `specs/CHECKS.md` (row :152) to Task 2 Files: new grep, and a description for not offered plus the stale 409.
  - Say whether the test title changes.
  - Give row 2's e2e its runnable command, e.g. `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag"`. Row 2 lists the e2e file today, but only the vitest command.

**SF3. Filtering lanes in `collide` alone makes a pointer drop on an unreachable lane land in the last reachable lane crossed.**
- **Plan:** Task 2 Step 3: "filter `droppableContainers` in `collide` … return `kind: 'none'` in `land` for an unreachable lane".
- **Source:** `apps/grid/src/board/useBoardDrag.ts:149-150`. When `pointerWithin` finds no lane it does `if (!hit) return last.current` and leaves `live.current` at the previous aim. `end` (`:222-228`) then lands at `live.current`.
- **What goes wrong:** with unreachable lanes filtered out, the pointer resting on one keeps the previous target, which is the own lane or any reachable lane passed on the way. `land` never sees the unreachable lane, so the `kind: 'none'` there never fires.
- **Test gap:** a glide from Bevestigd sideways past Geannuleerd (reachable) to a further unreachable lane would write `geannuleerd`. The planned test ("a pointer drop on an unreachable lane writes nothing") passes trivially on adjacent lanes.
- **Smallest change:**
  - In `collide`, a pointer over an unreachable lane re-aims to the card's own place: `aim(from)`, `last.current = []`.
  - Add a Task 2 Step 1 test that crosses a reachable lane before releasing on an unreachable one, and expects no request.

**SF4. The `pressedOnly`-through-`writes` change has no stated signature, and it also changes grid cells.**
- **Plan:** Task 2 Files: "`pressedOnly` :281 resolves through `writes`". Global Constraints: "No … grid edits".
- **Source:**
  - `pressedOnly(model, key)` is called by `columnsFor` (`apps/grid/src/grid/columns.ts:287`, which has a `models` param defaulting to `{}`).
  - It is also called by the module-level `canSet(model, column)` (`apps/grid/src/ui/App.tsx:801`), which has no `models` in scope. So `canSet` and `draggable` (`:798`) need a new parameter at both call sites.
  - Resolving through `writes` in `columnsFor` makes a query grid cell over a button lifecycle read-only, which is a grid behaviour change. No current query writes a button lifecycle (`writes` only at `theatre/queries.ts:149`, `:230` and `studio/queries.ts:75`, none on Studio's button datasets), so nothing visible moves today.
- **Related:** Task 3's `updateThrough` `expect` also reaches grid cell edits on `persoon_dag.state`.
- **Smallest change:**
  - Write the new signatures into Interfaces: `pressedOnly(model, key, models)` and `canSet(model, column, models)`.
  - State that both the grid-cell and `updateThrough` effects are intended (the spec's "on a lifecycle column only where a declared transition reaches" covers every skin), or narrow the change to `canSet`.

## Note

- **N-a.** `lifecycleOf` returns null when `models[writes.dataset]` is not served to the viewer, and `reachable(null, …)` then allows every lane. The engine still refuses the write (threat 1), so this is UX only. One line in Deferrals would settle it.
- **N-b.** The stale-drop rewrite works:
  - With `expect` sent, any API move makes `checkTransition` answer 409 before the reachability check (`packages/engine/src/writes.ts:323-325`).
  - The store re-reads on `transition_lost` in the same catch as the 422 (`apps/grid/src/grid/store.ts:280-291`), so the manual-board "one ⌘Z undoes the edit before" assertion carries over.
  - The existing keyboard path for `e2e h voorlopig` (Voorlopig → Uitgenodigd → Bevestigd) stays reachable (`packages/theatre/src/datasets.ts:282-284`).
- **N-c.** The "not offered" keyboard assertion needs a new expected announcement. From Bevestigd, → skips Geweigerd, because only Voorlopig and Geannuleerd are reachable (`datasets.ts:282`, `:288`). The rewrite should assert that skip, not just "no request".

## Premises checked

- Link account reads `/schema` → `packages/engine/src/record-link.ts:64-81`, `auth.ts:300`, `test/record-link.test.ts:269-278` → **does not hold** (P1)
- Owner user reads `ticket` in `/schema` and may make b→c → `access.ts:66-68` (`owners` declared, `lifecycle.test.ts:65`), `lifecycle.test.ts:36`, `:253-254` → holds
- `/schema` handler has the actor for `servedLifecycle` → `packages/engine/src/app.ts:351`, `servedLifecycle` `:189-192`, call `:377` → holds
- `checkTransition` 409 before 422, role-checked → `packages/engine/src/writes.ts:304-332` → holds
- Link never writes a state → `packages/engine/src/validate.ts:298` (refuses `owner_writable` on the lifecycle column), `app.ts:87-89` → holds
- `isReadonly` makes `canSet` refuse a query column without `writes` → `apps/grid/src/engine.ts:158-159`, `fieldOf` `:185`, `canSet` `App.tsx:801` → holds
- Field carries `writes { dataset, field, key }` for `lifecycleOf` → `apps/grid/src/types.ts:39`, `engine.ts:186` → holds
- Target `Model.lifecycle` / `lifecycle_buttons` available via `models[writes.dataset]` → `apps/grid/src/engine.ts:239-241` → holds (when the target is served; N-a)
- `persoon_dag.state` writes `toewijzing.state`, a lifecycle with no `button` transitions → `packages/theatre/src/queries.ts:146-149`, `datasets.ts:279-288`, `app.ts:186-187` → holds
- `pressedOnly` callers → `apps/grid/src/grid/columns.ts:281`, `:287`, `apps/grid/src/ui/App.tsx:801` → holds (SF4: signature unstated)
- `updateThrough` sends no `expect`, PATCHes the target directly → `apps/grid/src/api.ts:326-340` → holds
- `Board.tsx` `manual` :71, `useBoardDrag` call :73, "+" preset `{ [column]: lane.value }` :83 → `apps/grid/src/board/Board.tsx:71`, `:73`, `:83` → holds
- QuickCreate creates in `target ?? model`, target = `creates` → `apps/grid/src/ui/App.tsx:454`, `:765-772`, `dashboard/QuickCreate.tsx:96-99` → holds, but `persoon_dag` has no `creates` (SF1)
- Studio "Op tafel" `creates: taak`, `status` writes `taak.status` → `packages/studio/src/queries.ts:57-76` → holds
- Query writable when any column writes → `packages/engine/src/app.ts:57-60` → holds
- `drop.ts`: a within-column drop on a sorted board becomes a `place` that writes `position` → `apps/grid/src/board/drop.ts:42-61`, `:68-74` → holds (the never-manual change is needed)
- `collide` :138, `step` :166, `land` :230; no-hit falls back to `last.current` → `apps/grid/src/board/useBoardDrag.ts:138-160`, `:166-179`, `:230-245` → holds (SF3)
- `ColumnLook` → `apps/grid/src/board/Column.tsx:13-17` → holds
- `boardNeed` lifecycle `drag:false` → `apps/grid/src/engine.ts:302-307`; test `engine.test.ts:809-811` → holds
- `offered.test.tsx:107` button-lifecycle test → holds
- `hints.ts:11-13` follows `drags` → holds
- `onCreated` pushes only for `target` → `apps/grid/src/ui/App.tsx:768-772` → holds
- Store re-reads on `transition_lost` → `apps/grid/src/grid/store.ts:288-291` → holds
- `board-drag-refused` → `e2e/step-3f.spec.ts:641-777`; registered at `specs/CHECKS.md:152`, enforced by `scripts/check-checks.ts` in `bun run check` → holds (SF2)
- `ticket` fixture → `packages/engine/test/lifecycle.test.ts:32-38`, `:59-73`; `/schema` case `:436-441` → holds
- Spec R3 board row and 2026-11-06 rulings → `specs/work-model/spec.md:100`, `:120-123`; `docs/SPEC.md` Work model *Editable skins*, Board → holds

---

## First review (plan blob 59885a9)
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
