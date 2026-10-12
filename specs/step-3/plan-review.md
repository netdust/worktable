# Plan review: step 3 (queries, views on queries, Persoon_rol), second pass

Reviewed-plan: 013b1cabb769aefd6aef9923848865799faee59a specs/step-3/plan.md
Verdict: ready with fixes

The first pass (blob 8c98844, not ready) is this file at commit ab07aae.

The three blocking findings from the first review are fixed in the plan, and every premise the plan cites now holds in source. The ten findings below come from four places:
- **New seed rows break existing e2e specs** that Task 1 does not run (S1, S2).
- **The fix for review S2 is half done** (S3, S4).
- **The calendar e2e only passes in the current week** (S5).
- **Some requirements and the write path have no tests or checks** (S6–S10).

Each has a small fix.

## Earlier findings
- **B1, resolved.** Query columns that point at toewijzing are now plain integers, and a Global Constraint says so.
- **B2, resolved.** I re-ran the vocabulary check against every name the plan adds, with `taak`, `record`, `aan` and `ander` allow-listed. It finds nothing in `packages/engine`.
- **B3, resolved.** `options_from.sort` is in the declaration, the validation and docs/SPEC.md:49. The seed gives Bram voorkeur, so rank order and id order disagree. The test expects `['Bram De Wilde','Lotte Verhaegen']`.
- **S1, resolved.** Noor's only assignments are on activities 8 and 16. Neither overlaps slot 15 (10-14, 10:00–17:00), so afwezig is the only thing excluding her.
- **S2, partly resolved.** The flow now keeps the row, but the view has no Soort column (S4 below), and Review Focus still describes the old flow (S3 below).
- **S3, resolved for the calendar, but it breaks step-2** (S2 below).
- **S4, S7, S8, resolved.**
- **S5, resolved in intent.** The signatures and call sites are missing (S7 below).
- **S6, partly resolved.** A stale `home_name` is still in a test name (S6 below).
- **Notes.** N1, N4, N5, N6, N7 (for Taak) and N8 (ruled) are applied. N2 is applied. N3 is applied, but the list is incomplete (S1 below).

## Blocking
None.

## Should fix

**S1. New seed rows break three e2e specs that Task 1 Step 4 does not run.**
- **Plan:** Task 1 Step 4 runs only `grid-ux`, `step-1`, `step-2` and `dagplanning`.
- **Break 1, a second "vergadering Gent":** A-dubbel `[2, 'vergadering', …, 'Gent']` gets the omschrijving "vergadering Gent". Activity 12 already has it.
  - `e2e/step-0d.spec.ts:148` calls `activiteitId(page, 'vergadering Gent')`, which asserts exactly one match at `:92`.
  - `e2e/step-0d.spec.ts:270-271` locates by `row(page, 'vergadering Gent')`. Both activities fall in the week of 10-12, so the locator hits two rows (strict mode).
  - `e2e/step-0b.spec.ts:105-110` has the same problem (`refused-edit`).
- **Break 2, a second Sam row:** with the new voorlopig row, `e2e/step-0c.spec.ts:196` (`tbody tr.nv-tr` hasText 'Sam Peeters' in Toewijzingen) matches two rows.
- **Fix:**
  - Give A-dubbel its own omschrijving, for example an explicit `omschrijving`, or soort `andere` (there is no "andere Gent").
  - Narrow the step-0c locator.
  - In Step 4, run the whole e2e suite (`bun run e2e`) instead of a hand-picked list.

**S2. Seeding Lotte as bevestigd on activity 26 (Nachtwacht) breaks a step-2 flow. The broken thing is the test's premise, not a count.**
- **Source:**
  - `packages/theatre/src/queries/mijn_producties.sql` lists every production where the person has a bevestigd row.
  - `e2e/step-2.spec.ts:961-964` asserts that Lotte's link page shows exactly one row, De Kersentuin, and `not.toContainText('Nachtwacht')`.
- **Fix:** seed that row as `voorlopig`. persoon_dag counts voorlopig as live, Persoonskalender's filter keeps it, and it is logistics, so it raises no conflict. The S3 assertions are unchanged.

**S3. Review Focus contradicts Task 9.**
- **Plan:** Review Focus, "Shape, not behaviour", says "The gate drives a real fix (state → geannuleerd)".
- **Task 9 badge-clears** now drives Familiefeest's soort to Beschikbaar, to fix review S2.
- **Fix:** update that Review Focus line.

**S4. badge-clears edits a column the view does not show.**
- **Plan:** Task 9 says "in Afwezigheden, set Familiefeest's Soort to Beschikbaar".
- **Source:** the seeded Afwezigheden view's `visible_fields` are `['persoon_id','start_at','eind_at','reden']` (`packages/theatre/src/seed.ts`, the Afwezigheden view). There is no Soort column to edit.
- **Fix:** do one of these, and say which:
  - Add `soort` to that view in Task 1, and check the e2e specs that assert its headers.
  - Make the edit through the drawer.

**S5. person-calendar and company-week only pass in the week of 2026-10-12.**
- **Plan:**
  - Task 6's ruling: the calendar's shown week lives in App state "starting on today's week".
  - Task 9 asserts "in the week of 2026-10-12" but never says how the test gets to that week.
- **Source:** every other e2e flow pins a week with `openWeek` (`e2e/tree.ts:30`), which sets a date condition. The calendar as planned ignores that condition. From 2026-10-19 on, both flows fail.
- **Fix (also the simpler design):** derive the calendar window from the view's date condition, the way App already derives `conditionDays` for the matrix (`App.tsx:265-270`). Prev/next/Maand/Week then rewrite that condition with `shift`/`shiftMonth`. `openWeek` pins the week, and the new `calendarShown` state is not needed. If you keep the state instead, the flows must say how they get to the week.

**S6. Task 3 Step 1 names a lookup that does not exist.**
- **Plan:** "an owner's rows carry no lookup → no `home_name` key".
- **Source:** the lookup under `withOwnedItem` is `team_name` (`lookups-privacy.test.ts:86-89`, `fixtures/lookup-domain.ts` item).
- **Second gap:** the case "an owner_visible lookup is served, filtered and sorted for its owner" needs a variant where `team.name` is `owner_visible`. `ownedTeam` (`:41`) declares owners but not that.
- **Fix:** rename the test to `team_name`, and name the variant.

**S7. The scope reaching sort, group and filter has no stated signature.**
- **Plan:** Task 3 says `parseSort` / `parseGroup` (`params.ts:119-122`) "take the scope", and "`/history`'s `whereOf` passes the scope".
- **Source:**
  - Both functions are private. They are reached only through `parseRowsParams(source, query)` (`params.ts:125`). Its callers are `app.ts:291`, `history.ts:84`, `owner-views.ts:101` and `views.ts:445`, plus the tests at `lookups.test.ts:292` and `lookups-privacy.test.ts:209`.
  - `whereOf` is in `rows.ts:32`, and `/history` reaches it through `readIds`. The filter scope must go through `filterWhere(input, source, table, now, domain)` (`filter.ts:177`) to `compileFilter` and then `resolveKey`.
  - If the new parameter is optional with a default, it fails open.
- **Fix:** name `parseRowsParams(source, query, scope)` and its call sites (`publicRows` passes `'all'`), and make the filter scope a required parameter.
- **Simpler alternative:** refuse in `rows.ts`. `readRows` and `readIds` already hold the scope, so `whereOf` → `filterWhere` and `orderOf` cover `/rows`, `/history` and owner-views in one file.

**S8. Some requirements have no test.** `step3-queries.test.ts` has no case for:
- **R9:** "anyone with a timed overlap" and "is active". No seeded Speler holder has a timed assignment on 10-14.
- **R10:** werklijst's open-slot and unanswered-invitation (onbeantwoord) items. Only the Taak and optie items are asserted.
- **R11:** locatie_dag's `conflicten` count. A-dubbel against activity 1 should give 1 on both rows.

**Fix:** add these three cases to Task 2 Step 1.

**S9. Beschikbaarheid's soort accepts any value.**
- **Source:**
  - `beschikbaarheidWriter` (`writers.ts:205-212`) checks no option, and the engine checks none (the earlier N7).
  - Task 1 makes `soort` `owner_writable`.
- **Effect:** a person can write `soort: 'x'`. The absence then counts as neither afwezig nor onzeker in conflicten or kandidaten. That is the "write path's checks" asset in the threat model.
- **Same gap:** `taak.gekoppeld_aan` declares options but gets no `checkOption`.
- **Fix:** add `checkOption` for both in Task 1 Step 3, and a 400 test in T1.

**S10. Task 7 changes the matrix picker without rerunning the e2e flows that use it.**
- **Source:**
  - `e2e/step-2.spec.ts:176-183` (`fillFromMatrix`) types into the searchbox "Kies een persoon" and clicks a name.
  - `:365` fills with "Ines Brievenbus", a person the test creates, who has no Persoon_rol.
- **Effect:** once the picker shows candidates only, these flows break. Task 7 Step 4 runs only grid unit tests.
- **Fix:** Task 7 should:
  - say whether the search box stays in candidates mode;
  - update `fillFromMatrix` to press "Iedereen tonen" when needed;
  - run `bunx playwright test e2e/step-2.spec.ts`.

## Note
- **N1. The matrix ignores soort.** `datasets.ts:209` (`away`) reads every Beschikbaarheid row whatever its soort. After Task 1:
  - Bram's onzeker row marks him "Afwezig en toegewezen" on voorstelling Gent.
  - After badge-clears, Familiefeest (now beschikbaar) still marks Noor away in the matrix.

  The spec does not require a change. It needs a ruling, or a follow-up item.
- **N2. "Only an owner-visible lookup may appear in a view for owners" (R2) already holds.** `forOwnersProblem` (`views.ts:356`) admits only query views, and lookups exist only on datasets (`lookupOf`). One sentence in Task 3 would save the reviewer the search.
- **N3. Write replies.** `writes.ts:657` also selects lookups only under `'all'`. Using `lookupsFor` there keeps write replies consistent with reads. This is not a leak.
- **N4. `fieldColumn` is private.** Task 8 builds its test Column with `fieldColumn`, but it is module-private (`grid/columns.ts:167`). Use `columnsFor`, or export it.
- **N5. Moving `writeDb`.** `writeDb` is at `step-2.spec.ts:112`, not `:105`. It depends on `THEATRE`, which has to move to `e2e/db.ts` with it.
- **N6. Two small threat-model test gaps.**
  - Threat 2's "the target dataset declares owners" refusal has no test.
  - Threat 3's "absent from `/schema`" is not asserted.
- **N7. Seeded views are not validated.** `migrate.ts:150` inserts them without `skinOf`/`groupOf`, so a wrong `group_by` on a seeded calendar view only shows up in e2e.
- **N8. The simplest-design paragraph holds.** The alternative it rejects is stated honestly, and the gate does need the picker, the calendar and the badge. The simpler designs I found are the ones in S5 and S7.

## Premises checked
- Activity ids 1, 2, 4, 13, 15, 16 and 26 (untimed overnachting Antwerpen 10-15, Nachtwacht) → `seed.ts` `slots`/`untimed` → holds
- A-dubbel overlaps activity 1 at Gent, different production → `seed.ts`, `VENUE_OF` → holds; omschrijving collides (S1)
- Toewijzing 5 is Sam uitgenodigd on 13; Familiefeest covers 10-14 00:00–23:59; Studiedag ends 10-12 12:00 → `seed.ts` → holds
- Kandidaten for slot 15 = {Bram, Lotte}; Noor out only for afwezig, Sam only for being assigned; both fall back to dagtarief 210 → `seed.ts` → holds
- Lotte voorlopig on 13 overlaps her bevestigd on 2; Bram onzeker 20–23 against activity 4 (20:30) → holds
- Validation refuses a relation to toewijzing → `validate.ts:161-168` → holds, and the plan obeys it
- The new names pass the vocabulary check with the four allow-list lines → `scripts/check-vocabulary.ts` (simulated) → holds
- The rows route orders by group, sort, id → `rows.ts:53-57` → holds; `options_from.sort` addresses it
- `options_from.sort` is in the spec → `docs/SPEC.md:49` → holds
- `parseSort`/`parseGroup` at `params.ts:104,119`, private, reached via `parseRowsParams` with four callers → holds; signature not stated (S7)
- `whereOf` → `rows.ts:32` (not `history.ts`); `/history` reaches it via `readIds` (`history.ts:84-85`) → holds in substance
- `resolveKey` refuses no lookup today → `filter.ts:36` → holds
- `readRows` selects lookups only under `all` → `rows.ts:137` → holds; also `writes.ts:657`
- `servedLookups` → `app.ts:150-161` → holds
- `checkLookups`' owners refusal → `validate.ts:214` → holds
- `withOwnedItem`, `ownedTeam`, `team_name` → `lookups-privacy.test.ts:41,86` → holds; `home_name` does not (S6)
- `checkRates` → `writers.ts:259` → holds
- `checkOption`, `forPlanners` → `writers.ts:14,62` → holds; `beschikbaarheidWriter` checks no option (S9)
- `checkOwnerWritable` allows `soort` → `validate.ts:116-130` → holds
- Lifecycle refuses geannuleerd → bevestigd → `datasets.ts` toewijzing transitions → holds
- `checkWrites` needs only the key as a query column → `validate.ts:244-258` → holds
- A grid write through a mapped column with a null key is refused client-side → `api.ts:259-262` → holds
- `vul_slot` `on: 'toewijzing'`; `match { toewijzing_id: 'id' }` valid → `actions.ts:112-115` → holds
- `servedColumn` → `app.ts:106`; `actionsOn` → `actions.ts:136` (takes no actor) → holds, as a modification
- `skinOf`, `groupOf`, `ViewFields` → `views.ts:27,94,127` → holds
- `SavedViewSeed.skin` → `declare.ts:153` → holds
- `checkTones` → `validate.ts:45`; `TONES`, `ICONS` (users/check/flag) → `declare.ts` → holds
- `productie_dag` has `date: 'plandag'` and `productie_id` → productie → `queries.ts` → holds
- Grid references hold: `types.ts:93` (ViewType), `engine.ts:92,223-251,369`, `api.ts:302`, `App.tsx:264-271,488-499`, `Rail.tsx:91`, `Matrix.tsx:155-187,543-560`, `Relation.tsx:49-71`, `Drawer.tsx:226-235`, `Window.tsx:28,48`, `i18n.ts:92,198`, `SpaceSelect.tsx` (React Aria `Select`)
- `fieldColumn` usable from a test → `grid/columns.ts:167` → does not hold (private; N4)
- `writeDb` → `e2e/step-2.spec.ts:112` → holds (line differs)
- `openView`/`openWeek` → `e2e/tree.ts:14,30` → holds
- Seeded Afwezigheden view shows Soort → `seed.ts` views → does not hold (S4)
- New seed rows only move counts in the four listed specs → `step-0b:105`, `step-0c:196`, `step-0d:148,270`, `step-2:961-964` → does not hold (S1, S2)
- `ARCHITECTURE-INVARIANTS.md` → absent; no invariant rows to check
