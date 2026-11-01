# Studio: Netdust studio on worktable

Written on 2026-10-21 from a brainstorm with Stefan, and approved by him the same day ("ok"). Revised on 2026-10-22 after he clicked through the first working version (see "Revised on 2026-10-22"). This is a parent spec, cut into plans (see "The cut"). "Brainstorm" means that conversation. A requirement marked `invented — approved 2026-10-21` was Claude's call, approved with the document. Each one is listed again under "Calls approved on 2026-10-21".

## Why

Stefan runs about thirty WordPress sites for clients, seven of them under a maintenance agreement (SLA). Today the fleet is managed from `~/Sites/netdust-wp-manager`: shell scripts, a small dashboard, and a health snapshot that is overwritten on every run. That gives no history, no single place to see what is happening, and no way to act on a site except from the command line. Studio replaces it. It becomes his view of what has to happen and what is being done, across sites and across the projects he builds with Claude Code.

> "this whole php thing makes we want to double down on my fleet." — Stefan
> "I believe we need to stop developing Leika for worktable but start fleet domain where i can manage my website like this" — Stefan
> "eventually this is my netdust studio where i also want to list clients, projects progress etc" — Stefan

Laika development on worktable stops. Laika is not a paying commitment (Stefan, "1 NO", to "is Laika a paying client expecting delivery?").

## What studio is, in one screen

Studio opens on a dashboard that answers four questions on a Monday morning:

> "sites healthy, where did we stop working, what's on the table. something in the agenda?" — Stefan

The approved mockup is the worktable dashboard prototype (`design/dashboard-prototype.html`) with studio data. It was shown on 2026-10-21 ("that looks amazing"). Because it carries client names, the mockup itself stays outside this repo, in the brainstorm's local `.superpowers/` folder. Its sections:

- **Nu:** sites in order (a progress tile, "24 van 30"), storing (red when above zero), let op (orange), wacht op jou (orange).
- **Waar we stopten:** a list of projects with their stage and last step, beside a list of sites that need attention.
- **Deze week:** the agenda as a week strip, beside today's items.
- **Op tafel:** open tasks due this week or overdue, and updates waiting for confirmation, with inline buttons.
- Quick actions in the header: Nieuwe taak, Nieuw agendapunt. An action always starts from the sites it acts on (S9), so there is no Nieuwe actie in the header.
- The space switcher (top left) is the organisation: picking a client narrows every tile.

## Goals, non-goals, anti-goals

**Goals (v1)**
- See the fleet's health, with history, per site and per client.
- Run health checks, malware checks, updates and smoke tests from studio, per site and in bulk.
- See where every project stands, kept current by Claude Code while it works.
- One agenda: planned items appear by themselves, and Stefan adds his own.
- Local Claude Code reads and writes studio.

**Non-goals (v1, later or never)**
- Report emails to clients. They come right after v1 ("after is ok"), and need engine step 4 (Publication) and a real mail transport.
- Contacts, agreements, renewals (Claude's guess, accepted with "ok"). They come with report emails.
- Any chat inside studio, and Sofie integration ("forget about it. first the domain and the script and making sure local claude can do its thing").
- Public pages of any kind ("forget about report pages").
- An AI agent that acts on its own ("no agentic layer or anything yet").
- E2E runs from studio. The SLA sites have no tests.
- Selection in skins other than the table (the engine's `selection-actions` spec).
- Deeper malware scanners (maldet, Wordfence CLI).
- Moving netdust-wp-manager's non-fleet parts (see "Open for Stefan").

**Anti-goals: failure even if it technically works**
- A click, a request row or an MCP call that can run an arbitrary command on a server.
- An empty or unreadable registry that reads as a healthy fleet. netdust-wp-manager shipped this bug: three scripts scanned a deleted directory, iterated zero sites and exited 0.
- Production touched by a write that nobody with the administrator role confirmed.
- Stale health data that looks current.
- A second registry of sites kept by hand.

## Constraints

- **No dependency on netdust-wp-manager.** Studio does not call its scripts, read its `dashboard/data/cache.json`, or use its registry code. Knowledge is ported; code is not called.
  Source: "this replaces fleetmanager, don't make it depended on that folder" — Stefan.
- **worktable's own rules hold** (`AGENTS.md`):
  - the engine never learns a domain word
  - no WordPress code and no client data in this repo
  - one engine instance per client, one database file each
  - domain names are Dutch
  - the scope lock in `docs/SPEC.md` is edited before any code
- **Studio is private.** It binds 127.0.0.1 on Stefan's machine. Nothing in v1 is reachable from outside it.
- **Each site's `site.yml` is the source of truth for a site.** Studio reads it and never writes it.

## Where it lives

- **S1 Two homes.** `packages/studio` in worktable holds the domain: datasets, queries, writers, lifecycle, actions, seeds, with invented fixtures only. A new private repo, `~/Sites/netdust-studio`, holds the instance:
  - the database file
  - the service accounts' tokens
  - the registry sync
  - the worker and its action handlers
  - the schedules
  - the systemd user units

  The generic MCP server (S18) is engine code and lives in worktable.
  Source: invented — approved 2026-10-21. It follows from "No WordPress code anywhere in this repo", "No client data in this repo", "Exporters live in the client's own repo" (`AGENTS.md`), and from "this replaces fleetmanager".

## The domain (`packages/studio`)

- **S2 Organisatie.** A client or Netdust itself: naam, soort (klant · intern), notities. It is the domain's space.
  Source: "client/organisation dataset yes" — Stefan.
- **S3 Site.** One row per site in the registry, keyed by its registry name. Studio shows no site.yml data: from the registry it keeps only the name (to know the site exists) and whether it is still there. Technical facts (domain, servers, paths, risk, markers, staging) stay in `site.yml`, where the worker and the deploy tooling read them.
  - Studio's own: organisatie, SLA, extra smoke URLs, notes. SLA is imported once from `site.yml` when the site first appears; after that it is studio's.
  - The worker's: the health columns and the screenshot.
  - Views: a table, a board by gezondheid, and a gallery of homepage screenshots (S24).

  Source: "ok, a split is good. the studio never shows site.yml data. its not needed there" — Stefan, 2026-10-23.
  - Health columns: status (ok · let op · storing · onbekend), http, responstijd, wp, php, updates_plugins, updates_themes, updates_core, tls_dagen, laatste_check.
  - Studio stores no SSH host, path, domain or other technical fact.

  The REST layer strips `readonly` columns from every write (`cutBody`), so the registry and health columns are plain columns. Site's writer lets a person write only studio's own columns, and lets a service write the registry and health columns (and SLA only when it creates the site). Revision records who wrote each value.
  Source: "sites healthy" — Stefan. The registry rule follows netdust-wp-manager's INV-3 (generated from `site.yml`, never hand-maintained). The enforcement is invented — approved 2026-10-21.
- **S4 Actie, shown as "Opdrachten".** A request:
  - soort: gezondheidscheck · malwarescan · bijwerken · smoketest
  - bijwerken always covers WordPress core, plugins and themes (S15); there is no per-component choice (plan studio-domain, ruling)
  - the status (S10)
  - aangevraagd_door, gepland_op, samenvatting (long)
  - its sites, as links with a state per site: wacht · te bevestigen · bezig · klaar · mislukt · overgeslagen, plus the preview and a detail text per link. The action that creates the request creates its links in the same batch (S9). A request's sites never change after it is made, except that Stefan may drop one before confirming.

  Stefan never adds an Opdracht by hand: "i will never add anythinh to opdrachten en onderhoudslog, correct? this is all done because actions happened somewhere else, thats why they go to logboek" — Stefan, 2026-10-22.

  **gepland_op** means "not before": the worker leaves a request alone until then. A bijwerken request cannot be future-dated (the writer refuses), so a confirmed update runs right after confirmation, never later while Stefan is away. Read-only kinds may be future-dated. The schedule (S16) creates the next run ahead of time, so it shows in the agenda.
  Source: "i need to run action bulk and per site, command line is not good enough." — Stefan.
- **S5 Onderhoud, shown as "Onderhoudslog".** What was actually done: site, datum, soort, uitkomst (ok · bevindingen · mislukt), samenvatting, details (long), actie (relation). Its writer allows creates from `service` accounts and refuses every update and delete. The worker is the one that writes it, by the same convention as S3. Together with Revision, this is the maintenance log.
  Source: the brainstorm's "missing piece": a durable per-site maintenance log. Agreed with the playback ("ok").
- **S6 Project and Werkpakket, shown as "Features".**
  - A **Project** is an engagement or a product: naam, organisatie, repo (a path), notities.
  - A **Werkpakket** ("Features" in the grid: "Features (Recommended)" — Stefan, 2026-10-22) is one piece of work inside it, one plan and one branch: project, naam, branch, plan (a path to `specs/<feature>/plan.md`), fase (ontwerp · plan · bouwen · review · geblokkeerd · klaar · geparkeerd), laatste_stap, volgende_stap, geblokkeerd_door, bijgewerkt.
  - A Claude session finds its row by repo path plus branch, and creates it if missing. Parallel sessions on one repo each have their own branch, so they never overwrite each other.
  - "Waar we stopten" lists werkpakketten as "project · werkpakket", as the mockup showed.
  - Plan content stays in the repo. Studio holds status and the path.
  - **voortgang** ("14/32") is derived, never typed: every write to a werkpakket counts its plan steps (S7), the done and skipped ones over all of them, and stores the result. A werkpakket without steps has none. The agent touches the werkpakket at every stop anyway, so the count is as fresh as `laatste_stap`.
  Source: "today I don't see fine-grained work of the agent. Each feature are big plans that can take a full day to complete" — Stefan, 2026-10-31.
  Source: "a planner for todos, plans, building where claude code can write/access status of a project. this way i can see whats going on during development" — Stefan. The two-level split, the matching key and the stage names are invented — approved 2026-10-21 (the builder check found about 15 worktable worktrees in flight at once).
- **S7 Taak.** titel, status (open · bezig · geblokkeerd · gedaan · overgeslagen), deadline, wie, notities, stap, and optional relations to project, organisatie, werkpakket, site and actie.
  - **Plan steps are tasks.** An agent mirrors its plan's tasks into Taak rows on the werkpakket, `wie` claude, one row per plan task, created in plan order and without a deadline, so they stay off Op tafel and the agenda. `stap` holds the plan's own label for the task ("Task 3"); within one werkpakket a label is unique (the writer refuses a second), so a re-sync finds its row instead of adding one. The plan stays the source of truth: Studio mirrors it and may lag it.
  - Op tafel and the agenda show every unfinished task with a deadline: open, bezig or geblokkeerd.
  Source: "We already have tasks in worktable. Tasks can be planned and hold state of these steps?" — Stefan, 2026-10-31. The added states and the `stap` key are invented — approved 2026-10-31 ("we know enough").
  - Stefan, Claude and the worker create tasks. The worker creates one per failure or finding. Every task the worker or the sync creates is due the day it is made, so it lands on Op tafel (S11).
  Source: "what's on the table" — Stefan.
- **S8 One Agenda.** The grid shows one Agenda. Its main view is a calendar on the **agenda** query, which unions everything dated: Stefan's own items, requests by gepland_op, and open tasks by deadline. `+ Nieuw` on it asks title and date and saves an Agendapunt (titel, datum, start, eind, organisatie, soort afspraak · deadline · herinnering, notities). The Agendapunt dataset is labelled "Agenda", and the agenda query is listed under it (`of`), so the tree holds one entry. Its other view is a table of his own items, for editing.
  Source: "a agenda where planned items appear and where i can add items amnually too ofcourse" — Stefan; "an Agenda should work like an agenda, i add by hand but it can also import data, so agendapunten should not exist, its confusing" — Stefan, 2026-10-22.
- **S9 Actions on the sites you pick.** The four kinds are selection actions on Site (engine spec `selection-actions`). Stefan ticks sites in a table view, or takes everything the view shows, and runs one. A site's drawer runs it on that site alone. Each run creates one request with one link per site, in one batch. Saved views ("SLA-sites", or one client's sites) are the named sets; there are no groups.
  - In a bijwerken run on more than one site, the worker leaves a `risk: high` site out at preview, with the reason on its line ("Hoog risico: alleen per site bijwerken"). Such sites are updated one at a time, through their staging route (S15).
  - A selected site that is no longer in the registry gets its link as overgeslagen ("niet in registry"), so taking everything a view shows always works.
  Source: "a button that acts on the filtered items is better and/or making sure grid items are selectable should also be possible" and "do you agree this is a better path? more natural to work with? if so, yes, engine first" — Stefan, 2026-10-22, replacing the groups of 2026-10-21 ("i find this a bad solution").
- **S10 Lifecycle of an Actie.**
  - Read-only kinds: aangevraagd → bezig → klaar | mislukt. Aangevraagd → geannuleerd.
  - Bijwerken: aangevraagd → voorbereiden → voorbereid → bevestigd → bezig → klaar | deels | mislukt. Voorbereiden is the worker's claimed preview (plan studio-domain, ruling). Aangevraagd, voorbereiden or voorbereid → geannuleerd.
  - On a high-risk site, voorbereid means staging was updated and tested green (S15). On every other site, it means the production preview is written.
  - The transition voorbereid → bevestigd declares the role `administrator` only. Both service accounts (worker, Claude) are `editor`, so neither can confirm a write to production.
  - One confirmation per request, after the per-site preview, in the opdracht's drawer.
    - Clicking an action in Sites opens the new opdracht in the drawer at once. It follows the worker live: each site line gains its one-line summary, and the opdracht shows the progress.
    - When the preview is done, the drawer offers Bevestigen and Annuleren, and on each site line "Niet nu" (take it out) or "Toch wel" (bring it back).
    - Closing the drawer loses nothing: the opdracht waits under Te bevestigen on the dashboard, whose row opens the same drawer.
    - A site the action or the worker skipped (high risk in bulk, not in the registry, unreachable) has no preview and cannot be brought back.

  Source: "maybe this should happen in a opdracht drawer or a popup that opens instead of me having to nivagate around the app" and "yes, spec it that way" — Stefan, 2026-10-22, on the engine's `specs/drawer-actions/spec.md`.
  - What is confirmed is pinned: the worker installs exactly the previewed versions. A premium update whose pending version changed since the preview is skipped and reported.
  - A preview older than 24 hours expires: the request goes back to aangevraagd for a fresh preview.
  - A confirmed update the worker has not claimed within 24 hours of its preview expires too, and Stefan can cancel a confirmed update until the worker claims it (review 2026-10-23).
  Source: invented — approved 2026-10-21. Stefan was asked "does the click mean go, or preview first" and has not answered. The role guard is how the anti-goal "production touched by a write nobody confirmed" is enforced.
- **S11 Queries for the dashboard.** sites_aandacht: status not ok, or laatste_check older than 8 days, or not in the registry any more. sites_in_orde: the live sites not in sites_aandacht. op_tafel: open tasks with a deadline this week or earlier, listed under Taken (`of`), because it is a filter of tasks. Tasks without a deadline stay in Taken only. Requests waiting for confirmation have their own tile, Te bevestigen. A failed request is not on the table: the worker's task per failure carries it, and Gedaan clears it. The dashboard's numbers read these and Site.
  Source: the approved mockup; "op tafel should be a filter of taken, no? everything i need to do in near future( today or this week )", "Leave them out (Recommended)" on tasks without a deadline, and "Via the worker's task (Recommended)" on failures — Stefan, 2026-10-22.
- **S12 The seeded dashboard.** As in the mockup (sections, tiles, quick actions). Two exceptions:
  - "Wacht op jou" is a plain count of op_tafel; Te bevestigen shows its own count in its tile. The breakdown text in the mockup is dropped, because a stat tile only shows its change against the previous period.
  - Inline buttons are tile `set` writes: Gedaan on a task. The Te bevestigen tile has no inline Bevestigen: clicking its row opens the opdracht's drawer, so Stefan always confirms after seeing the preview ("ok, remove it" — Stefan, 2026-10-22).
  - Quick actions are creates (`dashboard.ts` `actionOf`): Nieuwe taak and Nieuw agendapunt. Actions start from Sites (S9).
  - The tree's sections: Vloot (Sites), Werk (Projecten, Features, Taken), Planning (Agenda), Logboek (Opdrachten, Onderhoudslog), Klanten (Organisaties). The per-site links of a request stay out of the tree and open from the request's drawer.
  Source: "that looks amazing" — Stefan, on the mockup. The Logboek: "maybe we need a section log/rapports ?" — Stefan, 2026-10-22. The rest of the sections are invented — approved with this revision.
- **S24 Site screenshots.** Each gezondheidscheck takes a screenshot of the production homepage and stores it as the site's attachment of kind screenshot. The Sites gallery shows the latest one per site.
  Source: "Sites has Risico ins't that enough for board? and a screenshot of the homepage would be a good image" — Stefan, 2026-10-22.

## The worker (`netdust-studio`)

- **S13 A plain script, no AI.** A long-running Bun/TypeScript process, a systemd user service on the same machine as studio. It polls the engine every few seconds with its own service token. It claims a request by its transition to bezig (the engine answers a second simultaneous claim with 409), runs it, writes the per-site link states, Onderhoud rows and tasks, and finishes the request. It runs only while the machine is on.
  Source: "ok, but this can be a normal script no? cli?" — Stefan. Bun/TypeScript and "same machine" are invented — approved 2026-10-21.
- **S14 A fixed action list.** Each soort maps to one handler in the worker. A request's row selects a handler and names sites by registry name. Host, path and WordPress path come **only** from that site's `site.yml`, resolved at run time, for the production environment by name. Never from the database, never by a "production-first" fallback. Commands run as argument arrays, never as interpolated shell strings. Read-only kinds use read-only WP-CLI commands only.
  Source: invented — approved 2026-10-21. These are the lessons of netdust-wp-manager's INV-3/INV-5 and its `site_remote_target` field-shift guard, ported as rules.
- **S15 The handlers.**
  - **Gezondheidscheck:**
    - HTTP to the production domain: status, response time, days left on the TLS certificate
    - over SSH: WordPress and PHP versions, pending plugin, theme and core updates as JSON
    - result: the Site's health columns, one Onderhoud row, and a homepage screenshot (S24)
  - **Malwarescan:**
    - `wp core verify-checksums` and `wp plugin verify-checksums --all`
    - plugins that cannot be verified (premium) are listed as such, not as findings
    - each finding becomes a task
  - **Bijwerken:**
    - Targets are WordPress core, plugins and themes. YOOtheme Pro is included explicitly.
    - The route depends on the site's `risk:` in `site.yml`:
      - **`risk: high` takes the staging route.** First staging is brought to production's core, plugin and theme versions, so the test means something. Then staging is updated and tested: its `@e2e` checks where the site has them, otherwise the smoke test. Green means the request waits in voorbereid with the exact versions that passed. Red means it stops: the staging result goes on the table as a task and production is untouched. A high-risk site without a staging environment is refused, with a task.
      - **Every other site takes the direct route.** The preview lists per site what would change (name, from → to). Unreachable sites are skipped. The request then waits in voorbereid.
    - After confirmation, per site in turn: a database export on the server, the confirmed versions, then the smoke test on production. Core updates include the database upgrade. On a high-risk site, the confirmed versions are the ones that passed on staging.
    - **Sites whose plugins live in `composer.json`** are not updated by the worker, because a deploy would undo a server-side update. There, Bijwerken creates a Werkpakket ("composer update"), which goes through the devops flow (branch, `make promote`, `make ship`).
    - **YOOtheme Pro comes from a zip Stefan downloads.** YOOtheme issues one API key per website, entered in that site's customizer, and offers no documented key-based download (https://yootheme.com/docs/wordpress/updating). So once per release Stefan downloads `yootheme_wp_<version>.zip` from his account into a local folder in `netdust-studio`. The worker installs that exact zip, pinned by its version, on staging and production through the same preview and confirmation. No key is stored by studio. Source: "ok, zip folder is fine" — Stefan, 2026-10-21, replacing "I have API key stored locally".
    - On a failed smoke test: roll back what changed where WordPress.org versions allow it, mark the site mislukt, and create a task naming the database export. A database is never restored automatically.
    - A plugin that a site's `health.markers` protect is never updated by studio. It is skipped with that reason, and a task goes on the table, because an update silently wipes the patch the marker guards. After every update, the worker checks the site's markers. A missing marker marks the site mislukt.
    - Sites with `risk: high` are skipped in a bulk run (S9) and are updated one at a time. The worker re-checks this, and that every link it applies has a preview, at apply time.
  - **Smoketest:**
    - homepage answers 200 with no PHP error markers in the body
    - `wp-login.php` answers 200
    - `/wp-json/` answers JSON
    - plus the site's extra URLs
  Source: "i want to run a health, malware script easly", "i want to easly update wordpress + plugins for all site", "i want to easly run smoke tests" — Stefan. The routes: "updating plugins can't happen directly on production as you say. first staging, then e2e, all good? we do prodcutoin with smoke. we also need to make sure that wp, plugins and yootheme gets updated" and "what if we do the staging route only on high risk site? and that i have API key stored locally for it's not on the site?" — Stefan, 2026-10-21. The composer-site exception is invented — approved 2026-10-21. The steps are the brainstorm's action matrix ("should we make an action matrix, what buttons, what scripts, how ai gets involved?"). Rollback and backup scope are invented — approved 2026-10-21.
- **S16 Schedules.** The worker creates requests on a timer, as its own service account, with one link per site in the registry. Default: gezondheidscheck and malwarescan for every site every Monday at 07:00. Bijwerken is never scheduled.
  Source: "set a shedule even" — Stefan. The default and "never scheduled writes" are invented — approved 2026-10-21.
- **S17 Registry sync.** The worker reads every `site.yml` under a configured list of roots, on start, hourly, and on demand. The live fleet needs `~/Sites` and a Windows-side Sites folder. A site's key is its `name:`. When two files declare the same name (today: a working copy beside the original, like `*-smoke` or `*-planning-model`), the sync takes neither and writes a task naming both paths. It reads one structure only, schema 2 (S23). A site's production is `environments.production` by name: its `url`, its `path`, its `ssh_host` or else `deploy.ssh_host`, and `deploy.wp_path`. A file without a complete production entry is a site studio checks over the web only. The sync marks it so and puts a task on the table naming the file. It never falls back to older keys. The real files are the test fixtures, in the private repo.
  - It creates Site rows by name, with SLA imported once from `site.yml`, and keeps `in_registry` current. It writes no other `site.yml` fact into studio (S3).
  - It marks sites whose `site.yml` disappeared as not in the registry, and never deletes them.
  - It fails loudly, and writes a task, when it finds zero files or cannot read the root.
  Source: "this replaces fleetmanager, don't make it depended on that folder" — Stefan, plus the anti-goal.

- **S23 One structure for every `site.yml`.** The file keeps its name and its place in every project; skills and the devops tooling keep reading it. The 18 files still on older keys (`remote:`, `hosting:`, `remote.production_path`, `stack.wp_path`) are converted once to schema 2, the structure `netdust-devops`'s `templates/site.yml.tmpl` defines:
  - `environments.production` with `url` and `path`, and `ssh_host` where it differs from `deploy.ssh_host`
  - `deploy.ssh_host` and `deploy.wp_path`
  - `deploy.method: manual` where there is no repo
  - `branch` left out where there is no repo
  - every other key kept as is: `sla`, `risk`, `stack`, `health`, notes

  Claude does the conversion with Stefan, outside studio, before the worker's first working version. Stefan reads each file's diff. Where a file cannot say which path is production, it stays web-only until Stefan fills it in.
  Source: "site.yml is also in skills etc... replacing by other file seems too much.. cnt we just have 1 strcure for all?" and "ok" — Stefan, 2026-10-21.

## Claude Code access

- **S18 A generic MCP server.** An engine-level MCP server in worktable that speaks to any instance's REST with a service token: describe the schema, read rows with a filter, create and update rows, run a declared action, ask a transition. It takes dataset names as arguments, so it knows no domain. Over stdio, Claude Code spawns it.
  Source: "making sure local claude can do its thing" — Stefan. The generic shape is invented — approved 2026-10-21.
- **S19 Claude's account.** A service account `claude` with role editor. Claude can read everything, create requests and tasks, and write Project status. It cannot confirm a write to production (S10). It is registered in Stefan's user-level Claude Code config, so every session on the machine has it.
  Source: "i will probably always use claude code to stear everything and thus the worktable is my view of what has to happen, what is being done" — Stefan.
- **S20 Keeping projects current.** In v1, a line in Stefan's global `CLAUDE.md` tells sessions to update the studio Project at each stage change and when blocked. A netdust-gates hook that does it deterministically is later.
  Source: invented — approved 2026-10-21. The global `CLAUDE.md` is Stefan's file; the line is his to add.

## Running the instance

- **S21 The instance.** `netdust-studio` runs `serve.ts --domain <packages/studio> --db <file>` on 127.0.0.1 as a systemd user service, beside the worker. It has one administrator account (Stefan, signing in by magic link through the outbox mailer on the local machine) and two service accounts (worker, claude).
  Source: "One engine instance per client, one database file each" (`AGENTS.md`); "Studio is private" above.

## Changes to the spec of record

- **S22 Scope lock.** Before any code, `docs/SPEC.md` changes:
  - the studio domain and the generic MCP server move to "in"
  - Laika's theatre-specific steps (5–7, and step 4's call sheets) are parked
  - step 4's Publication and a real mail transport stay as the next engine step, for report emails after v1
  - the theatre package stays in the repo as the first reference domain, beside fiche
  Source: "stop developing Leika for worktable" — Stefan. Keeping theatre is invented — Claude's call, accepted in the playback ("ok").

## The cut

One spec, three plans, each its own `feature/<feature>` branch:

0. **selection-actions** (worktable engine): the engine's own spec `specs/selection-actions/spec.md`. Studio's S8, S9 and S12 sit on it. Added on 2026-10-22.
1. **studio-domain** (worktable): S2–S12, S22, S24's dataset side. First working version: studio's dashboard running on invented fixtures in the real grid. Tasks 1–5 were built before the 2026-10-22 revision; the revised plan reworks what the revision changed.
2. **studio-mcp** (worktable engine): S18. First working version: a Claude Code session lists studio's sites through the MCP.
3. **studio-worker** (`netdust-studio`): S1, S13–S17, S19–S21, S23, S24's screenshot. First working version: the real sites appear in studio from `site.yml`, each with a fresh health check.

## Security surface

The spec flags one, so every plan that touches it owes a `## Threat model` (netdust-gates:threat-modeling):
- service-account tokens that can create requests
- a worker that turns database rows into SSH commands on production
- the MCP server
- extra smoke URLs, which are fetched by the worker
- the YOOtheme zip from a local folder, installed on production

The mitigations named above (S10 role guard, S14 allowlist and site.yml-only targets, S16 no scheduled writes) are its starting point, not its end.

## Left to the builder

- Poll interval, timeouts, and the backup retention on the server.
- The MCP tool list's exact names and argument shapes, within S18.
- Ports, unit files, and where tokens are stored on disk (mode 0600).
- The PHP error markers the smoke test looks for.
- Verifying against the engine, before planning:
  - that a link's `state` shows per site in the drawer
  - that a tile `set` can carry the Bevestigen transition, or else which route does
  - that the outbox mailer covers sign-in on 127.0.0.1

## Calls approved on 2026-10-21

S1 two homes · S3/S5 who may write synced, health and maintenance rows · S4 target as a column, gepland_op as "not before", no future-dated updates · S6 Project plus Werkpakket, matched by repo and branch, stage names · S9 groups for bulk (replaced on 2026-10-22) · S12 one Nieuwe actie instead of four buttons (replaced on 2026-10-22) · S17 duplicate names and several roots · S10 preview-then-confirm for updates, administrator-only confirm, one confirm per request with per-site drop, pinned versions, 24-hour expiry · S13 Bun/TypeScript, same machine · S14 the run-time rules · S15 rollback and backup scope, plugins protected by `health.markers` never updated, `risk: high` sites skipped in bulk, composer sites as a Werkpakket · S16 Monday 07:00, writes never scheduled · S18 generic MCP · S20 a `CLAUDE.md` line before a hook.

## Revised on 2026-10-22

Stefan clicked through studio-domain's first working version (Tasks 1–5 built) and reshaped it:
- Groups are gone. Actions run on the sites he picks (S9), on a new engine feature (`selection-actions`).
- One Agenda (S8). Op tafel is a filter of tasks (S11).
- New names: Opdrachten, Onderhoudslog, Features. The tree gains a Logboek section (S12).
- Sites get a board by gezondheid (risico left studio on 2026-10-23) and a gallery of homepage screenshots (S3, S24).
- Contacts stay after v1 ("After v1, as planned (Recommended)").

## Open for Stefan

- netdust-wp-manager also holds things that are not fleet operations: `new-site.sh` and the scaffolder, the NAS backup, the plugin test harness, and the fleet memory (`memory/GLOBAL.md`, `memory/projects/*`) that the global `CLAUDE.md` names as Layer B. Studio v1 replaces the fleet operations only. Where these go is not decided.
