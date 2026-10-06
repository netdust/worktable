# Step 0e: accounts, import, and the Laika cutover's groundwork

The last slice of build step 0 before the cutover. It replaces the temporary dev actor with engine accounts, imports Laika's real planning data through a generic command, proves parity on that data, and does the work outside worktable that the cutover needs: the Laika exporter, the WordPress view shortcode, and a baseline release without the views module. The cutover itself is a separate slice: HTTPS, the Host allowlist for a real domain, session flags, backups with a restore drill, and an independent review.

0e covers six independent units in four repositories. This file is the parent spec. Each unit gets its own plan and branch, and the set of plans is reviewed together (`/plan-review step-0e`).

## Decisions taken before this spec (Stefan, 2026-10-06)
- **Real data stays outside every repo.** Stefan pulls Laika's data into its DDEV himself (`make pull`). The exporter writes JSON to a path outside all repositories. The parity gate runs locally against that file and commits only counts and checks, never rows. No agent pulls from a server.
- **Baseline: a release without views.** In ntdst-baseline, `main` is brought up with the non-views work of v2.13–v2.15, a new minor is cut without `services/views`, and the `feature/views*` branches are archived. Laika's composer constraint moves at the cutover, not in 0e.
- **The WordPress "block" is a shortcode plus a YOOtheme element** in atelier, following PerformanceService's pattern.
- **Three roles:** administrator, editor and owner (named after the spec's Owner actor, and matching cargo). An owner account is linked to a row by `(subject_dataset, subject_id)` on the engine's own account table: cargo will have couriers and customers in different datasets. An owner sees only rows whose declared owner column for `owner` points at its subject, and writers refuse by role. Signed links stay in step 2. Laika's core team get engine accounts as editors. Source: Stefan, 2026-10-06.
- **The planner role is renamed editor** before it spreads (Stefan's brief).

## Units, in order

### U1. The table-rebuild migrator. Entry condition: it lands first. (worktable, `feature/step-0e-migrator`)
- **What it does.** A changed dataset declaration no longer stops startup. The migrator compares the declared table with the stored one and applies the smallest safe change:
  - **New nullable column, or a column with a default:** `ALTER TABLE … ADD COLUMN`.
  - **Anything else, done by rebuilding the table** (a new non-null column without a default, a dropped or retyped column, a new foreign key or index):
    - create `new_<table>` from the declaration;
    - copy every row through the columns that are kept;
    - drop the old table and rename the new one;
    - recreate its indexes;
    - all inside one transaction, with `PRAGMA foreign_keys = OFF` around it and `foreign_key_check` before commit.
  - **Refused, naming the dataset and the column, before anything is touched:** a retype that would lose data, or a new non-null column without a default on a non-empty table.
  - **Views** that depend on a rebuilt table are recreated after it.
- **Revision rows are never touched.**
- **The test.** A populated database (every theatre dataset seeded, writes done through the routes so Revision holds rows) is migrated across a declaration change that forces a rebuild (adding a foreign key). Every row and every Revision row survives unchanged. The ids are identical, and the foreign keys hold.

Source: "Entry condition: the table-rebuild migrator lands first, with a test that rebuilds a populated database without losing a row or a revision."

### U2. Accounts, roles and scoping. (worktable, `feature/step-0e-auth`)
- **Accounts.** Engine accounts sign in by magic link. The shape follows Folio's (AGENTS.md allows copying its magic-link sessions):
  - a link request answers identically, in status, body and timing class, whether or not the email has an account (Stefan, 2026-10-06);
  - tokens are hashed at rest, single-use and claimed atomically, and expire after 15 minutes;
  - link requests are rate-limited per email and per client address (Stefan, 2026-10-06);
  - in development the link is printed to the console, with no mail provider.
- **Where it departs from Folio:**
  - Consuming a link is a POST from a confirm page, not a state-changing GET, so a mail scanner's prefetch cannot burn it.
  - Session ids are hashed at rest.
  - A new session id is issued at sign-in.
  - Expired sessions and links are swept.
  - The session cookie is HttpOnly and SameSite=Lax. `Secure` is set whenever the engine is served over HTTPS (that is the cutover's job; in 0e it is off on localhost).
- **The dev actor goes away.** `dev-actor.ts` is removed. Every route needs a session except the link request, the consume POST, and the public route (below). The confirm page is the grid's. A request without a session answers 401.
- **Bootstrap.** The first administrator is created by an engine CLI command (`serve.ts --create-admin <email>`), never through a route.
- **Accounts table** (engine, generic): email (unique, case-insensitive), role, `subject_dataset` and `subject_id` (both null, or both set and only for role owner; the subject must be a declared dataset), created_at, disabled_at.
- **Roles.**
  - administrator: everything, including accounts and roles.
  - editor: reads and writes every dataset and query that a writer does not restrict, and owns saved views.
  - owner: scoped by owner columns (below). An owner account without a subject sees nothing.
- **The rename.** The current dev role `admin` becomes `administrator`.
- **The planner rename.** "planner" disappears from code and docs; `docs/SPEC.md`'s Access table says editor.
- **Owner columns.** A dataset or query declares `owners: { owner: '<column>' }`. The column is `id` or a relation column. For an owner session the engine matches it when the column's dataset (for `id`, the dataset itself; for a relation, its target) equals the account's `subject_dataset`, and the value equals `subject_id`. It filters every read by that, and refuses a write to a row outside it with 404, so ids don't leak. Writers receive the actor and may refuse further.
  - Theatre declares `owner` columns on Toewijzing (`persoon_id`) and Beschikbaarheid (`persoon_id`), and Persoon declares its own `id`, so an owner sees their own Persoon row.
  - A source without an owner column for `owner` is invisible to an owner (404). The same goes for `/schema`, which lists only the sources the caller may read.
  - The theatre writers let an owner write only their own Beschikbaarheid. Toewijzing and Persoon writes refuse the owner role: the actual side and confirm/decline arrive with step 2.
- **Seeded views move to a system owner** (owner id −1) that no session can assume. They are read-only for everyone (403 `read_only_view`) until copied ("Save as new"), and listed as shared. Existing views owned by the dev actor (0) are migrated: seeded ones to the system owner, any others to the first administrator.
- **The permission check runs before the in-use check** (the 0e requirement in `docs/SPEC.md`). An actor who may not delete gets 403 without `by`. A test proves the order.
- **A generated test matrix:** every route × every role (none, owner, editor, administrator) × allowed or denied, generated from one table of routes and roles, with each cell asserting its status. A new route without a row fails the matrix test.

- **The public read route** for the WordPress shortcode: `GET /api/public/views/:share_token`, the spec's Recipient actor, which is a read-only rendering by share token. It needs no session. Source: Stefan, 2026-10-06; four constraints:
  1. Only an administrator sets `public`, and only on a view whose `source_type` is `query`. A public view of a dataset would expose every column.
  2. The route accepts only `from` and `to`. The view's filters, sort and visible fields stay fixed server-side, and any other parameter is a 400.
  3. The token is random and long (32 bytes, base64url). It is stored hashed (sha256), compared in constant time, and rotatable by an administrator (rotating invalidates the old one). The route is rate-limited per client address and sends no CORS headers, because the shortcode fetches server-side.
  4. A test asserts the response never contains an owner id or a column outside the view's `visible_fields`.

  Each served row is projected to `visible_fields` only, with no `lookups`, `custom` or `title` beyond those.

Source: Stefan's brief: "engine accounts by magic link replacing the dev actor, with generic role names (administrator, editor; rename "planner" before it spreads); actor scoping through owner columns; seeded views migrated to a system owner no session can assume and read-only until copied; the permission check before the in-use check; a generated test matrix of every route against every role" · the three roles: Stefan's decision above.

### U3. The vocabulary check in the gate. (worktable, `feature/step-0e-vocabulary`)
`bun run check` fails when a domain word appears in `packages/engine`. The word list is built from the domain packages' declared dataset, query and column names, plus a small fixed list (for example persoon, activiteit, productie, fiche). Comments and tests are checked too. The check has its own test, which plants a word and expects a failure.
Source: "the vocabulary check in the gate (no domain word in packages/engine)."

### U4. The generic JSON import command and the parity gate. (worktable, `feature/step-0e-import`)
- **The import command:** `serve.ts --import <file.json> --db <file>`.
  - **What it reads:** `{ "worktable_export": 1, "datasets": { "<name>": [ { "legacy_id": …, …columns } ] }, "checks": { … } }`. The command ignores `checks`, which only the parity gate reads.
  - **Order:** rows are inserted in foreign-key order, and relations are resolved from `legacy_id` to the new id.
  - **What is kept:** each dataset keeps `legacy_post_id` for one release (a declared column added for import, per `docs/SPEC.md`).
  - **Validation:** rows go through the dataset's type and option validation. The writers' cross-field rules are checked too, but they report instead of refusing: the import writes a report of every refused row and stops before committing if any were refused, unless `--accept-report` is passed.
  - **Atomicity:** the whole import runs in one transaction, and it is idempotent on an empty database.
  - **Revision:** one batch per import, actor = the administrator who ran it.
  - **What it never does:** call WordPress.
- **The parity gate** (`bun run parity <export.json>`, run locally by Stefan or on his authorisation, never in CI):
  - it imports into a temporary database;
  - it compares counts per dataset;
  - it checks that Laika's Planning, Toewijzingen and Afwezigheden views (as the theatre package redeclares them) return the expected rows: activities per ISO week, assignments per person and per state, absences per person. "Expected" is the export's own `checks` block, which the exporter computes from atelier's repositories, the way WordPress shows it today, after cleaning. The comparison therefore runs between what WordPress shows and what the engine shows, never between the exporter and itself;
  - it writes `specs/step-0e/parity.md` with counts and pass or fail only, never row contents.
Source: "the generic JSON import command … the parity gate on imported data" · `docs/SPEC.md` Storage ("legacy_post_id kept for one release").

### U5. The Laika exporter. (the private Laika repo, `feature/worktable-export` via `make feature`)
- **What it is:** a WP-CLI command in `laika-core` (site-specific, tracked in the Laika repo), `wp laika export-planning --out=<path>`. It writes U4's JSON from atelier's repositories, not from raw SQL.
- **Mapping:**
  - person → Persoon (its `wp_user` is not exported: engine accounts are made in the engine). The post title is split into voornaam and achternaam (Source: Stefan, 2026-10-06):
    - Lowercase particles (van, van den, van der, de, den, der, ter, ten, te, 't, von, vom, zu, du, le, la, d') attach to the last name.
    - A single-token name takes the token as voornaam and "(onbekend)" as achternaam.
    - Every particle split and every single token appears in the report.
    - The report is reviewed on a dry run (`--dry-run`: report only, no file) before the real export.
  - organisation → Organisatie;
  - production → Productie;
  - activity → Activiteit:
    - date + start/end → `start_at`/`eind_at`;
    - `status`: option→`optie`, confirmed→`bevestigd`, cancelled→`geannuleerd`;
    - `kind` → `soort`: show→`voorstelling`, rehearsal→`repetitie`, build→`opbouw`, soundcheck→`opbouw`, strike→`afbouw`, travel→`reis`, overnight→`overnachting`, meal→`maaltijd`, free→`andere`, other→`andere`. The original kind is kept as `custom.laika_soort`. The days-worked count is unaffected: opbouw counts and andere doesn't. Source: Stefan, 2026-10-06;
    - fields with no column yet (`performance`, `location`, `place`, `settled_by`, `notes`) are counted in the export's report, not exported;
  - assignment → Toewijzing;
  - absence → Beschikbaarheid (whole days → 00:00–23:59).
- **Cleaned at export, each case listed in the export's report:**
  - **Assignment status:** `requested`→`uitgenodigd`, `confirmed`→`bevestigd`, `declined`→`geweigerd`, and `maybe`→`uitgenodigd`, with the original status written into `notitie` ("Laika: maybe", appended to any existing note). The report counts them. If `maybe` meant "pencilled in, never asked", these rows will show as unanswered invitations once step 2 exists, so a planner skims that list before cutover. Source: Stefan, 2026-10-06.
  - **Organisation roles:** the `organisation_role` taxonomy (venue, coproducer, funder, presenter, several per organisation) maps to one `soort` by precedence: own company→`eigen`, venue→`venue`, coproducer→`partner`, presenter→`partner`, funder→`agentschap`, nothing→`partner`. Funder goes last, because a funder that also presents is operationally a partner. The original role list is kept as `custom.laika_rollen`, so the mapping can be redone. Source: Stefan, 2026-10-06.
  - **An assignment holding both a person and a name** keeps the person and drops the name.
  - **A duplicate (person, activity) pair** keeps the oldest row and drops the rest.
- **Where the output goes:** a path outside every repository. No client data is committed, and the exporter's tests use invented posts.
- **The export holds personal data** (names, emails, dietary notes, absences). Its default file name (`laika-planning-export*.json`) is gitignored in both the Laika and the worktable repo. A gate check in each repo fails if a file of that name, or any file with the export's marker key `"worktable_export"`, is staged. Source: Stefan, 2026-10-06.

Source: "the Laika exporter in the private Laika repo, with mapping for maybe, the organisation roles taxonomy, and rows holding both a person and a name or a duplicate pair, cleaned at export" · location: Stefan's decision above.

### U6. The WordPress view shortcode. (atelier, `feature/worktable-view`)
- **What it adds:** a new atelier service, following PerformanceService's shape:
  - `[worktable_view token="…"]` renders a public view's rows, through U2's public route, as escaped HTML;
  - there is no shortcode that fetches a query by name: every route except the public one needs a session, so the website reads `voorstellingen` through a public view on it, by token (ruling: one door, the Recipient actor);
  - a YOOtheme element wraps it, guarded like `services/performance/yootheme.php`.
- **Fetching:** the engine URL comes from configuration (`site.yml` or wp-config, never hard-coded). The fetch is server-side, with a short timeout, a transient cache, and a quiet empty state when the engine is down. The engine is never called from the browser.
- **Escaping:** every value is escaped (`esc_html`/`esc_attr`), per `netdust-wp:wp-security`.

Source: "the WordPress view block" · form: Stefan's decision above.

### U7. A baseline release without views. (ntdst-baseline, `feature/drop-views`)
- **What the repo already holds (verified 2026-10-06).** v2.13.0 and v2.14.0 are views-only releases on the `feature/views*` lineage: every commit in `origin/main..v2.14.0` is views work. v2.15.0 and v2.15.1 (duplicate) were cut from `main` and carry no `services/views`. So the release without views already exists as v2.15.1. What is missing:
  - `main` is behind its own release: `origin/main` is an ancestor of v2.15.1, 10 commits back.
  - The README changelog does not say that 2.13 and 2.14 were views-only and that the module left for Worktable.
  - The views branches are still live.
- **The work:**
  - fast-forward `main` to v2.15.1;
  - add one changelog note (2.13/2.14 views-only, the module moved to Worktable, no consumer should constrain to them after the cutover), and tag that commit v2.15.2;
  - tag `feature/views`, `feature/views-saved` and `feature/views-matrix` as `archive/views`, `archive/views-saved` and `archive/views-matrix`. Branch deletion and their worktrees are left to Stefan.
- **Stops before anything is published:** before pushing `main`, the tags or v2.15.2, Stefan confirms (the release reaches every consumer through composer).
- **A trap for Laika today, reported, not fixed:** Laika requires `^2.13`, which already allows 2.15.1, a release without views. Its lock holds 2.14.0, so a plain `composer update` would silently drop the views module that Laika's planning screens still use. Laika's constraint moves at the cutover; until then, nobody runs `composer update netdust/ntdst-baseline` there.

Source: "removing the views module from baseline" · form: Stefan's decision above.

## Gates
- **U1:** the populated-rebuild test (named above) passes, and `bun run gate` passes.
- **U2:** `bun run gate` passes, including the route × role matrix. In a real browser: a magic link from the development outbox signs an editor in through the confirm page. An owner sees only their own Toewijzingen and Afwezigheden in the grid. A seeded view refuses Save and allows "Save as new". A session-less request gets 401. The public route serves a public query view by token and nothing else.
- **U3:** `bun run check` fails on a planted domain word and passes without it.
- **U4:** the import of an invented Laika-shaped export passes in the gate. The staged-export check fails on a planted export. The parity gate on Stefan's real export passes locally, and `specs/step-0e/parity.md` records the counts.
- **U5:** the Laika repo's own gate (`composer gate`) passes, with exporter tests on invented posts.
- **U6:** atelier's tests pass. In Laika's DDEV, the shortcode renders the public voorstellingen from a local engine.
- **U7:** baseline's `composer gate` passes on the fast-forwarded `main` plus the changelog commit. Nothing is pushed until Stefan confirms.

Then stop and report.

## Out
- **The cutover,** a separate slice: HTTPS, the Host allowlist for a real domain, Secure session flags, backups and a restore drill, the independent review, and Laika's composer constraint.
- **Signed person links and record tokens** (step 2).
- **Publication (step 4),** apart from the single public read route above.
- **Mail delivery,** beyond the console in development.

## After the plan review (Stefan, 2026-10-06)
- **Where the data lives.** No server runs atelier's PlanningService (not Laika's `main`, not `staging`). Laika's real planning data is the Glimworm workbook, transcribed into a seed. The seed is `bin/seed/glimworm.php` with `glimworm.json`, which exist only on the planning branches (`feature/views-saved`, worktree `/home/ntdst/Sites/laika-planning-model`). It holds the production, the people with their dietary needs, the venues, every activity with who is on it, and the absences.
  - **How it is loaded:** locally. Stefan runs the seed in that worktree; both checkouts share the one `laika` DDEV database. The exporter then reads that database, and the parity gate covers all six datasets. Afterwards `… glimworm.php remove` takes exactly the seeded records out (each carries `_laika_seed = glimworm`). No deploy, no pull. Source: Stefan, 2026-10-06 ("there a seed script user real Laika data"; "it was a worktree planning model").
  - **What parity proves here:** the export → import → engine path on real names and assignments. What WordPress shows is what the seed wrote.
- **An activity with no start** gets the day-line hour, `T05:00`, so its plandag is its own date, flagged `custom.laika_geen_start`.
- **An activity with no production** goes under one placeholder Productie, `(zonder productie)`.
- **Corrections to this spec's U5, from the plan review:**
  - Activity `location`, `place` and `notes` do have columns (`locatie_id`, `plaats`, `notities`) and are exported. The title maps to `omschrijving`.
  - Persoon has `dietary`.
  - The own company is named with `--own`, because atelier's profile holds no link to it.
  - Only source-language records are exported.

## Settled (Stefan, 2026-10-06)
All six open questions were answered and are written into the units above: the public route with its four constraints, maybe, role order, the name split, activity kinds, and the account link with the role named owner. Two additions came with them, also written in: the export's personal data is gitignored with a staged-file gate check, and sign-in answers identically with a rate limit.

## Plans
One plan per unit, each `specs/<feature>/plan.md` in this repo with its `**Spec:**` naming this file. The plans for other repositories name their repository and branch. They live here so the set is reviewed as one. The worktable plans run in the order listed, each merged before the next branches: the migrator is Stefan's entry condition, the vocabulary plan renames the engine's test fixtures before auth rewrites every test, and the import runs as an administrator. The four plans in other repositories are independent of each other.

| Plan | Repository · branch |
|---|---|
| `specs/step-0e-migrator/plan.md` | worktable · `feature/step-0e-migrator` |
| `specs/step-0e-vocabulary/plan.md` | worktable · `feature/step-0e-vocabulary` |
| `specs/step-0e-auth/plan.md` | worktable · `feature/step-0e-auth` |
| `specs/step-0e-import/plan.md` | worktable · `feature/step-0e-import` |
| `specs/step-0e-laika-export/plan.md` | laika · `feature/worktable-export` (`make feature`) |
| `specs/step-0e-atelier-view/plan.md` | atelier · `feature/worktable-view` |
| `specs/step-0e-baseline-release/plan.md` | ntdst-baseline · `feature/drop-views` |

## Report (at the end)
- The ledger rows moved, with line counts.
- Hours per unit.
- What in `docs/SPEC.md` can't be built as written.
- The proposed `docs/SPEC.md` diff: the role rename, owner columns, the migrator, the import format, the public route, and the vocabulary rule.
