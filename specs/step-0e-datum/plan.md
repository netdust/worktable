# Step 0e follow-up: activities without a time, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Activiteit can have no time. It gets a required `datum` and an optional `start_at`, and the grid shows such an activity on its day without a time, instead of the 05:00 the import gave 114 of Laika's activities.

**Architecture:**
- Theatre's Activiteit declaration gains `datum` (date, required). `start_at` and `eind_at` become nullable.
- The Activiteit writer:
  - keeps `datum` equal to the date of `start_at` when a time is set;
  - derives `plandag` from the day line when there is a time, and from `datum` when there is none;
  - refuses an `eind_at` without a `start_at`.
- `voorstellingen` reads `datum`. The grid renders an empty `datetime` cell as nothing, and sorts untimed rows first within their day.
- The Laika exporter drops its 05:00 rule and the `laika_geen_start` flag, and sends `datum` with an empty `start_at`.
- Your local `~/laika-export/engine.db` is rebuilt by a fresh export and import.
- **First working version:** Task 2. In a test database, an activity created with only a date shows in the grid on that day with no time.

**Tech Stack:** Bun, TypeScript, bun:sqlite, React grid, Vitest and Playwright; PHP for the Laika exporter (Brain Monkey, wp-phpunit).

**Spec:** `specs/step-0e/spec.md`, and the spec lines approved by Stefan on 2026-10-06, recorded in `specs/step-0e/spec-diff.md` under "Activities without a time". The parent is `docs/SPEC.md`, but this plan does not commit it.

**Branches:**
- worktable: `feature/step-0e-datum`, from `feature/step-0e`. Not merged.
- Laika: further commits on the unpushed `feature/worktable-export` in `/home/ntdst/Sites/laika-planning-model`. Ruling: the exporter has one branch, the change belongs with it, and nothing is pushed.

**Simplest design:**
- **Keep `start_at` required and show "05:00" as "no time" in the grid.** That is simplest, but it rejects your ruling, and it would hide a real 05:00 start.
- **Store a time-of-day `start` beside `datum`.** This would split one datetime into two columns everywhere the engine and the views use `start_at`.

The approved design adds one column and relaxes one. Only the writer, the one query and the grid's empty cell change.

## Decisions (Stefan, 2026-10-06: "approved")
- **The Activiteit columns:** `datum` is required. `start_at` and `eind_at` are optional.
- **Consistency:** with a time, `datum` equals the date of `start_at`. The writer sets it from `start_at`, and refuses a body whose explicit `datum` disagrees. An `eind_at` without a `start_at` is refused, with a Dutch message.
- **`plandag`:** the day line applies to `start_at`. Without a time, `plandag = datum`.
- **`voorstellingen.datum`** is `a.datum`. `start` is empty for a show without a time.
- **The Laika exporter:** an activity without a start time exports `datum` and `start_at: null`. The T05:00 rule, the `laika_geen_start` flag and the report's `geen_start` note are removed. The end-rolls-to-the-next-day rule stays for activities with a time. The report counts untimed activities as `zonder_tijd`.
- **Existing databases:** the migrator refuses a required new column on a table with rows. That is right, and it stays. The e2e and test databases start fresh. `~/laika-export/engine.db` is rebuilt (Task 4). No live database exists.
- **"+ New" on Activiteit** asks for `productie_id` and `datum`, no longer `start_at` (the 0d R8 rule, which asks for the required columns).

## Global Constraints
- `packages/engine` stays untouched apart from anything a test proves necessary. This is a domain change, and the engine already supports nullable datetimes.
- Dutch names in theatre; refusals in Dutch.
- No commit leaves `bun run gate` red.
- No write to the Laika planning database. Exporting only reads it.
- Nothing is merged or pushed to `main`. The Laika branch is not pushed.
- `docs/SPEC.md` is not committed. Its approved lines wait for the final spec commit.

## Threat model
Not a security surface: no route, auth or input-parsing change beyond the writer's own validation.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Theatre Activiteit writer and declaration | `POST/PATCH /api/rows/activiteit`, `/rows/voorstellingen` | integration · `packages/theatre/test/writer.test.ts`, `theatre.test.ts` · `bun test packages/theatre` | untimed-activity |
| Grid empty datetime | `DateCell`, `useTable` sort, newRow | unit · `apps/grid/src/grid/*.test.ts(x)` · `bun run --filter @worktable/grid test` | untimed-activity |
| Laika exporter | `wp laika export-planning` | unit and integration · `tests/Unit/WorktableExport/ActivityMapTest.php`, `tests/Integration/WorktableExport/ExportCommandTest.php` · `ddev composer test:unit`, `test:int` | none |
| Rebuild of the local engine | the import CLI, parity | manual · Task 4 | none |

## Review Focus
1. A real 05:00 start is still a time, not "no time". A test creates one and the grid shows 05:00.
2. A 00:30 show keeps `datum` on its calendar day while `plandag` moves to the previous day. The voorstellingen test covers it.
3. An untimed activity sorts and groups correctly in Planning: first in its day, never on the previous day.
4. An update that clears `start_at` keeps `datum`. An update that sets `start_at` on another day moves `datum` with it.
5. Parity on the re-export still passes every check and view, with the 114 untimed activities on their own weeks.

## Time log

| Task | Start | End |
|---|---|---|

---

### Task 1: Theatre — datum, optional start, the writer
**Files:** `packages/theatre/src/datasets.ts` (Activiteit `datum`; `start_at`/`eind_at` nullable), `writers.ts`, `queries/voorstellingen.sql`, `seed.ts` (seed activities carry `datum`; add one untimed activity), `packages/theatre/test/writer.test.ts`, `theatre.test.ts`, the invented import fixture `packages/theatre/test/fixtures/invented-export.json` (activities gain `datum`; one becomes untimed; its `checks` are recomputed by hand from the rows).

- [ ] **Step 1: Tests first,** each through the routes:
  - an activity with only `datum` is created with `plandag = datum` and no `start_at`;
  - with `start_at` set, `datum` follows it;
  - a body whose `datum` disagrees with `start_at` is refused;
  - `eind_at` without `start_at` is refused;
  - clearing `start_at` keeps `datum`;
  - a 05:00 start stays a time;
  - voorstellingen shows `datum` and an empty `start` for an untimed show;
  - a 00:30 show keeps its calendar `datum`.

  Run → FAIL.
- [ ] **Step 2: Implement.** Run `bun test packages scripts` and `bun run check` → PASS. Parity tests must stay green on the updated fixture.
- [ ] **Step 3: Commit.** `feat(theatre): an activity can have no time — datum required, start optional`.

### Task 2: Grid — an empty time is just the day
**Files:** `apps/grid/src/grid/cells/Date.tsx` (an empty datetime renders nothing; the editor accepts clearing), `useTable.ts` (empty start sorts first within its group), `newRow.ts` (asks for `productie_id` and `datum`), their tests, and `e2e/step-0e.spec.ts` (flow **untimed-activity**: create an activity with only a date; it shows on that day with no time; it survives a reload).

- [ ] **Step 1: Tests first,** then implement. Run `rm -rf e2e/.tmp && bun run gate` → PASS.
- [ ] **Step 2: Commit.** `feat(grid): an activity without a time shows on its day without one`.

### Task 3: Laika exporter — send datum, no more 05:00
**Repository:** `/home/ntdst/Sites/laika-planning-model`, branch `feature/worktable-export`.

**Files:** `ActivityMap.php` (returns `datum`, `start_at` nullable; `NO_START` and `geen_start` removed), `Export.php` (emits `datum`; `zonder_tijd` note; no `laika_geen_start`), `Checks.php` (weeks from `datum`), and the tests. Regenerate the invented fixture (`WORKTABLE_EXPORT_FIXTURE=1`) and import it into a temporary worktable database built from Task 1's theatre.

- [ ] **Step 1: Tests first** (ActivityMap: no start gives `start_at` null and `datum` set; with a start, `datum` is the date). Then implement. Run `ddev composer test:unit` and `test:int`, and quote them. `make gate` stops at the old `audit:deps` advisory; quote the later tiers on their own.
- [ ] **Step 2: Commit.** `fix(laika-core): an activity without a time exports without one`.

### Task 4: Rebuild the local engine (operator steps; reads Laika's database only)
- [ ] Stop the running engine and grid.
- [ ] Re-export: `ddev wp laika export-planning --own=76437 --out=/mnt/laika-export/laika-planning-export.json --report=/mnt/laika-export/export.report.json`.
- [ ] Move `~/laika-export/engine.db` to `engine.db.pre-datum`. Run `--create-admin`, then `--import`, then seed the three views. Set `chmod 600`.
- [ ] Run `bun run parity` on the new export into `specs/step-0e/parity.md`. Keep it uncommitted until Stefan reads it.
- [ ] Restart the engine and grid. Planning shows the untimed activities without 05:00.
