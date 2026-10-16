# Brief: test cleanup (after feature/mutation-testing is merged)

Source of truth:
- specs/test-prune/2026-10-16.md: the totals, the spot-check corrections, the reconciliation and Stefan's rulings.
- The slice reports under specs/test-prune/2026-10-16/.
- specs/mutation/<date>.md: the mutation baseline.

Entry: netdust-gates:policy. This is a plan, not the bounded path: several hundred dispositions across four tiers. Use subagent-driven execution, because it would outlive one context.

## Stefan's rulings, 2026-10-16

Verbatim: "1 completion, 2 remove, 3 collapse, 4 yes".
1. A step's browser acceptance tests are a completion criterion. A gate test may go once a cheaper tier provably pins its behaviour. Its CHECKS row and its plan cell are edited in the same commit. Every SPEC acceptance line that names a browser flow (SPEC:349, :351, :352, :353, :354) keeps at least one e2e.
2. Remove dead production code with its tests. **Not in this feature**: it belongs to the UI-architecture feature. Here, only leave its tests alone.
3. Collapse @smoke to three tests: the sign-in page, the record-link headers (smoke/step-2), and one API probe.
4. Mutation testing is the arbiter for "covered by".

## The rule for every removal, from the spot-check's lesson

No test goes on the audit's word alone. One claim in 20 was refuted and 7 in 20 needed an assertion moved.
- **Unit and integration tiers**: run `bun run mutation -- <module>` before and after the removal, for each module the removed test exercises. If the score drops or a mutant now survives, the test, or its assertion, stays or moves instead. Where no mutation module covers the code, break the behaviour by hand: the covering test must go red.
  - The baseline in specs/mutation/ ran while other projects' gates loaded the box, so it may count load flakes as kills. When a removal decision hinges on a module, rerun that module's baseline with the box quiet first.
- **E2E**: break the behaviour by hand, run the covering test(s), and see them go red before the old test goes. Record the break and the red run in the commit message.
- Move the assertions first, each RED→GREEN at its new seam. Then delete.
- **Chains**: a behaviour pinned at two tiers never loses both sides. The report's Reconciled section lists the known chains.

## Units, in this order. Each is its own commit group with the gate alone at its end.

1. **Harness speedups**, deleting no test. This makes every later gate shorter.
   - `openWeek` goes straight to `/#view=<id>&f=…` (E1 R10). Time one spec before and after.
   - read-limit-cut seeds its 5,001 rows with one SQL statement (E2).
   - `VITE_RECORDS_PAGE_SIZE=2` applies only to relation-beyond-page (E1 finding 2).
   - `bothThemes` returns at once without `SHAKEOUT_SHOTS` (E2).
   - The two isolation leaks:
     - step-0e seeded-view-read-only must wait for its copy and delete it in a finally;
     - the leftover "Planning (kopie)".
   - Also fix the stale CHECKS row: `period-is-a-filter` → `period-is-the-period`.
2. **E2E slices E1 and E2**:
   - the DELETE-CONFLICTs under ruling 1, the REWRITEs (R1–R11 and E2's), and the smoke collapse under ruling 3;
   - edit the CHECKS rows and plan Test-map cells in the same commits.
   - The spot-check's corrections apply:
     - board-drag's three extra assertions move;
     - conflict-band-negeren folds into choose-other's board run;
     - smoke/step-2's record-link headers test stays.
3. **Engine and domain slices EN1, EN2, T**:
   - the DELETEs and conflicts, with the mutation baseline on filter.ts, filter-compile.ts and validate.ts as the arbiter;
   - the REWRITE moves into packages/engine/test (invite, import-cli, lookups:92, person-pages:204).
   - The spot-check's corrections apply: validate.test:133, migrate.test:273 and rank.test:46 stay.
4. **Grid slices G1–G3**:
   - the mutation baseline on store, group, columns, rank and drop is the arbiter;
   - the setStrings, time-kind, ViewPanel and prefs tests stay until the UI-architecture feature removes their code;
   - Matrix.test:512 and store.test:163/:453 are rewritten to the server's message now.
5. **Missing tests the audit found**, each RED→GREEN or proven by a hand break:
   - findAll's 5000 cap;
   - `entries` defaulting to 50;
   - the service-account half of the record-link address rule plus token revocation, in the engine;
   - a null-relation lookup on /rows;
   - Board onShown columns;
   - the concurrent planner and person 409 at the theatre tier (E1 R8).

## Constraints

- No product code changes, except where a test proves a defect. In that case stop and report it to me first.
- Gate alone, after checking `ps` for other projects' playwright, ddev and phpunit; I book turns with laika.
- Report, per unit:
  - tests and lines removed;
  - gate time before and after;
  - every disposition that turned out wrong when verified.
- I merge each unit.
