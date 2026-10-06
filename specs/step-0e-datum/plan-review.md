# Plan review — step-0e-datum (activities without a time)
Reviewed-plan: 2e249df60158d894c66057a76ee9eebfd88c61b0 specs/step-0e-datum/plan.md
Verdict: not ready

The design matches the approved spec lines, and the engine needs no change. Two things send the plan back. The real export has an untimed activity with an end time, and no task decides what happens to it. The plan's claim about how "+ New" fills the row is also wrong in source.

## Blocking
- **B1. An activity with an end but no start has no rule.**
  - The real export has one: legacy 24008, 09:00 end, no start. Laika's invented fixture has another ("Nachtrit").
  - Task 1's writer would refuse it, and the import rolls the whole file back on any refusal (`import.ts:221-224`).
  - Stefan rules.
- **B2. "+ New asks for `productie_id` and `datum`" is wrong.**
  - `newRow.ts:77` fills a required date column with the window's day itself.
  - Once `datum` is required, `needs` is `['productie_id']` and `datum` comes pre-filled, with no change to `newRow.ts`.
  - Reword it; Task 2 only tests it.

## Should fix
- **S1. `scripts/parity.ts` buckets weeks from `start_at` and counts `shifted` against it (:138, :149).** Both break for untimed rows; move them to `datum`.
- **S2. Seeded "Toewijzingen per activiteit" and "Optie of bevestigd" sort by `start_at`, with no group and no date shown.**
  - Untimed rows land above every other day with no day visible.
  - Sort by `plandag, start_at` and show `datum`.
- **S3. `queries.ts`: `voorstellingen.start` and `dagplanning.start_at` must become nullable.**
- **S4. No task applies the approved line to `specs/step-0e/spec.md`.**
- **S5. Review Focus 1, "the grid shows 05:00", has no grid or e2e test.**
- **S6. The e2e flow names no view or path.**
  - Planning filters `bevestigd`, and a new row is `optie`, so it disappears after a reload.

## Note
- **N1.** Much of Task 2 may already hold:
  - an empty datetime renders as `''`;
  - it sorts first;
  - groups are by key;
  - `wireValue` sends `''` as `null`.

  Only clearing in the picker editor plausibly needs code.
- **N2. Clearing `start_at` on a row with an `eind_at` is refused.** Tests must clear both. Add a test that a PATCH of `datum` alone moves `plandag`.
- **N3. Task 4's "seed the three views" has no command.** `--fresh` also seeds invented rows.
- **N4. The re-export overwrites the previous export.** Keep it as `.pre-datum`.
- **N5. Task 4 is read-only toward Laika:** the export reads only, and its output is confined to `/mnt/laika-export`.
- **N6. The simplest-design paragraph holds,** and the engine needs no change.
- **N7. The migrator refusal is as stated.**
- **N8. 114 untimed activities** match the real export.

---

# Round 2
Reviewed-plan: 50c6dac6a73192f46d1eb23e6cc5e51c804805db specs/step-0e-datum/plan.md
Verdict: not ready (B1: the e2e names a non-existent view "Activiteiten" — clicking the table opens Planning; use "Optie of bevestigd"). Should fix: S1 the e2e day depends on the run date (newRow uses today inside the window); S2 Task 3 omits ExportCommand.php (count of removed keys → TypeError) and ChecksTest.php; S3 the approved U4 spec-diff line still defines weeks by start_at; S4 Task 1 must run the full gate; S5 Task 4 renames the old export after overwriting it. Notes: datum edits on timed rows and clearing Start with an end are refused — make the messages say what to do; name the test files; give the cross-repo import command; atelier renders a null start (outside this plan). Prior B1, B2, S1–S5, N1–N3, N5–N7 resolved; S6 and N4 partly.
