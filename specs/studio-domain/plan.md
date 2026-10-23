# Studio domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `studio` domain package that turns worktable into Netdust studio: organisations, sites, requests (Opdrachten) started on the sites Stefan picks, with their status rules, the maintenance log, projects and work packages, tasks, the agenda, and the seeded Monday dashboard.

**Architecture:** One new domain package, `packages/studio`, declared exactly like `packages/theatre` (datasets, writers, queries as SQL views, declared actions, seed and views). No engine file changes. Studio joins the e2e harness as a third instance beside theatre and fiche. The branch is cut from `main` (5f1a34b or later). `~/Sites/worktable` itself is on a fix branch 85 commits behind; the review checked `main`.

**Tech Stack:** Bun, TypeScript, SQLite through the engine, bun:test, Biome, Playwright (harness only).

**Spec:** `specs/studio/spec.md` (approved 2026-10-21, revised 2026-10-22), requirements S2–S12, S22 and S24's dataset side. Sibling plans: `specs/studio-mcp/plan.md`, and `specs/studio-worker/plan.md` in `~/Sites/netdust-studio`. Plan review: `/home/ntdst/Sites/netdust-studio/specs/studio/plan-review.md`. It lives in the private repo because it names real client sites, and this repo holds no client data.

## Revision of 2026-10-22 (read this first)

Tasks 1–5 are built (`46a409f` … `78ce848`). Their rulings A, C, D and E stand (E restored with drawer-actions), and B is void (see Rulings). Stefan then clicked through the first working version and revised the spec (see its "Revised on 2026-10-22"):
- groups are gone, replaced by the engine's selection actions (`specs/selection-actions/spec.md`)
- one Agenda
- Op tafel is a filter of tasks
- new labels (Opdrachten, Onderhoudslog, Features, Agenda)
- a Logboek section
- a Sites board and a screenshot gallery (the board groups on gezondheid since 2026-10-23: studio shows no site.yml data)

The data contract, rulings, threat model, Test map and Review Focus below are updated to the revision. Tasks 6–8 replace the old Tasks 6 and 7. Struck items say what they replaced, so a restart can read the history.

**Before Task 6:** `feature/selection-actions`, `feature/drawer-actions` and `feature/studio-mcp` are merged into `main`, and `main` is merged into this branch. Expect trivial conflicts in `playwright.config.ts`, `e2e/auth.ts`, `e2e/global-setup.ts`, `scripts/check-boundaries.ts`, the root `package.json`, `bun.lock` and `apps/grid/src/ui/app.css` (e9352b9's list-tile change). Before Task 6, re-read the merged `specs/selection-actions/plan.md` and `specs/drawer-actions/plan.md` for the final names: `SelectionActionDecl`, `many`, `{ ids }`, `listed: false`, the link item opening its record through `openRelated`, and QuickCreate on a query that creates. Keep both sides. The gate stays green after the merge, before any revision code.

## Before any studio branch

The S22 scope-lock edit lands on `main` as one docs commit, at plan approval, before this branch or studio-mcp's is cut. `AGENTS.md` requires the spec of record to change first, and both plans need it.
- "In" gains: the studio domain (`packages/studio`, `specs/studio/spec.md`), and the generic MCP server (`packages/mcp`). Publication and a real mail transport stay as the next engine step.
- "Out" gains: Laika's theatre-specific steps 4 (call sheets) to 7, parked on 2026-10-21 ("stop developing Leika for worktable" — Stefan).
- One line below the build-order table: studio's three plans run before step 4.

## Global Constraints

- Every Playwright run and every gate run go under `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate` ("the lock"), because the harness ports are fixed. Added 2026-10-22.
- The engine never learns a domain word. `packages/engine` is not modified by this plan. `bun scripts/check-boundaries.ts` (extended to `studio`) and `bun scripts/check-vocabulary.ts` stay green.
- No WordPress code and no client data in this repo. Fixtures are invented: no real client, site or domain names.
- Domain names are Dutch (`AGENTS.md`). Refusal messages are Dutch, like theatre's.
- Studio stores no SSH host, path or credential (S3).
- Datetimes are written as `YYYY-MM-DDTHH:MM:SS` in local time. The engine refuses `toISOString()` output (`writes.ts:109`). SQL compares against `strftime('%Y-%m-%dT%H:%M:%S','now','localtime')`, never `datetime('now')`.
- The gate is `bun run gate` (about 20 minutes). A unit's own command runs first, then the gate; the task report quotes both.

## Data contract (consumed by studio-mcp and studio-worker)

These names are the interface the other two plans write against. Changing one breaks them.

| Dataset | Columns (type; options) |
|---|---|
| `organisatie` | naam; soort (klant · intern, default klant); notities (long) |
| `site` | naam (unique, by writer; the only value studio takes from site.yml); in_registry (bool, default true); organisatie_id → organisatie; sla (bool; studio's own, imported once at the site's first sync); smoke_urls (long); notities (long); gezondheid (ok · let_op · storing · onbekend, default onbekend); statuscode (int); responstijd_ms (int); wp_versie; php_versie; updates_plugins (int, default 0); updates_themas (int, default 0); updates_core (bool, default false); tls_dagen (int); laatste_check (datetime). Attachments: kind `screenshot` (S24). Board on `gezondheid`; gallery of `screenshot`. ~~domein, hosting, risico, health_markers, beheer, staging~~ removed on 2026-10-23 (Task 6c) |
| ~~`groep`, `groep_lid`~~ | removed on 2026-10-22 (spec S9) |
| `actie` (label "Opdrachten") | titel (nullable text: the action sets "<Soort> · <site naam>" for one site or "<Soort> · <n> sites"; the writer falls back to "<Soort>"); soort (gezondheidscheck · malwarescan · bijwerken · smoketest; required); status (lifecycle below, default aangevraagd); bron (handmatig · schema, default handmatig); gepland_op (datetime); voorbereid_op (datetime, set by the writer); samenvatting (long). Link `sites` → `actie_site`, state `state` |
| `actie_site` (`listed: false`; lifecycle on `state`, see Rulings; lookup `actie_status` via actie_id, field status; samenvatting (long, the drawer's detail line, frozen from voorbereid like voorstel)) | actie_id → actie; site_id → site; state (wacht · te_bevestigen · bezig · klaar · mislukt · overgeslagen, default wacht); voorstel (long: the preview, pinned versions as JSON text); resultaat (long); unique (actie_id, site_id), by writer |
| `onderhoud` (label "Onderhoudslog") | site_id → site; datum (datetime); soort (as actie.soort); uitkomst (ok · bevindingen · mislukt); samenvatting; details (long); actie_id → actie; organisatie_id (copied from the site) |
| `project` | naam; organisatie_id → organisatie (nullable; the writer defaults it to the first `intern` organisatie); repo; notities (long) |
| `werkpakket` (label "Features") | project_id → project (required); naam; repo; branch; plan; fase (ontwerp · plan · bouwen · review · geblokkeerd · klaar · geparkeerd, default ontwerp); laatste_stap; volgende_stap; geblokkeerd_door; bijgewerkt (datetime, set by the writer); organisatie_id (copied from the project); lookup `project` (via project_id, field naam); unique (repo, branch) when both set, by writer |
| `taak` | titel; status (open · gedaan, default open); deadline (date); wie (stefan · claude); notities (long); organisatie_id, project_id, werkpakket_id, site_id, actie_id (all optional relations) |
| `agendapunt` (label "Agenda") | titel; datum (date); start_at, eind_at (datetime); soort (afspraak · deadline · herinnering, default afspraak); organisatie_id; notities (long) |

**Nullability.** Every column is nullable unless it is required below or has a default (the engine refuses a create missing any other column, `writes.ts:151-157`).
- organisatie: naam
- site: naam
- actie: soort
- actie_site: actie_id, site_id
- onderhoud: site_id, datum, soort, uitkomst, samenvatting
- project: naam
- werkpakket: project_id, naam
- taak: titel
- agendapunt: titel, datum

**Actie status (lifecycle on `status`).**
- Read-only kinds: aangevraagd → bezig → klaar | mislukt.
- Bijwerken: aangevraagd → voorbereiden → voorbereid → bevestigd → bezig → klaar | deels | mislukt. Voorbereiden → mislukt, and voorbereid → aangevraagd (expiry).
- Any of aangevraagd · voorbereiden · voorbereid → geannuleerd.
- Roles:
  - voorbereid → bevestigd: `administrator` only. The writer also refuses it when `voorbereid_op` is more than 24 hours old, so an expired preview cannot be confirmed before the worker's next tick.
  - every other transition: `editor` and `administrator`.

**Writing a lifecycle column.** A service account writes `actie.status` and `actie_site.state` only with `expect: { <column>: <current> }`. Without it the engine answers 400 (`writes.ts:316-321` `expectFromService`). A second writer with a stale `expect` gets 409 `transition_lost`, which is how a claim is single. A user account needs no `expect`.

**Queries:**
- `sites_aandacht` (of site)
- `sites_in_orde` (of site; Ruling A)
- `op_tafel` (of taak): open tasks with a deadline on or before this week's Sunday
- `agenda` (of agendapunt, `creates: 'agendapunt'`, calendar need)

**Declared actions:** four selection actions on `site` (`many: true`), named `gezondheidscheck`, `malwarescan`, `bijwerken`, `smoketest`, with no inputs. Each declares `opens: true` and creates one actie (its first top-level create) and one `actie_site` per selected site in one batch. ~~`<soort>` on groep, `<soort>_site` on site~~.
**Space:** `organisatie`.
**Drawer (drawer-actions):**
- actie's lifecycle buttons are "Bevestigen" (voorbereid → bevestigd, administrator) and "Annuleren" (aangevraagd | voorbereiden | voorbereid → geannuleerd).
- actie's live states are aangevraagd, voorbereiden, bevestigd and bezig.
- The actie.sites link declares detail `samenvatting`.
**Sections:** Vloot (site) · Werk (project, werkpakket, taak) · Planning (agendapunt) · Logboek (actie, onderhoud) · Klanten (organisatie).

## Rulings (plan-level, against the approved spec)

Rulings made during Tasks 1–5, ledgered on the branch's executor ledger and written here so they travel with the plan:
- `Ruling A: "Sites in orde" reads a query sites_in_orde = the live sites NOT IN sites_aandacht — why: a $period filter cannot say "older than 8 days", and the stale-check rule must live once — cost if wrong: one more contract name.`
- ~~`Ruling B: users write groups of soort eigen and site; alle, sla and hosting groups are the sync's`~~ Void on 2026-10-22: groups are gone.
- `Ruling C: actie.voorbereid_op and werkpakket.bijgewerkt are readonly; their writers set them — why: a service could otherwise PATCH voorbereid_op to now and keep an expired preview confirmable — cost if wrong: none visible.`
- `Ruling D: every studio writer's delete refuses a service account (forbid, 403) — why: "no delete tool" in the MCP is not a control; a token can reach DELETE directly — cost if wrong: Claude marks a taak done instead of deleting it.` Its groep_lid exception is void with groups.
- `Ruling E (restored 2026-10-22, with drawer-actions): in voorbereid, a person (kind user) may move a link te_bevestigen → overgeslagen ("Niet nu") and overgeslagen → te_bevestigen ("Toch wel"), the latter only when the link has a voorstel — why: Stefan drops a site in the opdracht's drawer, and a skipped link without a preview (high risk in bulk, not in the registry, unreachable) must never be brought in — cost if wrong: none.` Built in Task 3 (`mayRestore`, `actie-site.ts:40-49`); it stays.

- ~~`Ruling: an Actie targets one required groep …`~~ Replaced on 2026-10-22: an Actie's sites are its links, made by the selection action in the same batch (spec S9). There is no Nieuwe actie quick create.
- `Ruling (2026-10-22): actieSiteWriter allows a create only while its actie is aangevraagd and its voorbereid_op is not set — why: a request's sites are fixed when it is made (spec S4), and an expired preview goes back to aangevraagd with voorbereid_op kept, so a dropped site cannot return — cost if wrong: before the first preview, a service, or Stefan in the Sites cell, can add a site; he still reads the preview before confirming (the existing deferral).`
- `Ruling (2026-10-22, with drawer-actions): Stefan drops a site with the "Niet nu" button on its line in the opdracht's drawer (Ruling E), not by deleting the link. A person may delete a link only while the actie is aangevraagd; a service never (Ruling D) — why: a delete is not undoable and drops the request's Undo (selection-actions review N14); "Niet nu" is a reversible state — cost if wrong: none.`
- `Ruling (2026-10-22, with drawer-actions): actie_site gains a lifecycle on state, every transition for editor and administrator:
  - wacht → te_bevestigen | bezig | overgeslagen | mislukt
  - te_bevestigen → bezig | mislukt | overgeslagen. This last one is a single entry carrying the button "Niet nu", with when { actie_status: 'voorbereid' }. A button's when only decides whether it shows, so the worker's apply-time skip uses the same entry.
  - overgeslagen → te_bevestigen, button "Toch wel", with when { actie_status: 'voorbereid', resultaat: null }. A link the action or the worker skipped carries a resultaat, so the button never shows there.
  - bezig → klaar | mislukt | overgeslagen

  actieSiteWriter decides who may write what, mirroring the buttons' when exactly (drawer-actions review N1):
  - A person (kind user) may move te_bevestigen ↔ overgeslagen only while the actie is voorbereid. "Toch wel" also needs a voorstel (Ruling E).
  - A service may move te_bevestigen → overgeslagen only while the actie is voorbereiden (the re-preview's skip, clearing voorstel) or bezig (the apply-time skip), and never overgeslagen → te_bevestigen.
  - (2026-10-23, from 6b's review) One predicate, unclaimed (aangevraagd with no voorbereid_op), governs every change of the set: create, a change of site_id or actie_id, and a person's delete. resultaat is frozen in voorbereid, beside samenvatting. Every service write of state sends expect — why: the drawer's buttons are declared transitions, and the engine requires expect for a service's lifecycle write — cost if wrong: a worker write without expect is a 400, caught by its tests.`
- `Ruling (2026-10-22, with drawer-actions): actie's lifecycle declares the buttons "Bevestigen" (voorbereid → bevestigd, administrator) and "Annuleren" (aangevraagd | voorbereiden | voorbereid → geannuleerd), and live: [aangevraagd, voorbereiden, bevestigd, bezig]. The four Site selection actions declare opens: true, with the actie as their first top-level create. The actie.sites link declares detail: 'samenvatting', a new long-text column on actie_site that the worker fills with its one-line summary. From voorbereid on, samenvatting is frozen like voorstel; the worker's outcomes go to resultaat. actie.samenvatting carries the worker's progress text — why: the update flow happens in the drawer that opens on Bijwerken (spec S10, revised) — cost if wrong: none.`
- `Ruling (2026-10-22): a selected site with in_registry false gets its link as overgeslagen with resultaat "niet in registry" — why: "take everything the view shows" must work on the seeded Sites view — cost if wrong: none.`
- `Ruling (2026-10-22): the Opdrachten table keeps the engine's + Nieuw, because a writer cannot tell an action's create from the grid's (both go through createAs as the caller). The grid shows + Nieuw on any dataset whose writer can update (`app.ts:36-37`, `App.tsx:577`), and hiding it would need an engine change this plan rules out. A bare request (no sites) is claimed within one poll and ends mislukt "geen sites" with a taak, so "+ Nieuw, then add sites" never works; requests start from Sites. Onderhoudslog and Sites show the same button, and their writers refuse it with a Dutch message. A site added by hand in the Sites cell before the first preview gets wacht whatever its risico; the worker skips a risico hoog site in a request of several at preview and at apply (studio-worker) — cost if wrong: one confusing button.`
- ~~`Ruling (2026-10-22): in a bijwerken run on more than one site, the action creates the link of a risico hoog site as overgeslagen …`~~ Replaced on 2026-10-23: studio holds no risico. The worker skips a `risk: high` site in a bijwerken on more than one site at preview (wacht → overgeslagen, with the reason in resultaat and samenvatting), and again at apply (studio-worker).
- `Ruling (2026-10-23): studio shows no site.yml data. Site keeps only naam (to know the site exists) and in_registry from the sync. sla is studio's own: imported once when the sync first creates the site, then set by Stefan and never touched by the sync. organisatie_id, smoke_urls and notities are studio's. The health columns are the worker's. — why: "ok, a split is good. the studio never shows site.yml data. its not needed there" (Stefan, 2026-10-23); technical facts (domain, servers, paths, risk, markers) stay in site.yml, which the worker and the deploy tooling read — cost if wrong: the Sites list identifies a site by its registry name only.`
- `Ruling (2026-10-23, confirmed with the coder): siteWriter lets a person write organisatie_id, sla, smoke_urls and notities. A service writes naam, in_registry, the health columns, organisatie_id, smoke_urls and notities (as Task 4 built: Claude links a site to its client and adds notes), and sla only on create (forbid "De SLA is van studio: de worker zet ze alleen bij een nieuwe site.") — why: the split, the smallest change — cost if wrong: none.`
- `Ruling: Bijwerken always covers core, plugins and themes, with no per-component booleans — why: Stefan, "we also need to make sure that wp, plugins and yootheme gets updated"; and per-component inputs would make every run ask questions — cost if wrong: no way to update only plugins in v1.`
- `Ruling: a state voorbereiden between aangevraagd and voorbereid — why: the worker claims a preview by a transition, as it claims every request; the spec's voorbereid is "preview done" — cost if wrong: none visible to Stefan; one more board column.`
- `Ruling: actie is not scoped by organisatie, so "Te bevestigen" and the Opdrachten views stay fleet-wide under the space switcher; in the scoped agenda query, actie rows carry no organisatie and drop out under a client — why: a request spans clients through its sites; scoping it to one client would hide a bulk update from the client view that it touches — cost if wrong: picking a client still shows other clients' requests in the Te bevestigen tile, and a request touching several clients shows under none of them in the agenda.`
- `Ruling: spec S4's aangevraagd_door is not a column; who asked is read from Revision, and bron says handmatig or schema — why: a writer sees an actor's id, role and kind, never a name (declare.ts:260-266), and Revision already records the actor of every write — cost if wrong: "who asked" is one click away, in the history, not in the grid.`
- `Ruling: actie gets a filled titel (by the action, with the writer's "<Soort>" fallback) instead of being titled by soort — why: a title column keeps soort a pick in every view — cost if wrong: none.`

## Architecture

**First working version:** Task 1. A studio instance runs with invented fixtures and opens on its dashboard in the real grid (`bun packages/engine/src/serve.ts --domain @worktable/studio --db /tmp/studio.db --files-dir /tmp/studio-files --fresh` plus the grid; `--files-dir` is required once Site declares attachments in Task 6). It has every tile, the space switcher and the quick creates. The writers' rules follow in Tasks 2–8.

**Simplest design.** The simplest design that meets the ask is a domain package with only datasets and the seeded dashboard, with every rule left to the worker and to convention. This plan uses that shape: no engine change, everything declared. But it adds writer rules in the four places where convention is not enough:
- the confirmation of a production update
- a frozen preview
- an append-only maintenance log
- registry and health columns that the grid would otherwise let Stefan overwrite by hand

`cutBody` strips `readonly` columns from every REST write, the worker's included, so ownership has to live in writers, not in `readonly`. Everything else (the sync, expiry, routing by risk) belongs to the worker plan.

## Threat model

**Assets**
- The right to confirm a production update: an Actie moving voorbereid → bevestigd.
- The confirmed set: which sites and which pinned versions (`actie_site.voorstel`) a confirmation covers.
- The integrity of what Stefan reads as truth: Site's registry and health columns, and the Onderhoud log.

**Attacks**
1. **A service account (claude or worker, kind service) writes `actie.status` to bevestigd**, with a correct `expect` → the lifecycle declares voorbereid → bevestigd for `administrator` only. In addition, actieWriter.update refuses entering bevestigd unless `ctx.actor.kind === 'user'` and the role is administrator. This covers a service account that was created with role administrator by mistake.
2. **A service account creates an Actie already in bevestigd, bezig or klaar** (a create is not a transition) → actieWriter.create refuses any status but aangevraagd.
3. **A service undoes its own batch to land in bevestigd.** The worker's claim bevestigd → bezig, undone by the worker itself, would write bezig → bevestigd → the actieWriter guard on entering bevestigd applies to undo writes too. Only the batch's own account may undo at all (`writes.ts:786-787`). The test uses that account, so the refusal is the writer's.
4. **The confirmed set is changed after the preview:** a site added, a `voorstel` rewritten, a `site_id` swapped, or a dropped site brought back → actieSiteWriter refuses:
   - creates unless the parent is aangevraagd with no `voorbereid_op` (Ruling of 2026-10-22)
   - any change to `voorstel`, `site_id` or `actie_id` once the parent is voorbereid or later
   - in voorbereid, any state change but a person's "Niet nu" and "Toch wel" (Ruling E; "Toch wel" only with a voorstel), mirroring the buttons' when
   - a delete unless the parent is aangevraagd, and any delete by a service (Ruling D)
   - in bevestigd, every change
   - in bezig, any state change out of overgeslagen or into te_bevestigen
5. **Bijwerken scheduled to fire while Stefan is away**, through a future `gepland_op` → actieWriter refuses `gepland_op` after now on soort bijwerken, on create and on update.
6. **Stefan's grid (kind user) overwrites a site's health or registry column**, so stale data reads as fresh → siteWriter refuses those columns from kind user, and refuses creates and deletes from kind user. Users write only organisatie_id, smoke_urls and notities.
7. **Anyone rewrites or deletes the maintenance log** → onderhoudWriter refuses every update and delete, and creates from kind user.

**Mitigations (where they live)**
- `packages/studio/src/datasets.ts` `actie.lifecycle`: the admin-only voorbereid → bevestigd.
- `packages/studio/src/writers/actie.ts` `actieWriter`:
  - create forces aangevraagd and fills titel
  - entering bevestigd needs a user administrator
  - transitions must fit the soort
  - no future `gepland_op` on bijwerken
  - soort is immutable
- `packages/studio/src/writers/actie-site.ts` `actieSiteWriter`: the frozen set, including the delete rule.
- `packages/studio/src/writers/site.ts` `siteWriter`: column ownership by actor kind; naam unique.
- `packages/studio/src/writers/onderhoud.ts` `onderhoudWriter`: append-only, service-only creates.

**Deferrals**
- A writer sees role and kind, not which service account acts (spec S3). The claude account can write health columns and Onderhoud rows like the worker. Accepted: it is one person's tooling on a 127.0.0.1 instance, and Revision records the actor of every value.
- The confirmed set is pinned by state, not by snapshot (drawer-actions review N1b). Bevestigen's `expect` pins the actie's status, not which links are te_bevestigen. A second person with an account could change the set between the administrator's last read and the press. Studio has one person, and services are refused by kind, so this is accepted. If a second person ever gets an account, the transition to bevestigd snapshots the te_bevestigen set and the worker applies the snapshot.
- An editor service can write `voorstel` before voorbereid. The control is Stefan reading the preview before he confirms. From voorbereid on, it is frozen.
- Any editor, Claude included, can upload a site screenshot (the engine's attachment rule is role-only). The screenshot is part of what Stefan reads; Revision and the attachment's uploader record who did it.
- Token theft and transport: owned by studio-mcp and studio-worker.
- Studio has no owner or link actors. The space switcher is a view filter, not access control.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Actie status rules (lifecycle + actieWriter) | `PATCH /api/rows/actie/:id` (with `expect` for services), `POST /api/rows/actie`, `POST /api/batches/:id/undo` | integration · `packages/studio/test/actie.test.ts` · `bun test packages/studio/test/actie.test.ts` | confirm-update-from-dashboard, service-cannot-confirm |
| Confirmed set (actieSiteWriter) | `POST`/`PATCH`/`DELETE /api/rows/actie_site`; the drawer's "Niet nu"/"Toch wel" are PATCHes with expect | integration · `packages/studio/test/actie-site.test.ts` · `bun test packages/studio/test/actie-site.test.ts` | drop-site-before-confirm |
| Site and Onderhoud ownership (siteWriter, onderhoudWriter) | `PATCH`/`POST`/`DELETE /api/rows/site`, `/api/rows/onderhoud` | integration · `packages/studio/test/ownership.test.ts` · `bun test packages/studio/test/ownership.test.ts` | — |
| Selection actions on site (2026-10-22) | `POST /api/actions/<soort>` with `{ ids }` | integration · `packages/studio/test/actions.test.ts` · `bun test packages/studio/test/actions.test.ts` | request-health-check-for-selected-sites, request-from-a-site-drawer |
| Reshape: labels, sections, listed, agenda, op_tafel, board, gallery (2026-10-22) | `GET /api/schema`, `GET /api/rows/<query>`, `GET /api/views` | integration · `packages/studio/test/seed.test.ts`, `queries.test.ts` (extended) · `bun test packages/studio` | add-to-the-agenda, sites-board-and-gallery, preview-opens-from-request |
| Queries (sites_aandacht, op_tafel, agenda) | `GET /api/rows/<query>` | integration · `packages/studio/test/queries.test.ts` · `bun test packages/studio/test/queries.test.ts` | — |
| Planning writers (project, werkpakket, taak, agendapunt, organisatie) | `POST`/`PATCH /api/rows/<dataset>` | integration · `packages/studio/test/planning.test.ts` · `bun test packages/studio/test/planning.test.ts` | — |
| Seed, views and dashboard | `GET /api/schema`, `GET /api/views` | integration · `packages/studio/test/seed.test.ts` · `bun test packages/studio/test/seed.test.ts` | dashboard-opens-on-monday-questions, space-narrows-dashboard |
| Boundaries, vocabulary, harness | `bun run check`, `playwright.config.ts` | none: proven by `bun run check` and the harness booting | — |

## Review Focus

1. **A confirmation reached any way but a person's click** (service write with `expect`, a create in bevestigd, the service's own undo, a service account with role administrator): refused every time → row 1 (`actie.test.ts`: "no service account reaches bevestigd").
2. **A preview changed between Stefan reading it and the update running:** the confirmed set is exactly what he read (voorstel and samenvatting), and a dropped site stays dropped → row 2 (`actie-site.test.ts`: "voorstel is frozen from voorbereid on", "a dropped site stays dropped after confirmation", "a skipped link without a voorstel cannot be restored").
3. **Stale health shown as current:** a site whose `laatste_check` is older than 8 days, or null, is listed in Sites met aandacht whatever its `gezondheid` says → row 6 (`queries.test.ts`: "an old check is attention, even when ok").
4. **A site that disappeared from the registry** still counts as healthy → row 6 (`queries.test.ts`: "not in the registry is attention, and leaves Sites in orde").
5. **The space switcher on a client** shows another client's sites or work packages: every scoped source narrows, and actie is unscoped by ruling → row 8 (`seed.test.ts`: "every list a tile reads is scoped or ruled unscoped").
6. **A bulk update includes a high-risk site** (2026-10-22): its link is overgeslagen at request time, and no restore exists → row 4 (`actions.test.ts`: "a high-risk site in a bulk update is skipped at request time").
7. **A request's sites change after it is made** (2026-10-22): no link is created once the actie leaves aangevraagd, nor after an expired preview → row 2 (`actie-site.test.ts`: "no site joins a request after it is claimed").

---

### Task 1: The package, the seed and the dashboard (the first working version)

**Files:**
- Create: `packages/studio/package.json` (`@worktable/studio`; dependency `@worktable/engine: workspace:*`, like fiche), `packages/studio/tsconfig.json`
- Create: `packages/studio/src/index.ts`, `src/datasets.ts`, `src/queries.ts`, `src/queries/sites_aandacht.sql`, `src/queries/op_tafel.sql`, `src/queries/agenda.sql`, `src/seed.ts`, `src/writers/index.ts` (pass-through writers for now)
- Modify: root `package.json` (devDependencies gain `"@worktable/studio": "workspace:*"`, as fiche and theatre are), `bun.lock`
- Modify: `scripts/check-boundaries.ts` (`domains` gains `'studio'`), `scripts/check-vocabulary.ts` (the default `--domain` list gains `@worktable/studio`), `scripts/vocabulary-allow.txt`
- Modify: `playwright.config.ts`, `e2e/auth.ts`, `e2e/global-setup.ts` (a studio instance)
- Test: `packages/studio/test/seed.test.ts`

**Interfaces:**
- Produces: `export default studio: Domain` from `@worktable/studio`, with every name in the Data contract. `views` include, by name: Sites, Alle sites, Sites in orde, Storing, Let op, Sites met aandacht, Groepen, Acties, Acties per status, Te bevestigen, Onderhoudslog, Projecten, Werkpakketten, Per fase, Taken, Op tafel, Agenda, Vandaag, Agendapunten, Organisaties, and the dashboard Overzicht.

- [ ] **Step 1: Declare the datasets, queries and space** exactly as the Data contract. The actions come in Task 6.
  - `title`: naam or titel; `actie_site` and `groep_lid` by `{ via: 'site_id', else: … }`.
  - `scoped: 'organisatie_id'` on site, project, werkpakket, taak, agendapunt, onderhoud, and on the queries sites_aandacht, op_tafel and agenda, each declaring `organisatie_id` as a relation to organisatie. The grid narrows only sources served as scoped (`app.ts:318`, `tiles.ts:16`).
  - `date`: actie.gepland_op, onderhoud.datum, werkpakket.bijgewerkt, taak.deadline, agendapunt.datum.
  - `calendar` on agendapunt (day datum, start start_at, end eind_at, lanes organisatie_id) and on the agenda query.
  - `board` on actie.status and werkpakket.fase.
  - `tones`:
    - gezondheid: ok → ok, let_op → warn, storing → bad, onbekend → grey
    - actie.status: klaar → ok, deels → warn, mislukt → bad, voorbereid → amber, bezig → sky
    - fase: geblokkeerd → bad, review → warn, bouwen → violet, klaar → ok
  - `sections`:
    - Vloot: site, groep, actie, onderhoud
    - Werk: project, werkpakket, taak, agendapunt, agenda, op_tafel
    - Klanten: organisatie

    `sites_aandacht` is not listed: it is `of: 'site'`, and `validate.ts:609-611` refuses a section naming a query with `of`. The grid lists it under Sites.
  - The queries' SQL is written in Task 5. For now each query selects its declared columns from one table, so the views resolve.

- [ ] **Step 2: Wire the package.** Add `"@worktable/studio": "workspace:*"` to the root `package.json` devDependencies, then run `bun install`. `--domain @worktable/studio` must now resolve from the repo root (`serve.ts:83`).

- [ ] **Step 3: Seed invented fixtures and the views.**
  - Fixtures:
    - 2 organisations (Studio Voorbeeld, intern; Bakkerij Testmans, klant)
    - 5 sites, one per gezondheid, one with `in_registry: false` (risico removed in Task 6c)
    - the groups Alle sites and SLA-sites, plus each site's own group (soort site)
    - 2 projects with 3 werkpakketten in different fases
    - 4 open tasks
    - 3 agendapunten this week
    - 1 Actie in voorbereid with 2 actie_site rows in te_bevestigen
  - The dashboard Overzicht:
    - **Nu:** progress "Sites in orde" (done Sites in orde, total Alle sites); stat Storing (bad above 0); stat Let op (warn above 0); stat Wacht op jou (Op tafel, warn above 0).
    - **Waar we stopten:** list Werkpakketten (rows 5, columns project, fase, laatste_stap, bijgewerkt); list Sites met aandacht (rows 5).
    - **Deze week:** week Agenda; list Vandaag (rows 5).
    - **Op tafel:** list Te bevestigen (rows 5, set status → bevestigd, label Bevestigen); list Op tafel (rows 8, set status → gedaan, label Gedaan).
    - Actions: create actie "Nieuwe actie", create taak "Nieuwe taak", create agendapunt "Nieuw agendapunt".

- [ ] **Step 4: Write `seed.test.ts`:**
  - "every dashboard tile names a live view": every tile's view id is in `/api/views`.
  - "the agenda serves the calendar need": `/api/schema` sources.agenda.calendar matches `{ day: 'datum' }`.
  - "every list a tile reads is scoped or ruled unscoped": each tile's source is scoped on organisatie_id, or is actie or groep.
  - "Nieuwe actie asks soort and groep only": the actie model's required, non-defaulted fields are exactly soort and groep_id.

  Run `bun test packages/studio/test/seed.test.ts`: PASS.

- [ ] **Step 5: Boundaries and vocabulary.**
  - Add `'studio'` to `domains` in `scripts/check-boundaries.ts`.
  - Add `'@worktable/studio'` to `check-vocabulary.ts`'s default `--domain` list, then run `bun scripts/check-vocabulary.ts`. Expect about 15 hits in `packages/engine` (project, check, plan, groep, registry, updates, core, lid, branch, dagen, door, details, sites, leden, repo). Add each to `scripts/vocabulary-allow.txt` with its reason: generic English, as `status` is; or a Dutch word in an engine test string, as `mijn`, `aan` and `ander` are; or the engine test fixture's invented dataset, as `taak` is, which covers `project`. Never rename an engine identifier to dodge a hit.
  - Run `bun run check`: exit 0.

- [ ] **Step 6: The harness instance.** In `playwright.config.ts`, add an engine on port 4313 (`--domain @worktable/studio --db e2e/.tmp/studio.db --fresh --outbox e2e/.tmp/outbox-studio --app-url http://127.0.0.1:5176 --cookie-name wt_session_studio_e2e`: not the live instance's cookie, so opening the harness grid never signs Stefan out of his studio) and a grid on 5176 (`ENGINE_URL=http://127.0.0.1:4313`). Then in `e2e/auth.ts` and `e2e/global-setup.ts`, a studio administrator and editor, following fiche's entries. Run `bunx playwright test e2e/smoke`: PASS, with the three instances booting.

- [ ] **Step 7: Look at it.** Run the engine on a fresh db and the grid as in Step 6. The grid opens on Overzicht, with every tile filled from the fixtures and the switcher listing both organisations. Take a screenshot for the task report.

- [ ] **Step 8: Gate and commit.** Run `bun run gate`: exit 0. Then:

```bash
git add packages/studio package.json bun.lock scripts/check-boundaries.ts scripts/check-vocabulary.ts scripts/vocabulary-allow.txt playwright.config.ts e2e/auth.ts e2e/global-setup.ts
git commit -m "feat(studio): the studio domain's datasets, seed and Monday dashboard"
```

### Task 2: Actie status rules

**Files:**
- Create: `packages/studio/src/writers/actie.ts`
- Modify: `packages/studio/src/datasets.ts` (actie.lifecycle), `src/writers/index.ts`
- Test: `packages/studio/test/actie.test.ts`

**Interfaces:**
- Consumes: the Data contract's actie columns and lifecycle.
- Produces: `actieWriter: Writer`. Refusals in Dutch: "Een actie begint als aangevraagd.", "Alleen Stefan bevestigt een update.", "Deze preview is verlopen.", "Bijwerken kan niet vooruit gepland worden.", "Deze stap past niet bij deze soort.", "Soort en groep liggen vast." (from Task 6: "De soort ligt vast.")

- [ ] **Step 1: Write the denial tests first.** In `actie.test.ts`, use `createService(sqlite, 'claude', 'editor')` (from `packages/engine/src/auth.ts`) and `createService(sqlite, 'robot', 'administrator')` as Bearer requesters, beside an administrator user. Every service write of `status` sends `expect: { status: <current> }`.
  - "no service account reaches bevestigd": from voorbereid, both services' PATCH `{ status: 'bevestigd', expect: { status: 'voorbereid' } }` → refused (403 or 422, not 400), and the row stays voorbereid. The user administrator's PATCH → 200.
  - "a create starts at aangevraagd": POST with status bevestigd → refused; POST without status → 201, status aangevraagd, titel filled.
  - "a service's own undo never lands in bevestigd": after the robot service moves bevestigd → bezig (with expect), that same service's `POST /api/batches/:id/undo` → refused by actieWriter (its message), and the status stays bezig.
  - "bijwerken is never future-dated": POST and PATCH with `gepland_op` tomorrow on bijwerken → refused; the same on gezondheidscheck → 2xx.
  - "transitions fit the soort": gezondheidscheck aangevraagd → voorbereiden → refused; bijwerken aangevraagd → bezig → refused; gezondheidscheck bezig → deels → refused.
  - "soort and groep are fixed": a PATCH of soort or groep_id → refused.
  - "an expired preview cannot be confirmed": with `voorbereid_op` 25 hours ago, the user administrator's PATCH to bevestigd → refused ("Deze preview is verlopen."); 23 hours ago → 200.

  Run them and expect FAIL.

- [ ] **Step 2: Implement** the lifecycle on actie (Data contract) and `actieWriter` with `refuse()`/`forbid()` from `@worktable/engine`, in the style of theatre's `writers.ts`. Set `voorbereid_op` to now, formatted per the Global Constraints, when status enters voorbereid.

- [ ] **Step 3: Run** `bun test packages/studio/test/actie.test.ts`: PASS. Then `bun run gate`: exit 0.

- [ ] **Step 4: Commit:** `git commit -m "feat(studio): actie status rules — only a person confirms an update"`

### Task 3: The confirmed set

**Files:**
- Create: `packages/studio/src/writers/actie-site.ts`
- Test: `packages/studio/test/actie-site.test.ts`

**Interfaces:**
- Produces: `actieSiteWriter: Writer`. Refusals "Het voorstel ligt vast sinds de preview." and "Een bevestigde update verandert niet meer."

- [ ] **Step 1: Write the tests first:**
  - "voorstel is frozen from voorbereid on": a PATCH of voorstel, site_id or actie_id on a link whose actie is voorbereid, bevestigd or bezig → refused.
  - "no site joins after the preview": a POST of a link on a voorbereid actie → refused; on aangevraagd and voorbereiden → 201.
  - "Stefan drops a site before confirming": te_bevestigen → overgeslagen on voorbereid → 200; te_bevestigen → klaar on voorbereid → refused.
  - "a dropped site stays dropped after confirmation": with the actie bevestigd, the claude service's PATCH overgeslagen → te_bevestigen → refused; with it bezig, the same → refused; and that service's undo of its own earlier drop → refused.
  - "the worker writes results while bezig": state bezig → klaar and `resultaat` by the service → 200.

  Run them and expect FAIL.

- [ ] **Step 2: Implement** `actieSiteWriter`, reading the parent through `ctx.find('actie', …)`.

- [ ] **Step 3: Run** `bun test packages/studio/test/actie-site.test.ts`: PASS. Then `bun run gate`: exit 0.

- [ ] **Step 4: Commit:** `git commit -m "feat(studio): a confirmed update covers exactly the previewed sites and versions"`

### Task 4: Site and Onderhoud ownership

**Files:**
- Create: `packages/studio/src/writers/site.ts`, `src/writers/onderhoud.ts`
- Test: `packages/studio/test/ownership.test.ts`

**Interfaces:**
- Produces: `siteWriter`, `onderhoudWriter`, and `SYNCED_COLUMNS` and `HEALTH_COLUMNS` (exported string arrays from `site.ts`, in the Data contract order).

- [ ] **Step 1: Write the tests first:**
  - "a person cannot overwrite registry or health": a user administrator's PATCH of gezondheid, laatste_check, sla, naam → refused; of organisatie_id, smoke_urls, notities → 200.
  - "sites come from the registry": a POST and a DELETE by the user → refused; a POST by a service carrying the synced columns only (naam, domein, hosting, sla, risico, health_markers, beheer, staging) → 201.
  - "a site name is unique": a service's second POST with the same naam → refused.
  - "the log is append-only": any actor's PATCH or DELETE of onderhoud → refused; a POST by the user → refused; a POST by a service → 201.
  - "a log row belongs to its site's client": a service's POST sets organisatie_id from the site.

  Run them and expect FAIL.

- [ ] **Step 2: Implement** both writers, deciding by `ctx.actor.kind`.

- [ ] **Step 3: Run** `bun test packages/studio/test/ownership.test.ts`: PASS. Then `bun run gate`: exit 0.

- [ ] **Step 4: Commit:** `git commit -m "feat(studio): registry and health columns are the worker's, the maintenance log is append-only"`

### Task 5: The queries

**Files:**
- Modify: `packages/studio/src/queries.ts`, `src/queries/sites_aandacht.sql`, `src/queries/op_tafel.sql`, `src/queries/agenda.sql`
- Test: `packages/studio/test/queries.test.ts`

**Interfaces:**
- Produces:
  - `sites_aandacht` columns: id (= site id), naam, gezondheid, reden (storing · let_op · oud · nooit · weg), laatste_check, organisatie_id
  - `op_tafel` columns: id (offset ranges as in theatre's werklijst), soort (taak · bevestigen · mislukt), titel, onderwerp, deadline, taak_id, actie_id, status (writes taak.status by taak_id), organisatie_id
  - `agenda` columns: id (offset ranges), titel, datum, start_at, eind_at, soort (afspraak · deadline · herinnering · onderhoud · taak), organisatie_id, agendapunt_id, actie_id, taak_id; `creates: 'agendapunt'`

- [ ] **Step 1: Write the tests:**
  - "an old check is attention, even when ok": laatste_check 9 days ago with gezondheid ok → listed, reden oud; 7 days → not listed; null → reden nooit.
  - "not in the registry is attention, and leaves Sites in orde": in_registry false → listed, reden weg, and absent from the "Sites in orde" view.
  - "op tafel holds what waits for Stefan": an open taak, an actie in voorbereid, and an actie mislukt or deels appear; klaar does not; the taak row's status writes back.
  - "the agenda holds every dated thing": an agendapunt, an actie with gepland_op, and an open taak with a deadline appear on their dates; a gedaan taak does not.

- [ ] **Step 2: Write the SQL.** Compare against `strftime('%Y-%m-%dT%H:%M:%S','now','localtime')` (Global Constraints).

- [ ] **Step 3: Run** `bun test packages/studio/test/queries.test.ts`: PASS. Then `bun run gate`: exit 0.

- [ ] **Step 4: Commit:** `git commit -m "feat(studio): sites that need attention, what is on the table, one agenda"`

### Task 6: The reshape (2026-10-22)

**Files:**
- Modify: `packages/studio/src/datasets.ts`, `queries.ts`, `queries/op_tafel.sql`, `queries/agenda.sql`, `seed.ts`, `index.ts`, `writers/index.ts`, `writers/actie.ts`, `writers/actie-site.ts`, `playwright.config.ts` (`--files-dir`); remove `groep` and `groep_lid` and every fixture, view, writer and test that names them
- Test: `packages/studio/test/seed.test.ts`, `queries.test.ts`, `actie.test.ts`, `actie-site.test.ts`, `ownership.test.ts` (adjusted where they named groups)

**Interfaces:**
- Consumes: the merged engine's `listed: false`, `QueryDecl.of`/`creates`, `DatasetDecl.attachments`, `board`, `gallery`, and drawer-actions' transition `button`/`when`, lifecycle `live`, link `detail` and the `available` marks (final names from its merged plan).
- Produces: the Data contract above. Tasks 7–8 and studio-worker write against it.

- [ ] **Step 1: Adjust and add the tests (RED where new):**
  - seed:
    - "the tree has five sections in order, and actie_site is not in it"
    - "the labels read Opdrachten, Onderhoudslog, Features, Agenda"
    - "the header has Nieuwe taak and Nieuw agendapunt, and no Nieuwe actie"
    - "Sites has a board on risico and a gallery of screenshots"
  - queries:
    - "op_tafel holds open tasks due this week or earlier, and no task without a deadline"
    - "a failed request is not on the table"
    - "the agenda holds agendapunten, requests by gepland_op and open tasks by deadline, and creates agendapunt"
  - actie-site: "no site joins a request after it is claimed": a create on a link whose actie is voorbereiden or later is refused, for the user and the service alike.
  - actie-site: "a person deletes a link only while the actie is aangevraagd": in voorbereiden or later → refused; a service's delete → refused (Ruling D).
  - actie-site: "the drawer's buttons are marked only in voorbereid": on a link in te_bevestigen, `available.buttons` holds "Niet nu" while the actie is voorbereid and nothing in voorbereiden, bevestigd or bezig. "Toch wel" is marked on an overgeslagen link only in voorbereid and only with no resultaat.
  - actie-site: "a drop in voorbereid needs a person": the claude service's te_bevestigen → overgeslagen in voorbereid is refused by the writer.
  - actie-site: "a person drops or restores only in voorbereid": a user's te_bevestigen → overgeslagen, and overgeslagen → te_bevestigen, in aangevraagd, voorbereiden, bevestigd and bezig are refused.
  - actie-site: "the worker skips at apply only in bezig": a service's te_bevestigen → overgeslagen in bezig → 200; in voorbereid → refused. Its overgeslagen → te_bevestigen is refused in every state.
  - actie-site: "samenvatting is frozen from voorbereid on", in the same test as voorstel.
  - actie-site: "every service write of state sends expect": without it, 400.
  - The built tests the new rules change (78ce848):
    - `actie-site.test.ts:94-95`: a create in voorbereiden, and one in a read-only bezig, now answer refused.
    - `actie-site.test.ts:111-119`: the te_bevestigen → klaar step now expects the engine's `transition_not_allowed` (the transition is not declared), not the writer's FROZEN.
    - `actie-site.test.ts:179-199`: rewritten. The administrator's "Niet nu" in voorbereid, then the administrator's own undo. In bevestigd and bezig only a move to te_bevestigen is asserted, with CONFIRMED. overgeslagen → bezig is asserted as the engine's refusal.
    - `actie-site.test.ts:201-214` stays as built: the voorbereid row keeps FROZEN, because a delete outside aangevraagd is refused by the inner rule before Ruling D.
    - Every service PATCH of `state` in the built tests gains `expect`.
    - The Ruling E tests (`actie-site.test.ts:121-145`) stay as they are.
    - `queries.test.ts:85`: op_tafel holds no actie.
    - `queries.test.ts:116-129` stays: it is the only test of the Gedaan write-back. It finds the first op_tafel line instead of `r.soort === 'taak'`, since op_tafel has no `soort` any more.
    - `seed.test.ts:70`: there is no Nieuwe actie quick action.
  - actie-site: "the worker writes the preview while voorbereiden": a service PATCH of `voorstel`, `samenvatting` and `state` (with expect) answers 200. studio-worker depends on exactly these writes.
  - seed: the seeded voorbereid actie's row carries `available.buttons` Bevestigen and Annuleren for the administrator. Its te_bevestigen links carry "Niet nu" and their samenvatting as detail. `/schema` serves actie's `live`.
  - actie-site: "no site joins a request after it is claimed" also covers an expired preview: an actie back in aangevraagd with `voorbereid_op` set refuses a create, from the Sites cell and from a service.
  - Remove the groep-based fixtures and assertions. Ruling D's groep_lid exception goes with groep_lid.
- [ ] **Step 2: Implement.**
  - Drop groep and groep_lid.
  - actie loses groep_id. Its writer's titel falls back to "<Soort>". checkFixed pins soort only.
  - actieSiteWriter:
    - allows a create only while the actie is aangevraagd with no `voorbereid_op`;
    - allows a user's delete only while the actie is aangevraagd;
    - keeps Ruling E (`mayRestore`) as built, and adds: a drop in voorbereid needs kind user;
    - freezes samenvatting from voorbereid on, beside voorstel;
    - the `readOnlyRun` create branch (`actie-site.ts:17`) is removed.
  - The lifecycles, buttons, `live`, the `actie_status` lookup on actie_site, its new `samenvatting` column and the link's `detail` (Rulings of 2026-10-22, with drawer-actions).
  - The labels, sections and `listed: false` on actie_site.
  - The views:
    - Opdrachten (was Acties) and Te bevestigen. Te bevestigen stays a view on the actie dataset, so its dashboard tile's rows open the opdracht's drawer (drawer-actions R7).
    - Opdrachten per status (board), Features (was Werkpakketten) and Per fase.
    - Groepen is removed.
    - Sites per risico (board) and Sites in beeld (gallery) are new.
    - SLA-sites (`sla: true`, `in_registry: true`) is new and replaces the removed group as a named set.
  - op_tafel and agenda are rewritten per the contract. op_tafel's columns become: id, titel, deadline, taak_id, status (writes taak.status by taak_id, for the Gedaan tile), organisatie_id. The seeded "Op tafel" view (`seed.ts:358`) shows titel, deadline and status, no longer `soort` and `onderwerp`. agenda keeps its calendar columns and gains `of: 'agendapunt'` and `creates: 'agendapunt'`.
  - The seed's `voorstel` fixtures take the worker's shape: `{ core?, plugins: [{ slug, from, to, bron }], themes: […], yootheme?, beschermd: [] }` (studio-worker Task 5's `Voorstel`).
  - The Sites board groups on risico. A drag is a person's write of risico, which siteWriter refuses (`site.ts:30`), and the card stays.
  - Site declares `attachments: { kinds: { screenshot: 'Screenshot' } }`, `board: { column: 'risico' }` and `gallery: { kind: 'screenshot' }`, with the views "Sites per risico" (board) and "Sites in beeld" (gallery).
  - Dashboard:
    - "Wacht op jou" counts op_tafel.
    - "Te bevestigen" keeps its tile, without its inline Bevestigen `set` (`seed.ts:441`): a row opens the opdracht's drawer (drawer-actions R7), where Bevestigen sits beside the preview ("ok, remove it" — Stefan, 2026-10-22). Test: "the Te bevestigen tile has no set button".
    - The Nieuwe actie quick action is gone.
  - The harness's studio instance gets `--files-dir e2e/.tmp/files-studio`.
- [ ] **Step 3: Run** `bun test packages/studio`: PASS. `bun run check` exits 0. Then the gate under the lock: exit 0. The harness's studio instance must boot with `--files-dir`.
- [ ] **Step 4: Commit:** `git commit -m "feat(studio): no groups, one agenda, op tafel from tasks, the Logboek and the sites board and gallery"`

### Task 6c: Studio shows no site.yml data (2026-10-23)

**Files:**
- Modify: `packages/studio/src/datasets.ts`, `seed.ts`, `writers/site.ts`, the views that name the removed columns, `packages/studio/test/seed.test.ts`, `ownership.test.ts`, `queries.test.ts` where they name them.

- [ ] **Step 1: Tests (RED first):**
  - "Site serves no site.yml data": `/schema`'s site columns are naam, in_registry, organisatie_id, sla, smoke_urls, notities and the health columns, and none of domein, hosting, risico, health_markers, beheer, staging.
  - "a person writes organisatie, sla, smoke URLs and notes": 200 each.
  - "a person writes no health column, naam or in_registry" (refused).
  - "a service writes sla only on create" (a PATCH of sla by a service is refused with the forbid above); a service still writes organisatie_id, smoke_urls and notities.
  - "the Sites board groups on gezondheid".
- [ ] **Step 2: Implement.**
  - Drop the six columns from site, the seed and every view.
  - Move the Sites board to `board: { column: 'gezondheid' }` and rename its view "Sites per gezondheid".
  - siteWriter per the 2026-10-23 rulings.
- [ ] **Step 3: Run** `bun test packages/studio` and `bun run check`: PASS.
- [ ] **Step 4: Commit:** `git commit -m "feat(studio): studio shows no site.yml data; SLA is studio's own"`

### Task 7: Selection actions on Site (2026-10-22)

**Files:**
- Create: `packages/studio/src/actions.ts`
- Test: `packages/studio/test/actions.test.ts`

**Interfaces:**
- Produces: `actions: Record<string, SelectionActionDecl>`: gezondheidscheck, malwarescan, bijwerken, smoketest, each `on: 'site'`, `many: true`, `opens: true`, `input: {}`, with a label. `run(records)` creates one actie (soort, titel) with `children`/creates of one actie_site per record.

- [ ] **Step 1: Write the tests (RED):**
  - "a health check on three selected sites is one request with three links, in one batch": undo removes all four rows.
  - "one site from its drawer": `{ ids: [id] }` → titel "Gezondheidscheck · <naam>".
  - "the result opens": the run's `created[0]` is the actie, and the four actions declare `opens: true`.
  - "a site gone from the registry is skipped in a request": a selected site with in_registry false gets its link as overgeslagen with resultaat "niet in registry"; the other links are wacht.
  - "a service can start a request on ids": the claude service account → 201.
- [ ] **Step 2: Implement** `actions.ts` and register it in `index.ts`.
- [ ] **Step 3: Run** `bun test packages/studio/test/actions.test.ts`: PASS. Then the gate under the lock: exit 0.
- [ ] **Step 4: Commit:** `git commit -m "feat(studio): run a check or an update on the sites you pick"`

### Task 8: Planning writers

(Unchanged from the old Task 7, renumbered.)

**Files:**
- Create: `packages/studio/src/writers/planning.ts`
- Modify: `packages/studio/src/datasets.ts` (`readonly: true` on `werkpakket.bijgewerkt`, as `voorbereid_op` has)
- Test: `packages/studio/test/planning.test.ts`

**Interfaces:**
- Produces: `projectWriter`, `werkpakketWriter`, `taakWriter`, `agendapuntWriter`, `organisatieWriter`.
  - projectWriter defaults `organisatie_id` to the first `intern` organisatie when absent.
  - werkpakketWriter sets `bijgewerkt` to now on every write (readonly from this task, Ruling C), copies `organisatie_id` and (when absent) `repo` from the project, and refuses a second live row with the same repo and branch ("Er is al een feature voor deze repo en branch.").

- [ ] **Step 1: Write the tests:**
  - "a project without a client belongs to Netdust": a POST without organisatie_id by the claude service → 201, with the intern organisatie.
  - "one row per repo and branch": a second create → refused; the same branch in another repo → 201.
  - "bijgewerkt moves on every write": after a PATCH of laatste_stap, bijgewerkt is later than before.
  - "a werkpakket belongs to its project's client": organisatie_id follows the project.
  - "titles and names are required": an empty titel or naam on each dataset → refused with its Dutch message.
  - "options are checked": an unknown fase or soort → refused.
- [ ] **Step 2: Implement** the writers.
- [ ] **Step 3: Run** `bun test packages/studio/test/planning.test.ts`: PASS. Then the gate under the lock: exit 0.
- [ ] **Step 4: Commit:** `git commit -m "feat(studio): projects, features, tasks and agenda items"`

## Close

As netdust-gates:policy: `bun run gate` under the lock → `/feature-review studio-domain` (security-sentinel joins: the plan carries a threat model) → one fix pass → `/shakeout` drives the Test map's e2e flows on the studio instance (Stefan's screenshots: the dashboard, Sites as table, board and gallery, a request's drawer with a site's preview, the Agenda) → push, and hand Stefan the merge. worktable has no `make promote`; a feature merges to main as the repo's history shows.
