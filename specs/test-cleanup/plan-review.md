# Plan review: test cleanup (re-review)
Reviewed-plan: 71b316fd554e7135f2cbadc426e72b1b7972cfbd
Verdict: ready with fixes

After this review (the author, 2026-10-17): Should fix 1–5 were applied, and the orchestrator's rulings were folded in. Those rulings are REWRITE scope (the named ones only) and Task 1.3 (dropped, its relation-beyond-page proof done). So were Notes 1–7 where they still applied; Note 2 went with Task 1.3. The plan is now blob 85e38151fd10ae0506f68adc5450640bc4ddb6a6. Nothing was Blocking, so it wasn't reviewed again.

All 3 Blocking and 9 Should fix findings from the last review are answered in the new text. Nothing is Blocking now. Three of those answers leave something behind (new Should fix 1–3), and one change introduced a contradiction (new Should fix 4). The previous blob 83ec3bda is not in this repo's object store, so I checked each old finding against the new text, not against a diff.

## Previous findings: resolved or not

**Blocking**
- **B1, T slice under Stryker:** resolved. The shared procedure's Prove step now has a second bullet for theatre, fiche and scripts tests (plan:66-68).
- **B2, wrong store.test file:** resolved. Task 4.4 now names `apps/grid/src/matrix/store.test.ts:163` and `:453` (plan:284); both lines hold.
- **B3, findAll test already exists:** resolved. Task 5.1 is now a check with no new test (plan:298-304). `writes.ts:240` and `actions.test.ts:350,357` hold.

**Should fix**
- **S1, after-run rule:** resolved. Undetected lists are compared, not the score (plan:73, RF5, Task 3.5). `mutation.ts:66-100` writes a per-module Undetected list in summary.md.
- **S2, two tasks owning one test:** resolved (5.3 → 3.4, 5.6 → 2.4). Leftover: new Should fix 1.
- **S3, E1 plain DELETEs:** resolved. Task 2.2 names all five. E1's only other plain DELETE is smoke/step-3f (E1:102), which Task 2.1 covers.
- **S4, two reconciled items:** resolved (plan:215-216). `Composer.test.tsx:7,34` renders `Dashboard`, and `Dashboard.tsx:96` shows the empty text.
- **S5, Task 1.3 seeding the wrong dataset:** resolved by the ruling; option (b) is gone.
- **S6, Task 1.6:** resolved by the ruling. Leftover: new Should fix 2.
- **S7, no threat model:** added. Leftover: new Should fix 3.
- **S8, Unit 5 files and commands:** resolved. Task 5.4 still has no line to break (Note 4).
- **S9, three wrong pointers:** resolved. RF2 → 2.3, 2.5, 3.4. declarations:201 is in 3.3. The step-0e plan cells at `step-0e-auth/plan.md:129-134` and `step-0e-datum/plan.md:59-60` hold.

**Notes:** 1, 2, 3, 4, 7 and 8 are taken up. Note 7 holds: `git diff a9d407f 8d3f517` touches only CHECKS.md, so a9d407f's 2402 s gate is main's code. Note 5 became "asked of the orchestrator" but left a contradiction (new Should fix 4). Note 6 (who merges) is unchanged.

## Blocking
None.

## Should fix

1. **Task 3.4, invite bullet (plan:251): one hand break for three guards.**
   - `record-link.ts:108-115` is `retireDelivered`, which rotates the link and revokes the action tokens. Only the revocation assertion (POST /act with the old token → 401 `bad_token`) goes red under it.
   - The service-account half is guarded at `writes.ts:564`: `if (actor.role === 'administrator' && (actor.kind ?? 'user') === 'user') return`.
   - The inbox echo is guarded at `writes.ts:563`: `if (values[column] === current[column]) return`.
   - Both sit in `checkLinkAddress` (attack 16). Under the planned break, the service-account 403 and the echo 200 never go red. That is the spot-check's failure shape, on a credential guard.
   - **Fix:** three breaks:
     - `writes.ts:564` for the service-account 403;
     - `writes.ts:563` for the echo 200;
     - `record-link.ts:112-114` for the 401.

2. **Task 1.6 Steps 3–4 (plan:162-163): the match rule is incomplete, and Step 4 would then "fix" rows that are correct.**
   - Playwright matches `--grep` against `_grepTitleWithTags()`: the project name, the file path, the describe titles, the test title and the tags, joined by spaces (`playwright/lib/common/index.js:2609-2614, 2831-2840`, applied at `lib/runner/index.js:6459-6465`).
   - It compiles the pattern with `forceRegExp`, case-insensitive `gi` unless written as `/…/` (`lib/util.js:152-157`).
   - The registry already relies on this. CHECKS:15 greps `"\sundo-changed-since @e2e"`. Its test, `step-1.spec.ts:365`, is top-level, so `\s` only matches the space after the file path. A matcher that reads the test title alone reports that row as stale.
   - The JSON reporter strips the `@` from tags (`lib/runner/index.js:4175`).
   - **Fix:**
     - Build the title the way `_grepTitleWithTags` does, with `forceRegExp`'s flags.
     - In Step 4, before editing any row the check names, run that row's own `bunx playwright test <file> --grep "<pattern>" --list`. If Playwright lists a test, the bug is in check-checks, not in the row.
     - Skip the two rows whose entry is `—` (CHECKS:146-147, tier auth).

3. **Threat model and Task 3.2 (plan:29-38, :240): the mitigation covers only EN1, and Task 3.2 doesn't carry it.**
   - The asset is "every guard on a route, a session, a scope or a token". Task 3.4 also removes owner-scope and token tests (`T-domain-scripts.md:43-47, 50, 66, 90, 100, 106, 112`):
     - access.test:54, :64, :84, :111;
     - apply.test:270;
     - invite.test:245;
     - person-pages:190;
     - step1.test:230;
     - step3-data:105;
     - step3c:56.
   - Task 3.2's steps say only "the shared procedure", and the shared Prove step asks for a red cover, not the guard's file:line.
   - **Fix:**
     - The mitigation reads "each removal of a test that pins a guard (EN1, and T's access, owner and invite rows) names its guard (file:line)…".
     - Tasks 3.2 and 3.4 each get one line: "name the guard (Threat model)".
     - RF6 points at 3.2 and 3.4.

4. **Unit 3 intro against Task 3.2 (plan:230 vs :240): a contradiction the change introduced.**
   - The intro says EN1's REWRITEs wait for the ruling and "only the named ones are done". Task 3.2 says "The REWRITEs as the report states them".
   - Task 3.3's declarations:201 is also a REWRITE (the spot-check's, `2026-10-16.md:59`), and it isn't among the "named ones".
   - **Fix:** Task 3.2 says "EN1's REWRITEs wait for the scope ruling". The intro's named list adds declarations:201 as a spot-check correction.

5. **Test map rows 1.2 and 1.5 (plan:347, :350) can't be run as written.**
   - Row 1.2 has only the fragment `--grep read-limit-cut`; row 1.5 has no command.
   - **Fix:** 1.2 becomes `bunx playwright test e2e/grid-ux.spec.ts --grep read-limit-cut`. 1.5 names the creating spec files and the scratch spec's command.

## Note

1. **Who merges, still open.** The Architecture line (plan:7) says "merged by the orchestrator"; `brief.md:69` says "I merge each unit". It's a one-word fix.

2. **Task 1.3 Files (plan:120) points at port lists that don't exist.**
   - The CHECKS.md header (CHECKS.md:1-7) lists no ports, the config has no port comment, and the repo has no port check.
   - The list workers actually read is the plan's own Global Constraints line (plan:26). Add 5176 there.
   - If Task 2.2 proves relation-beyond-page's removal, its Files should include `playwright.config.ts`, since the 1.3 note says the fifth server goes then.

3. **Task 1.5 pointers (plan:139).**
   - "Team e2e weergave" and "Eigen e2e weergave" are at `grid-ux.spec.ts:257-258`, and "Mijn planning" is at `step-0d:187`. `step-0d:217-241` holds only "Planning (kopie)". "Dubbel" is at :590, not :589.
   - `dagplanning.spec.ts:291-294` also makes a "Planning (kopie)"; its cleanup is at :204-206.
   - `dropViews` deletes only `mine` views (`tree.ts:82`), so "Collega e2e weergave" needs the colleague's own context.
   - The step already says "confirm each by reading".

4. **Task 5.4: the line to break.** The null path is `rows.ts:143` (`typeof id === 'number' ? … : undefined`). Returning `{ id, title: '' }` when `id === null` turns only the new test red; the dangling-relation test at `rows.test.ts:226` stays green.

5. **Engine mutation run count.**
   - Task 3.1 (before), Task 3.3 ("that module's rerun") and Task 3.5 (the reruns) make three full engine runs of about 71 min each. The Simplest design promises one before-run and one after-run, so say which run is the after-run.
   - The first clause of the T rule (plan:67) is empty for lines outside a MODULES file. Say "where those lines are in a MODULES file; otherwise the hand break alone".

6. **RF3 and plan cells.** RF3 (plan:44) credits Task 1.6 with checking plan cells, but 1.6 reads CHECKS only; plan cells are guarded by the Bookkeeping step. E1 finding 1 (`E1-e2e-early.md:286`) names plan cells that still say `period-is-a-filter`: `grid-toolbar/plan.md:62, :245` and `react-aria/plan.md:49`. Fixing them is one line in unit 1's report, if Stefan wants it.

7. **Task 1.6 Files** omits `package.json`, where the `check` script lives.

## Premises checked
- `webServer` is top-level config only → `playwright/types/test.d.ts:1049` is in `TestConfig` (878-2027); `TestProject` (111-759) has none → holds
- 5176 runs for the whole gate → web servers are set up by `createPluginSetupTasks` in `createGlobalSetupTasks` (`lib/runner/index.js:6321-6327`) for every run that isn't a list → holds
- List mode skips global setup and web servers → `lib/runner/index.js:6946-6948` (load task plus report-begin only) → holds
- `--list --reporter=json` prints JSON → `createReporters` allows json in list mode (`:5195-5203`); `JSONReporter.onEnd` writes to stdout with no outputFile (`:4052-4065`); `finishTaskRun` calls onEnd (`:6313`) → holds
- "the grep is a regex over the full title" → `_grepTitleWithTags` plus `forceRegExp` 'gi' (`lib/common/index.js:2609-2614, 2837-2840`, `lib/util.js:152-157`); CHECKS:15 depends on it → holds only partly (Should fix 2)
- A second grid server on 5176 can reach the engine → Vite proxies via ENGINE_URL (`vite.config.ts:6`); the write guard checks only `sec-fetch-site` (`write-guard.ts:23-25`); cookies ignore the port (`playwright.config.ts:34`) → holds
- relation-beyond-page has no file-level hooks and asserts limit 2 → `step-0d.spec.ts:302-327`, no top-level hooks → holds
- The config has four servers today and no `projects` → `playwright.config.ts:15-50` → holds
- Ports are listed in the CHECKS.md header or a port check → CHECKS.md:1-7; no port check found by grep → does not hold (Note 2)
- Template titles → `smoke/grid-ux:16`, `step-3e:46`, `title-line:35`, `focus-mark:44` → holds
- CHECKS:61 greps `period-is-the-period`; the old row was at :60 at 9320fba → holds
- Shared procedure: the summary has an Undetected list; engine is forced on a test-tree change; incremental file name → `scripts/mutation.ts:20, 35-55, 66-100` → holds
- No `reports/` in this worktree, so Tasks 3.1 and 4.1 run in full → holds
- Engine Stryker runs only packages/engine (T rule) → `packages/engine/stryker.config.json:3` → holds
- Grid incremental reruns a killed mutant, static ones included, whose killing test is gone → Stryker `incremental-differ.js:276-285, 309-316` → holds
- `store.ts` and the other module arguments match only MODULES entries → `mutation.ts:10-19, 105-106`; matrix/store.ts is not in MODULES → holds
- matrix `store.test.ts:163`, `:453` and `Matrix.test.tsx:512` → hold
- `MAX_FIND_ALL` at `writes.ts:240`; the 5000 and 5001 tests at `actions.test.ts:350, 357` → hold
- `DEFAULT_ENTRIES` at `history.ts:50`; `history.test.ts:157` asserts only entries=2 and bad values → holds
- `rows.test.ts:226` builds a dangling relation; the null path is `rows.ts:143` → holds
- `Board.tsx:74` `columns: lanes.length`; no test asserts it → holds
- R8's break at `writes.ts:296` `transition_lost`; act shares it (`action-token.test.ts:291`) → holds
- Task 3.4's `record-link.ts:108-115` reaches the service-account half and the echo → the guards are at `writes.ts:563-564` → does not hold (Should fix 1)
- `T-domain-scripts.md:220-226` holds the invite additions; `record-link.test.ts:376` is the attack-16 describe → holds
- declarations:201 is a REWRITE to "an unused tone ('grey')" → `2026-10-16.md:59` (the spot-check overrides EN2:28's DELETE) → holds
- `Composer.test.tsx:157` is the reconciled target and renders Dashboard; the text is at `Dashboard.tsx:96` → holds
- E2 timeline and calendar REWRITEs at `E2-e2e-step3.md:98-99, 242-252` → holds
- E1's plain DELETEs are only 0b and 0e, plus smoke/step-3f → `E1-e2e-early.md:42, 63-66, 102` → holds
- Step-0e plan cells → `step-0e-auth/plan.md:129-134`, `step-0e-datum/plan.md:59-60` → holds
- `public.test.ts:193` covers the owner-column strip → holds
- Ruling 3 asks for the netdust-gates lesson → `2026-10-16.md:94` → holds
- The gate before-figure is main's code → `git diff a9d407f 8d3f517` shows CHECKS.md only → holds
- Isolation item done → `step-0e.spec.ts:108-147`, with a finally at :139-145 → holds
- `bothThemes` at `ui-fit.spec.ts:64-72`; E2's replacement at `E2-e2e-step3.md:288` → holds
- read-limit-cut seeds through the API in a serial beforeAll; the assertion is at grid-ux:743; plandag is readonly and writer-derived (`theatre/src/datasets.ts:141`) → holds
- openWeek has 117 call sites; link builder at `App.tsx:458-464`; the landing template at `ui-fit.spec.ts:101-106` → holds
- The gate runs `scripts/*.test.ts` → `package.json` gate `bun test packages scripts` → holds

---

# The first review (blob 83ec3bda8dd29676034a901f6048354f04df6eec)

## 
Reviewed-plan: 83ec3bda8dd29676034a901f6048354f04df6eec
Verdict: not ready

There are three Blocking findings, and each one needs only a line or two in the plan. Unit 1 is buildable now apart from the 1.3 and 1.6 fixes below.

## Blocking

1. **The mutation check proves nothing for the T slice** (shared procedure, steps "Prove" and "Rerun the module"; Unit 3 intro; Task 3.4).
   - The plan says to run `bun run mutation -- <module>` before and after each removal, for every module in MODULES.
   - A theatre, fiche or scripts test never runs under Stryker:
     - `packages/engine/stryker.config.json:3` runs `bun test --bail` inside packages/engine only.
     - `scripts/mutation.ts:39` hashes `packages/engine/test` only.
     - `specs/mutation/2026-10-16.md:30-32` says it outright: "Theatre and fiche tests import the unmutated `@worktable/engine`, so they cannot kill an engine mutant."
   - So a T removal touching validate.ts or filter.ts gives identical before and after numbers and passes every time. That is the spot-check's failure shape.
   - **Smallest change:** add one rule to the shared procedure. A removed test outside `packages/engine/test` and `apps/grid/src` gets no before/after run. Its "the engine pins it" claim holds only if:
     - every mutant on the lines that behaviour runs is Killed in Task 3.1's quiet run, meaning it is not in the Undetected list; and
     - a hand break of the behaviour turns the named engine test red.

2. **Task 4.2 points at the wrong file** ("store.test:163 and :453 are rewritten here").
   - Those rows are `apps/grid/src/matrix/store.test.ts:163` ("reverts a refused cell … in the site's words") and `:453` ("asks once for the window's rows after a refusal …"). They are G3's rows (`G3-grid-skins.md:70,73`), not G1's.
   - `apps/grid/src/grid/store.test.ts` has other tests at those lines, so a worker would rewrite the wrong test.
   - **Smallest change:** move both rows to Task 4.4 with the matrix path. matrix/store.ts is not in MODULES, so the proof is a hand break.

3. **Task 5.1 writes a test that already exists** ("findAll's 5000 cap").
   - `packages/engine/test/actions.test.ts:341-364` ("ctx.findAll in an action", commit c4a2bb0, 2026-10-11) already covers it:
     - "reads every matching row, up to 5000";
     - "5001 matching rows refuse the action with 422, and nothing is written".
   - The audit missed it.
   - **Smallest change:** Task 5.1 becomes a check. Hand-break `MAX_FIND_ALL` (`packages/engine/src/writes.ts:240`), watch the 5001 test go red, and record the audit's claim as a wrong disposition. No new test.

## Should fix

1. **The after-run rule is weaker than the brief** (shared procedure "Rerun the module"; Tasks 3.5 and 4.5).
   - The brief says: "if the score drops or a mutant now survives".
   - The plan says: "no new survivor may name a line the removed test covered", and 3.5 checks the score only.
   - Two problems:
     - The engine has no per-test coverage (`specs/mutation/2026-10-16.md:39-42`), so "a line the removed test covered" can't be known there.
     - The moves in units 3–4 add kills, which can cancel a lost kill in the total score.
   - **Fix:** compare the Undetected lists in `reports/mutation/summary.md` before and after. Any mutant detected before and undetected after is a finding.

2. **Two tasks own the same test, twice.**
   - E1 R8 (the planner and person race, moved to `packages/theatre/test/toewijzing.test.ts`) is in Task 2.4 (R1–R9) and again in Task 5.6.
   - T's invite REWRITE in Task 3.4 is Task 5.3. `T-domain-scripts.md:220-226` already gives the exact additions to `record-link.test.ts:376`: service accounts, the inbox echo, and token revocation.
   - **Fix:** 2.4 and 3.4 own them. 5.6 and 5.3 become "done in 2.4 / 3.4; the hand break is recorded there".

3. **E1's plain DELETEs have no task.**
   - Task 2.2 covers "conflicts" only, so five rows have no home (`E1-e2e-early.md:42,63-66`):
     - step-0b json-charset-accepted;
     - step-0e undo-day-line-move (about 30 s);
     - undo-person-to-name;
     - clear-start-segment-by-segment;
     - undo-time-on-untimed-in-planning.
   - **Fix:** Task 2.2 becomes "E1's DELETEs and DELETE-CONFLICTs, steps 0a–0e".

4. **Task 2.5 leaves out two reconciled items.**
   - **The empty dashboard:** E2 moves the assertion into `Dashboard.test.tsx:167` (`E2-e2e-step3.md:328`). G3 deletes that test (`G3-grid-skins.md:166`). The reconciled target is `Composer.test.tsx:157` (`2026-10-16.md:75`).
   - **The "Iemand anders kiezen" shape per skin:** it covers E2's timeline and calendar REWRITEs (`E2-e2e-step3.md:98-99,242-252`) as well as Task 4.4.
   - **Fix:** one line in 2.5 for each.

5. **Task 1.3's option (b) seeds the wrong dataset.** It says "seed 5,001 people".
   - relation-beyond-page pages **Productie** (`e2e/step-0d.spec.ts:303,309,319`).
   - It also asserts `limit === '2'` and offsets in steps of 2 (`:324-326`), so option (b) has to rewrite those assertions too.
   - **Fix:** "5,001 producties; the limit and offset assertions become 5000 and [0, 5000]".

6. **Task 1.6 is a proposal, but other steps depend on it, and its design is flawed.**
   - Review Focus 3, the shared Bookkeeping step, 2.1 Step 3 and 2.7 all run "Task 1.6's check". If 1.6 is refused, none of them has a check to run.
   - If it is built, Step 3's static read of `test('…')` titles cannot resolve template titles: `e2e/smoke/grid-ux.spec.ts:16`, six more smoke files, `step-3e.spec.ts:46`, `title-line.spec.ts:35`, `focus-mark.spec.ts:44`. Step 4 would then "fix" rows that are correct.
   - **Fix:** use Playwright's own matcher, `bunx playwright test <file> --grep "<pattern>" --list`. List mode skips global setup and the web servers (`playwright/lib/runner/index.js:6946-6948`); one row took 2.2 s here. Name that command as the fallback if 1.6 is refused.

7. **The plan has no `## Threat model`.**
   - Task 3.2 removes up to 40 tests in the access, auth and security slice (EN1). The audit's top finding was a guard that no test reached.
   - **Fix:** add a short threat model. Each EN1 removal names its guard (file:line) and the kept test that goes red when that guard is broken. Its mitigation points at Task 3.2's Prove step. This also makes security-sentinel run at review.

8. **Unit 5 steps and its Test map row can't be run as written** ("the writer context's file", "the file's command"). I checked these in the source:
   - 5.2: `history.test.ts:157` is *named* "default 50" but only asserts `entries=2` and bad values. Break `history.ts:50`.
   - 5.3: `record-link.test.ts:376` covers the editor only. Break `record-link.ts:108-115`.
   - 5.4: `rows.test.ts:226` builds a dangling relation, not a null one.
   - 5.5: break `Board.tsx:74` (`columns: lanes.length`); no test asserts `columns`.
   - 5.6: `packages/theatre/test/toewijzing.test.ts`; break `writes.ts:296`.
   - **Fix:** put the files and the `bun test <file>` / `bunx vitest run <file>` commands in the steps and the Test map row.

9. **Three pointers in the plan are wrong.**
   - Review Focus 2 points at "2.3, 3.3, 3.4". owner-denied-queries is handled in 2.5, and 3.3 holds none of the chains. It should read 2.3, 2.5, 3.4.
   - `declarations.test:201` is EN2's (`packages/engine/test/declarations.test.ts:201`, `EN2-engine-shapes.md:28`) and sits in validate.ts's mutation module. It belongs in 3.3, not 3.4.
   - Task 2.2 lists `specs/step-0e/plan.md`, which doesn't exist. The step-0e plan cells are in `specs/step-0e-auth/plan.md:129-134` and `specs/step-0e-datum/plan.md:59-60`.

## Note

1. **A simpler route for 1.3.** relation-beyond-page is itself a DELETE-CONFLICT (`E1-e2e-early.md:56`). Its cover is `apps/grid/src/api.test.ts:210-225`, which already pins page size 2 with offsets 0/2/4. Add option (c) to the question in Step 1: leave it to Task 2.2. If the delete is proven there, the env setting goes and no second server or seed is needed.
2. **Task 1.5 widens the brief.**
   - The brief names only "Planning (kopie)". The plan adds three more names; that is reasonable after a9d407f, but flag it the way 1.6 is flagged.
   - Other leftovers stay: grid-ux's "Dubbel e2e weergave" (:589), "Reeksen e2e hernoemd" (restored at :318-323), and "Collega e2e weergave" (:623, made by another account).
   - step-0e makes none of the four (its PATCH at :113 is refused).
   - A stronger Step 2 proof: after the creating specs run, no own non-seeded view is left.
3. **Task 1.1 has a template.** `e2e/ui-fit.spec.ts:101-106` already lands by `#view=<id>&f=`. Resolve the view by name *and* source (model label to source via /api/schema), because names repeat across models: "Per persoon per dag" is both a view and a model. There are 117 call sites, not 118.
4. **Finding the culprit in a batch.** If an after-run shows a new survivor, apply that one mutant by hand and run each removed test with `-t "<name>"`. That avoids splitting the batch across several full validate.ts runs of about 49 minutes each.
5. **REWRITE scope needs a ruling.** For units 3–4 the brief names only invite, import-cli, lookups:92, person-pages:204, Matrix:512 and matrix/store. Task 3.2 adds EN1's REWRITEs. Tasks 3.3, 3.4 and 4.x don't say whether EN2's 9, T's other REWRITEs or G1–G3's 42 are in scope.
6. **Who merges.** The brief says "I merge each unit" (`brief.md:69`). The plan says the orchestrator merges.
7. **The 1.7 baseline isn't recorded.** "a9d407f, 40 min" is not written anywhere in the repo. Cite its source or measure it.
8. **Rows found by line number.** Where a slice row gives only a line at 9320fba, read the test name with `git show 9320fba:<file>`. store.test, group.test, Board.test, drop.test, links.test, toewijzing.test and writer.test have all shifted since.

## Premises checked
- `openWeek(page, view, model, field, monday, span = 6)` → `e2e/tree.ts:30-37` → holds
- "118 call sites" → 117 calls → does not hold (trivial)
- The link holds `view=<key>&f=<layout filters>` → `apps/grid/src/ui/App.tsx:458-464`; key = `String(view.id)` → `apps/grid/src/engine.ts:403` → holds
- GET /api/views lists the seeded views with ids → `packages/engine/src/views.ts:301-322` → holds
- The landing consumes `f` → `App.tsx:296-310` → holds
- read-limit-cut seeds by API in a serial beforeAll/afterAll → `e2e/grid-ux.spec.ts:711-740` → holds
- `writeDb(sql, ...params)` → `e2e/db.ts:5-12` → holds (it returns changes(), not ids; the assertion at `grid-ux:743` must change)
- `VITE_RECORDS_PAGE_SIZE: '2'` → `playwright.config.ts:29` → holds; default 5000, set at build time → `apps/grid/src/api.ts:200` → holds
- Option (b) "people" → `e2e/step-0d.spec.ts:303-326` (Productie) → does not hold
- `bothThemes` → `e2e/ui-fit.spec.ts:64-72`; `shot` returns without SHAKEOUT_SHOTS → `e2e/shots.ts:5-7` → holds
- step-0e leak fixed → e21a06a, a9d407f; `dropViews` → `e2e/tree.ts:78-84` → holds; "Planning (kopie)" left by `step-0d.spec.ts:217-241` → holds
- CHECKS:61 greps `period-is-the-period` → `specs/CHECKS.md:61` → holds
- Module names and argument passing → `scripts/mutation.ts:10-19,121-122`; `bun run x -- a b` forwards the args (tested) → holds
- Incremental file path and forced engine reruns → `scripts/mutation.ts:37-48` → holds; this worktree has no `reports/` → holds
- Grid incremental reruns a killed mutant whose killing test is gone → Stryker `incremental-differ.js:276-286,309-316` → holds
- Before/after mutation judges theatre, fiche and scripts tests → `packages/engine/stryker.config.json:3`, `mutation.ts:39`, `specs/mutation/2026-10-16.md:30-32` → does not hold
- "After recheck" column → `specs/mutation/2026-10-16.md:11` → holds
- store.test:163/:453 are G1's → `apps/grid/src/matrix/store.test.ts:163,453` → does not hold
- `Matrix.test.tsx:512`; validate.test:133, engine migrate.test:273, rank.test:46 → hold
- Chains: `rail-tree.spec.ts:28`, `seed-missing.test.ts:282,293`, `step-3.spec.ts:462`, `step3-queries.test.ts:435` → hold
- board-drag `step-3e:153`; conflict-band-negeren `step-3f:1105`; choose-other `:1230,1256,1290`; `smoke/step-2.spec.ts:15` → hold
- Tests added since 9320fba → git diff: writer-creates.test.ts, slot-split.spec.ts, focus-mark.spec.ts → holds
- SPEC:349 and :351–354 are the acceptance rows; SPEC:53 cap; SPEC:62 entries default 50 → `docs/SPEC.md` → hold
- findAll cap untested → `packages/engine/test/actions.test.ts:341-364` → does not hold
- entries default untested → `history.test.ts:157-166` → holds
- Service-account address rule and revocation untested in the engine → `record-link.test.ts:376+` (`:172` is the record-links route) → holds
- Board onShown columns untested → `Board.tsx:74`, no assertion on `columns` → holds
- `transition_lost` 409 → `packages/engine/src/writes.ts:296` → holds
- declarations.test:201 is T's → `packages/engine/test/declarations.test.ts:201` → does not hold
- `specs/step-0e/plan.md` holds Test-map cells → the file doesn't exist → does not hold
- Gate before-number of 40 min → not recorded in the repo → unverified

## Incident during this review
To locate the Playwright package I ran a `find /` over the whole filesystem by mistake. It ran from about 17:41 to 17:46 CEST, when I killed it. That is the same incident the G2 auditor caused. Rerun any gate or timing result that fell in that window.
