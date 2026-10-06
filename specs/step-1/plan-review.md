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
