# Plan review: views-and-actions (round 3, scoped)
Reviewed-plan: 296e145cd8228d0b41ced6d4bdf33633071a123f specs/views-and-actions/plan.md
Verdict: not ready

The plan fixes every round-2 finding. One new premise is false, though. Moving `gone_views` out of the tiles fixes the unknown-key refusal, but the engine also refuses a tile whose view has been deleted. I also found two unnamed red tests, a destructive edge in the R11 write-back, and one sub-case of R5 that nothing covers. Each fix is a line or two in the plan.

## Round 2, finding by finding
- **B1 resolved.** All engine text is now English (plan :42, :59, :290-291), in the same style as `seed-missing.ts:144, 156, 209`. I ran `scripts/check-vocabulary.ts --root` on a scratch file holding the two report lines, "a seeded view stays shared", and the new identifiers (`seed_key`, `keySeeded`, `lockedSeed`, `gone_views`, `locked`). Studio was resolved through a scratch copy, because the worktree's `node_modules` does not link `@worktable/studio`. Result: exit 0, no domain word. The baseline engine also passes.
- **S1 resolved.** The plan calls `useRunFollower(models)` in Workspace (plan :185). Workspace is at `App.tsx:186`, `models` at :389 and the work column at :673. There is a hook-order caveat (N1).
- **S2 resolved.** The `shared` refusal now sits after `ownedView`, inside the write (plan :59, :83; `views.ts:345-352`). The grid sends `shared` only for your own views (`ViewList.tsx:47,51`) and never from the Composer (`Composer.tsx:197`).
- **S3 resolved in intent.** `useLayout` writes the fitted layout back (plan :326). With the `known` set as written, that write-back can destroy data (S3 below).
- **S4 resolved.** `columns.ts:204` is in Task 6 (plan :63, :351).
- **S5 resolved.** The Ruling (plan :53) keeps `seed-missing.ts:168-177`. I traced `:154-167`, `:169-181`, `:183-189` and `:191-197`: all stay green.
- **S6 resolved.** `keySeeded` writes no revision. I traced `:199-218` (`:216`), `:270-280`, `:282-291`, `:302-310` and `views.test.ts:484-503`, and the named changes and greens hold. `views.test.ts:305-336` passes with `keySeeded(fresh, declared)`: it keys `later` but not `onPerStatus` or `undeclared`.
- **S7 resolved.** "Link kopiëren" and "Link gekopieerd" match `i18n.ts:85-86`. I spot-checked the e2e citations and they hold: `step-2.spec.ts:718-720`, `step-1.spec.ts:194, 341`, `step-2.spec.ts:208`, `ui-fit.spec.ts:414`, `step-0c.spec.ts:89-91`, `action-inputs.spec.ts:146`, `selection-domain.ts:62-77`.
- **S8 resolved.** One step needs a second site (N3).
- **S9 resolved.** The plan now cites `views.ts:350` and adds the denial test (plan :76, :110).
- **N1, N2, N3, N5, N6, N8, N9 resolved.** N2's "Nothing else" claim misses the dashboard's drawer (S4). The citations for N3 and N5 drifted (N2 below).
- **N4 partly resolved.** See B1.
- **N7 ruled, not confirmed.** See N4 below.

## Blocking

**B1. A dashboard tile naming a deleted view fails at the engine, so "the Composer's save of that dashboard is accepted" cannot pass.**
- **Plan:** Task 4, Interfaces (:284), and Step 1, R10a (:300-301).
- **Source:**
  - A PATCH re-validates the whole stored layout: `views.ts:348` → `viewBody` → `dashboardFields` → `layoutOf` (`views.ts:202`).
  - Every tile goes through `viewNamed`, whose `LISTABLE` requires `deleted_at IS NULL` (`dashboard.ts:55-56, 59-64`). It throws 400 `bad_view` "a tile names no view N".
  - The Composer sends that layout back unchanged (`Composer.tsx:197`).
  - The refusal shows as raw English. `errorText` passes `bad_view` through (`i18n.ts:444-446`), and the Composer puts it on screen (`Composer.tsx:199-202`). That breaks the rule "No English string reaches the screen".
  - The Composer labels the gone tile `#<id>` (`Composer.tsx:63`), not "Weergave verwijderd".
- **Realistic case:** R14 removes "Alle sites". A team copy of the dashboard that still names it can then no longer be saved from the Composer.
- **Smallest change:** a Ruling plus one test. Either option works:
  - (a, grid only, no access change) The Composer leaves out the tiles whose view is in `gone_views` when it saves, and labels them "Weergave verwijderd" until then. The Task 4 test becomes "a PATCH whose layout no longer holds the gone tile is accepted".
  - (b) The PATCH keeps, without re-validating, only those tile view ids that the stored layout already names and that are soft-deleted. Add the denial test "a PATCH adding a tile on a deleted view is 400".

## Should fix

**S1. `packages/theatre/test/migrate.test.ts:79` turns red, and the plan does not name it.**
- After the migrate, every table's rows, minus `added[n]`, must equal the rows before it (`:75-88`).
- `added.saved_view` is `['for_owners', 'layout']`. The new `seed_key` column then appears on the step-1 fixture's system views (`fixtures/step-1.sql:251-258`), and `keySeeded` keys the declared ones.
- **Fix:** add `'seed_key'` there, list the test in Task 4 Step 4, and add the file to Test map row 1's command.

**S2. `e2e/step-3c.spec.ts:346-388` (composer-team-dashboard) turns red, and it would leave its change in the shared theatre database.**
- As administrator, theatre's seeded Overzicht becomes `editable`.
  - The Rail then shows "Dashboard verwijderen" (`Rail.tsx:72`), so `:356` fails.
  - The Composer saves in place, because `target = dashboard.editable ? dashboard : team` (`Composer.tsx:194-197`). No copy appears, so `:372-373` fails.
- The `finally` deletes only new dashboards (`:383-386`). The "e2e tegel" tile therefore stays on the seeded Overzicht for every later test (`:382`).
- **Fix:** name the test in Task 5 and rewrite it to the R8 rule: in-place save, deletable. Restore the seeded layout in the `finally`.

**S3. The R11 write-back persists drops of valid column ids.**
- **Plan:** `known` is "the model's field, lookup and link ids" (:325), and `useLayout` writes the fitted layout back with `storeLayout` (:326).
- **Source:** column and layout ids also include:
  - `title` (`columns.ts:230`);
  - `lookups.<field>.<name>` (`:247`);
  - `rollups.<key>` (`:257-259`);
  - the matrix's `record:`/`name:` hidden ids (`ui/views.ts:50, 56`).
- `storeLayout` then overwrites the kept matrix hidden list (`ui/views.ts:75`). One fit loses a person's hidden matrix columns, or a title sort, for good.
- **Fix:**
  - Set `known` to the ids of `columnsFor(model, view)`, and pass every `isMatrixKey` id through untouched.
  - Add the test "a matrix view's hidden record: column and a title sort survive the fit".
  - Add `App.tsx:266`, `useLayout`'s only caller, to Task 5's Files.

**S4. R5's "an open drawer" is not met on the dashboard.**
- **Plan:** "Nothing else" (:195).
- **Source:**
  - `Dashboard.refresh` re-reads only the tiles (`Dashboard.tsx:40-43`).
  - The dashboard's drawer holds its own `opened` row (`:48, :119`). It is re-read only after a press inside it (`:58-64`).
  - A site's drawer opened from a list tile therefore stays stale when the run ends.
- **Fix:** Dashboard's `ended` effect also re-reads `opened` with `rowOf`, as `Grid.tsx:333-341` does. Add one case to `runs.test.tsx`.

## Note

- **N1. Hook order in Workspace.**
  - The counts effect (`App.tsx:351-360`) and the rows effect (`:364-387`) come before `models` (`:389`).
  - Putting `runs.ended` in their dependency arrays is a TS2448 "used before its declaration" error.
  - **Fix:** say that one `ended` effect placed after `useRunFollower` calls `reloadView` and re-reads the counts.
- **N2. Paths and names that drifted.**
  - QuickCreate is `dashboard/QuickCreate.tsx`, not `ui/` (plan :139).
  - `useOpenRow` is `grid/useOpenRow.tsx` (:139).
  - The DrawerSlot lines are `App.tsx:219, 628, 717`, not `:220, 738`.
  - "Gezondheid checken" is `studio/src/actions.ts:43`, not `:29`.
  - The worker helper is `studio.spec.ts:33-37`.
  - The Files table says `RunsProvider`, while Interfaces say `Runs.Provider`/`useRunFollower`. Pick one name.
- **N3. The S8 move needs a second site.** `studio.spec.ts:190` ticks testmans-winkel. "Sites met aandacht" lists voorbeeld-blog, testmans-bestel and oud-archief (`:145-148`). Tick testmans-bestel instead, and its drawer site line follows.
- **N4. Round-2 N7 is ruled but not flagged.** The lock-mark Ruling (:58) still departs from R9's letter. Mark it in the plan as "Stefan to confirm".
- **N5. Ruling :54 cannot arise.** `keySeeded` keys live rows only (:52), so two rows never share one `seed_key` "from before this branch". It is harmless; drop it or reword it.
- **N6. The R10a dropped-tile report line has no text.** Write it in English beside the two "left alone" lines.
- **N7. "ViewOut gains no field" (:311) versus `gone_views` (:284).** Say that `gone_views` is present only on a dashboard. Then `views.test.ts:338-361`, which compares a table view with `toEqual`, stays green as claimed.
- **N8. Reading `seededIds` by `seed_key` drops today's fallback.**
  - Today, a tile resolves to another owner's shared view with the seed's name (`dashboard.ts:211-212`).
  - Ruling :53 keeps exactly that case "present".
  - Such a tile would now fail seeding, against R10a's "never fails".
  - It is rare. Rule whether the fallback stays for tiles.
- **N9. A copy can still send a stale key.** `duplicate` from ViewList on a view that is not on screen reads `currentOf` of a stored copy that was never fitted (`useSavedViews.ts:182-184`). It can still send a stale sort and get 400 (`views.ts:181`). This is an edge case; accept it or fit inside `currentOf`.

## Premises checked
- `lockedSeed` internal, no `ViewOut` field; `editable` from it → `views.ts:82-95`; `ui/views.ts:40-44`; `ViewList.tsx:31,51,55` → holds. `outOf` and `ownedView` gain a `domain` parameter, and every caller is in `views.ts` (`:310, :331, :347, :362, :369`).
- `gone_views` beside the layout; the Composer sends back only `{layout}` → `Composer.tsx:197`; `dashboard.ts:35-36` → holds.
- A layout naming a deleted view saves → `dashboard.ts:55-64`; `views.ts:202, 348` → does not hold (B1).
- `useRunFollower(models)` in Workspace with `Runs.Provider` → `App.tsx:186, 389, 673` → holds; ordering → N1.
- The create wrap → `grid/hooks.ts:31-35`, called from `App.tsx:398`; `store.ts:225-230, 438-441` → holds.
- `createThrough` already has the row → `App.tsx:436-443`; `api.ts:289-293` (returns `Saved` with the row) → holds.
- Both QuickCreates can pass the row → `dashboard/QuickCreate.tsx:84, 97-99`; `App.tsx:719-725`; `Dashboard.tsx:122-125` → holds.
- `finished` reads created rows with `rowOf` → `api.ts:315-318, 342-353`; `engine.ts:454-465` carries `available` → holds.
- `waiting(row)` via the primary button → `studio/datasets.ts:129, 132, 136`; `actie_site` declares no `live` (`:171-191`) → holds.
- The dock as a portal slot → `SidePanel.tsx:24, 30, 76`; `App.tsx:219, 628, 717` → holds.
- `useLayout` writes the fitted layout back → `grid/hooks.ts:10-25`; `ui/views.ts:67-69, 73-76, 86-88, 121-122` → holds as a mechanism; `known` → does not hold (S3).
- `columns.ts:204` prints "Nee" for null → holds. `react-aria.spec.ts:675` asserts false, not null → stays green.
- `keySeeded` writes no revision and keys live rows only → `migrate.ts:107, 112, 116-132` → holds. Tests: `seed-missing.test.ts:216, 279, 290` and `views.test.ts:498-503` stay green; `:270-280, 282-291, 302-310` turn red as named; `views.test.ts:305-336` holds with `keySeeded`.
- `testEngine` runs no migrate → `sign-in.ts:16-28` → holds.
- The shared-name present rule → `seed-missing.ts:162-178` → holds; tests `:154-167`, `:183-189` stay green.
- English report lines and the English 400 message → `seed-missing.ts:144, 156, 193, 209, 220`; `check-vocabulary.ts:10-21, 66-74`, run → passes.
- The seed and the migrator write as -1 → `seed-missing.ts:127, 154, 199-206`; `migrate.ts:112` → holds.
- A forged `seed_key` is ignored → `views.ts:207-215, 277-281, 295-299` → holds.
- `dashboard.test.ts:227-231` turns red as named; `:422-439` and `:448-454` stay green; `:441-446` stays green → holds.
- `views.test.ts:135-152` (`:142`), `:169-174` and `:338-361` hold; signIn defaults to editor (`sign-in.ts:56-60`).
- `theatre/test/seed-missing.test.ts` traced: the ordering by `seed_key` and "removed, no longer declared" hold.
- `theatre/test/migrate.test.ts:79` → red, unnamed (S1).
- `e2e/step-3c.spec.ts:346-388` → red, unnamed (S2).
- Studio e2e citations: `:145-148`, `:190-192`, `:204` ("Volgt live" stays beside the spinner), `:206-207`, `:222`, `:259`, `:269-271`, `:303`, `:373`, `:556`, `:600`, `:647-648`, `:828-850`, `:171`, `:221-227`, `:58`, `:83` → hold.
- `Dashboard.tsx:40-47, 123` → holds; the dashboard drawer is not re-read → S4.
- `useSavedViews.ts:19, 206-211` → holds; `Composer.tsx:194-197` with the seeded dashboard editable → S2.
- `ARCHITECTURE-INVARIANTS.md` → absent → no invariant check applies.

Verdict: not ready. B1 needs one Ruling and its test line. S1–S4 are a named test each, plus one interface line for `known` and one for the dashboard drawer.
