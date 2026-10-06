# Plan review: step-0e, second round (seven plans, one parent spec)
Reviewed-plan: 04304c900b6b737f90da37366e2ccfd27af81f8b specs/step-0e-migrator/plan.md
Reviewed-plan: aa553287f7c950a15a7ffa8992bc96e8501040ed specs/step-0e-vocabulary/plan.md
Reviewed-plan: 7689b1fb404280eb02cd4d1fd9e83956380f3578 specs/step-0e-auth/plan.md
Reviewed-plan: de1ebba2db204aa08d40e318bdab73af80415d75 specs/step-0e-import/plan.md
Reviewed-plan: 973ce7a3654378702ec9f1eb86ee94c645415438 specs/step-0e-laika-export/plan.md
Reviewed-plan: ef77a3cdc7f2739feaf4bb45576b07b4ed7ffc15 specs/step-0e-atelier-view/plan.md
Reviewed-plan: b55faccb273a1f9a0b64877ebeef783a0d145d71 specs/step-0e-baseline-release/plan.md
Verdict: not ready

**Why:** one Blocking finding remains, in the Laika exporter. Two of its fixes clash:
- the B1 fix chose `origin/main` plus atelier `^0.9.1` as the base;
- the S2 fix relies on Polylang and `LAIKA_SOURCE_LANGUAGE`, and neither exists on `origin/main`.

The rest of the set:
- **Ready:** migrator, vocabulary, baseline.
- **Ready once the small Should-fix items are in:** auth, import, atelier-view.

## Blocking

**NB1. The exporter's base has no Polylang, so "only the source language" cannot run.** (laika-export, "Repository and branch" l.19 and Decisions l.25)
- **What the plan says:**
  - The branch comes from origin's `main`, plus "the same `composer.json` change staging carries from `feature/company-profile` (9d15e46): atelier `^0.9.1` and ntdst-baseline `^2.13`, line for line".
  - "Only records in `LAIKA_SOURCE_LANGUAGE` are exported … through Polylang (`pll_get_post`)."
- **What the source says:**
  - On `origin/main`, `web/app/mu-plugins/laika-core/` holds only `labels.php`, `laika-core.php`, `plugin-config.php` and `timezone.php`. There is no `languages.php`, so `LAIKA_SOURCE_LANGUAGE` and the `pll_get_post_types` filter are not defined.
  - `git grep "LAIKA_SOURCE_LANGUAGE\|pll_" origin/main -- web/app/mu-plugins/laika-core` returns nothing.
  - `origin/main:composer.json` has no `wpackagist-plugin/polylang`. Staging adds it at l.66, with `languages.php` from 3b6c8a2 (feature/polylang-paths).
- **Consequences:**
  - Stefan's staging data, pulled into a DDEV running this branch, holds translated persons, organisations and productions, but Polylang's code is absent. Every language copy would be exported as a separate row, which is exactly S2.
  - The integration test's "one translated person" cannot be created either.
- **The "line for line, promote without conflict" claim also fails:**
  - 9d15e46's diff is from `^2.12`/`^0.6`, not from main's `dev-feature/select-labels as 2.8.0` / `dev-feature/performances as 0.3.0`.
  - Staging's hunk also changes `ntdst-core` (`^5.3`→`^5.4.1`) and adds the Polylang lines next to it. The two edits overlap without being identical, so a merge conflicts, and `composer.lock` certainly will.
  - atelier v0.9.1 requires `netdust/ntdst-core ^5.4` (its composer.json), so Task 0's "update both packages" also has to move ntdst-core.
- **Smallest change:** Stefan rules the base. One option: build the exporter on `origin/feature/company-profile`. It already holds atelier `^0.9.1`, ntdst-core `^5.4.1`, Polylang, `languages.php` and a matching lock. Another option: Task 0 merges that branch in, and the plan names that the exporter is stacked on it. Either way, drop the "line for line … without a conflict" sentence.

## Should fix

**SF1. Auth: the `/accounts` routes have no task.** (auth Decisions table l.45, l.74; attack 8 l.102)
- The permissions table, the accounts ruling and attack 8's mitigation all rely on `GET/POST/PATCH /accounts…`.
- No task lists them in Files or Interfaces, and no task tests them. Task 1's routes are only `/auth/request|consume|me|signout`.
- Task 4's `EXPECTED` would then name routes that do not exist.
- Smallest change, either of:
  - drop `/accounts` from the table, the ruling and attack 8 (the CLI is the 0e door);
  - or add them to Task 1's Interfaces, with denial tests: an editor gets 403, and a role or subject taken from a non-administrator body is refused.

**SF2. Auth: the e2e exception covers Task 1, but Tasks 2–4 are red too.** (auth Global Constraints l.81; Task 1 Step 4 l.195)
- The grid signs in only in Task 5, so the commits of Tasks 2, 3 and 4 also leave `bun run e2e` red.
- Smallest change: "Tasks 1–4 are the exception; Task 5 closes it."

**SF3. Auth: two new engine flags have no home.** (auth Task 5 l.292–293)
- `--cookie-name` and `--rate-limit-scale` appear only in the e2e bullet list.
- Task 5's Files do not touch `serve.ts`, `app.ts`, `auth.ts` or `rate-limit.ts`, and Task 1's `EngineOptions` (l.165) has neither option.
- Smallest change: add both to `EngineOptions` and to the Files of the task that builds them, with a test that the defaults are `wt_session` and 1. See N-a for dropping the scale flag altogether.

**SF4. Auth: the Test map row contradicts the S11 fix.** (auth Test map l.129)
- The row says "generated from `access.ts`'s table plus `app.routes`".
- Task 2 l.218 now says `EXPECTED` lives in the test, independently of `access.ts`.
- Smallest change: reword the row to "`EXPECTED` in the test file plus `app.routes`".

**SF5. Atelier-view: Laika's wiring test cannot load the class from the worktree.** (atelier-view Task 3 Step 2 l.157)
- `ddev composer test:int` runs inside the web container, which mounts only `/home/ntdst/Sites/laika`.
- `/home/ntdst/Sites/worktrees/atelier-worktable-view` is not visible there. The exporter plan needs a compose mount for the same reason (laika-export l.60).
- The test's second assertion ("an empty constant means … the empty state with no request") is also atelier behaviour, not Laika wiring.
- Smallest change:
  - Laika's test requires `plugin-config.php` and asserts `services.core` names `'Atelier\Worktable\WorktableService'` and `overrides['worktable']['engine_url'] === WORKTABLE_URL`, with no class loaded;
  - the empty-URL case moves to atelier's `WorktableViewTest`.

**SF6. Laika export: `--own` is missing from the command's interface.** (laika-export Task 2 Interfaces l.174)
- Goal l.7 and Decisions l.38 make `--own=<id>` required and refused when missing.
- Task 2's interface is `wp laika export-planning [--out] [--report] [--dry-run]`, and no test covers the refusal.
- Smallest change: add `--own=<id>` to the interface, and a denial test (missing `--own`, and an id that is not an organisation) to Task 2 Step 1.

## Note

- **N-a. Auth: a simpler e2e design without `--rate-limit-scale`.**
  - The e2e engines run `--fresh`, so the `rate_limit` table is empty on every run.
  - The e2e signs in at most about six times (four roles in global setup, plus the sign-in flow), under 20 per 15 minutes. The other specs reuse `storageState`.
  - A flag that multiplies every limit is a weakening of a security control that production can reach, and it is not in the threat model. Dropping it removes both the flag and the threat-model gap.
- **N-b. Import: three execution-time points for the parity script.**
  - **Session door.** Task 3 has the script read `/rows` "as that administrator". The only session helper is the test fixture's `signIn()`. Name the door: an exported engine helper that mints a session, or request and consume through the outbox.
  - **Paging.** `/rows` caps at `MAX_LIMIT = 5000` (`params.ts`), so the script must page by `total`.
  - **Legacy id 0.** The placeholder Productie's legacy id `0` must not be treated as falsy when relations are resolved.
- **N-c. Import: the year-boundary pair never produces W01.** (Review Focus 3)
  - 2026-12-31 (Thursday) and 2027-01-01 (Friday) are both in 2026-W53.
  - The pair does test the ISO-year trap. To also exercise W01, add 2027-01-04.
- **N-d. Laika export: the checks wording is looser than the contract.** Decisions l.52–53 say "activities per ISO week" and "per person … per mapped state". The import contract is per week per status, with name-only assignments under `"naam"`. Repeat both in `Checks` so the unit test pins them.
- **N-e. Laika export: where the command is registered.** Golden path l.109 says "registered through `plugin-config.php` like the site's other services". laika-core registers no service of its own: `plugin-config.php` lists only atelier classes, and there is no autoloader. Name it: `require_once` in `laika-core.php` and `WP_CLI::add_command` under the `WP_CLI` guard.
- **N-f. Both Laika plans `make feature` in the one Laika checkout.**
  - That checkout is on `feature/card`, and its atelier install is on `feature/card` too.
  - `make feature` switches it to a main-based branch, and `composer install` then moves the atelier install.
  - This contradicts atelier-view l.20 ("the checkout installed in Laika … is not switched"). The two Laika branches also cannot be worked on at once.
  - Say this, or use a Laika worktree.
- **N-g. Auth: the planner rename in code.** `packages/engine/test/views.test.ts:378` passes `role: 'planner'`. The `Actor['role']` union will force the rename. Name it in Task 1 so the spec's "planner disappears from code" has a line.
- **N-h. Atelier-view: the stop is still likely.** Task 4 now states the expected stop honestly (N1). The U6 browser gate will most likely move to the cutover. Tell Stefan when the plans are handed over.
- **N-i. Laika export: the bind mount.** If `~/laika-export` does not exist at `ddev restart`, Docker creates it owned by root. The plan's "Stefan creates it himself" should come before the restart in Task 3 Step 5.

## Prior findings

- **B1 — partly.** The base is now named (main plus atelier `^0.9.1`, planning models registered inside the command), and atelier v0.9.1 holds `services/planning/*`. The chosen base lacks what the S2 fix needs (NB1).
- **B2 — resolved.** `--own=<id>`, required, at Decisions l.38. Its interface entry is missing (SF6).
- **B3 — resolved.** dietary → Persoon `dietary` (l.43); `datasets.ts:110` declares it.
- **S1 — resolved.** Calendar date from `substr(start_at,1,10)`, per mapped status, plandag shifts reported but not failed, no-start at `T05:00`, and the `"naam"` key (import l.44–45; laika l.32).
- **S2 — not resolved in effect.** The rule is written (laika l.25), but it depends on Polylang and `LAIKA_SOURCE_LANGUAGE`, which are absent on `origin/main` (NB1).
- **S3 — resolved.** Placeholder `(zonder productie)`, title→`omschrijving`, location/place/notes→`locatie_id`/`plaats`/`notities`, `settled_by`→custom; the spec is corrected at l.163–167.
- **S4 — resolved.** `ntdst_data()->get(<post type>)` (l.26), the door `ActivityRepository` itself uses.
- **S5 — resolved.** The list is spec-scoped (vocabulary l.9); `email` is allowlisted in auth l.159, `legacy`/`post` in import l.52. The derived list I computed from theatre and fiche has no `plan` or `per`.
- **S6 — resolved.** `test` and `gate` both run `bun test packages scripts` (vocabulary l.63).
- **S7 — resolved.** Only `*.json` files are checked, by top-level key, in both repos (import l.57, laika l.63), with a test that a staged `import.ts` passes.
- **S8 — resolved.** An owner column changed on update is 403, tested with tables unchanged (auth l.47, Task 2 l.225).
- **S9 — resolved.** `public_view`: only an administrator may PATCH, DELETE or restore a public view (auth l.73, Task 3 l.251).
- **S10 — resolved.** `setTimeout(…, 0)`, with no write on the request path (auth l.67).
- **S11 — partly.** `EXPECTED` now lives in the test (l.218), but the Test map row still says it comes from `access.ts` (SF4).
- **S12 — resolved.** A fiche editor in global setup, `step-0c` uses it, and the cookie name is per instance (l.290–292). Its flag has no Files entry (SF3).
- **S13 — resolved.** The inversion of `writes.test.ts:169` is named (l.51, Task 2 l.227), and the Writer row is in the Task 6 list.
- **S14 — resolved.** Brain Monkey stubs on `render()` (atelier-view Test map l.119).
- **S15 — resolved.** The `core` list entry and the `overrides` key are in Task 3 (l.154). The test seam breaks inside DDEV (SF5).
- **S16 — resolved.** `owner_column_visible` on `PUT share-token`, and `owner_id` is never served (auth l.72, Task 3 l.252).
- **N1 — resolved.** Task 4 states the expected stop.
- **N2 — resolved.** Views are recreated whatever their hash says, foreign keys go back on in a `finally`, and the rebuild test has its own two-dataset domain (migrator l.30–31, l.114).
- **N3 — resolved.** The Simplest design cites the spec's ALTER mandate; storage-class retypes are noted (l.19, l.29).
- **N4 — resolved.** The test-side words are allowlisted or renamed (vocabulary l.28).
- **N5 — resolved.** `require_once`, a staging-only pull, WP_CLI stubs, PHP 8.3 (laika l.14, l.116–117). Where the command is registered is still vague (N-e).
- **N6 — resolved.** Step 0 checks the worktrees and states that pushing `archive/views-saved` publishes that branch for the first time; local `main` is handled with `branch -f`.
- **N7 — resolved.**
  - 401 and 429 are in `ApiError`.
  - The token is cleared with `replaceState` before the hash is written.
  - The proxy's shared address is addressed (by a flag; see N-a).
  - Concurrent consumes are tested on two connections.
  - A disabled account cannot consume.
  - The account is re-read on every request.
  - The draft mechanism is worded.
  - An administrator is in global setup.
  - A deleted view's token answers 404.
- **N8 — resolved.** `--create-admin` runs before `--import` (import l.17–18).

## Premises checked

- `migrate()` takes the per-source hash ledger and refuses a changed dataset; query views are `DROP VIEW IF EXISTS` + `CREATE VIEW` → `packages/engine/src/migrate.ts:36-48`, `ddl.ts` `viewDdl` → holds
- `datasetDdl` adds `id`, `custom`, `created_at`, `updated_at`, `deleted_at`, so the account table gets `created_at` → `ddl.ts:27-35` → holds
- Theatre has six datasets, all `custom: true`; `dietary`, `locatie_id`, `plaats`, `notities` exist; `productie_id` is NOT NULL; `plandag` and `weergavenaam` are readonly → `packages/theatre/src/datasets.ts` → holds
- No word in the derived list (dataset, query and column names split on `_`) is `plan` or `per`; it holds `email`, `start`, `state`, `site`, `status`, `type`, `default`, `parameters` → computed from theatre and fiche → holds
- Engine `src` hits are `default`, `site`, `status`, `type` → computed scan → holds (`per` is no longer a derived word, so harmless)
- `gate` runs `bun test packages` directly → `package.json` → holds (the plan now changes both scripts)
- `valuesOf` cuts readonly and undeclared keys before the writer; `revise()` makes a new batch per call; `storedOf` runs `inUse` before `writer.delete` → `packages/engine/src/writes.ts` → holds
- `writes.test.ts:169` asserts the writer's delete did not run on a 409 → `packages/engine/test/writes.test.ts:168-171` → holds
- `/rows` caps at 5000 per page; `from`/`to` filter on `substr(date,1,10)` → `params.ts` `MAX_LIMIT`; `rows.ts` `whereOf` → holds
- The theatre writer computes plandag at `DAY_LINE_HOUR = 5`; Toewijzing refuses both a person and a name, and a duplicate pair → `packages/theatre/src/writers.ts` → holds
- Seeded Toewijzingen and Afwezigheden are dataset table views; Planning filters `bevestigd` → `packages/theatre/src/seed.ts:114-198` → holds
- "planner" survives in code → `packages/engine/test/views.test.ts:378` → holds (N-g)
- Playwright runs fiche on 4312/5175 → `playwright.config.ts` → holds
- `docs/SPEC.md` Writer row says "checked before the writer's own delete"; Storage has `legacy_post_id` and the migrator → `docs/SPEC.md:45,111` → holds
- Laika `make feature` branches from `origin/main` → `Makefile.netdust:161` → holds
- 9d15e46 carries atelier `^0.9.1` / baseline `^2.13` and is on `feature/company-profile` and `staging` → `git show 9d15e46` → holds
- "Same change, line for line, no conflict on promote" → 9d15e46's diff is from `^2.12`/`^0.6`, main has `dev-feature/*` and ntdst-core `^5.3`, and staging also edits the adjacent lines → does not hold
- Staging's lock has atelier v0.9.1 and baseline v2.14.0 → `origin/staging:composer.lock` → holds
- atelier v0.9.1 has `services/planning/{Activity,Assignment,Absence}{Model,Repository}`, `PlanningService` calling `*Model::register()`, and `shared/models/{Person,Organisation}Repository` → atelier `git ls-tree v0.9.1` → holds
- atelier v0.9.1 requires `netdust/ntdst-core ^5.4` → `v0.9.1:composer.json` → holds (main has `^5.3`)
- `LAIKA_SOURCE_LANGUAGE` / Polylang on the exporter's base → `origin/main` laika-core has no `languages.php`, composer.json has no Polylang → does not hold
- Activity fields date, start, end, kind, status, production, performance, location, place, settled_by, notes; assignment fields person, name, status, note; absence fields person, from, to, reason → `ActivityModel.php:41-51`, `AssignmentModel.php:36-40`, `AbsenceModel.php:32-35` (v0.9.1) → holds
- A missing service class in plugin-config gives `_doing_it_wrong` and is skipped → ntdst-core `specs/core-trim/plan.md:144` → holds
- atelier `origin/main` is v0.9.1; `services/` is in its classmap; Brain Monkey is a dev dependency; the unit bootstrap has no WordPress → atelier `composer.json`, `tests/bootstrap.php` → holds
- PerformanceService's YOOtheme guard is at `after_setup_theme` → `PerformanceService.php` ~l.61-68 → holds
- Laika has `config/application.php` and `.env.example` on main → `git ls-tree origin/main` → holds
- DDEV mounts only the project, so the atelier worktree is not visible to `test:int` → `.ddev/config.yaml`; worktree path outside the project → holds (SF5)
- Baseline: `origin/main` 3ced762 is an ancestor of v2.15.1, 10 commits back; no `services/views`; `feature/views` 5439c70, `-saved` 7efef97 (not on origin), `-matrix` d884568; local `main` is 51788ac; worktrees `-views` and `-saved` exist; `composer gate` exists → git in `/home/ntdst/Sites/ntdst-baseline` → holds

## The cut

- `step-0e-migrator` → one feature
- `step-0e-vocabulary` → one feature
- `step-0e-auth` → one feature. It is large, but everything shares the actor and session boundary.
- `step-0e-import` → one feature, carrying worktable's half of the staged-export guard.
- `step-0e-laika-export` → one feature. If Stefan rules NB1 by building on `feature/company-profile`, the plan should say it is stacked on that branch. That is a base, not a dependency between plans.
- `step-0e-atelier-view` → one feature across two branches in two repos (atelier plus a Laika wiring branch). Acceptable once the wiring test stands on its own (SF5).
- `step-0e-baseline-release` → one feature
- No spec requirement is unowned, and none is owned twice.

---

# Round 1 (kept for the record)

Verdict: not ready

Why: all three Blocking findings are in the Laika exporter plan. Migrator and baseline are ready. Vocabulary, auth, import and atelier-view are ready once their fixes are in.

## Blocking

**B1. The exporter's branch base has no planning repositories.** (laika-export, "Repository and branch" l.16, Architecture l.8, Tech Stack l.12)
- The plan says: `make feature name=worktable-export` "branches from origin's `main`" and then "reads through atelier's repositories (`ActivityRepository`, `AssignmentRepository`, the absence repository …)", on "atelier 0.10".
- The source says otherwise:
  - `/home/ntdst/Sites/laika/Makefile.netdust:161` runs `git checkout -b "feature/$(name)" origin/$(BR_PROD)`, and `site.yml` has production `branch: main`.
  - On `origin/main`, `composer.json` pins `"netdust/atelier": "dev-feature/performances as 0.3.0"`. Atelier's `origin/feature/performances` holds only `services/performance` and `services/production`: no `services/planning`, so no Activity, Assignment or Absence repository.
  - `\Atelier\Planning\PlanningService` is in the plugin-config `core` list only on `feature/planning-model`, `feature/views-saved` and `feature/views-matrix`. It is not on `main`, `staging` or `feature/card` (`web/app/mu-plugins/laika-core/plugin-config.php:17-25`). So even on today's branch the activity, assignment and absence post types are not registered.
- Smallest change: name the base the exporter is built and run on, and how the planning models get registered during the export. For example: branch from `feature/views-saved` (atelier ^0.9.1 with PlanningService booted), or keep the `make feature` base, require atelier ≥0.9.1 and register PlanningService's models inside the command. Stefan rules which.

**B2. "The profile service already holds that link" is false.** (laika-export, Decisions l.28)
- `services/profile/ProfileModel.php:57-61` (field groups basic, contact, images, social, kit) has no field that points at an organisation post.
- No file under `services/profile/` mentions an organisation.
- Smallest change: identify the own company with an explicit `--own=<organisation post id>` flag (refuse when missing), or another rule Stefan picks. The report shows the choice.

**B3. "Dietary notes go to `custom.dieet` (the theatre package has no column)" is false.** (laika-export, Decisions l.33)
- `packages/theatre/src/datasets.ts:110` declares `dietary: { type: 'text', label: 'Dieet', nullable: true }` on Persoon.
- Smallest change: map atelier's `dietary` to Persoon `dietary` and drop the ruling.

## Should fix

**S1. Import and exporter disagree on `activities_per_week` in two ways.** (import Decisions l.43 and Task 3 l.158; laika-export Decisions l.25 and l.42)
- Which date counts:
  - The import plan says weeks are the "ISO weeks of the Activiteit's `start_at` calendar date".
  - But its parity reads `/rows/activiteit` per week with `from`/`to`. That window filters on the source's `date`, which is `plandag` (`packages/engine/src/rows.ts` `whereOf`; `datasets.ts` `date: 'plandag'`).
  - The exporter maps "an activity with no start" to `T00:00`. `plandag()` (`packages/theatre/src/plandag.ts`, `DAY_LINE_HOUR = 5` in `writers.ts`) moves every such activity, and every 00:00–04:59 start, to the previous day. A Monday all-day activity then lands in the previous ISO week, and parity fails on real data.
- Which rows count:
  - The parity applies "the filters of the theatre views 'Planning'…", and Planning filters `status: 'bevestigd'` (`seed.ts`).
  - The exporter counts "activities per ISO week of their date", meaning all of them.
- Smallest change:
  - Fix the contract in the import plan's format: which statuses, and which date (calendar date via `substr(start_at,1,10)`, or `plandag` with the exporter computing it at hour 5).
  - Take a ruling on the time given to no-start activities (`T00:00` or the day-line hour).
  - Also say how name-only assignments (no persoon legacy id) appear in `assignments_per_person`.

**S2. Translated records will be exported once per language.** (laika-export Architecture l.8, Task 2)
- `laika-core/languages.php:4-5` and the `pll_get_post_types` filter make production, person and organisation translatable.
- `PersonRepository::findBySlug` already filters to `pll_default_language()`.
- The plan never restricts to the source language, so it will export each language copy as a separate Persoon, Organisatie or Productie.
- Smallest change: export only `LAIKA_SOURCE_LANGUAGE` records, map relations to them, and add one translated person to the integration test.

**S3. The column mapping is incomplete, and one spec premise is false in source.** (laika-export Decisions l.22-26)
- Activiteit `productie_id` is NOT NULL (`datasets.ts:56`), but atelier's activity `production` is optional (`ActivityModel.php:46`). There is no rule for an activity without a production, so those rows will be refused at import.
- The activity post title (`supports => ['title']`) is never mapped to `omschrijving`, the Activiteit title column.
- The spec's "fields with no column yet (`performance`, `location`, `place`, `settled_by`, `notes`)" is false for `location`→`locatie_id` (`datasets.ts:77`), `place`→`plaats` (:78) and `notes`→`notities` (:87). `settled_by` may also fit `verrekening_default` (:85).
- Smallest change: add a no-production cleaning rule with a report entry, map title→`omschrijving`, and put the location/place/notes question to Stefan as a spec finding instead of dropping the data silently.

**S4. Person, Organisation and Production have no list method.** (laika-export l.8: "reads through atelier's repositories … never raw SQL")
- Each of `PersonRepository`, `OrganisationRepository` and `ProductionRepository` exposes only `find`, `create`, `update` and slug or country lookups.
- Smallest change: name the enumeration door, `ntdst_data()->get(<post type>)`, which the repositories use themselves (`ActivityRepository::between`).

**S5. The vocabulary check goes red from the plans that follow it.** (vocabulary Architecture l.9 and Decisions; auth Task 1 l.164; import Decisions l.46; migrator Task 1 `planChange`)
- The derived word list includes fiche/Persoon `email` (`packages/fiche/src/datasets.ts:18`). Auth's `account.email` will hit it.
- Import's `legacy_post_id` on theatre adds `legacy` and `post`. `post` then hits `app.post(` (`packages/engine/src/app.ts:21`, `views.ts:196`).
- The vocabulary plan widens the list beyond the spec ("declared dataset, query and column names") to option keys and saved-view names. That adds `plan`, which hits the migrator's `planChange` (merged before the check, under "No behaviour change in src"), and `per` (also not in the plan's "verified" hit list).
- Smallest change: keep to the spec's sources plus the fixed list, or keep the widening and add an allowlist step with reasons to each later plan (`email` in auth, `legacy`/`post` in import, `plan` in vocabulary).

**S6. The `scripts/` tests never run in the gate.** (vocabulary Task 1 Files l.63; import Test map)
- The plan changes the `test` script to `bun test packages scripts`.
- But `package.json` `gate` runs `bun test packages` directly. The vocabulary, staged-export and parity tests are therefore outside `bun run gate`.
- Smallest change: change `gate` as well.

**S7. The staged-export content check flags its own source.** (import Decisions l.54; laika-export Decisions l.53)
- "A staged file holding `"worktable_export"`" matches `import.ts`, `check-staged-export.ts`, their tests, the spec and plans, and Laika's `ExportCommand.php` the moment they are staged during a gate run.
- Smallest change: check content only in `*.json` files, as a top-level key (the `invented-*` exemption stays).

**S8. Auth: an owner can move a row out of scope by PATCH.** (auth attack 6 l.97, Task 2)
- Only create forces the owner column. Nothing stops `PATCH /rows/beschikbaarheid/<own>` with `persoon_id: <other>`. `runWrite` (`writes.ts`) checks only that the current row is in scope.
- Smallest change: refuse an owner-column value other than the subject on update too (403), with a denial test asserting the tables are unchanged.

**S9. Auth: an editor can widen a public view.** (auth Decisions l.67-70, attacks 8 and 10)
- An administrator makes an editor-owned query view public. The editor still owns it and can PATCH `filters` and `visible_fields` (`views.ts` `ownedView`, `viewBody`), which changes what the token serves without any administrator.
- Smallest change: on a `public = 1` view, only an administrator may PATCH, DELETE or restore it (or an edit clears `public`), with a test.

**S10. Auth: `queueMicrotask` does not move delivery after the response.** (auth l.66, attack 1)
- A microtask runs before Hono's returned Response is written. The known-email path (token hash, insert, outbox write) still sits inside the request's time, and the test asserts only bodies and status.
- Smallest change: defer with `setTimeout(…, 0)` (or do the same work for unknown emails), and assert that no database write happens on the request path.

**S11. Auth: the route matrix grades itself.** (auth Task 2 Interfaces l.213)
- `ROUTE_TABLE` with its expected statuses is exported from `access.ts`, the same module whose `may()` is "the Decisions table, as data". A wrong cell then passes both sides.
- Smallest change: keep the expected-status table in `route-matrix.test.ts` as an independent oracle. Keep `may()` in src. Keep the "unlisted route fails" test, filtering Hono's middleware entries out of `app.routes`.

**S12. Auth e2e: the fiche engine and grid are forgotten, and the cookies collide.** (auth Task 5 l.278)
- `playwright.config.ts` also runs fiche on 4312/5175, and `e2e/step-0c.spec.ts:3` drives `http://127.0.0.1:5175`.
- Cookies ignore the port, so `wt_session` from 4311 is sent to the fiche engine and gets 401. The fiche database also has no account.
- Smallest change: create a fiche editor in global setup, and separate the cookies (a per-instance cookie name, or fiche on `localhost`).

**S13. Auth: the delete-order swap breaks an existing test and a spec line.** (auth Decisions l.50)
- The swap reverses `packages/engine/test/writes.test.ts:169` ("on a 409 the referenced dataset's writer delete did not run").
- It also contradicts `docs/SPEC.md`'s Writer row ("checked before the writer's own delete").
- Smallest change: name that test's inversion in Task 2, and add the Writer-row line to the Task 6 spec-diff list.

**S14. Atelier-view: the unit-tier test seam cannot run.** (atelier-view Test map l.119)
- It says `do_shortcode(…)` with `pre_http_request` stubbed, but atelier's `tests/bootstrap.php` loads only the vendor autoloader and `ABSPATH`, with no WordPress.
- Smallest change: test `WorktableService::render()` with Brain Monkey stubs for `wp_remote_get`, `get_transient`, `set_transient` and `esc_html`.

**S15. Atelier-view: the service is never booted in Laika.** (atelier-view Task 1 l.135, Task 3 l.154)
- Atelier has no service registry. `atelier.php` holds one filter, and services are booted by the site's `plugin-config.php` `core` list (`PerformanceService` is listed there).
- Task 3 does not add `\Atelier\Worktable\WorktableService::class`.
- It also sets `engine_url` through an ad-hoc filter, where the house pattern is plugin-config's `overrides` key (`plugin-config.php`: "Each key is a service slug; its array reaches that service through `ntdst/service/{slug}/config`").
- Smallest change: add both lines to Task 3.

**S16. Auth: "never contains an owner id" needs a decision.** (spec U2 constraint 4; auth attack 10)
- The plan reads it as `saved_view.owner_id` only. An owner column such as `persoon_id` listed in `visible_fields` would still be served.
- Smallest change: refuse `PUT share-token` on a view whose `visible_fields` holds a declared owner column (or strip such columns from the projection), with a test.

## Note
- **N1. Atelier-view Task 4's stop is near-certain.** The engine binds `127.0.0.1` (`serve.ts`) and allows only loopback `Host` values (`app.ts` `hosts`), so a DDEV container cannot reach it. Tell Stefan now that the U6 browser gate will likely move to the cutover. The stop itself is sound and honestly worded.
- **N2. Migrator, three points.**
  - Views dropped "first" must be recreated whatever their ledger hash says (`apply()` returns early on an equal hash).
  - `foreign_keys` must be switched back ON in a `finally`.
  - In `rebuild.test.ts`, the engine fixture can create and update only `notitie` (`project` is delete-only and referenced, so a delete there returns 409). It needs its own domain to write to two datasets.
- **N3. Migrator's Simplest design** rejects always-rebuild on performance. The spec mandates the ALTER path anyway, so cite the spec. Storage-class retypes (text↔date, boolean↔integer) produce identical DDL and never reach the planner, which is harmless.
- **N4. Vocabulary: test-side hits** that will need renames or allowlisting: `open`, `state`, `start`, `parameters`, `per`.
- **N5. Laika export, smaller points.**
  - laika-core has no services and no autoloader ("mu-plugins have no autoloader", `tests/bootstrap-unit.php`), so the new classes need `require_once`.
  - `make pull env=production` has no server: `site.yml` says "no production server". Pull from staging only.
  - `WP_CLI::error` in an in-process wp-phpunit `__invoke` needs stubs.
  - PHP platform is 8.3, not 8.2.
- **N6. Baseline.** `feature/views-saved` (7efef97, 16 commits past v2.14.0) has never been pushed, so `archive/views-saved` publishes it. Check that worktree for uncommitted work first. Local `main` sits at 51788ac (2.6.0); `branch -f` handles that.
- **N7. Auth, execution-time points.**
  - `ApiError`'s status union lacks 401 and 429 (`params.ts`).
  - The grid's hash is `URLSearchParams` (`ui/hash.ts`), so `#/auth/<token>` can be mangled by a `writeHash` on mount. Clear the token from history after consume.
  - Behind the Vite proxy every client address is 127.0.0.1, so e2e shares the 20-per-15-minutes consume budget.
  - "Concurrent consumes" on a single bun:sqlite connection are serialised; use two connections.
  - Refuse consume for an account disabled after its link was sent.
  - The session should read role and disabled state on every request.
  - Review Focus 4's "existing draft mechanism" is the new-row draft only.
  - Global setup also needs an administrator for the public-view flow.
  - Add a test that a deleted public view's token returns 404.
- **N8. Import's first working version** runs `--as admin@example.test` on a fresh database that has no account. Run `--create-admin` first.

## Premises checked
- `migrate()` hash ledger; changed dataset throws "not built yet" → `packages/engine/src/migrate.ts:36-48` → holds
- Query view DDL is `DROP VIEW IF EXISTS` + `CREATE VIEW` → `ddl.ts` `viewDdl` → holds
- `createEngine`, `send` in the engine fixture → `packages/engine/test/fixture.ts` → holds
- `storedOf` runs `inUse` before `writer.delete` → `writes.ts` `storedOf` → holds
- `valuesOf` = cut, check, `writer.create`, options, relations, required; not exported → `writes.ts` → holds
- `revise()` makes one batch per call → `writes.ts` `revise` → holds
- `whereOf`, `cellsOf`, `readRevisions`, `viewRoutes(actor = DEV_ACTOR)` → `rows.ts`, `writes.ts`, `views.ts` → holds
- `saved_view` already has `share_token`, `public` → `saved-view.ts` → holds
- Seeded views owned by `DEV_ACTOR.id` 0; `DEV_ACTOR` role `admin` → `migrate.ts` `seedDomain`, `dev-actor.ts` → holds
- Host allowlist is loopback only; engine binds 127.0.0.1 → `app.ts` `hosts`; `serve.ts` `hostname` → holds
- `public` / `share_token` cannot be set through the view body → `views.ts` `viewBody`/`stored` → holds
- Engine src hits are only `default`, `site`, `status`, `type` → computed scan → does not hold (also `per`)
- Engine tests use Dutch fixture words → `packages/engine/test/*` → holds
- `gate` runs the `scripts/` tests once `test` changes → `package.json` `gate` → does not hold
- Theatre has no dietary column → `packages/theatre/src/datasets.ts:110` → does not hold
- Activiteit has no column for location, place, notes → `datasets.ts:77,78,87` → does not hold (spec premise)
- Voorstellingen has date column `datum` (from/to valid on the public route) → `queries.ts` → holds
- `make feature` branches from `origin/main` → `Makefile.netdust:161` → holds
- The exporter's base has atelier planning repositories → `origin/main` `composer.json` (atelier dev-feature/performances, no `services/planning`) → does not hold
- PlanningService is booted in Laika → `plugin-config.php` on main, staging and feature/card → does not hold
- atelier repositories exist (Activity, Assignment, Absence, Person, Organisation, Production) → `atelier/services/*`, `shared/models` → holds (no list method on Person, Organisation, Production)
- atelier statuses, kinds and absence fields match the spec mapping → `ActivityModel.php`, `AssignmentModel.php`, `AbsenceModel.php` → holds (assignment note field is `note`)
- Profile service links the own organisation → `services/profile/ProfileModel.php:57-61` → does not hold
- laika-core `timezone.php` → present → holds
- `bin/gate.sh` tiers; `composer test:unit` and `test:int` → `bin/gate.sh`, `composer.json:131-143` → holds
- PerformanceService YOOtheme guard at after_setup_theme → `PerformanceService.php:61-68` → holds
- YOOtheme `addTypePath` child elements → `builder-wordpress/bootstrap.php:60-63` → holds
- atelier unit tier has no WordPress → `atelier/tests/bootstrap.php` → holds (contradicts the plan's test seam)
- Baseline: `origin/main` 3ced762 is an ancestor of v2.15.1 (tag ba44a50, commit d7a75f8), 10 commits back → git → holds
- Baseline: no `services/views` in v2.15.1 → `git ls-tree` → holds
- Baseline: `origin/main..v2.14.0` = 58 commits → git → holds
- Baseline: `main` not checked out in any worktree; worktrees `-views` and `-saved` exist → `git worktree list` → holds
- Laika data counts on the local database (0 activities, 2 persons, 2 organisations) → not verifiable without DDEV → unverified

## The cut
- `step-0e-migrator` → one feature
- `step-0e-vocabulary` → one feature
- `step-0e-auth` → one feature. It is large (engine, theatre, grid, e2e), but everything shares the actor/session boundary.
- `step-0e-import` → one feature. It carries the worktable half of the staged-export guard, as the spec assigns.
- `step-0e-laika-export` → one feature. Its Task 3 Step 3 cross-repo import is a manual check that needs U4 merged, not a build dependency.
- `step-0e-atelier-view` → one feature across two branches in two repos (atelier `feature/worktable-view` plus a Laika `feature/worktable-view` for the wiring). Acceptable, because the wiring tests on its own through the worktree bootstrap. Task 4's live check needs U2 merged.
- `step-0e-baseline-release` → one feature
- No spec requirement is unowned, and none is owned twice.
