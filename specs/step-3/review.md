# Feature review: step-3

Range `3997cb5..945b4c1` (feature/step-3 against main). Reviewed against the plan `specs/step-3/plan.md`: its requirements, Review Focus and Threat model, with `spec.md` R1–R13 and G. Two reviewers ran: superpowers' code reviewer (most capable model) and security-sentinel, because the plan carries a threat model. No `ARCHITECTURE-INVARIANTS.md` exists. Level full.

## Blocking

None.

## Should fix

- **CR-S1** · `packages/theatre/src/queries/conflicten.sql:16,38,82`, `kandidaten.sql:5,35`, `persoon_dag.sql:5` (code reviewer). Two timed activities with no end that start at the same moment never conflict, because the overlap test `x.van < y.tot AND y.van < x.tot` is strict and a point event's window is `[start, start]`.
  - Scenario: two bevestigd voorstellingen at 20:00 without `eind_at` produce no conflict and no badge, and kandidaten still offers the person for the second one.
  - On the real copy, 45 of 168 timed activities have no end.
- **CR-S2** · `conflicten.sql:33,74` with `scoped: 'productie_id'` (code reviewer). A conflict between two productions carries only one side's `productie_id`.
  - Scenario: a planner with production B selected in the space picker sees a badge on the person's B row in persoon_dag (which counts both sides), while the Conflicten view filtered to B shows nothing.
  - The same applies to locatie_dubbel.
- **CR-S3** · `apps/grid/src/ui/App.tsx:274-276`, `calendar/Calendar.tsx:160` (code reviewer). The calendar uses any date condition as its window, with no cap or normalisation.
  - "Dit jaar" draws a 365-column week. "Vandaag" draws one column, and "next" then jumps seven days.
- **CR-S4** · `e2e/step-3.spec.ts:193-195` (code reviewer). conflicten-six-types asserts that some row carries each type label, and the shared database's seeded rows already satisfy four of the six. The flow never checks its own rows or their ernst.
- **CR-S5** · `packages/theatre/src/seed.ts` against gate G (code reviewer). On a fresh seed, onbevestigd never appears (seeded invitations are new). open_slot appears only while seeded activity 15 is within 14 days of today. The browser gate manufactures both rows (R-7). The literal wording "from seeded data" therefore needs an owner ruling.
- **SS-S1** · `packages/theatre/src/writers.ts:270-275,340-353` (security-sentinel). An editor can re-point a rated Persoon_rol row to another person or role, or delete it, without ever writing a rate column. This moves or erases an administrator's rate (threat 4).

## Note

- **CR-N1** · `werklijst.sql:34`, `persoon_dag.sql:18-20`: soft-deleted persons are not filtered, while conflicten filters them.
- **CR-N2** · `conflicten.sql:60-69`: onbevestigd and werklijst onbeantwoord never expire for activities in the past.
- **CR-N3** · `conflicten.sql:80-81`: locatie_dubbel does not flag activities of one production where a speelreeks is missing. This matches SPEC; those branches are untested.
- **CR-N4** · werklijst `status` can be edited on non-taak rows and answers a read-only error. This is the existing write-back pattern.
- **CR-N5** · `validate.ts:377-383`: `away.where` values are checked against options, not against the column's type.
- **CR-N6** · candidates in the relation cell and the drawer input have unit tests only.
- **CR-N7** · `vocabulary-allow.txt` allows `taak` because of an engine test fixture that predates this branch; renaming the fixture would let the check guard the word again.
- **SS-N1** · `rows.ts:105-111`: an owner-visible lookup whose field is a relation resolves its title without a readable check. Under R-5 this is the owner's own record, so there is no new exposure.
- **SS-N2** · The plan's threat model still names `filter.ts:36` and `params.ts:119-122`; the refusal lives in `rows.ts:33-69`.
- **SS-N3** · No test pins that `options_from` leaves the write path unchanged (threat 5).
- **SS-N4** · An owner can set their own absence to beschikbaar. This is by design, option-checked and kept in the revision log.
- **SS-N5** · `scripts/conflict-counts.ts:39` copies only the main file. A live WAL database could give a torn copy; `VACUUM INTO` would be safer. Privacy holds.
- **SS-N6** · The untracked `specs/step-3/shakeout/` screenshots come from the e2e database with invented fixtures, not the real copy (verified: written by `e2e/shots.ts` against the e2e server).

## Deferred minors from the task loop

The code reviewer triaged them. The point-activity and cross-production items become CR-S1 and CR-S2. The rest can wait.

Findings: 0 Blocking · 6 Should fix · 13 Note
