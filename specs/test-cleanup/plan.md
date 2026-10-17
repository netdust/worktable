# Test cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry out the 2026-10-16 test audit's approved dispositions in five units: harness speedups, the e2e slices, the engine and domain slices, the grid slices, then the missing tests. No test goes without proof that a cheaper tier still pins its behaviour.

**Architecture:** Each unit is its own commit group on `feature/test-cleanup`, ends with the gate run alone, and is merged by the orchestrator before the next starts. Within a unit, each task applies one slice's dispositions for one area, in a fixed order: prove the cover, move the assertions RED→GREEN, delete, then rerun the cover. The slice reports hold the dispositions. This plan holds the order, the proofs and the bookkeeping, and never copies a disposition.

**Tech Stack:** Bun test (packages, scripts), Vitest + jsdom (apps/grid), Playwright (e2e and smoke), StrykerJS (`bun run mutation`), SQLite.

**Spec:** `specs/test-cleanup/brief.md`, with Stefan's rulings in `specs/test-prune/2026-10-16.md` ("1 completion, 2 remove, 3 collapse, 4 yes"). The dispositions are in the slice reports under `specs/test-prune/2026-10-16/`. The mutation baseline is `specs/mutation/2026-10-16.md`.

## Global Constraints

- No product code changes, except where a test proves a defect. Then stop and report to the orchestrator before fixing anything.
- Ruling 1: a step's browser acceptance test may go only once a cheaper tier provably pins its behaviour. Its CHECKS row and its plan Test-map cell are edited in the same commit. Every SPEC acceptance line that names a browser flow (SPEC:349, :351, :352, :353, :354) keeps at least one e2e.
- Ruling 2: dead production code and its tests stay in this feature. The UI-architecture feature removes them: the site's own words (`setStrings`), the time kind, the unserved field types, prefs, ViewPanel.
- Ruling 3: @smoke collapses to three tests: the sign-in page, the record-link headers (smoke/step-2), and one API probe.
- Ruling 4: mutation testing decides "covered by" for unit and integration removals.
- No test goes on the audit's word alone. 1 claim in 20 was refuted, and 7 in 20 needed an assertion moved.
- The audit read `9320fba`. Find every row by its test name, never by its line number. Where a row gives only a line, read the name with `git show 9320fba:<file>`: store.test, group.test, Board.test, drop.test, links.test, toewijzing.test and writer.test have all shifted since. A row whose test has changed or gone since is re-judged, and the result recorded as a wrong disposition.
- Chains: a behaviour pinned at two tiers never loses both sides. The report's Reconciled section lists the known chains.
- Leave alone the tests added after the audit: `writer-creates.test.ts`, `e2e/slot-split.spec.ts`, `e2e/focus-mark.spec.ts`, and the bezetting, slot-split and focus-ring additions in existing files.
- Gates, e2e suites and Stryker runs are heavy. Each runs alone, only after the orchestrator books the turn with laika, and after a `ps` check for other projects' playwright, ddev and phpunit. Single-file bun or vitest runs are fine at any time.
- Before rerunning anything after a red run, copy `test-results/` out, or give the run its own `--output`.
- Ports: e2e uses 4311/5174/4312/5175; scratch servers use 4371/5197.
- Commit by path, never `git add -A`. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No merge, no push.

## Threat model

The cleanup removes tests from the access, auth and security slice (EN1). The audit's top finding was a guard no test reached: the owner-column strip on public views, since covered by public.test.ts:193.
- **Assets:** every guard on a route, a session, a scope or a token: whatever decides who reads or writes what.
- **Attack:** a removal leaves a guard that no kept test reaches. A later change then breaks it with the suite still green.
- **Mitigation:**
  - each removal of a test that pins a guard names that guard (file:line) and the kept test that goes red when it is broken by hand. That covers EN1, and T's access, owner and invite rows: access.test:54, :64, :84, :111, apply.test:270, invite.test:245, person-pages:190, step1.test:230, step3-data:105 and step3c:56;
  - the commit message records the break and the red run;
  - the Prove step of Tasks 3.2 and 3.4.
- **Deferrals:** none. A guard with no kept test keeps the removed test.

## Review Focus

1. **A "covered by" that never reaches the edge case** (the spot-check's failure shape). Every removal's commit names the break and the red run of the cover. A reviewer checks the break hit the removed test's own edge, not something near it. → every unit 2–4 task, step "Prove".
2. **A chain losing both sides** (dagplanning-is-gone ↔ seed-missing:282/:293; owner-denied-queries ↔ step3-queries:435; grid-ux.test :76/:190/:204 and step1:400 ↔ seed-missing:293). → Tasks 2.3, 2.5, 3.4.
3. **A CHECKS row or plan cell left pointing at a deleted test**, a registered check that runs nothing (as CHECKS:60 did). → Task 1.6 adds `bun scripts/check-checks.ts` to `bun run check` for the CHECKS rows. The plan cells are guarded by the shared Bookkeeping step.
4. **A SPEC browser acceptance line left with no e2e.** → Task 2.6 maps each of SPEC:349–354 to a kept e2e.
5. **A mutant detected before a removal and undetected after**, in a module the baseline covers. Moves can add kills that hide a lost one in the total score, so the lists are compared, not the score. → Tasks 3.x and 4.x, step "Rerun the module".
6. **A guard left with no kept test** (EN1, and T's access, owner and invite rows). → the Threat model, Tasks 3.2 and 3.4.

## Simplest design

The simplest design deletes what the slice reports mark DELETE, in one pass per tier. It doesn't use that, because Stefan's rule is that no test goes on the audit's word, and the spot-check showed why. What it adds is the proof step per removal, so the cost is runs, not code.

The mutation runs are batched per module. One rerun before a module's batch, on a quiet box, and one after, instead of one per test. A grid module's incremental run reuses every result whose covering tests didn't change, so its after-run is short. An engine module runs whole (the command runner sees no tests), so its removals are batched to keep it to one before-run and one after-run.

## First working version

Task 1.1 (openWeek straight to the view) is first. It is the one change everyone feels at once, and it is measured on one spec before and after.

## Shared procedure for units 2–4 (one task = one slice area)

Every removal follows these steps, in this order. Each task's own steps refer to them.

- **Locate:** list the task's rows from the slice report: test name, disposition, cover named, assertions to move. Find each by name in the current tree. A row that no longer matches is re-judged, and the result recorded.
- **Prove:**
  - **unit or integration, removed test in `packages/engine/test` or `apps/grid/src`:** for a module in `scripts/mutation.ts`'s MODULES, run `bun run mutation -- <module>` before the batch, on a quiet box. If the module's test tree changed, delete `reports/mutation/<slug>.incremental.json` first. Keep that run's `reports/mutation/summary.md` Undetected list. For a module outside MODULES, break the behaviour by hand: the named cover must go red.
  - **removed test outside those two trees** (theatre, fiche, scripts): Stryker never runs it. The engine stryker config runs `bun test` in packages/engine only, so it can't kill an engine mutant, and a before/after run would always match. Its "the engine pins it" claim holds only if:
    - where those lines are in a MODULES file, every mutant on them is Killed in the unit's quiet baseline, meaning absent from the Undetected list (outside a MODULES file, the hand break alone decides); and
    - a hand break of the behaviour turns the named engine test red.
  - **e2e:** break the behaviour by hand, run the covering test(s), and see them go red. Keep the break's diff and the red run's output for the commit message.
- **Move:** each assertion the report says to move goes to its new seam first. It goes RED with the behaviour broken by hand, then GREEN.
- **Delete:** the test, then the support code that goes dead with it (the report's "support code" list), but only where nothing else uses it.
- **Rerun the module:**
  - **unit or integration:** the same `bun run mutation -- <module>`. Compare the Undetected list with the before-run's: any mutant detected before and undetected after is a finding. Put the test or its assertion back, and record the disposition as wrong.
  - To find which removal let a mutant survive without another full run, apply that one mutant by hand and run each removed test with `-t "<name>"`. A full validate.ts run takes about 49 min.
  - **e2e:** the cover passes, and the unit's spec file passes alone.
- **Bookkeeping:** CHECKS rows and plan Test-map cells for every e2e removed, in the same commit. Then run Task 1.6's check.
- **Commit:** one commit per area. The message names each removal, its cover, the break and the red run, and any disposition that was wrong.

---

## Unit 1: harness speedups, deleting no test

The brief's isolation item is done: e21a06a and a9d407f, step-0e's copy and its cleanup. The stale CHECKS row (`period-is-a-filter`) is fixed on main: CHECKS:61 now greps `period-is-the-period`. Both get a line in the unit report, no task.

### Task 1.1: openWeek goes straight to the view

**Files:**
- Modify: `e2e/tree.ts` (`openWeek`, 117 call sites)

**Interfaces:**
- Produces: `openWeek(page, view, model, field, monday, span = 6)`. The signature and behaviour are unchanged: the view opens on the week, with its own other conditions kept and the date condition set to "ligt tussen" monday..monday+span.

- [ ] **Step 1: Time it before.** Run `bunx playwright test e2e/step-3e.spec.ts --output=<scratch>/t-before` (it calls openWeek on most flows) and record its wall time. This needs a booked turn.
- [ ] **Step 2: Implement.**
  - Read the view's key and conditions without the menu: GET /api/views for the id and the stored filters. Resolve the view by its name *and* its source (the model label to the source via /api/schema), because names repeat across models: "Per persoon per dag" is both a view and a model.
  - Build the same `#view=<id>&f=…` hash that "Link kopiëren" builds (`apps/grid/src/ui/App.tsx:458-464`; the key is `String(view.id)`). `e2e/ui-fit.spec.ts:101-106` already lands this way. Read the app's link builder to see how a stored filter becomes a link condition (R10's catch).
  - Then `page.goto('/#…')`, reload, and the same final poll that the `f` param is consumed.
  - If a stored filter can't be expressed in the link format without reimplementing the app's converter, open that view through the old path and only the rest directly. Record which views took the old path.
- [ ] **Step 3: Prove.** Run step-3e and dagplanning alone. Both must pass.
- [ ] **Step 4: Time it after.** Run step-3e as in Step 1, and record the time saved.
- [ ] **Step 5: Commit.** `git add e2e/tree.ts`. The message carries the before and after times.

### Task 1.2: read-limit-cut seeds its 5,001 rows in one SQL statement

**Files:**
- Modify: `e2e/grid-ux.spec.ts` (read-limit-cut and read-limit-cut-bar-and-foot: the seeding and its cleanup)
- Use: `e2e/db.ts` `writeDb(sql, ...params)`

- [ ] **Step 1:** Replace the 101 API batches each way with one `INSERT … SELECT` over a recursive CTE, and one `DELETE` in the cleanup. Use the rows' own columns, so the read cap is still what bites. The rows go to the engine's database file directly, as `db.ts` already does, so no writer runs: fill every column the activiteit writer derives (`plandag` among them) exactly as an API create would. Check this by comparing one SQL row with one API-made row. `writeDb` returns `changes()`, not ids, so the assertion at grid-ux:743 changes with it.
- [ ] **Step 2:** Run both tests alone (booked): they pass, and the counts still read `5000+ rijen · 2 groepen`.
- [ ] **Step 3:** Commit, with the before and after duration of the two tests.

### Task 1.3: dropped (orchestrator, 2026-10-17)

The ruling pulled relation-beyond-page's proof forward, and both conditions held. So relation-beyond-page goes in Task 2.2, and `VITE_RECORDS_PAGE_SIZE: '2'` leaves `playwright.config.ts` with it. No second grid server, no port 5176.
- **Hand break:** `apps/grid/src/api.ts` `everyRow`, with `offset: String(all.length)` changed to `String(0)`. `bunx vitest run src/api.test.ts -t "pages with offset until the total"` went red, and green again once restored. The filter's Productie picker reads `records()`, which is `everyRow`.
- **SPEC:** none of the acceptance lines (SPEC:349–356) names relation paging, an offset, or a picker beyond its first page.

### Task 1.4: bothThemes returns at once outside a shake-out

**Files:**
- Modify: `e2e/ui-fit.spec.ts` (`bothThemes`)

- [ ] **Step 1:** Make `if (!process.env.SHAKEOUT_SHOTS) return` the first line of `bothThemes`.
- [ ] **Step 2:** Run ui-fit alone (booked), then once with `SHAKEOUT_SHOTS=<scratch>` to see the shots still taken. Record both times.
- [ ] **Step 3:** Commit.

### Task 1.5: the gate's leftover views (wider than the brief, which names only "Planning (kopie)": reasonable after a9d407f, flagged)

**Files:**
- Modify: the specs that leave their own views behind. The gate's four:
  - "Team e2e weergave" and "Eigen e2e weergave" (grid-ux.spec.ts:257-258);
  - "Mijn planning" (step-0d:187);
  - "Planning (kopie)" (step-0d:217-241, and dagplanning:291-294, whose cleanup is at :204-206).

  The reviewer also found grid-ux's "Dubbel e2e weergave" (:590), "Reeksen e2e hernoemd" (restored at :318-323), and "Collega e2e weergave" (:623, made by another account). `dropViews` deletes only `mine` views, so that one needs the colleague's own context. step-0e makes none of them. Confirm each by reading.
- Use: `dropViews(page, names)` from `e2e/tree.ts`

- [ ] **Step 1:** For each creator, add the rule a9d407f set. Drop its own leftovers through the API first, as a precondition. Delete what it made in a finally.
- [ ] **Step 2: Prove.** Run the creating specs, then list `/api/views` (a scratch spec, untracked and deleted after). No own view that the seed didn't make is left, under any account. Record the list before and after.
- [ ] **Step 3:** Commit.

### Task 1.6: a check that every CHECKS entry runs a test

Ruled (orchestrator, 2026-10-17): build it. A registered check that runs nothing is an incident (CHECKS:60), and an incident lands as a gate tier.

**Files:**
- Create: `scripts/check-checks.ts`
- Modify: `package.json` (`check` script)
- Test: `scripts/check-checks.test.ts`

**Interfaces:**
- Produces: `bun scripts/check-checks.ts` exits 1 and names the row when a CHECKS entry's file and `--grep` match no test. Units 2–4 run it after every deleting commit.

- [ ] **Step 1: Write the failing test.**
  - A fixture registry with CHECKS:60's old line (`--grep "period-is-a-filter @e2e"`) is reported.
  - A fixture entry whose grep matches nothing is reported.
  - An entry that matches a test is not reported.
- [ ] **Step 2:** Run `bun test scripts/check-checks.test.ts`. It fails: the module doesn't exist yet.
- [ ] **Step 3: Implement** on one `bunx playwright test --list --reporter=json` call. List mode skips global setup and the web servers.
  - Match each CHECKS entry's file and `--grep` against the listed tests the way Playwright does. `_grepTitleWithTags` joins the project name, the file path, the describe titles, the test title and the tags with spaces (`playwright/lib/common/index.js:2609-2614`). `forceRegExp` compiles the pattern case-insensitive `gi`, unless it's written as `/…/` (`lib/util.js:152-157`).
  - The registry depends on this. CHECKS:15 greps `"\sundo-changed-since @e2e"`, and its `\s` matches only the space after the file path.
  - The JSON reporter strips `@` from tags, so add it back.
  - Don't parse the specs with regexes: template titles (e.g. smoke/grid-ux:16, step-3e:46, title-line:35, focus-mark:44) only resolve in the list.
  - Skip rows whose entry is `—` (CHECKS:146-147, tier auth).
- [ ] **Step 4:** The test passes, and `bun scripts/check-checks.ts` passes on the current CHECKS.md.
  - If it names a row, first run that row's own `bunx playwright test <file> --grep "<pattern>" --list`. If Playwright lists a test, the bug is in check-checks: fix the script, not the row.
  - Rows that are stale today are fixed in this commit and listed.
- [ ] **Step 5:** Commit.

### Task 1.7: close unit 1

- [ ] **Step 1:** Ask the orchestrator to book the gate. Run `bun run gate` alone, and copy `test-results/` out if anything fails.
- [ ] **Step 2: Report.**
  - Tests and lines removed: none.
  - Gate time before and after. The before-figure is the last gate on main's code: a9d407f, 16:52:09–17:32:11 on 2026-10-17, 2402 s, as reported to the orchestrator.
  - Each task's measured saving.
  - Any disposition found wrong.
  - The plan cells that still say `period-is-a-filter` (grid-toolbar/plan.md:62, :245; react-aria/plan.md:49), fixed in a docs commit in this unit with the stale-row line.

---

## Unit 2: e2e slices E1 and E2

Rows come from `E1-e2e-early.md` and `E2-e2e-step3.md`: the DELETE-CONFLICTs under ruling 1, the REWRITEs (R1–R11 and E2's), and the smoke collapse under ruling 3. Each task follows the shared procedure, with the e2e proof.

### Task 2.1: the smoke collapse (ruling 3)

**Files:** `e2e/smoke/*.spec.ts`, `specs/CHECKS.md` (the @smoke rows)

- [ ] **Step 1:** Write R11's single sign-in-page test. It checks lang nl, IBM Plex, the referrer and robots meta, the two CSS tokens, no Sakani markup, the page's own colours, and the sign-in button going from disabled to enabled. Keep smoke/step-2's record-link headers test (the spot-check). Keep one API probe; pick it from E1's smoke rows and name why.
- [ ] **Step 2: Prove.** Break each property the collapsed tests checked, one at a time, by hand, and see the new test go red. Then delete the other smoke tests.
- [ ] **Step 3:** CHECKS: one @smoke row per kept test, with the rest removed. Run Task 1.6's check.
- [ ] **Step 4:** Commit. Also propose the netdust-gates lesson ruling 3 asks for, as a note in the unit report, not a file.

### Task 2.2: E1's DELETEs and DELETE-CONFLICTs, steps 0a–0e

**Files:** `e2e/step-0a…0e.spec.ts`, `specs/CHECKS.md`, the plans' Test-map cells (`specs/step-0a…0d/plan.md`; step-0e's are in `specs/step-0e-auth/plan.md:129-134` and `specs/step-0e-datum/plan.md:59-60`)

- [ ] **Steps:** the shared procedure, e2e proof, for each row of E1's step-0a…0e DELETEs and conflicts. The plain DELETEs among them: step-0b json-charset-accepted; step-0e undo-day-line-move, undo-person-to-name, clear-start-segment-by-segment and undo-time-on-untimed-in-planning.
  - relation-beyond-page (step-0d) goes with the proof Task 1.3 records. The same commit removes `VITE_RECORDS_PAGE_SIZE: '2'` from `playwright.config.ts` and edits specs/step-0d/plan.md:67, :73, :76.
  - One commit per spec file.

### Task 2.3: E1 DELETE-CONFLICTs, steps 1, 2 and 2b and the early features (dagplanning, rail-tree, react-aria's E1 rows)

**Files:** the named specs, CHECKS, the plans' cells

- [ ] **Steps:** the shared procedure. **Chain:** rail-tree dagplanning-is-gone ↔ seed-missing.test:282/:293. Delete at most one side; Task 3.4 decides the other with this task's result in hand.

### Task 2.4: E1 REWRITEs (R1–R9) and the dead helpers

- [ ] **Steps:** each REWRITE as the report states it, RED→GREEN at its seam.
  - R8, the concurrent planner and person race, moves to `packages/theatre/test/toewijzing.test.ts`. Its hand break is `packages/engine/src/writes.ts:296`, and the 409 `transition_lost` test must go red. This is also the brief's unit-5 item.
  - Delete the helpers E1 lists as dead, only once nothing imports them.

### Task 2.5: E2 DELETE-CONFLICTs and REWRITEs (step-3 to 3f, grid-ux, react-aria, toolbar, ui-fit)

- [ ] **Steps:** the shared procedure. The spot-check's corrections apply:
  - **board-drag:** its three extra assertions move first: a keyboard drop into the left-hand column stored as 'optie'; ⌘Z after a mouse drop on a sorted board; every card's right edge inside its column.
  - **conflict-band-negeren** folds into conflict-choose-other's board run: Negeren, close with Sluiten, reopen from the card, the band is back.
  - **read-limit-cut-bar-and-foot:** its tfoot assertion moves into read-limit-cut, then the test goes.
  - **Chain:** owner-denied-queries ↔ step3-queries.test:435. Delete at most one side.
  - **The empty dashboard:** the assertion E2 would move into Dashboard.test:167 goes to `Composer.test.tsx:157`, the reconciled target. G3 deletes Dashboard.test:167.
  - **"Iemand anders kiezen" per skin:** E2's timeline and calendar REWRITEs (E2-e2e-step3.md:98-99, 242-252) take the per-skin shape: each skin's component test asserts the band's two buttons with `places` wired. Task 4.4 does the board's.

### Task 2.6: SPEC acceptance lines keep their e2e

- [ ] **Step 1:** For each of SPEC:349, :351, :352, :353 and :354, name the kept e2e test that drives it, in the unit report. If one has none, a removal in 2.2–2.5 is undone.

### Task 2.7: close unit 2

- [ ] **Steps:** run Task 1.6's check. The gate alone, booked. Report tests and lines removed, the gate time before and after, and the wrong dispositions.

---

## Unit 3: engine and domain slices EN1, EN2 and T

REWRITE scope (orchestrator, 2026-10-17): only the named ones. For this unit that's invite, import-cli, lookups:92 and person-pages:204, plus declarations:201 (the spot-check's correction). Every other REWRITE (EN1's, EN2's other 8, T's others) is listed as deferred in the unit report, with one reason each.

Rows come from `EN1-engine-access.md`, `EN2-engine-shapes.md` and `T-domain-scripts.md`. The mutation arbiter covers `filter.ts`, `filter-compile.ts` and `validate.ts`. Removals touching other engine modules are proven by a hand break. The spot-check's KEEPs stand: validate.test:133, migrate.test:273 and rank.test:46.

### Task 3.1: the quiet-box baselines

- [ ] **Step 1:** Booked, on a quiet box, rerun `bun run mutation -- filter.ts filter-compile.ts validate.ts` in this worktree. It has no incremental cache, so the run is full. Record the scores against specs/mutation/2026-10-16.md's "after recheck" column. The results are this unit's before-numbers.

### Task 3.2: EN1 (access, auth, security)

- [ ] **Steps:** the shared procedure. Most of EN1's modules are outside MODULES, so hand breaks. Name each guard (Threat model). EN1's REWRITEs are deferred by the scope ruling.

### Task 3.3: EN2 (shapes, migrations, rows, views, writes)

- [ ] **Steps:** the shared procedure. Rows in filter.ts, filter-compile.ts and validate.ts take the mutation proof. Task 3.1 is the before-run. The after-run is Task 3.5's single rerun once all of unit 3's engine removals are in, not one rerun per task, since a full engine run takes about 71 min. The validateDomain rule: a "passes validation" test goes only where its own file's setup migrates the same object.
  - declarations.test:201 becomes one assertion that an unused tone ('grey') validates. It's EN2's, in validate.ts's module.

### Task 3.4: T (theatre, fiche, scripts), and the REWRITEs that move into packages/engine/test

- [ ] **Steps:** the shared procedure.
  - The four REWRITEs move first, each RED→GREEN in packages/engine/test: invite, import-cli, lookups:92, person-pages:204.
  - invite carries T-domain-scripts.md:220-226's additions to `record-link.test.ts:376`: service accounts, the inbox echo, and token revocation on an address change. This is also the brief's unit-5 item. It takes three hand breaks, one per guard:
    - `writes.ts:564`, so the service-account 403 goes red;
    - `writes.ts:563`, so the echo 200 goes red;
    - `record-link.ts:112-114`, so the revocation 401 goes red.
  - Name each guard (Threat model).
  - **Chains:**
    - seed-missing:282/:293, against Task 2.3's result;
    - grid-ux.test :76/:190/:204 and step1.test:400, which lean on seed-missing:293;
    - step3-queries:435, against Task 2.5's result.

### Task 3.5: close unit 3

- [ ] **Steps:** the mutation reruns of Task 3.1's modules (booked). Compare the Undetected lists with the before-runs: no mutant detected before may be undetected after. Then the gate alone (booked), and the report.

---

## Unit 4: grid slices G1–G3

REWRITE scope (orchestrator, 2026-10-17): only Matrix.test:512 and matrix/store.test:163/:453. G1–G3's other REWRITEs (about 42) are listed as deferred in the unit report, with one reason each. The ones that touch code the UI-architecture feature rewrites or removes (setStrings, the time kind, ViewPanel, the prefs stub, Workspace's state) wait for that feature.

Rows come from `G1-grid-core.md`, `G2-grid-ui.md` and `G3-grid-skins.md`. The mutation arbiter covers `store`, `group`, `columns`, `rank` and `drop`. The tests that stay until the UI-architecture feature (ruling 2): setStrings, the time kind, ViewPanel and prefs.

### Task 4.1: the quiet-box baselines

- [ ] **Step 1:** As Task 3.1, for `store.ts group.ts columns.ts rank.ts drop.ts`.

### Task 4.2: G1 (grid core)

- [ ] **Steps:** the shared procedure.

### Task 4.3: G2 (grid ui)

- [ ] **Steps:** the shared procedure. Leave the setStrings and ViewPanel and prefs tests.

### Task 4.4: G3 (skins)

- [ ] **Steps:** the shared procedure.
  - Matrix.test:512 and `apps/grid/src/matrix/store.test.ts:163` and `:453` are rewritten to the server's message (the spot-check). matrix/store.ts is not in MODULES, so the proof is a hand break.
  - rank.test:22, :28 and :37 stay DELETE-CONFLICT, so they're proven before they go. rank.test:46 stays.
  - The "Iemand anders kiezen" per-skin shape: each skin's component test asserts the band's two buttons with `places` wired.

### Task 4.5: close unit 4

- [ ] **Steps:** as Task 3.5, for the grid modules.

---

## Unit 5: the missing tests the audit found

Each is new, written RED→GREEN, or proven by a hand break where the code already does the right thing. "RED" here means: break the code by hand, see the new test fail, then restore the code.

### Task 5.1: findAll's 5000 cap (SPEC:53): a check, no new test

`packages/engine/test/actions.test.ts:341-364` already covers it ("reads every matching row, up to 5000"; "5001 matching rows refuse the action with 422, and nothing is written"). The audit missed it.
- [ ] **Steps:**
  - Hand-break `MAX_FIND_ALL` (`packages/engine/src/writes.ts:240`).
  - Run `bun test packages/engine/test/actions.test.ts` and see the 5001 test go red.
  - Restore. Record the audit's claim as a wrong disposition.

### Task 5.2: `entries` defaults to 50 (SPEC:62)

- Test: `packages/engine/test/history.test.ts`. :157 is *named* "default 50" but only asserts `entries=2` and bad values.
- [ ] **Steps:**
  - GET /history with no `entries` answers at most 50 entries when 51 exist.
  - Hand-break the default (`packages/engine/src/history.ts:50`), and the test goes red.
  - `bun test packages/engine/test/history.test.ts`

### Task 5.3: the service-account half of the record-link address rule, and token revocation: done in Task 3.4

- [ ] **Steps:** none here. Task 3.4 records the hand break.

### Task 5.4: a literal null relation's lookup on /rows

- Test: `packages/engine/test/rows.test.ts`. :226 builds a dangling relation, not a null one.
- [ ] **Steps:**
  - /rows serves the lookup as null for a row whose relation column is null.
  - Hand-break the null path: `rows.ts:143` (`typeof id === 'number' ? … : undefined`), returning `{ id, title: '' }` when `id === null`. Only the new test goes red; the dangling-relation test at rows.test:226 stays green.
  - `bun test packages/engine/test/rows.test.ts`

### Task 5.5: Board onShown columns ("· N kolommen")

- Test: `apps/grid/src/board/Board.test.tsx`. No test asserts `columns` today.
- [ ] **Steps:**
  - onShown reports the columns shown.
  - Hand-break `Board.tsx:74` (`columns: lanes.length`), and the test goes red.
  - `bunx vitest run src/board/Board.test.tsx` in apps/grid

### Task 5.6: concurrent planner and person writes give 409 at the theatre tier: done in Task 2.4 (E1 R8)

- [ ] **Steps:** none here. Task 2.4 records the hand break.

### Task 5.7: close unit 5

- [ ] **Steps:** the gate alone, booked, and the report.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| 1.1 openWeek | e2e/tree.ts | e2e · step-3e, dagplanning · `bunx playwright test e2e/step-3e.spec.ts` | every openWeek caller |
| 1.2 read-limit seed | grid-ux read-limit-cut | e2e · grid-ux · `bunx playwright test e2e/grid-ux.spec.ts --grep read-limit-cut` | read-limit-cut, read-limit-cut-bar-and-foot |
| 1.3 page size | dropped: relation-beyond-page goes in 2.2 | unit · apps/grid/src/api.test.ts · `bunx vitest run src/api.test.ts` (the proof, done) | — |
| 1.4 bothThemes | ui-fit | e2e · ui-fit · `bunx playwright test e2e/ui-fit.spec.ts` | the six ui-fit flows |
| 1.5 leftovers | the creating specs | e2e · `bunx playwright test e2e/grid-ux.spec.ts e2e/step-0d.spec.ts e2e/dagplanning.spec.ts`, then the scratch spec `bunx playwright test e2e/0-views-list.spec.ts` (untracked, deleted after) | as named |
| 1.6 CHECKS check | scripts/check-checks.ts (one `playwright test --list`) | unit · scripts/check-checks.test.ts · `bun test scripts/check-checks.test.ts` | — |
| 2.x e2e slices | each spec's flows | e2e · the cover spec · hand break, then red run | the removed flows' covers |
| 3.x engine and domain | the routes and writers named per row | unit/integration · packages/*/test · `bun test <file>`; `bun run mutation -- <module>` | — |
| 4.x grid | components and stores per row | unit · apps/grid/src/**/*.test.ts · `bunx vitest run <file>`; `bun run mutation -- <module>` | — |
| 5.1 findAll cap | writer ctx findAll | integration · packages/engine/test/actions.test.ts · `bun test packages/engine/test/actions.test.ts` (check only) | — |
| 5.2 entries default | GET /history | integration · packages/engine/test/history.test.ts · `bun test packages/engine/test/history.test.ts` | — |
| 5.4 null lookup | GET /rows | integration · packages/engine/test/rows.test.ts · `bun test packages/engine/test/rows.test.ts` | — |
| 5.5 Board onShown | Board component | unit · apps/grid/src/board/Board.test.tsx · `bunx vitest run src/board/Board.test.tsx` | — |
| 5.3, 5.6 | owned by 3.4 and 2.4 | — | — |
