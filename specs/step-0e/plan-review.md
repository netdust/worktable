# Plan review — step-0e (seven plans, one parent spec)

Reviewed-plan: a6dec0c2abe13d73e995c33f1189e6a1f9262b57 specs/step-0e-migrator/plan.md
Reviewed-plan: 0bf4c58177313db0e6026dbe8d322ca32c0bcd38 specs/step-0e-vocabulary/plan.md
Reviewed-plan: ae5268a1cbdad8d8211f84de78b71ba42c65113b specs/step-0e-auth/plan.md
Reviewed-plan: 15ab163437de58f6e192cff658ac4cba87d28579 specs/step-0e-import/plan.md
Reviewed-plan: 32fa8964bc0651a718bcc8e87987f72903ba72ab specs/step-0e-laika-export/plan.md
Reviewed-plan: a5806ce60101830dee41bbef0f802922cbf418e7 specs/step-0e-atelier-view/plan.md
Reviewed-plan: 9923f7936d4032ec7ee730c51afda30b08d02c0b specs/step-0e-baseline-release/plan.md
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
