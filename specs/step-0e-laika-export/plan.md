# Step 0e U5: the Laika planning exporter, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Where the data is (Stefan, 2026-10-06).** No server runs atelier's PlanningService: not `main`, not `staging`. The real planning data is the Glimworm seed (`bin/seed/glimworm.php` + `.json`), which exists only on the planning branches (worktree `/home/ntdst/Sites/laika-planning-model`, `feature/views-saved`). Stefan runs it locally, into the `laika` DDEV database that both checkouts share. The exporter then exports all six datasets from it, and the mapping is also proven on invented posts in the tests.

**Goal:** `wp laika export-planning --out=<path> --own=<id> [--dry-run]` writes Laika's planning as the engine's import JSON, cleaned and with its own `checks` block. A report lists every cleaning decision. The file can never be committed.

**Architecture:**
- **Where it lives.** A small service in `laika-core` (site-specific, tracked in the Laika repo): `services/worktable-export/`. It reads through atelier's repositories (`ActivityRepository`, `AssignmentRepository`, the absence repository, `PersonRepository`, `OrganisationRepository`, `ProductionRepository`), never raw SQL.
- **The units.** Pure mapping classes, unit-tested with Brain Monkey: `NameSplit`, `StatusMap`, `KindMap`, `ActivityMap`, `RoleRank`, `Cleaner` and `Checks`. `ExportCommand` wires them to WP-CLI and gets one integration test on invented posts.
- **First working version:** Task 2. `ddev wp laika export-planning --dry-run` prints the report's counts on the local DDEV database. Locally that database holds 0 activities, 2 persons and 2 organisations, plus whatever Stefan pulls.

**Tech Stack:** PHP 8.3, WordPress (Bedrock) on ntdst-core 5.4, atelier 0.10, WP-CLI, PHPUnit with Brain Monkey (unit) and wp-phpunit through DDEV (integration).

**Spec:** `specs/step-0e/spec.md` U5 in the worktable repo, and the import format in `specs/step-0e-import/plan.md` Decisions. This plan lives in worktable so the set is reviewed as one. On execution, the executor copies it to `laika/specs/worktable-export/plan.md` in the first commit.

**Repository and branch:** `/home/ntdst/Sites/laika`. Load `netdust-devops:devops` first, then `make feature name=worktable-export`; it branches from origin's `main`. No deploy, promote or ship. The export is a local tool; Stefan decides whether this branch is ever promoted.
- **The atelier base** (plan review B1). `origin/main` pins atelier `dev-feature/performances as 0.3.0`, which has no person, organisation or planning models. The branch's first commit makes the same `composer.json` change staging carries from `feature/company-profile` (9d15e46): atelier `^0.9.1` and ntdst-baseline `^2.13`, line for line, so the two promote together without a conflict. atelier v0.9.1 contains `services/planning` (verified 2026-10-06). Ruling; the cost if wrong is one rebase.
- **Planning models inside the command only.** PlanningService stays out of the site's `plugin-config.php`, so no environment gains planning post types. The command registers atelier's planning models (Activity, Assignment, Absence, through the same `register()` calls PlanningService makes) when it runs, if they are not already registered. The integration test does the same before creating invented planning posts.

**Simplest design:** A one-off PHP script run with `wp eval-file` is simplest. It is rejected because the mapping needs unit tests (Stefan's dry-run review depends on the report being right), and the gitignore check needs a known file name. A WP-CLI command in laika-core costs one class over the script.

## Decisions (Stefan, 2026-10-06, unless marked)
- **Only the source language.** Productions, persons and organisations are translatable (`laika-core/languages.php`). Only records in `LAIKA_SOURCE_LANGUAGE` are exported, and relations that point at a translation are mapped to its source-language record through Polylang (`pll_get_post`). The integration test includes one translated person (plan review S2).
- **How records are enumerated.** Person, Organisation and Production repositories have no list method, so the exporter enumerates through `ntdst_data()->get(<post type>)`, the door the repositories use themselves (`ActivityRepository::between`), never raw SQL (plan review S4).
- **Status:** `requested`→`uitgenodigd`, `confirmed`→`bevestigd`, `declined`→`geweigerd`, `maybe`→`uitgenodigd`. A `maybe` row's `notitie` (from atelier's assignment `note`) gets `Laika: maybe`, appended on a new line to any existing note. The report counts the `maybe` rows and lists their legacy ids for the planner's skim.
- **Activity:**
  - status: `option`→`optie`, `confirmed`→`bevestigd`, `cancelled`→`geannuleerd`;
  - kind: `show`→`voorstelling`, `rehearsal`→`repetitie`, `build`→`opbouw`, `soundcheck`→`opbouw`, `strike`→`afbouw`, `travel`→`reis`, `overnight`→`overnachting`, `meal`→`maaltijd`, `free`→`andere`, `other`→`andere`, with the original kind in `custom.laika_soort`;
  - `date` + `start`/`end` → `start_at`/`eind_at` as `YYYY-MM-DDTHH:mm`, in the site's timezone (laika-core `timezone.php`). An end before its start rolls to the next day, matching the theatre writer's day line;
  - **an activity with no start** gets `T05:00`, the day-line hour, so its plandag is its own date. `custom.laika_geen_start` is `true`, and the report counts them (Stefan, 2026-10-06);
  - **an activity with no production** is hung under one placeholder Productie, `(zonder productie)` with legacy id `0`, which the exporter adds only when needed. No data is lost, the report counts them, and a planner re-files them after import (Stefan, 2026-10-06);
  - the post title → `omschrijving`; `location` → `locatie_id` (the organisation's legacy id); `place` → `plaats`; `notes` → `notities` (theatre has all three columns, plan review S3, which corrects the spec's premise);
  - `settled_by` (company/programmer) → `custom.laika_verrekening`, since `verrekening_default` is free text with no agreed vocabulary yet. Ruling; the cost if wrong is one key to move;
  - `performance` is not exported (the engine has no Performance; the website keeps the link) and is counted in the report.
- **Organisation:** `soort` by rank: own company→`eigen`, `venue`→`venue`, `coproducer`→`partner`, `presenter`→`partner`, `funder`→`agentschap`, none→`partner`. The role slugs are kept in `custom.laika_rollen`.
  - The own company is named on the command line: `--own=<organisation post id>`, required, and the command refuses without it. Atelier's profile holds no link to an organisation (plan review B2). The report names the chosen organisation.
- **Person name:** lowercase particles attach to the last name. The particle list is `van, van den, van der, van de, de, den, der, ter, ten, te, 't, von, vom, zu, du, le, la, d'`, matched as whole lowercase tokens, longest first.
  - A single token becomes voornaam = token and achternaam = `(onbekend)`.
  - Every particle split and every single token is listed in the report.
  - `wp_user` is not exported.
- **Persoon columns:** email, phone and dietary → `email`, `telefoon` and `dietary` (theatre declares `dietary`, plan review B3).
- **Cleaning:**
  - an assignment with both a person and a name keeps the person and drops the name;
  - of a duplicate (person, activity) pair the oldest post ID is kept and the rest are dropped.

  Both are listed in the report by legacy id.
- **Absence:** whole days → `start_at` `T00:00`, `eind_at` `T23:59` on the last day. `reden` comes from the absence's reason field.
- **Checks:** the exporter computes `checks` through atelier's repositories after cleaning, in the shape fixed by the import plan:
  - per-dataset counts;
  - activities per ISO week of their date;
  - assignments per person legacy id and per mapped state;
  - absences per person legacy id.
- **Dry run:** `--dry-run` writes only the report (to stdout as counts plus `--report=<path>`), never the export.
- **Output:**
  - `--out` is required unless `--dry-run`, and must resolve outside the Laika repo root (else `WP_CLI::error`).
  - The file name must match `laika-planning-export*.json`.
  - The file carries `"worktable_export": 1`.
- **Getting the file out of the container.** `ddev wp` runs inside the web container, which mounts only the project. A new `.ddev/docker-compose.worktable-export.yaml` mounts the host's `~/laika-export` at `/mnt/laika-export`, and `--out`/`--report` must resolve under `/mnt/laika-export` (else `WP_CLI::error`). Ruling: this is the only way to write outside the repo from DDEV without a host-side WP-CLI. The cost if wrong is one compose file, and Stefan creates `~/laika-export` himself.
- **Personal data in git** (Stefan, 2026-10-06):
  - `.gitignore` gains `laika-planning-export*.json` and `*.report.json`;
  - `bin/gate.sh` gains a first tier `check:export`, a composer script running `bin/check-staged-export.sh`, which fails on a staged file of those names or a staged `*.json` file whose top-level object has a `worktable_export` key, so `ExportCommand.php` mentioning the key never trips it (plan review S7);
  - exempt: `tests/**/fixtures/invented-*.json`.

## Global Constraints

- Evidence: no task claims a line below without its evidence in the task report — the
  command as run with its output quoted, or the review that owns the line. No quote, not met.
- Base: ntdst-core is the framework base and its layering applies to every new class —
  `netdust-wp:ntdst-framework`; where files live — `netdust-wp:ntdst-patterns`. Owned by the
  whole-branch review, joined on WordPress by `netdust-wp:ntdst-drift-reviewer` on the changed
  paths (Part 1 runs core's invariants live); its `## Findings:` header is quoted.
- Golden path: the plan names the slice this feature is built to (`netdust-wp:ntdst-patterns`
  → `golden-paths/`); every departure from it is named and justified, or `none`. Judged, not
  grepped: `/plan-review` checks the slice is named, the whole-branch review that code keeps it.
- Security: every data flow (AJAX action, REST route, form post, shortcode attribute,
  settings save, custom query) states its four pillars — validate, sanitize, escape,
  authorize — as `netdust-wp:wp-security` defines them; a pillar that does not apply is
  written `n/a — <why>`, never omitted. Evidence per flow: each pillar cited `file:line`; the
  output of `grep -nE "current_user_can|wp_verify_nonce|check_ajax_referer|check_admin_referer|permission_callback" <changed files>`;
  the denial test's name, RED then GREEN. `security-sentinel` owns the review when the plan
  carries a threat model.
- Drift: nothing `netdust-wp:ntdst-drift-reviewer` reports — a Critical or Drift finding is
  fixed or is a deviation the plan names; the review quotes the agent's findings, never "looks clean".
- Tests: the close is `make gate`. Unit = Brain Monkey, integration = wp-phpunit through
  DDEV, e2e = Playwright; commands and setup are `netdust-wp:wp-testing`'s. Evidence: the exit
  code and the summary lines of a run after the task's last edit. A tier that did not run is
  reported as not run, never as a pass. A site's tests cover its code and its configuration of
  ntdst-core and ntdst-baseline; the packages' own behaviour is tested in their repos.
- Local and ship: DDEV always; the Makefile is the only route to a server
  (`netdust-devops:devops`); anything that must ship names its `deploy.payload` path, and
  `make deploy-test env=staging` output listing it is quoted. An rsync, scp or SFTP to a server
  outside the Makefile is a defect the review reports.

| Red flag — the excuse | The answer |
|---|---|
| "Admin-only screen, so no nonce" | Capability says who; the nonce says they meant it. Both. |
| "The value comes from the database" | Stored input is input. Escape it on output. |
| "The reviewer will catch it" | The reviewer checks the evidence you quoted. No quote, not met. |
| "`make gate` was green earlier" | Earlier is not after your last edit. Run it, quote it. |
| "The integration tier needs DDEV; skip it" | `ddev start`. A tier not run is not a pass. |
| "Plain WordPress is simpler here" | On ntdst-core that is drift. Use the framework's door or name the deviation. |
| "Too small for the golden path" | Then the departure is `none` or one named line. Silence is the defect. |
| "The denial is obvious, no test needed" | Obvious is untested. Write it RED first. |
| "Just rsync this one file" | A hand-deploy is drift nobody sees. The Makefile, or nothing. |

Then this plan's own:
- **Golden path:** none of `admin-settings-page`, `content-type-feature`, `form-data-flow` or `yootheme-integration` fits a read-only WP-CLI export. The departure is named here: a laika-core service registered through `plugin-config.php` like the site's other services, reading only through atelier repositories, with no CPT, field, route or screen.
- **Data flows and their pillars.** There is one data flow, the WP-CLI command:
  - validate: `--out` must be outside the repo and match the name pattern; flags are known;
  - sanitize: the output is JSON-encoded with `wp_json_encode` (`JSON_UNESCAPED_UNICODE`); there is no HTML;
  - escape: n/a, because nothing is rendered to a browser;
  - authorize: only WP-CLI can reach it (the command registers only when `WP_CLI` is defined), and the shell user is the authority. There is no capability check because there is no web entry point; the denial test asserts no hook or route registers outside WP-CLI.
- **No real data in the repo or in a test:** fixtures are invented posts.
- **No deploy, pull, refresh or seed by an agent.** Stefan runs the Glimworm seed locally. If he ever pulls instead, it is from staging: `site.yml` declares no production server (plan review N5).
- **The seed's records are reused, not special-cased.** The exporter does not read `_laika_seed`; it exports whatever source-language records exist. Afterwards, `ddev wp eval-file bin/seed/glimworm.php remove` restores the local database.
- **laika-core has no autoloader** (`tests/bootstrap-unit.php`: mu-plugins have none), so the new classes are loaded with `require_once` from the service's entry file, and the unit bootstrap requires them the same way. `WP_CLI::error`/`success`/`log` are stubbed in the integration test (plan review N5).
- Each task logs its start and end time in a Time log in the copied plan.

## Threat model
**Assets:** the personal data of Laika's people (names, emails, phones, dietary notes, absences).

**Attacks:**
1. **The export or its report committed,** by an agent or by `git add -A`. → **Gitignore plus the `check:export` gate tier. Test: a planted staged file fails the tier, and a planted `invented-` fixture passes.**
2. **The export written inside the repo,** or a web-served path, by a mistyped `--out`. → **`ExportCommand` accepts `--out`/`--report` only under `/mnt/laika-export` (the `realpath` of the parent, so `..` cannot escape). Test: a path in the project, a `..` escape and `/tmp` are each refused.**
3. **The command reachable from the web.** → **Registered only inside `if (defined('WP_CLI') && WP_CLI)`. Test: with `WP_CLI` undefined, no command and no hook is registered.**

**Mitigations:** `ExportCommand::resolveOut()` (2), the registration guard (3), `bin/check-staged-export.sh` (1).

**Deferrals:** the file on Stefan's disk is his to protect; it is not encrypted.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Mapping rules (`NameSplit`, `StatusMap`, `KindMap`, `RoleRank`, `Cleaner`, `Checks`) | their public static methods | unit · `tests/Unit/WorktableExport/*Test.php` · `ddev composer test:unit` | none |
| `ExportCommand` on invented posts | `wp laika export-planning` invoked in-process (`ExportCommand::__invoke`) | integration · `tests/Integration/WorktableExport/ExportCommandTest.php` (denials first: attacks 2, 3) · `ddev composer test:int` | none |
| Staged-export tier | `composer check:export` in a temp git repo | integration (shell) · `tests/Unit/WorktableExport/CheckStagedExportTest.php` runs the script with `proc_open` · `ddev composer test:unit` | none |
| The import contract | the produced JSON imported by the engine | cross-repo, manual · `bun packages/engine/src/serve.ts --import <file> …` in worktable, on the invented fixture export this plan generates | none |

## Review Focus
0. The no-start (`T05:00`, flag set) and no-production (placeholder, legacy id 0) rules → `ActivityMapTest` and the integration test.
1. Names with particles and single tokens: "Jan van der Berg", "Els De Smet" (capital "De" stays in the last name as written, and is not split as a particle), "Madonna", "Jean-Luc d'Hondt" → `NameSplitTest`.
2. A whole-day absence ending on a DST change: `eind_at` is the last day's `T23:59` local → the integration test with an absence over the last weekend of October.
3. A duplicate pair where both rows carry different states: the oldest wins, and the report names the dropped one → `CleanerTest`.
4. An organisation with funder and presenter becomes `partner` → `RoleRankTest`.
5. The `checks` block is computed after cleaning, so dropped duplicates are not counted → `ChecksTest`.

---

### Task 0: The atelier base
- [ ] **Step 1:** On the new branch, make 9d15e46's `composer.json` change (atelier `^0.9.1`, ntdst-baseline `^2.13`) and update so both packages resolve to the versions staging's `composer.lock` holds (`git show origin/staging:composer.lock`), never to the newest that `^2.13` allows: 2.15.x drops the views module (spec U7's trap). Quote `composer show netdust/atelier netdust/ntdst-baseline` next to staging's lock entries, then run `make gate` and quote it. Commit: `build(worktable-export): atelier ^0.9.1 as on staging`. Then copy this plan to `specs/worktable-export/plan.md` in the same commit.

### Task 1: The pure mapping rules
**Files:** Create `web/app/mu-plugins/laika-core/services/worktable-export/{NameSplit,StatusMap,KindMap,ActivityMap,RoleRank,Cleaner,Checks}.php`, `tests/Unit/WorktableExport/*Test.php`.

**Interfaces:**
- Produces:
  - `NameSplit::split(string $title): array{voornaam: string, achternaam: string, note: ?string}`. The note is `particle` or `single` when reportable.
  - `StatusMap::assignment(string): string` and `StatusMap::activity(string): string`. An unknown value throws `DomainException`, reported per row.
  - `KindMap::soort(string): string`.
  - `ActivityMap::times(string $date, ?string $start, ?string $end): array{start_at: string, eind_at: ?string, geen_start: bool}`. A missing start becomes `T05:00`.
  - `RoleRank::soort(string[] $slugs, bool $isOwnCompany): string`.
  - `Cleaner::assignments(array $rows): array{rows: array, dropped: array}`.
  - `Checks::of(array $datasets): array`.

- [ ] **Step 1: Tests first,** with the Decisions' exact values and Review Focus 1, 3, 4, 5. Run `ddev composer test:unit` → FAIL.
- [ ] **Step 2: Implement, run, commit.** `feat(laika-core): worktable export mapping rules`.

### Task 2: The command, the guard and the dry run
**Files:** Create `.ddev/docker-compose.worktable-export.yaml`, `services/worktable-export/ExportCommand.php`, `tests/Integration/WorktableExport/ExportCommandTest.php`. Modify `plugin-config.php` or `laika-core.php`, whichever registers laika-core's services (follow the existing pattern).

**Interfaces:**
- Produces: `wp laika export-planning [--out=<path>] [--report=<path>] [--dry-run]`. It writes `{worktable_export: 1, source: "laika", datasets: {productie, organisatie, persoon, activiteit, toewijzing, beschikbaarheid}, checks}`.

- [ ] **Step 1: Denial tests first:** attacks 2 and 3.
- [ ] **Step 2: Behaviour test.** The output directory is a constructor argument so the test can point it at a temp dir; production wires `/mnt/laika-export`.
  - Create invented posts through atelier's repositories: two productions; three organisations (own, venue+funder, funder+presenter); four persons (a particle name, a single token, a capital "De"); activities across W53/W01 and a DST weekend; assignments including `maybe`, a both-person-and-name row and a duplicate pair; and absences.
  - Run the command to that temp dir.
  - Assert the JSON shape, every mapping, the report entries, and that `checks` equals counts over the cleaned rows.
- [ ] **Step 3:** Write the produced file, made from invented posts only, to `tests/Integration/WorktableExport/fixtures/invented-export.json`, for the cross-repo check.
- [ ] **Step 4: Implement, then run** `ddev composer test:int`. Commit `feat(laika-core): wp laika export-planning, with a dry run and its report`.

### Task 3: Keep the export out of git
**Files:** Modify `.gitignore`, `composer.json` (`check:export`), `bin/gate.sh` (the tier first). Create `bin/check-staged-export.sh`, `tests/Unit/WorktableExport/CheckStagedExportTest.php`.

- [ ] **Step 1: Tests first** (a temp git repo):
  - a staged `laika-planning-export.json` → exit 1;
  - a staged `.json` file with the top-level marker key → exit 1;
  - a staged `.php` file mentioning the key → exit 0;
  - a staged `tests/x/fixtures/invented-export.json` → exit 0.
- [ ] **Step 2: Implement, then run** `make gate` and quote every tier's line.
- [ ] **Step 3: Cross-repo check.** In worktable (on a branch that has the import plan merged), import Task 2's invented export into a temp database and quote the counts.
- [ ] **Step 4: Commit.** `feat: refuse a staged planning export in the gate`.
- [ ] **Step 5: Stop.**
  - Push the branch (`make audit` shows nothing unpushed).
  - Hand Stefan the seed, run from the planning worktree: `cd /home/ntdst/Sites/laika-planning-model && ddev wp eval-file bin/seed/glimworm.php`. Then hand him the dry run from the exporter branch: `ddev restart` (for the mount), then `ddev wp laika export-planning --dry-run --report=/mnt/laika-export/dry-run.report.json`.
  - Then the real run: `--out=/mnt/laika-export/laika-planning-export.json`, which lands in `~/laika-export/` on the host.
