# Plan review: step 3 (queries, views on queries, Persoon_rol)

Reviewed-plan: 8c98844580e762b3b776e5ca8fadce81fad9ab98 specs/step-3/plan.md
Verdict: not ready

Three premises do not hold in the current source. Each one either turns `bun run check` red or lets a gate test pass for the wrong reason. All three have small fixes. The SQL design itself is sound:
- There is no circular view dependency.
- The `revision.new` encoding is right.
- `calendar.day === date` holds for every calendar source.
- The rows route window works the way Task 6 assumes.

## Blocking

**B1. Query relations to `toewijzing` are refused at validation.**
- **Plan:** Task 2 Interfaces declares conflicten `toewijzing_id` → toewijzing and `ander_toewijzing_id` → toewijzing, and kandidaten `toewijzing_id` → toewijzing.
- **Source:** `packages/engine/src/validate.ts:161-168` (`checkRelations`) throws "relates to "toewijzing", whose title is through a relation". Toewijzing's title is `{ via: 'persoon_id', else: 'naam' }` (`packages/theatre/src/datasets.ts`, toewijzing). `docs/SPEC.md:49` says the same: "a relation to a dataset with such a title is refused". No source in the repo relates to toewijzing today.
- **Effect:** `migrate` throws as soon as Task 2 registers the queries.
- **Fix:** declare these three columns as plain `integer` with no `relation`. `options_from.match` only needs the column to exist (Task 4), so F1 is unaffected. The same applies to persoon_dag's `toewijzing_id` if it was meant to be a relation.

**B2. The new theatre names collide with words already in `packages/engine`, so `bun run check` goes red from Task 1.**
- **Plan:** the Global Constraints treat the vocabulary only as a rule for future engine code ("`conflicten`, `ernst`, `voorkeur` … becomes banned").
- **Source:** `scripts/check-vocabulary.ts` bans every `_`-split word of more than 2 letters that is not in `scripts/vocabulary-allow.txt`. I simulated the check with the plan's new names. It finds existing hits for four of them:
  - `taak` (the Taak dataset): the engine's own test fixture declares a dataset named `taak` (`packages/engine/test/fixture.ts:27`, `views.test.ts:17`, `matrix.test.ts:23`; 21 test files, about 289 lines).
  - `record` (Taak's `record_id`): about 634 lines (`record_link`, `record_id`, …).
  - `ander` (`ander_toewijzing_id`, `ander_activiteit_id`): `packages/engine/test/batches.test.ts:78`.
  - `aan` (`toegewezen_aan`, `gekoppeld_aan`): `packages/engine/test/import.test.ts:298`.
- **Fix:** add a Task 1 step that:
  - adds `record`, `aan` and `ander` to `vocabulary-allow.txt`, each with its reason;
  - either renames the engine fixture dataset `taak` to an English word, or allow-lists it. `taak` is a domain word, so this choice is the owner's.

  The step runs `bun run check` before committing.

**B3. "The query's default order is `toewijzing_id, rang`" has no engine support.**
- **Plan:** Task 2 (kandidaten) says the query's default order is `toewijzing_id, rang`. Task 7's `optionsFrom` "keeps the server's order".
- **Source:** `packages/engine/src/rows.ts:53-57`. `orderOf` sorts by `params.group` and `params.sort`, then `asc(id)`. `QueryDecl` (`declare.ts`) has no default sort, and the outer `ORDER BY` overrides a view's own `ORDER BY`. With `id = slot*1e6 + persoon`, the picker would list candidates in person-id order, not by rank. That breaks R1 ("in the query's order") and R9 ("ranked by voorkeur, then rate").
- **Why no test catches it:** the seed hides it. Lotte is id 1 and has voorkeur, Bram is id 2, so rank order and id order agree. Task 2's assertion `['Lotte Verhaegen','Bram De Wilde']` and the e2e both pass either way.
- **Fix:**
  - Give `OptionsFrom` a generic `sort?: string[]` that the picker sends as `sort=`, validated as columns of `source`. Theatre declares `sort: ['rang']`.
  - Change the seed so rank and id disagree. For example, give Bram voorkeur instead of Lotte and expect `['Bram De Wilde','Lotte Verhaegen']`.

## Should fix

**S1. The kandidaten test does not prove the afwezig exclusion.**
- **Plan:** Task 1 seeds Noor bevestigd on activity 15 (her afwezig conflict) and expects Noor absent from activity 15's candidates.
- **Source:** Noor is already assigned to activity 15, so the "any non-cancelled Toewijzing on that activity" rule excludes her anyway. G says "excludes anyone afwezig or already assigned", and only "assigned" is actually proven.
- **Fix:** put Noor's bevestigd on activity 16 instead ("vergadering Antwerpen", 2026-10-14 17:30, `seed.ts` slot 16). It is the same plandag and still inside her Familiefeest absence. Her only exclusion from slot 15 is then afwezig, and badge-clears keeps its "Noor's row on 2026-10-14".

**S2. The badge-clears gate passes vacuously.**
- **Plan:** Task 9 badge-clears sets the state to Geannuleerd, then "after the grid reloads, the badge is gone (… assert on the reloaded rows)".
- **Source:** Task 9 seeds "Per persoon per dag" with filter `state $nin [geweigerd, geannuleerd]`. After the reload, Noor's row is filtered out, so "no badge" holds whether or not the count changed.
- **Fix:** clear the conflict in a way that keeps the row. For example, set Familiefeest's `soort` to beschikbaar in Afwezigheden, then assert that Noor's persoon_dag row is present and shows no badge. Alternatively, assert on a view without the state filter.

**S3. One person-calendar assertion cannot be met by the seed.**
- **Plan:** Task 9 person-calendar: "the untimed overnachting shows under 'Hele dag' in Productie 2's lane when laned by production."
- **Source:** the untimed activity (id 26, `seed.ts` `untimed`) has no Toewijzing, so persoon_dag (one row per live Toewijzing) never lists it. There is also no lane called "Productie 2"; production 2 is "Nachtwacht".
- **Fix:** append a seeded toewijzing on activity 26 (Lotte has nothing else on 10-15) and assert lane "Nachtwacht". Or move the all-day assertion to Bedrijfsweek, where every row is all-day.

**S4. Task order: Task 2 uses shapes that only Task 5 declares.**
- **Plan:** Task 2 declares `calendar: {…}` on persoon_dag and locatie_dag and `badge: 'bad'` on their `conflicten` columns. `CalendarDecl`, `QueryDecl.calendar` and `ColumnDecl.badge` only arrive in Task 5 (`declare.ts`).
- **Effect:** `defineQuery`'s excess-property check fails typecheck, so `bun run check` is red at Task 2's commit, and `checkCalendar` does not exist yet.
- **Fix:** move these declarations to Task 5's Files list, beside productie_dag's calendar.

**S5. Threat 1 names the filter and sort oracles but not the group oracle or `/history`.**
- **Source:**
  - `packages/engine/src/params.ts:119-122`: `parseGroup` accepts any lookup (`hasColumn` includes `lookupOf`).
  - `rows.ts:54`: `orderOf` orders by that group's lookup value, so an owner grouping its own Toewijzing rows by `datum` learns the hidden order.
  - `history.ts:84-85`: `/history/:source?filter=` runs the same `whereOf` filter.
- **Fix:**
  - State in Task 3 where the refusal lives. `parseSort`/`parseGroup` already validate keys, so they or `orderOf` must receive the scope.
  - Add two tests to `lookups-privacy.test.ts`: "an owner's group on a lookup is 400" and "an owner's /history filter on a lookup is 400".

**S6. Task 3's fixture edit does not match the fixture.**
- **Plan:** Task 3 Step 1 says "In `lookup-domain.ts`, give the owned dataset `team` a lookup, `team.home_name` via a relation."
- **Source:** in `packages/engine/test/fixtures/lookup-domain.ts`, `team` is not owned and has no relation column. The owned variants live in the test file: `ownedTeam` (`lookups-privacy.test.ts:43`) and `withOwnedItem` (`item` owned by `team_id`, which already has `team_name`). `lookup-domain.ts` is also imported by other tests.
- **Fix:** flip the existing `withOwnedItem` probes ("validation refuses owners…", the scoped-read test) instead of editing the shared fixture.

**S7. R9's "then rate" has no test.**
- **Source:** all four Speler holders in the seed fall back to Rol Speler's dagtarief of 210. Noor's dagtarief of 300 is on Lichttechnicus, which no slot asks for.
- **Fix:** add a Task 2 case where two non-voorkeur candidates differ only by `persoon_rol.dagtarief`.

**S8. R6's "added by ALTER" has no test.**
- **Source:** `schema-diff.ts:81` (`addable`) makes this an `alter` for a NOT NULL text column with a default. Nothing in Task 1 proves that an existing database migrates without a rebuild and that its existing rows read `afwezig`. Task 10 depends on exactly that for the real copy.
- **Fix:** add one case to `packages/theatre/test/migrate.test.ts`.

## Note

- **N1.** The conflicten `id` formula's `1e12` and `1e6` are REAL literals in SQLite, so the ids come out as floats. Use `1000000000000` and `1000000`.
- **N2. The e2e database is shared.** It is one engine started with `--fresh` (`playwright.config.ts`, workers 1), and `step-3.spec.ts` runs after specs that assign Noor, Bram and Sam (for example `dagplanning.spec.ts:214-258, 600-673`; `step-0d.spec.ts`). The exact candidate list and "Noor's row on 10-14" can drift. Also, for onbevestigd, backdating `created_at` only works on an uitgenodigd row with no later `state` revision, because the rule reads the latest revision first. Pick such a row, or backdate `revision.at` too.
- **N3. Task 1 Step 4 runs only `bun test packages`.** The appended activity on 2026-10-12 and the open slot on activity 15 change e2e counts: `grid-ux.spec.ts:328/339/394…` (28/21/29), `step-1.spec.ts:261`, and the Nachtwacht matrix. These would only surface at Task 9's gate. Run the affected e2e specs in Task 1.
- **N4. Unflagged readings of the spec.**
  - locatie_dubbel: the spec says "from different speelreeksen" (`docs/SPEC.md` Conflict types). The plan adds "or different productions" and applies the untimed and logistics rules. Without the production clause, the seeded A-dubbel (no speelreeks) would not count.
  - afwezig: the spec's "on a day covered" becomes window overlap in the plan.
  - SPEC row 238 sources conflicten from a "persoon_dag self-join". The plan inverts this to avoid a cycle, which is fine.

  Say all three in Task 2.
- **N5. Task 8's hedge has an answer.** `i18n.ts:92` already uses `'{count} {label}'`. Use `badgeCount: '{count} {label}'` and keep the word "conflicten" out of the grid.
- **N6.** `kindCalendar` already exists (`i18n.ts:198`). Task 6 only needs to remove the block at `Rail.tsx:91`.
- **N7.** `taak refuses a status outside open, gedaan` needs `checkOption` in `taakWriter`; the engine does not check options (compare `organisatieWriter`). Task 1 Step 3 only says `forPlanners`.
- **N8.** The calendar's shown week or month has to live in `App.tsx`, because `window` is computed there (around line 270). This needs a ruling at execution time.
- **N9. The simplest-design paragraph holds.** The brief's gate does need the picker, the calendar and the badge. The seeded Kandidaten and Werklijst views go beyond R12 but are harmless.

## Premises checked

- Activities 1 (Gent 09:00–13:00), 2 (14:00–18:00), 4 (20:30), 13 (P2 10-12 10:00–17:00), 15 (P2 10-14 10:00–17:00 optie) → `packages/theatre/src/seed.ts` `slots` → holds
- The untimed activity is id 26, and the appended A-dubbel is 27 overlapping activity 1 at Gent with another production → `seed.ts` `untimed`, `VENUE_OF` → holds
- Toewijzing ids 1–6; Noor's absence on 10-14; Lotte's Studiedag until 10-12 12:00 (it also makes Lotte's new row on activity 13 afwezig, harmlessly) → `seed.ts` → holds
- The seeded candidates come out Lotte then Bram → by voorkeur and by id alike → holds, but proves nothing (B3)
- Relation columns to toewijzing are allowed → `validate.ts:161-168`, `SPEC.md:49` → does not hold (B1)
- New theatre names are clean for the vocabulary check → `scripts/check-vocabulary.ts` + `vocabulary-allow.txt` → does not hold (B2)
- `/rows` keeps a query's own order → `rows.ts:53-57` → does not hold (B3)
- The rows route filters a date window on `source.date` → `rows.ts:39-48`, `params.ts:130` → holds
- `calendar.day === date` for productie_dag, persoon_dag, locatie_dag → `queries.ts:10` (`date: 'plandag'`) and plan → holds
- Views are created in `domain.queries` order; conflicten before persoon_dag gives no cycle → `migrate.ts:66-87` → holds
- `revision.new` stores `'"uitgenodigd"'` → `writes.ts:493-514` (`asJson` = `JSON.stringify`) → holds
- Seeds write no revision rows, so backdating `created_at` works in unit tests → `migrate.ts:144-152` (`insertRows`) → holds
- `readRows` selects lookups only under scope `all` (`rows.ts:137`) → holds
- `resolveKey` (`filter.ts:36`), `orderOf` (`rows.ts:53`) and `servedLookups` (`app.ts:153`) are at the cited lines → holds
- `checkLookups` refuses owners at `validate.ts:214` → holds
- Lookup fixture `team` is owned and has a relation → `fixtures/lookup-domain.ts` → does not hold (S6)
- `parseGroup` already refuses lookups for owners → `params.ts:119-122` → does not hold (S5)
- `checkRates` exists and gives the 403 message → `theatre/src/writers.ts:259-264` → holds
- `ctx.exists` for uniqueness → `declare.ts` `WriteContext.exists` → holds
- Toewijzing lifecycle: any state → geannuleerd allowed, geannuleerd → bevestigd refused → `datasets.ts` toewijzing lifecycle → holds
- An owner gets 404 on sources without `owners` → `access.ts:59-67` → holds
- `soort` NOT NULL with a default is added by ALTER → `schema-diff.ts:81,90-95` → holds (untested, S8)
- `owner_writable` on `soort` passes `checkOwnerWritable` → `validate.ts:116-131` → holds
- `actionsOn` and `servedColumn` exist and need an actor for the `options_from` drop → `actions.ts:136`, `app.ts:106` → holds, as a modification
- Skins today are `table|matrix` → `views.ts:27,94-98`; `engine.ts:92,369`; `api.ts:302` → holds
- `FillPicker` and `OpenSlot.cell` → `Matrix.tsx:155`, `matrix/columns.ts:74-79` → holds
- `PanelDrawer` → `Matrix.tsx:543` → holds
- `shift`/`shiftMonth` → `ui/Window.tsx:28,48` → holds
- `openView`/`openWeek` → `e2e/tree.ts:14,30`; `writeDb` → `e2e/step-2.spec.ts:105` → holds
- lucide-react is a dependency → `apps/grid/package.json:17` → holds
- `e2e/smoke/` and `specs/CHECKS.md` exist → holds
- `ARCHITECTURE-INVARIANTS.md` → absent, so no invariant rows to check

## Coverage summary

- R1 has a task but its ordering is broken (B3).
- R2 is covered; group and history are missing (S5).
- R3 and R4 are covered.
- R5 is covered.
- R6's ALTER is untested (S8).
- R7 and R8 are covered.
- R9's afwezig exclusion and rate ranking are unproven (S1, S7).
- R10, R11 and R12 are covered.
- G: badge-clears is vacuous (S2), and the person calendar's all-day assertion cannot be met (S3).
- Every threat-model mitigation has a test row; mitigation 1 is incomplete (S5).
