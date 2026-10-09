# Plan review: step-2, third review (the 87b22ce diff only)
Reviewed-plan: 10612c92936be3b37e0bd1481148ffccc1cf92fe specs/step-2/plan.md
Verdict: ready with fixes

Five of the six findings are resolved: B1, S2, S3 and S4, plus every Note except one. The exception is S1, the matrix undo. The one-stack design is the right call, and the delete ruling matches the spec's Out list ("The assignee tag list and undo of a delete", spec.md:116). But the new text exempts fill-down and paste from that rule, and on theatre those two write the lifecycle column. It also leaves out redo of an undone create and the adapter that strips the batch.

## Blocking

**B1. "Note edits, fill-down and paste keep today's path" puts back the re-invite that threat 7 exists to prevent.**
- **Plan:** Task 4, Files, the matrix op-stack bullet (plan.md:268).
- **Source:**
  - On theatre the matrix cell field *is* the lifecycle column. `fillDown` and `paste` write `join.cell_field` (`matrix/store.ts:146`, `:153`).
  - A pasted empty word clears a cell ("empty clears", `store.ts:369-371`), and so does `fillDown` from an empty first row (`store.ts:393-396`).
  - Today's path undoes a removal by sending `api.create` again (`store.ts:218-219`, through `step()` at `:353-370`).
- **What goes wrong:** paste empty over an `uitgenodigd` cell, then press Ctrl+Z. The engine receives a `POST /rows` create into a hooked state, so the hook fires and the invite mail goes out again. That is exactly what the plan's own sentence rules out for a single delete. A pasted or filled state change has a second problem: undoing it by sending the inverse PATCH is a write-mode transition, so b→u comes back as 422. That is the bug S1 was about.
- **Smallest change:** limit the exemption to non-lifecycle columns. Reword it as: "Note edits, and fill-down and paste on a join whose cell field is not the lifecycle column, keep today's path. On a lifecycle join, each op that lands in a fill or paste keeps its own batch, and the step undoes through `undoBatch` per op in reverse; cleared cells are skipped with the notice." Then add one test: "paste empty over a lifecycle cell, Ctrl+Z: the notice shows, nothing is written, no mail".

## Should fix

**S1. The matrix's API strips the batch, and no task changes that.**
- **Plan:** Task 4 says the op "keeps its write's batch (`Saved.batch`, api.ts:143-145)".
- **Source:**
  - `api.ts:142-145` does return `Saved.batch`.
  - But the matrix never sees it. The adapter in `apps/grid/src/matrix/hooks.ts:7-11` maps `create` and `update` to `saved.row`.
  - `MatrixApi` (`matrix/store.ts:7-11`) has `create`, `update` and `remove`, all returning `Row`, and no `undoBatch`.
  - `hooks.ts:6` still says "it needs the rows a write returns, not its batch".
- **Change:**
  - Add `matrix/hooks.ts` and the `MatrixApi` change to Task 4's files: `create` and `update` return `{ row, batch }`, plus an `undoBatch` call, and the stale comment goes.
  - Task 7's "a fourth `MatrixApi` call, `runAction`" then becomes the fifth.

**S2. Redo of an undone lifecycle create is not decided.**
- **Plan:** Task 4 says an op that changed the lifecycle column is undone and redone "through `undoBatch(batch)`".
- **Source:** undoing a create's batch deletes the record (`writes.ts:518-521`, `planned.created`). Its undo batch therefore holds a `deleted_at` revision, and undoing that batch is refused: "a batch holding a delete cannot be undone" (`writes.ts:473`).
- **What goes wrong:** Ctrl+Shift+Z after undoing an empty→`u` create is either a 422, or, if redo sends the create again, a create into a hooked state that re-invites. The plan's own test sequence `u`, `b`, Ctrl+Z, Ctrl+Shift+Z stops just short of this case.
- **Change:** one sentence and one test. A redo that would re-create a lifecycle record is skipped with the same notice. This is the same ruling as the delete, and the same Out-list item.

## Note

- **The store-test rewrite list.**
  - `store.test.ts:254` ("undoes a create, a Delete, then the create again…") also undoes a Delete, and it is not in the list "234, 274, 316".
  - Non-lifecycle joins keep re-create undo, so those four tests stay valid as they are. Adding lifecycle variants is safer than rewriting them, which would leave the non-lifecycle behaviour untested.
- **`/schema` `lifecycle: { column }` (Task 2) has no engine test.**
  - The premise holds: `app.ts:178-205` builds each source's object, so adding one key is trivial.
  - No Task 2 test asserts it, and the grid tests will mock it. One line in `lifecycle.test.ts` would pin it.
- **"A record with an empty owner column mints no token"** (Task 3 Interfaces) has no engine-side test. Task 10 covers only the theatre half (no email, no token request).
- **`edit-session.ts` needs a 0600 file, not just the flag.** Task 10 should note that it writes the file under `umask 077` or with `chmod 600`, since Task 9a refuses a group- or world-readable file. Otherwise shakeout fails on its first run.
- **No other breakage found.** Task 9b's theatre `owner_visible` marks resolve the earlier B1 (`migrate.ts:92`). The S3 headers, the S4 matrix 409, the Task 11 snapshot replacement, Task 12's RED wording, the Task 5 hook test, and the Task 0 and Task 5 line refs are all fine.

## Premises checked

- Op stack, one undo step per op group, redo by `step()` → `matrix/store.ts:328-370` → holds
- `api.update` returns `Saved.batch` → `api.ts:142-145` → holds in `api.ts`, but `matrix/hooks.ts:7-11` strips it before the store (S1)
- `undoBatch` returns the undo's own batch, which a redo undoes → `api.ts:181-184`; `UNDOABLE` includes `'undo'` (`writes.ts:454`) → holds for updates
- A redo of an undone create through `undoBatch` → `writes.ts:473` refuses a batch holding a delete → does not hold (S2)
- Fill-down and paste on today's path are safe on a lifecycle join → `store.ts:146, 153, 218-219, 369-371` write the cell field and undo a clear by re-create → does not hold (B1)
- "Undo of a delete" is out of scope → `spec.md:116` → holds
- `changed()` can send `expect` only when the cell field changes → `store.ts:151-157` builds the field diff → holds; the note body stays `{ notitie }` (`e2e/react-aria.spec.ts:640`)
- `/schema` can serve `lifecycle.column` → `app.ts:178-205` → holds (it adds one key)
- `migrate` validates the domain, so 9b's theatre marks are needed → `migrate.ts:92` → holds
- `edit-session.ts:111-125` spawns `serve.ts` with no secret flag → `scripts/shakeout/edit-session.ts:111-125` → holds

Earlier reviews are in git: the first at fbc0af1, the second at 87b22ce; the advisor's fidelity review at `specs/step-2/plan-review-advisor.md`.
