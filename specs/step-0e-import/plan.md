# Step 0e U4: the generic JSON import and the parity gate, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A generic command loads a JSON export into an empty engine database through each dataset's validation and writer rules, in one transaction, with one Revision batch.
- A parity script compares what the engine shows with the export's own `checks` block.
- A staged personal-data export can never be committed.

**Architecture:**
- **The importer.** `packages/engine/src/import.ts` orders datasets by their relations (a topological sort of `relation` columns). For each row it maps relation values from legacy ids to new ids and runs the same `valuesOf` pipeline `runWrite` uses: cut, type check, `writer.create`, options, relations, required. It then sets `legacy_post_id` and `custom` and inserts.
- **Refused rows.** A refused row is collected, never thrown past the loop. The import commits only when nothing was refused, or when `--accept-report` is passed, in which case the refused rows are skipped.
- **The parity script.** `scripts/parity.ts` imports into a temporary database, then reads through `createEngine` as an administrator, so the comparison goes through `/rows` exactly as the grid reads.
- **First working version:** Task 2.

  ```
  bun packages/engine/src/serve.ts --domain @worktable/theatre --db /tmp/x.db --create-admin admin@example.test
  bun packages/engine/src/serve.ts --domain @worktable/theatre --db /tmp/x.db --import packages/theatre/test/fixtures/invented-export.json --as admin@example.test
  ```

  It prints counts per dataset, and the grid shows the imported rows.

**Tech Stack:** Bun 1.3, bun:sqlite, TypeScript, `bun test`.

**Spec:** `specs/step-0e/spec.md`, U4 and the personal-data addition (parent: `docs/SPEC.md`, "What was in WordPress").

**Branch:** `feature/step-0e-import`, from `main` after auth merges. Revision needs an account id, and the import runs as an administrator.

**Simplest design:** Inserting the rows straight into the tables is simplest. It is rejected because the spec says the rows go through validation, and the writers compute derived columns: Activiteit's `plandag` comes from the writer. Reusing `valuesOf` costs an export of that function. Going through HTTP is rejected: it would make the import N requests and N transactions, not one.

## Decisions
- **The export format** (the contract with the Laika exporter, plan `step-0e-laika-export`):

  ```json
  { "worktable_export": 1,
    "source": "<free text, e.g. laika>",
    "datasets": { "<dataset>": [ { "legacy_id": 12, "<column>": "…", "<relation column>": <legacy id of target>, "custom": { } } ] },
    "checks": { "counts": { "<dataset>": 0 },
                "activities_per_week": { "2026-W41": { "<status>": 0 } },
                "assignments_per_person": { "<persoon legacy id> | \"naam\"": { "<state>": 0 } },
                "absences_per_person": { "<persoon legacy id>": 0 } } }
  ```

  - Weeks are ISO weeks of the calendar date WordPress shows an activity on, which is atelier's `date` and the first ten characters of the exported `start_at`. They are counted per mapped status, so the comparison does not depend on any one view's filter. The parity script counts the same way on the engine side, by `substr(start_at, 1, 10)` and `status` over live rows, and separately reports how many activities the engine's day line (`plandag`) moves to the previous day. That move is a known, intended difference, never a failure (plan review S1).
  - Name-only assignments, with no persoon, count under the key `"naam"`.
  - An absence counts once per row, not per day.
  - Every dataset present must be a declared dataset, and every key a declared, non-readonly column, `legacy_id` or `custom`. Anything else is 400-style refused with its path.
- **`legacy_post_id`.** Theatre's six datasets each gain `legacy_post_id` (integer, nullable, readonly), migrated by U1's ALTER path, per the spec's "kept for one release". The engine knows only the generic column name `legacy_post_id` as an import target. It is a column the domain declares; the importer writes it when it is declared.
- **Readonly columns.** A readonly column other than `legacy_post_id` in the export is refused: derived values come from the writer.
- **Refusing a non-empty database.** The import refuses unless every dataset it would write is empty: `import_needs_empty_database`. That makes it safe to run twice.
- **The report** goes to `--report <path>` (default: the import file's path plus `.report.json`, which sits outside the repo beside the export). It holds legacy ids and messages, never column values. Stdout prints counts only.
- **Vocabulary.** `legacy` and `post` join `scripts/vocabulary-allow.txt` with their reasons (`legacy_post_id` is a generic import column; `post` is also Hono's `app.post`), plan review S5.
- **Revision.** One `batch_id` for the whole import, actor = the `--as` account, which must be an administrator. `revise()` gains an optional `batch` argument.
- **The parity output.** `specs/step-0e/parity.md` gets, per check, `pass`/`fail`, the total compared, and the number of mismatched keys. No ids, names or values.
- **Personal data in git** (Stefan, 2026-10-06):
  - `.gitignore` gains `laika-planning-export*.json` and `*.report.json`.
  - A new `scripts/check-staged-export.ts` in `bun run check` fails if a staged file matches those names, or if a staged `*.json` file parses to an object with a top-level `worktable_export` key. Source files that only mention the key never trip it (plan review S7).
  - Exempt: files named `invented-*.json` under a `test/fixtures/` directory.

## Global Constraints
- `packages/engine` holds no domain word (the U3 check) and imports no domain package.
- No client data in this repository: the fixture export is invented (names like "Ada Voorbeeld").
- The parity script never runs in `bun run gate`. It needs Stefan's real export, which lives outside every repo.
- No agent pulls from a server or reads a real export unless Stefan runs it or authorises it in the session.
- `docs/SPEC.md` is never committed; the import format's lines go into `specs/step-0e/spec-diff.md`.
- Each task logs its start and end time in the Time log.

## Threat model
**Assets:** the personal data in an export (names, emails, dietary notes, absences), and the integrity of the imported planning.

**Attacks:**
1. **The export, or its report, committed to git** by an agent or by a human with `git add -A`. → **Gitignore plus `check-staged-export.ts` in `bun run check` (the names and the marker key). Test: a planted staged file fails the check, and a planted `invented-` fixture passes.**
2. **A crafted export injecting SQL** through dataset or column names. → **Every dataset and key is checked against the declarations before any SQL is built. Values are bound parameters. Test: an unknown dataset or column is refused, with nothing written.**
3. **A crafted export writing what a writer forbids,** or forged readonly or derived columns. → **The `valuesOf` pipeline, and readonly keys refused. Test: a `plandag` in the export is refused; a Toewijzing with both persoon and naam is in the report.**
4. **A half import leaving a database that looks complete.** → **One transaction, so a refused row aborts unless `--accept-report`. Test: a refused row leaves every table empty, using a file database.**
5. **Report or parity output leaking row contents into the repo.** → **The report holds ids and messages only and is written outside the repo by default; `parity.md` holds counts. Test: no value from the fixture appears in either output.**

**Mitigations:** `import.ts` (2–4), `scripts/check-staged-export.ts` (1), `scripts/parity.ts` (5).

**Deferrals:** the export file's protection on Stefan's disk is his. `legacy_post_id` is removed one release after the cutover (spec).

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Importer | `serve.ts --import`, `importExport()` | integration · `packages/engine/test/import.test.ts` (fixture domain; denials first: attacks 2–4) · `bun test packages/engine` | none |
| Theatre import of the invented export | `serve.ts --import` with theatre | integration · `packages/theatre/test/import.test.ts` · `bun test packages/theatre` | none — read back through `/rows` in the test |
| Staged-export check | `bun scripts/check-staged-export.ts` in a temp git repo | integration · `scripts/check-staged-export.test.ts` · `bun test scripts` | none |
| Parity script | `bun scripts/parity.ts <file>` | integration · `scripts/parity.test.ts` on the invented export: passes; a doctored `checks` block fails with a count, never a value | none |
| Real-data parity | `bun scripts/parity.ts ~/laika-export/…` | manual, by Stefan or on his authorisation · writes `specs/step-0e/parity.md` | none |

## Review Focus
1. Mid-flow failure rolls back on a file database (edge 6): the refused-row test reopens the file and counts rows.
2. Relation order and missing targets: a Toewijzing whose persoon legacy id is absent from the export is reported, not imported with a null.
3. The ISO week at a year boundary: the invented export has an activity on 2026-12-31 and on 2027-01-01, so the `checks` block and the engine agree on W53/W01.
4. The `maybe` mapping arrives as `uitgenodigd` with its note intact: theatre import test.
5. No real or report data staged (attack 1): the planted-file test.

## Time log

| Task | Start | End |
|---|---|---|

---

### Task 1: `legacy_post_id` in theatre; the staged-export check

**Files:**
- Modify: `packages/theatre/src/datasets.ts` (the six datasets), `.gitignore`, `package.json` (`check` runs `check-staged-export.ts`).
- Create: `scripts/check-staged-export.ts`, `scripts/check-staged-export.test.ts`.

- [ ] **Step 1: Tests.** Each case uses a temporary git repo:
  - a staged `laika-planning-export.json` → exit 1;
  - a staged `notes.json` whose top-level object holds `worktable_export` → exit 1;
  - a staged `import.ts` that mentions `"worktable_export"` in a string → exit 0;
  - a staged `packages/x/test/fixtures/invented-export.json` → exit 0;
  - nothing staged → exit 0.

  Run → FAIL.
- [ ] **Step 2: Implement.** Run `bun test packages scripts`. Run the theatre suite: an existing seeded database migrates through the ALTER path, as U1's theatre test already proves.
- [ ] **Step 3: Commit.** `feat: legacy_post_id on theatre datasets; refuse a staged export`.

### Task 2: The importer

**Files:**
- Create: `packages/engine/src/import.ts`, `packages/engine/test/import.test.ts`, `packages/theatre/test/fixtures/invented-export.json` (every dataset; includes a `maybe` origin note, a both-person-and-name row and a duplicate pair already cleaned by "the exporter", one refused row variant built in-test, and the W53/W01 pair).
- Create: `packages/theatre/test/import.test.ts`.
- Modify: `writes.ts` (export `valuesOf`; `revise` takes an optional batch), `serve.ts` (`--import`, `--as`, `--report`, `--accept-report`; exits non-zero on refusal).

**Interfaces:**
- Produces:
  ```ts
  interface ImportResult { counts: Record<string, number>; refused: { dataset: string; legacy_id: unknown; message: string }[]; committed: boolean }
  function importExport(sqlite: Database, domain: Domain, data: unknown, actor: Actor, opts: { acceptReport: boolean }): ImportResult
  ```

- [ ] **Step 1: Denial tests first:**
  - attacks 2–4 on the fixture domain;
  - a non-empty database → `import_needs_empty_database`;
  - `--as` an editor → refused.
- [ ] **Step 2: Behaviour tests:**
  - relations resolve to new ids;
  - derived columns come from the writer;
  - `custom` is stored;
  - `legacy_post_id` is set;
  - one Revision batch with the administrator's id;
  - `--accept-report` skips refused rows and commits the rest.
- [ ] **Step 3: Theatre test.** The invented export imports with zero refusals. `GET /api/rows/toewijzing` as an editor returns the expected count, and the `maybe` row's `notitie` holds `Laika: maybe`.
- [ ] **Step 4: Implement, then run** `bun test packages scripts`, `bun run check` → PASS.
- [ ] **Step 5: Commit.** `feat(engine): the generic JSON import, through the writers, in one transaction`.

### Task 3: The parity script

**Files:**
- Create: `scripts/parity.ts`, `scripts/parity.test.ts`.
- Modify: `package.json` (`"parity": "bun scripts/parity.ts"`), `specs/step-0e/spec-diff.md` (the import format and the parity rule).

**Interfaces:**
- Produces: `bun run parity <export.json> [--out specs/step-0e/parity.md]` → exit 0 when every check passes. It:
  - imports into a temporary file database;
  - creates a temporary administrator;
  - reads through `createEngine` as that administrator: `/rows/activiteit`, `/rows/toewijzing` and `/rows/beschikbaarheid`, live rows only, grouped in the script by the contract's keys (calendar week and status; persoon legacy id or `naam` and state; persoon legacy id). It also checks that the theatre views "Planning", "Toewijzingen" and "Afwezigheden" open on the imported data, and records their row counts;
  - compares with `checks`;
  - writes the counts-only markdown.

- [ ] **Step 1: Tests.**
  - The invented export passes.
  - A copy with one `activities_per_week` value bumped fails, and the output names the check and "1 mismatched key" with no week label value beyond the check name.
  - The output holds no fixture name or email.
- [ ] **Step 2: Implement, then run** `rm -rf e2e/.tmp && bun run gate` → PASS.
- [ ] **Step 3: Commit.** `feat(scripts): the parity gate compares the engine with the export's own checks`.
- [ ] **Step 4: Stop.** Hand Stefan the command for his real export:

  ```
  bun run parity ~/laika-export/laika-planning-export.json
  ```

  `parity.md` is committed only after he has run it and read it.
