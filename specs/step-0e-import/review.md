# Review: step-0e U4, the generic JSON import and the parity gate

Branch `feature/step-0e-import`, 65f7635..2de066d, run subagent-driven on 2026-10-06. Each of the three tasks had a fresh implementer and a fresh task reviewer, and every fix round got a scoped re-review. Two reviewers then read the whole branch on the most capable model: a code reviewer and `security-sentinel`.

## Final whole-branch review: ready with fixes
- **Holds:** one create pipeline (the importer reuses `valuesOf`, `encodeAll` and `create`), names checked before any SQL, a rollback proven on a reopened file database, legacy id 0, missing relation targets refused, the ISO-week year boundary, the `maybe` note, and the staged-file tests.
- **Scale:** 6 × 6000 rows import in about 1.1 s in one transaction, and parity pages past the 5000-row cap.
- **No client data is committed.** The fixture's expected `checks` were recomputed independently from its rows.
- **Important:** the export check only saw what was staged when `check` ran, so a committed export passed every later gate. This is the same finding as the audit's HIGH 1.

## Security audit
- Attacks 2–4: mitigated and tested.
- Attack 5: mostly mitigated.
- Attack 1: weak, through the findings below.
  - HIGH 1: the export check covered only staged files, not committed ones.
  - MEDIUM 2: the fixture exemption was by name only.
  - LOW 3: a type change was missed.
  - LOW 4: files other than `.json` were not inspected.
  - LOW 5: parity left its temp database behind on failure.
  - LOW 6: parity quoted file content on invalid JSON.
  - LOW 7: the report mode was not reapplied.
  - LOW 8: `custom` was unvalidated.

## Fix wave
- **Commits:** d6d106d, aff5cbd, 947d85d, 94ebb51, 2c6065e, 2de066d.
- **The 14 findings, each fixed:**
  - the check scans the whole index and sniffs files other than source or docs for the marker;
  - the fixture is exempted by its content;
  - parity cleans up on every path and quotes nothing;
  - the report is set to 0600 and is never left stale;
  - `custom` keys and values are validated;
  - a missing check block, or a missing view, fails parity;
  - `--import` with an account flag is refused;
  - the CLI leak test asserts the refused rows;
  - the spec-diff gains the value encodings and states that the exporter always emits `status`.
- **Scoped re-review:** all 14 addressed, no new Critical or Important.
- **Gate on Bun 1.4.2:** 749 package tests, 564 grid tests and 38 e2e flows. The whole-index scan takes 34 ms.

## Carried to the cutover slice
An imported database has no saved views: `migrate` does not seed views, and `--fresh` seeds demo rows, which block the import. Planning, Toewijzingen and Afwezigheden must be seeded on their own after the real import.

## Not done here, and why
- `specs/step-0e/parity.md` is written only when Stefan runs `bun run parity ~/laika-export/laika-planning-export.json` on his machine, and it is committed after he has read it.
- A pre-commit hook would catch an export at commit time instead of at the next gate. It is offered to Stefan, not installed, because it changes his git config.

## Rulings (in the order made)
- Ruling: branch cut from feature/step-0e (65f7635, U1+U3+U2 merged) — the approved order; cost if wrong: none.
- Ruling: a staged .json that does not parse fails the check closed (e.g. JSONC like a commented tsconfig.json) — personal data must not slip through a parse error; cost if wrong: such a file needs an exemption later.
- Ruling: with --accept-report the command exits 0 when the rest committed (the refusals were accepted explicitly; the report lists them) — cost if wrong: a script treats a partial import as clean.
- Ruling: custom is stored as given until the Field table exists (step 5) — cost if wrong: unvalidated custom keys, which Field will declare later.
- Ruling: a dataset with no create writer, or a self/circular relation, is refused as bad_import (theatre has neither) — cost if wrong: a future domain needs a two-pass import.
- Ruling: review minor 1 (pin attack 5 against the real theatre writers: a refused both-persoon-and-naam / duplicate row through the CLI, asserting no fixture value in report or stdout) is carried into Task 3, which already tests outputs for leaked values — cost if wrong: none.
- Ruling: HIGH 1 is fixed by scanning every tracked and staged file (git ls-files) at check time, so a committed export turns the gate red before any push; a tracked pre-commit hook (core.hooksPath) is offered to Stefan, not installed — it changes his git config — cost if wrong: an export sits in a local commit until the next gate.

## Deferred minors
- Task 1: minor (deferred): a renamed copy not ending in .json (export.txt, .json.bak) passes — note the limit in the script
- Task 1: minor (deferred): the refusal message says "(or the file cannot be read as JSON)" even for a plain name match
- Task 2: minor (deferred): writer messages go into the report verbatim; a future writer quoting values would leak them into the report (outside the repo by default)
- Task 2: minor (deferred): imported custom is not in the Revision batch (create revises declared columns only)
- Task 2: minor (deferred): export type Stored has no new consumer
- Task 2: minor (deferred): --import combined with an account flag is silently skipped
- Task 2: minor (deferred): an existing report file keeps its old mode on overwrite
- Task 3: minor (deferred): no-leak lists hand-picked, not built from every fixture string
- Task 3: minor (deferred): CLI leak test does not assert the refused count / legacy ids 590, 592
- Task 3: minor (deferred): test helpers leave temp dirs (invented data only)
- Task 3: minor (deferred): views are approximated by source + filters through /rows, not opened as stored SavedViews
- Final: minor (deferred): fixture exemption bypassable by a deliberately disguised file (escaped email, or no emails with source "invented"); hardening: check emails over JSON.stringify(parsed)
- Final: minor (deferred): a report-write error (missing directory) masks the original import error
- Final: minor (deferred): the report sits at the old mode until chmod runs on overwrite
- Final: minor (deferred): content sniff matches only the quoted JSON marker; .md and source files exempt wholesale
- Final: minor (deferred): an unmerged path during a merge conflict crashes the check (fails closed, noisy)
