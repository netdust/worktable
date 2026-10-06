# Review: activities without a time (datum)

Branch `feature/step-0e-datum`, range 409e081..2495bd8, plus Laika `feature/worktable-export` 4eb2726..5e828b4. Each task had its own review. One fresh reviewer on the most capable model read the whole branch on 2026-10-06. Its verdict: **ready after the fix wave**. One fix wave, one scoped re-review: all six fix-wave findings addressed, one new residual (B1).

## Fix wave (5056810, 8fc0851, 2495bd8; Laika 5e828b4)
1. **"+ New" trap (Important).** Stefan ruled: start wins on create. On a create with `start_at`, the theatre writer takes `datum` from it. On an update a disagreeing `datum` is still refused in Dutch. Addressed.
2. **Half-typed time saved as "no time" (Stefan: fix now).** The picker reverts a half-typed value to the stored one, using the browser's `validity.badInput`. Addressed.
3. **Dutch "Datum is verplicht."** when neither datum nor start is given, and for `PATCH datum: null`. Addressed.
4. **The PATCH status is asserted** in `writer.test.ts`. Addressed.
5. **spec-diff lines** for start-wins-on-create and datum-or-start required. Addressed.
6. **Laika plan text** no longer describes the T05:00 rule. Addressed.

## Engine change in the fix wave
`packages/engine/src/writes.ts` checks required-column nulls after the writer, not before, so a domain writer can answer a missing value in its own words. The re-reviewer confirmed the check after the writer runs on every path that stores values (REST create, update, import), no writer (theatre, fiche, engine fixtures) breaks on a null it never saw, and `bun run check` passes. Side effect: a null on an option column now gets the Dutch option message, not the English "may not be null".

## Residual, not fixed in this branch
- **B1 (Important, safe direction): clearing Start segment by segment keeps the stored time.** After the first segment, React fires no more change events, so the draft stays on the stored value. The input looks empty, and Enter keeps the time. No time is lost or invented. Clearing still works through select-all, `fill`, or the Delete key on the cell. Fixing it means reading the input's own value at commit. Ruling: one fix wave per branch; it is left for Stefan to schedule, and the shakeout's edit session checks it.
- **Firefox and Safari not verified.** The revert relies on `badInput`; only Chromium is installed and the e2e runs Chromium only. A browser that reports a half-typed value as `''` without `badInput` would bring M1 back for optional columns.

## Minor, deferred
1. After a half-typed revert, the input still shows the partly cleared segments, while the commit uses the stored value.
2. On a required date, clearing one segment snaps back to the stored day, which may interrupt retyping datum segment by segment (browser-dependent, not reproduced).
3. A dead branch in the `Date.tsx` mount; import order in `newRow.test.ts`.
4. `docs/SPEC.md` Day line: goes into the final spec commit (spec-diff.md).
5. `voorstellingen.start` may now be null: added to the parked U6 ticket.

## Rulings made by the executor
- Task 4 (operator commands, no code) ran by the controller: backups first, read-only export, import, seed. Cost if wrong: none, every file is backed up.
- Engine and grid on 4310/5173 against `~/laika-export/engine.db` stayed up during Tasks 1–3; the gate's e2e uses 4311/5174.
- Deviation: commit b818dff swept in `specs/step-0e/parity.md` before Stefan had read it; its content equals the rerun output byte for byte. Reported.

## Gate
`bun run gate` after the fix wave: bun 770, grid 574, Playwright 39, all green.

# Review: the shakeout fix pass

Range ec7743e..81b7a4b, reviewed on 2026-10-06 by one fresh reviewer on the most capable model. Its verdict: **approve with one Important fix**. The fix pass is 2 commits after 81b7a4b. The gate is green: bun 809, grid 581, Playwright 44.

## Fixed
1. **(Important) Undo in the Dagplanning view still lost the day.** The query had no `datum` column, so the undo entry could not capture it. Dagplanning now carries `datum`, written through to the activity. The e2e test `undo-time-on-untimed-in-dagplanning` was RED, then GREEN, with a reload.
2. **(Important, upgraded from Minor) The edit-session script could write row values inside the repository.** Its `--out` defaulted to the database's directory. It now defaults to `~/laika-export/shakeout` and refuses any `--out` or `--outbox` inside the checkout. A test for this was RED against the old script, then GREEN.

## For Stefan
- **Undo can overwrite another planner's change.** The before-image is taken from this tab's last copy of the row. If another planner changed a column since then, and the edit's reply carries that change, undo writes the old value back. Example: B confirms an activity, A edits its description, A presses Ctrl+Z, and B's confirmation is reverted. Before this branch, undo only touched the edited field. To fix it, the engine's write answer would report which columns the writer changed. It already computes this diff for Revision (`packages/engine/src/writes.ts:372`). That changes the engine's REST contract.

## Minor, deferred
3. `api.ts` updateThrough silently drops a query column that writes to a different record. No query does that today.
4. If the re-read after a query write fails, the fallback row loses the derived columns, and that undo becomes single-column again.
5. The real `editable` predicate in `hooks.ts` has no unit test. Only e2e covers it.
6. e2e `undo-person-to-name` checks only that `persoon_id` is a number, not that it is the original person, and it assumes the first row has a person.
7. e2e `undo-day-line-move` pins only the PATCH body. The old store reached the same final state.
8. The step 1 and step 3 carry-over notes are not referenced from `docs/SPEC.md`.

## Executor's rulings
- Query columns that write to another record are dropped from a multi-column undo. Today every `writes` goes through `activiteit_id`. Cost if wrong: one column not restored on a future query.
- The step 1 and step 3 notes live in `specs/step-N/carry-over.md`, because neither step has a spec yet. They follow the step 0 precedent.
