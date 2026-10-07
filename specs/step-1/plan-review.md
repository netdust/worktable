# Plan review: step 1, Speelreeks + Sjabloon + Rol (round 1)
Reviewed-plan: 3fc102cc7c1b60427dff8e1776336d58c6feae3b
Verdict: not ready (2 Blocking, 12 Should fix). Every finding was applied to the plan, giving blob 099a85b8…, with the review run again below.

## Blocking
- **B1.** `kleur` and `items` are already in `packages/engine` tests: 11 hits for `kleur` across fixture.ts, rows.test.ts, filter.test.ts and import.test.ts, and the `Items` label in refusal-domain.ts. With the new theatre columns, the vocabulary check turns red. **Applied:** Task 1 renames them to `colour` and `Entries`.
- **B2.** "A create = all `old` null" is false. An edit that fills an empty cell also records old null, so undo would delete the record (for example, a time added to an untimed activity on the same day). **Applied:** `create` writes a marker revision (field `id`), and there is a test for undoing a fill.

## Should fix (all applied)
- **S1.** Task 5's gate would go red on the step-0e undo flows. The e2e edit moves into Task 5.
- **S2.** `revision` leaks into `row.fields` through `toRow`, and `update`/`create`/`updateThrough` never hand back the batch. Now: `toRow` destructures it, and the API returns `{ row, batch }`.
- **S3.** The undo reply had no rows. Now the grid re-reads the affected rows of its own model.
- **S4.** The batch table's key was undecided, and engine tables have integer ids. Now an integer `id` plus a unique text `key`.
- **S5.** It was unclear who writes the batch row. Now the transaction owner writes it once. A no-op PATCH answers `batch_id: null`.
- **S6.** The import's `'all'` scope must not be reused. Actions now use `visibleSource`, `scopeOf` and `writableOf` per create.
- **S7.** Threat 6 had no test. Task 4 now adds one: a Toewijzing makes the apply's undo answer 409 `in_use`.
- **S8.** An owner gets 404, not 403, on datasets without `owners`. The tests now say 404 through REST and 403 through a direct writer call.
- **S9.** The unknown `speelreeks_id` refusal had no test. Task 1 now adds a Dutch `checkLive` and its test.
- **S10.** The matrix keeps its own client-side undo. This is a ruling for Stefan.
- **S11.** The apply's undo entry lives on the Speelreeksen view's store. The e2e presses Ctrl+Z there.
- **S12.** "404 or 403" is now 404 `unknown_source`.

## Notes (applied where they change the plan)
- **31-day boundary:** a test for 31 days accepted and 32 refused.
- **Redo after undoing an apply:** answers 422 `not_undoable`, and the grid drops the redo entry.
- **Create-only writer:** undo of a create there answers 405 `read_only`.
- **Undo order:** reverse revision order.
- **Internals:** `undoBatch` lives in `writes.ts`, beside the internals it needs.
- **Task 5 Files:** `Grid.tsx` added.
- **Review Focus 4:** drops `offset`.
- **Global Constraints:** the export-terms check is now Task 0.
- **"Rollen" and "Sjablonen" views:** marked invented, approval pending. The extra invented venue is dropped.
- **R1:** an editor's POST test added.
- **Task 7:** reports the R4 finding and the `docs/SPEC.md` diff.
- **Review Focus 6:** names Dagplanning.
- **Simplest design:** now compares against the grid posting the 28 creates one by one.

# Plan review: step 1 (round 2)
Reviewed-plan: b90e6de4c3d0fe704c39aa0792bd718bbad4eb9c
Verdict: not ready (1 Blocking, 6 Should fix). Every finding was applied, and the review runs again.

## Blocking
- **K1.** An undo entry in a view's store is lost when that view reloads or the planner navigates away (`hooks.ts:29-35`, `App.tsx:182-203`). So "one undo removes them all" could not pass. **Applied:** there is now one undo history per browser tab, of batch ids, held at app level (`ui/history.ts`), with a test that the entry survives a reload and a navigation. The spec's R7.6 and the proposed `docs/SPEC.md` lines say so.

## Should fix (all applied)
- **S1.** The Review Focus pointers to Test map rows were off by one after adding Task 0. They are renumbered.
- **S2.** The create marker breaks `writes.test.ts` (exact create revisions and the 201 body), `theatre/test/parity.test.ts` (an exact 201) and the shakeout `revisionProblems`. All are now listed in Task 2.
- **S3.** `migrate.test.ts` (the `_migrations` list) and `validate.test.ts` (`ENGINE_TABLES`) are now listed in Task 2.
- **S4.** `legacy-post-id.test.ts` pins six datasets. It is narrowed to the six imported ones.
- **S5.** The matrix callers of `api.create`/`api.update` (`matrix/store.ts` and `hooks.ts`) now unwrap `.row`.
- **S6.** The export-terms check is now spec R9 (Stefan: "Add a gate check that fails on any term from the export list, against staged diffs"), with a proposed `docs/SPEC.md` line. The constraint now says it flags terms when run before a commit.
- **S7.** The edit session reports a dataset with no rows as "skipped: no rows", and its undo uses the batch route.

## Notes applied
- The batch `key` is made unique with `checks: ['UNIQUE (key)']`.
- After an undo, the view re-reads the entry's own row id.
- A created record that is already gone counts as `changed_since` on `deleted_at`.
- Task 4 names the label "Sjabloon toepassen".
- The seed sentence is fixed.
- There is a refusal test for the `kleur` format.

# Plan review: step 1 (round 3)
Reviewed-plan: b938880127b2cf453e63a54dc1829029db57ef75
Verdict: **ready**. Nothing is Blocking. The four Should-fix edits to Task 5 are applied, with no re-review, as the reviewer called the plan ready.

## Should fix (applied)
- **S-A.** `Grid.test.tsx` asserts the inverse-write undo at :262, :664 and :683. It is now in Task 5's tests and expects `POST /batches/<id>/undo`.
- **S-B.** `store.undo` and `store.redo` delegate to the history, and `canUndo` and `canRedo` read its length, so the keyboard effect and the Toast don't change. After an action, a notice offers undo.
- **S-C.** There is one entry shape, `{ batch: Promise<string | null>; model; id }`, pushed at paint. It is dropped on a refusal, on a null batch and on `unknown_record`. A re-read happens only when the entry's model is the open view's, through a new `replace(row)` that also updates `confirmed`. Otherwise the view reloads through a reload counter.
- **S-D.** `ui/history.ts` and `history.test.ts` are created, `App.test.tsx` tests the reload and the navigation, and Test map row 6 lists them.

## Notes (applied)
- The header now says R1–R9.
- The e2e clicks a cell before pressing Ctrl+Z.
- Reloading after an action uses a reload counter.
- An entry is dropped on `unknown_record`.
- The step-0e undo flows assert restored cells instead of PATCH bodies.
- Task 7's script change gets a code-only commit.
