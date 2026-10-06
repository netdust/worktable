# Step 0e: accounts, import, and the Laika cutover's groundwork

The last slice of build step 0 before the cutover. It replaces the temporary dev actor with engine accounts, imports Laika's real planning data through a generic command, proves parity on that data, and does the work outside worktable that the cutover needs: the Laika exporter, the WordPress view shortcode, and a baseline release without the views module. The cutover itself is a separate slice: HTTPS, the Host allowlist for a real domain, session flags, backups with a restore drill, and an independent review.

0e covers six independent units in four repositories. This file is the parent spec. Each unit gets its own plan and branch, and the set of plans is reviewed together (`/plan-review step-0e`).

## Decisions taken before this spec (Stefan, 2026-10-06)
- **Real data stays outside every repo.** Stefan pulls Laika's data into its DDEV himself (`make pull`). The exporter writes JSON to a path outside all repositories. The parity gate runs locally against that file and commits only counts and checks, never rows. No agent pulls from a server.
- **Baseline: a release without views.** In ntdst-baseline, `main` is brought up with the non-views work of v2.13–v2.15, a new minor is cut without `services/views`, and the `feature/views*` branches are archived. Laika's composer constraint moves at the cutover, not in 0e.
- **The WordPress "block" is a shortcode plus a YOOtheme element** in atelier, following PerformanceService's pattern.
- **Three roles:** administrator, editor and person. An account linked to a Persoon gets the person role. It sees only rows whose declared owner column for `person` is its Persoon id, and writers refuse by role. Signed links stay in step 2.
  - Ruling, pending Stefan: the link lives on the engine's account (`subject_id`, set by an administrator), not as a `user_id` column on Persoon. The engine cannot know Persoon, and the account is the engine's table.
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
  - a link request always answers 200 and never reveals whether an account exists;
  - tokens are hashed at rest, single-use and claimed atomically, and expire after 15 minutes;
  - link requests are rate-limited per email and per IP;
  - in development the link is printed to the console, with no mail provider.
- **Where it departs from Folio:**
  - Consuming a link is a POST from a confirm page, not a state-changing GET, so a mail scanner's prefetch cannot burn it.
  - Session ids are hashed at rest.
  - A new session id is issued at sign-in.
  - Expired sessions and links are swept.
  - The session cookie is HttpOnly and SameSite=Lax. `Secure` is set whenever the engine is served over HTTPS (that is the cutover's job; in 0e it is off on localhost).
- **The dev actor goes away.** `dev-actor.ts` is removed. Every route needs a session except the link request, the confirm page, the consume POST, and the public route in U4. A request without a session answers 401.
- **Bootstrap.** The first administrator is created by an engine CLI command (`serve.ts --create-admin <email>`), never through a route.
- **Accounts table** (engine, generic): email (unique, case-insensitive), role, `subject_id` (nullable; for role person, the id the owner columns are matched against), created_at, disabled_at.
- **Roles.**
  - administrator: everything, including accounts and roles.
  - editor: reads and writes every dataset and query that a writer does not restrict, and owns saved views.
  - person: scoped by owner columns (below). A person account without a `subject_id` sees nothing.
- **The rename.** The current dev role `admin` becomes `administrator`.
- **The planner rename.** "planner" disappears from code and docs; `docs/SPEC.md`'s Access table says editor.
- **Owner columns.** A dataset or query declares `owners: { person: '<column>' }`. For a person session the engine filters every read by that column, and refuses a write to a row outside it (404, so ids don't leak). Writers receive the actor and may refuse further.
  - Theatre declares `person` owners on Toewijzing (`persoon_id`) and Beschikbaarheid (`persoon_id`).
  - Persoon declares its own `id`, so a person sees their own Persoon row.
  - A source without a person owner column is invisible to a person (404).
- **Seeded views move to a system owner** (owner id −1) that no session can assume. They are read-only for everyone (403 `read_only_view`) until copied ("Save as new"), and listed as shared. Existing views owned by the dev actor (0) are migrated: seeded ones to the system owner, any others to the first administrator.
- **The permission check runs before the in-use check** (the 0e requirement in `docs/SPEC.md`). An actor who may not delete gets 403 without `by`. A test proves the order.
- **A generated test matrix:** every route × every role (none, person, editor, administrator) × allowed or denied, generated from one table of routes and roles, with each cell asserting its status. A new route without a row fails the matrix test.

Source: Stefan's brief: "engine accounts by magic link replacing the dev actor, with generic role names (administrator, editor; rename "planner" before it spreads); actor scoping through owner columns; seeded views migrated to a system owner no session can assume and read-only until copied; the permission check before the in-use check; a generated test matrix of every route against every role" · the three roles: Stefan's decision above.

### U3. The vocabulary check in the gate. (worktable, with U2)
`bun run check` fails when a domain word appears in `packages/engine`. The word list is built from the domain packages' declared dataset, query and column names, plus a small fixed list (for example persoon, activiteit, productie, fiche). Comments and tests are checked too. The check has its own test, which plants a word and expects a failure.
Source: "the vocabulary check in the gate (no domain word in packages/engine)."

### U4. The generic JSON import command and the parity gate. (worktable, `feature/step-0e-import`)
- **The import command:** `serve.ts --import <file.json> --db <file>`.
  - **What it reads:** `{ "datasets": { "<name>": [ { "legacy_id": …, …columns } ] } }`.
  - **Order:** rows are inserted in foreign-key order, and relations are resolved from `legacy_id` to the new id.
  - **What is kept:** each dataset keeps `legacy_post_id` for one release (a declared column added for import, per `docs/SPEC.md`).
  - **Validation:** rows go through the dataset's type and option validation. The writers' cross-field rules are checked too, but they report instead of refusing: the import writes a report of every refused row and stops before committing if any were refused, unless `--accept-report` is passed.
  - **Atomicity:** the whole import runs in one transaction, and it is idempotent on an empty database.
  - **Revision:** one batch per import, actor = the administrator who ran it.
  - **What it never does:** call WordPress.
- **The parity gate** (`bun run parity <export.json>`, run locally by Stefan or on his authorisation, never in CI):
  - it imports into a temporary database;
  - it compares counts per dataset;
  - it checks that Laika's Planning, Toewijzingen and Afwezigheden views (as the theatre package redeclares them) return the expected rows for sampled weeks: totals per week, assignments per person, absences per person;
  - it writes `specs/step-0e/parity.md` with counts and pass or fail only, never row contents.
- **The public read route** for the WordPress shortcode (pending Stefan, see "Open in this spec"): `GET /api/public/views/:share_token` → the rows of a SavedView marked `public`, read-only, in `/rows` shape, with no session. Only views explicitly marked public with a token are served, and `voorstellingen` is the first.

Source: "the generic JSON import command … the parity gate on imported data" · `docs/SPEC.md` Storage ("legacy_post_id kept for one release").

### U5. The Laika exporter. (the private Laika repo, `feature/worktable-export` via `make feature`)
- **What it is:** a WP-CLI command in `laika-core` (site-specific, tracked in the Laika repo), `wp laika export-planning --out=<path>`. It writes U4's JSON from atelier's repositories, not from raw SQL.
- **Mapping:**
  - person → Persoon (its `wp_user` is not exported: engine accounts are made in the engine), with the post title split into voornaam and achternaam on the last space (reported when ambiguous);
  - organisation → Organisatie;
  - production → Productie;
  - activity → Activiteit:
    - date + start/end → `start_at`/`eind_at`;
    - `status`: option→`optie`, confirmed→`bevestigd`, cancelled→`geannuleerd`;
    - `kind` → `soort`: show→`voorstelling`, rehearsal→`repetitie`, build→`opbouw`, strike→`afbouw`, travel→`reis`, overnight→`overnachting`, meal→`maaltijd`, other→`andere`; soundcheck and free have no target (pending Stefan, see "Open");
    - fields with no column yet (`performance`, `location`, `place`, `settled_by`, `notes`) are counted in the export's report, not exported;
  - assignment → Toewijzing;
  - absence → Beschikbaarheid (whole days → 00:00–23:59).
- **Cleaned at export, each case listed in the export's report:**
  - **Assignment status:** `requested`→`uitgenodigd`, `confirmed`→`bevestigd`, `declined`→`geweigerd`, and `maybe`→`uitgenodigd` (pending Stefan, see "Open").
  - **Organisation roles:** the `organisation_role` taxonomy (venue, coproducer, funder, presenter, several per organisation) maps to one `soort` by precedence. The own company is `eigen`, then venue→`venue`, coproducer→`partner`, funder→`agentschap`, presenter→`partner`, and nothing→`partner`.
  - **An assignment holding both a person and a name** keeps the person and drops the name.
  - **A duplicate (person, activity) pair** keeps the oldest row and drops the rest.
- **Where the output goes:** a path outside every repository. No client data is committed, and the exporter's tests use invented posts.

Source: "the Laika exporter in the private Laika repo, with mapping for maybe, the organisation roles taxonomy, and rows holding both a person and a name or a duplicate pair, cleaned at export" · location: Stefan's decision above.

### U6. The WordPress view shortcode. (atelier, `feature/worktable-view`)
- **What it adds:** a new atelier service, following PerformanceService's shape:
  - `[worktable_view token="…"]` renders a public view's rows, through U4's public route, as escaped HTML;
  - `[worktable_query source="voorstellingen"]` does the same for the public `voorstellingen` view;
  - a YOOtheme element wraps it, guarded like `services/performance/yootheme.php`.
- **Fetching:** the engine URL comes from configuration (`site.yml` or wp-config, never hard-coded). The fetch is server-side, with a short timeout, a transient cache, and a quiet empty state when the engine is down. The engine is never called from the browser.
- **Escaping:** every value is escaped (`esc_html`/`esc_attr`), per `netdust-wp:wp-security`.

Source: "the WordPress view block" · form: Stefan's decision above.

### U7. A baseline release without views. (ntdst-baseline, `release/2.16`)
- **The release:**
  - bring `main` up to the non-views work of v2.13–v2.15, through a release branch;
  - remove nothing that exists on `main` today; `services/views` is never merged;
  - cut v2.16.0 without views, with a changelog entry saying so;
  - archive `feature/views`, `feature/views-saved` and `feature/views-matrix` as tags (`archive/views-*`), not deletions.
- **Stops before anything is published:** before pushing the tag, Stefan confirms (it is published to every consumer through composer).
- **Laika's constraint does not move in 0e.**

Source: "removing the views module from baseline" · form: Stefan's decision above.

## Gates
- **U1:** the populated-rebuild test (named above) passes, and `bun run gate` passes.
- **U2/U3:** `bun run gate` passes, including the route × role matrix and the vocabulary check. In a real browser: a magic link printed to the console signs an editor in. A person sees only their own assignments and absences in the grid. A seeded view refuses Save and allows "Save as new". A session-less request gets 401.
- **U4:** the import of an invented Laika-shaped export passes in CI. The parity gate on Stefan's real export passes locally, and `specs/step-0e/parity.md` records the counts.
- **U5:** the Laika repo's own gate (`composer gate`) passes, with exporter tests on invented posts.
- **U6:** atelier's tests pass. In Laika's DDEV, the shortcode renders the public voorstellingen from a local engine.
- **U7:** baseline's tests pass on the release branch. The tag waits for Stefan.

Then stop and report.

## Out
- **The cutover,** a separate slice: HTTPS, the Host allowlist for a real domain, Secure session flags, backups and a restore drill, the independent review, and Laika's composer constraint.
- **Signed person links and record tokens** (step 2).
- **Publication (step 4),** apart from the single public read route above.
- **Mail delivery,** beyond the console in development.

## Open in this spec (Stefan)
1. **The public read route** (U4) for the shortcode, addressed by the `share_token` of a SavedView marked `public`. It is recommended, because without it the shortcode cannot read the engine once every route needs a session. The alternative is a service account token for the website.
2. **Laika's `maybe` assignment status.** It is exported as `uitgenodigd` (recommended: an invited person who has not answered), or as `geweigerd`, or not exported.
3. **The organisation-role precedence in U5.** Is it right?
4. **The persoon name split** (on the last space, ambiguous names reported).
5. **Laika's activity kinds `soundcheck` and `free`** have no Activiteit soort. Map soundcheck→`opbouw` and free→`andere` (recommended), or add options to theatre.
6. **The person account's link** lives on the engine account (`subject_id`), not on Persoon (see Decisions).

## Report (at the end)
- The ledger rows moved, with line counts.
- Hours per unit.
- What in `docs/SPEC.md` can't be built as written.
- The proposed `docs/SPEC.md` diff: the role rename, owner columns, the migrator, the import format, the public route, and the vocabulary rule.
