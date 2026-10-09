# Plan review: step-2, fourth review (the 87b22ce..6f5c767 diff only)
Reviewed-plan: 5bb5ba014b6c608619c3c367b7375c317851818a specs/step-2/plan.md
Verdict: ready with fixes

All third-review findings are addressed in substance: B1, S1, S2 and the four Notes. The diff breaks nothing elsewhere in the plan. One gap is left. The text says what happens when an undo is skipped, but not what happens to the step on the stack afterwards. Because of how `step()` and `execute()` behave today, the plan's tests as written would pass even if the undo stack jams for good.

## Blocking
None.

## Should fix

**S1. A skipped undo or redo has no stated effect on the stack. With today's `step()` it jams the undo stack.**
- **Plan:** Task 4, Files, the op-stack bullet (plan.md:270), the words "Three cases are skipped … and write nothing". Also the Step 1 tests at plan.md:286.
- **Source:**
  - `execute()` stops at the first op that does not land and returns only the prefix before it (`apps/grid/src/matrix/store.ts:285-289`).
  - `step()` then leaves the remainder of the step on the stack it came from (`store.ts:360-368`).
- **What goes wrong:** if the skip is implemented as an op that did not land, which is the natural fit, three things follow:
  - The cleared-cell op stays on top of the undo stack. Every later Ctrl+Z shows the notice again, so nothing older on the stack can ever be undone.
  - The same applies when the cleared cell is part of a paste or fill. Ops are undone in reverse (`:357`), so the ops that come after the cleared one in that reversed order are never undone either.
  - The redo of an undone create stays stuck on top of the redo stack in the same way. That is milder, because a new edit clears the redo stack (`:335`, `:344`).
- **Why the tests miss it:** "Ctrl+Z after clearing a cell shows the notice and writes nothing" and the paste-empty test both pass with a jammed stack.
- **Smallest change:**
  - Add one sentence: "A skipped op is dropped from its step. The step's other ops still undo or redo through batch undo, and the step moves to the other stack minus the skipped op."
  - Add one test: "clear a lifecycle cell after an earlier `u`→`b`; Ctrl+Z shows the notice; a second Ctrl+Z undoes the `u`→`b`."
  - Optionally add a mixed case: "paste `b` and empty over two `u` cells; Ctrl+Z restores the `b` cell to `u` and skips the cleared one."

## Note

- **The store cannot tell a lifecycle join from any other yet.**
  - The new rule hinges on "a join whose cell field is the lifecycle column". `MatrixJoin` has no field for that (`apps/grid/src/types.ts:179-191`). It is built at `apps/grid/src/engine.ts:181` from the schema.
  - Task 4 names only `EngineSource` reading `lifecycle.column`. The flag, or the column, still has to reach `MatrixJoin`, so `types.ts` and `engine.ts:181` belong in Task 4's files.
  - The implementer will hit this through the plan's own lifecycle-join tests.
- **The "kept as they are" store tests still need their fake changed.**
  - `store.test.ts:46-52` types its fake on `MatrixApi['create']` and `MatrixApi['update']` and resolves them to a `Row`.
  - Once those return `{ row, batch }`, the fake's return value has to change, and `undoBatch` needs adding.
  - The assertions at 234, 254, 274 and 316 stay as they are, so "kept" is right for the behaviour, though not literally for the file.
- **The notice text does not fit the redo case.** The redo of an undone create shows "Verwijderen kan niet ongedaan gemaakt worden" ("deleting cannot be undone"), but the user pressed redo on a create. It is the same Out-list ruling, so this is a wording choice for the owner, not a defect.
- **The redo needs the undo's own batch.** A redo of a batch undo has to undo the batch that the undo returned (`api.ts:181-184` answers it; `UNDOABLE` includes `'undo'`, `writes.ts:454`). The next undo then needs the redo's batch. So the op has to carry its current batch and replace it on each step. The `u`, `b`, Ctrl+Z, Ctrl+Shift+Z test drives this.
- **`umask 077` in `edit-session.ts`.**
  - The script is TypeScript run by Bun, so `umask 077` is a shell idiom here. The file already writes files with `writeFileSync(file, text, { mode: 0o600 })` (`scripts/shakeout/edit-session.ts:761`), and the same call fits the secret file.
  - Caveat: `mode` applies only when the file is created. A leftover file with looser permissions would keep them, and Task 9a would refuse it. Either `chmodSync`, which the script already imports (`:2`), or deleting the file first closes this.

## Premises checked
- Fill-down and paste write `join.cell_field` through the shared `created()`/`changed()` → `store.ts:146, 154, 394-407` → holds. On a lifecycle join, the plan now routes these ops through batch undo.
- Each op in a fill or paste is its own `api.create`/`api.update` call, so each has its own batch, and "per op in reverse" is possible → `store.ts:219, 229, 329-337, 357` → holds
- An empty pasted word clears the cell, and so does a fill from an empty first row → `store.ts:375, 396-397` → holds. The plan now covers both with the skip.
- `execute()` stops at the first op that does not land, and `step()` leaves the rest on the stack it came from → `store.ts:283-292, 352-370` → holds. This is S1.
- `MatrixApi` has create, update and remove, all returning `Row` → `store.ts:7-11` → holds, and the plan changes it
- The adapter strips `Saved.batch`, and its comment says so → `matrix/hooks.ts:6-11` → holds, and the plan removes both
- `create` and `update` return `Saved { row, batch }`, including through a query → `api.ts:142-145, 160-179` → holds
- `undoBatch` returns the undo's own batch → `api.ts:181-184` → holds
- Undoing a create's batch deletes the record, so a redo would undo a batch holding a delete, which is refused → `writes.ts:518-521, 473` → holds. The plan skips that redo.
- Task 7's `runAction` as the fifth `MatrixApi` call (create, update, remove, undoBatch, runAction) → holds
- `/schema` `lifecycle: { column }` now has an engine test (plan.md:203) → matches the Interfaces line at plan.md:186 → holds
- An empty owner means no token and a null link → plan.md:182 (`mail?: (link: string | null)`), plan.md:229 and the new test at plan.md:243 agree → holds
- The secret file must not be readable by group or others → plan.md:50 refuses such a file; plan.md:468 now writes it 0600 → holds, with the caveat above

Earlier reviews are in git: the first at fbc0af1, the second at 87b22ce, the third at 6f5c767; the advisor's fidelity review at `specs/step-2/plan-review-advisor.md`.
