# Step 3: Queries, Views on Queries, Persoon_rol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A planner fills an open slot from a candidates list, works a Conflicten view of six types to zero with badges on the conflicting rows, and reads a person calendar, a venue calendar and the company week on a calendar skin.

**Architecture:**
- Four generic shapes go into the engine:
  - `options_from` on a relation column or input;
  - lookups on datasets with owners;
  - the `calendar` skin need and skin;
  - `badge` on an integer column.
- Theatre gains two datasets (Persoon_rol and Taak), `soort` on Beschikbaarheid, and five SQL views:
  - `conflicten`, built on the base tables;
  - `persoon_dag` and `locatie_dag`, which read `conflicten` for their badge count;
  - `kandidaten`;
  - `werklijst`.
- The grid gains a third view type (calendar), a candidates source in its three slot pickers, and a badge cell.

**First working version:** Task 2. Conflicten, Per persoon per dag and Kandidaten open as tables in the running grid on the seeded data. Task 1 is the data they stand on.

**Simplest design:** The smallest version that meets the brief would keep everything in theatre SQL and show the queries as plain tables. It would have no candidates source, no calendar and no badge, and a planner would look up candidates in a separate table view. The brief's gate rules that out: it needs a picker that lists candidates, a calendar skin and a badge on a row. The plan therefore adds the four shapes and nothing more:
- `options_from` reads an existing route with an equality filter;
- the calendar is a client-side layout over `/rows` with the existing date window;
- the badge is a column hint;
- F2 closes the two leaks already pinned by `lookups-privacy.test.ts`.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, TypeScript, React with React Aria Components; Bun tests (engine, theatre), Vitest + Testing Library (grid), Playwright (e2e).

**Spec:** `specs/step-3/spec.md` (R1–R12, G). Design: `specs/step-3/findings.md`. Spec of record: `docs/SPEC.md` at `8768723` (Dataset, Skin needs and Skins rows; Conflict types; queries table; step 3 rows).

## Global Constraints

- `packages/engine` knows no domain word and imports no domain package (`bun run check`). The vocabulary is built from every theatre and fiche dataset, query and column name, so a new theatre column name (`conflicten`, `ernst`, `voorkeur`, …) becomes banned in engine code, tests and comments. Engine fixtures use invented generic names (`slot`, `member`, `pick_list`, `lane`, …).
- No client data in the repo. `bun scripts/check-export-terms.ts` runs inside `bun run check`. Commit by path, never `git add -A`. The two untracked `specs/grid-ux/shakeout/*.url` files are never added.
- User-facing strings are Dutch, in `apps/grid/src/i18n.ts` and in theatre refusals. Engine names are English and generic.
- Domain rules (the untimed rule, the exclusions, the ranking) live in theatre SQL and writers, never in the engine.
- `docs/SPEC.md` is already edited. A task that finds the spec cannot hold stops and says why.
- Stefan's planner session on `~/laika-export/step2-copy.db` (engine :4341, grid :5181) is his. Never write to the copy. Task 10's script reads a temporary copy of it.
- The gate is `bun run gate`: check, engine and theatre bun tests, grid vitest, Playwright. Load makes single tests flake: rerun a failing test alone, and grep its trace for `net::ERR_` (ERR_NETWORK_CHANGED on WSL) before calling it red.
- Seeds use fixed dates (week of 2026-10-12). Seed rows are appended, never inserted between existing ones, so existing ids hold. Where an appended row changes a count an existing test asserts, update that assertion and name it in the task report.
- Query views are created in `domain.queries` order: `conflicten` before `persoon_dag` and `locatie_dag`.
- "Today" in SQL is `date('now','localtime')`, as `$period` uses the server's local date.

## Threat model

**Assets:**
- fields of records an owner may not read (lookup values);
- the rate columns (`dagtarief`, `uurtarief`);
- other people's absences, assignments and conflicts (query rows);
- the write path's checks.

**Attacks and mitigations:**
1. **An owner (a session or a person's link account) reads a lookup value on Toewijzing**, its own owned dataset, through the row, `/schema`, a filter oracle or a sort oracle. → `readRows` keeps lookups out of the select under any scope but `all`, except owner-visible ones (`rows.ts:137`). `servedLookups` (`app.ts:153`) serves an owner only owner-visible lookups. `resolveKey` (`filter.ts:36`) and `orderOf` (`rows.ts:53`) throw `bad_filter` / `bad_sort` on a lookup key that is not owner-visible when the scope is not `all`. Test map row T3.
2. **A domain declares an owner-visible lookup on a hidden field.** → Validation (`checkLookups`) refuses `owner_visible` unless the target `field` is `owner_visible` and the target dataset is readable by an owner, meaning it declares `owners`. T3.
3. **An owner reads kandidaten, conflicten, werklijst, persoon_dag or locatie_dag**, which carry other people's names, absences and conflicts. → None of them declares `owners`, so an owner gets 404 on `/rows` and the source is absent from `/schema` (existing `readable`). T2 asserts the 404 for each.
4. **An editor writes a rate on Persoon_rol.** → The Persoon_rol writer calls `checkRates` (`writers.ts:259`) and answers 403 "Alleen een beheerder wijzigt tarieven." T1.
5. **`options_from` leaks a query to a caller who cannot read it, or widens what a caller may pick.** → `/schema` serves `options_from` only when the caller can read `source`. The picker reads `/rows/<source>` as the caller. The writer judges the value: a PATCH naming a non-candidate goes through `refuse()` as before. T4 and T7.
6. **Injection through `options_from` or `calendar` keys.** → Keys are declarations, checked as declared columns at validation. Match values go through `filterCompile` as bound values. T4 and T5.

**Deferrals:**
- Editors read Persoon_rol rates. The brief makes rates admin-only for writes, not reads.
- kandidaten's rank uses rates without serving them, so its order hints at relative rates to an editor. Accepted: editors are staff.

## Test map

| Row | Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|---|
| T1 | Theatre data: Persoon_rol, Taak, Beschikbaarheid.soort, parameters, seeds | `POST/PATCH /rows/persoon_rol`, `/rows/taak`, `/rows/beschikbaarheid` | integration · `packages/theatre/test/step3-data.test.ts` · `bun test packages/theatre/test/step3-data.test.ts` | none — proven by flow |
| T2 | conflicten, persoon_dag, locatie_dag, kandidaten, werklijst | `GET /rows/<query>`; `PATCH` through persoon_dag `state` | integration · `packages/theatre/test/step3-queries.test.ts` · `bun test packages/theatre/test/step3-queries.test.ts` | conflicten-six-types, badge-clears |
| T3 | Lookups on datasets with owners (F2) | `GET /rows/:dataset`, `GET /schema`, `validateDomain` | integration · `packages/engine/test/lookups-privacy.test.ts` (extended) · `bun test packages/engine/test/lookups-privacy.test.ts` | none — engine denial |
| T4 | `options_from` (F1), engine | `validateDomain`, `GET /schema` | integration · `packages/engine/test/options-from.test.ts` · `bun test packages/engine/test/options-from.test.ts` | — |
| T5 | `calendar` and `badge`, engine | `validateDomain`, `GET /schema`, `POST/PATCH /views` | integration · `packages/engine/test/calendar.test.ts` · `bun test packages/engine/test/calendar.test.ts` | — |
| T6 | Grid calendar view | `<Calendar>` render; `calendar/layout.ts` `placeEvents` | unit · `apps/grid/src/calendar/layout.test.ts`, `apps/grid/src/calendar/Calendar.test.tsx` · `bun run --filter @worktable/grid test` | person-calendar, company-week |
| T7 | Grid candidates source | `optionsFrom` in `api.ts`; `FillPicker`, Drawer input, Relation cell | unit · `apps/grid/src/api.test.ts`, `apps/grid/src/matrix/Matrix.test.tsx` · same | candidates-picker |
| T8 | Grid badge cell | `<BadgeCell>` render | unit · `apps/grid/src/grid/cells/Badge.test.tsx` · same | badge-clears |
| T9 | Seeded views and the gate | the running grid | e2e · `e2e/step-3.spec.ts`, `e2e/smoke/step-3.spec.ts` · `bunx playwright test e2e/step-3.spec.ts` | all five above |
| T10 | Untimed-rule counts on the real copy | `bun scripts/conflict-counts.ts <db>` | none — a report, never asserted (G) | — |

## Review Focus

- **The untimed rule at its edges** (T2). A timed and an untimed work activity on one plandag is a warning. Two timed ones that touch (one ends 14:00, the next starts 14:00) do not conflict. Any pair involving maaltijd, overnachting or reis is never listed. A name-only row is never listed. An activity on 22:00–01:00 conflicts with a 00:30 one on the same plandag.
- **Denied actor** (T3, T2). An owner filtering or sorting `?filter={"datum":…}` on its own Toewijzing gets 400, never rows. An owner gets 404 on every new query.
- **Empty** (T7). A slot with no candidates shows "Geen kandidaten" and "Iedereen tonen", never an empty silent list. A caller who cannot read the source gets the plain picker.
- **Boundary** (T6). An event crossing midnight sits on its plandag. A month starting on a Sunday renders six week rows. An event with `end` before `start` is drawn as a point, not a negative block.
- **Shape, not behaviour** (T8, T9). The badge test renders the cell with 0, 1 and 3 and reads what is on screen. The gate drives a real fix (state → geannuleerd) and reads the badge gone after the grid reloads its rows.

---

### Task 1: Theatre data — Persoon_rol, Taak, soort, parameters, seeds

**Files:**
- Modify: `packages/theatre/src/datasets.ts` (add `persoonRol`, `taak`; `soort` on `beschikbaarheid`)
- Modify: `packages/theatre/src/writers.ts` (add `persoonRolWriter`, `taakWriter`)
- Modify: `packages/theatre/src/seed.ts` (append the rows below; add the two parameters)
- Modify: `packages/theatre/src/index.ts` (register both datasets and writers; Persoon_rol under "Gegevens", Taak under "Planning")
- Test: `packages/theatre/test/step3-data.test.ts`

**Interfaces:**
- Produces the dataset `persoon_rol` with these columns:
  - `persoon_id` → persoon;
  - `rol_id` → rol;
  - `dagtarief` and `uurtarief`, real, nullable;
  - `voorkeur`, boolean, default false;
  - `notitie`, text, nullable.
  
  Title `{ via: 'persoon_id', else: 'notitie' }`, icon `users`.
- Produces the dataset `taak` with these columns:
  - `titel`, text;
  - `deadline`, date, nullable;
  - `toegewezen_aan` → persoon, nullable;
  - `gekoppeld_aan`, text, options `productie · speelreeks · activiteit · organisatie`, nullable;
  - `record_id`, integer, nullable;
  - `status`, options `open · gedaan`, default `open`, tones ok on gedaan;
  - `notitie`, text, nullable.
  
  Title `titel`, date `deadline`, icon `check`.
- Produces `beschikbaarheid.soort`: text, default `'afwezig'`, options afwezig · onzeker · beschikbaar · voorkeur, tones bad · warn · ok · sky, `owner_visible: true` and `owner_writable: true`. A person sets their own soort; check `checkOwnerWritable` allows it.
- Produces the own organisation's `parameters` seed `{ dag_grens_uur: 5, waarschuwingshorizon_dagen: 14, bevestigingstermijn_dagen: 7 }`.
- Seed ids that later tasks use. Appended rows take the next ids, so read them back by match, never by literal id, in tests.
  - activity **A-dubbel**, appended after `untimed`: `[2, 'vergadering', '2026-10-12T10:00', '2026-10-12T11:00', 'bevestigd', 'Gent']`, which overlaps activity 1 (production 1, Gent, 09:00–13:00);
  - toewijzingen appended:
    - Lotte (1) voorlopig on activity 13 (production 2 repetitie, 10:00–17:00 on 10-12), which overlaps her bevestigd on activity 2 (14:00–18:00): **overlap, conflict**;
    - Noor (3) bevestigd on activity 15 (2026-10-14 10:00–17:00), against her afwezig on 10-14: **afwezig**;
    - Sam (4) voorlopig on activity 15: **already assigned**;
    - an open slot on activity 15: `rol_id` Speler, `aantal` 1, `state` open;
  - beschikbaarheid appended: Bram (2), soort onzeker, 2026-10-12T20:00–23:00, against his uitgenodigd on activity 4 (20:30): **onzeker**;
  - persoon_rol: Speler for Lotte (voorkeur true), Bram, Noor and Sam; Lichttechnicus for Noor (dagtarief 300);
  - taak: two rows, one open assigned to Lotte with deadline 2026-10-16, and one gedaan.

- [ ] **Step 1: Write the failing tests** in `step3-data.test.ts`, through `testEngine` and `send`, as `theatre.test.ts` does:
  - `an editor cannot set a rate on persoon_rol` → 403, message `Alleen een beheerder wijzigt tarieven.`; an administrator → 201;
  - `one persoon_rol per person and role` → second create 409 or 400 with a Dutch message (match `writer.test.ts`'s duplicate style);
  - `beschikbaarheid without soort is afwezig` → created row `soort === 'afwezig'`;
  - `an owner sets soort on its own beschikbaarheid` → 200;
  - `an owner cannot read persoon_rol or taak` → 404 on both `/rows`;
  - `taak refuses a status outside open, gedaan` → 400.
- [ ] **Step 2: Run** `bun test packages/theatre/test/step3-data.test.ts` → FAIL (unknown dataset).
- [ ] **Step 3: Implement** the datasets, the two writers (`forPlanners` + `checkRates` on Persoon_rol; `ctx.exists('persoon_rol', { persoon_id, rol_id }, id)` for uniqueness; `forPlanners` on Taak), the seeds and the registrations.
- [ ] **Step 4: Run** the file → PASS; then `bun test packages` and fix any count an appended seed changed, naming each in the report.
- [ ] **Step 5: Commit** `feat(theatre): Persoon_rol with admin-only rates, Taak, soort on Beschikbaarheid (afwezig by default), seeds for step 3`

### Task 2: Theatre queries — conflicten, persoon_dag, locatie_dag, kandidaten, werklijst

**Files:**
- Create: `packages/theatre/src/queries/conflicten.sql`, `persoon_dag.sql`, `locatie_dag.sql`, `kandidaten.sql`, `werklijst.sql`
- Modify: `packages/theatre/src/queries.ts` (declarations); `packages/theatre/src/index.ts` (queries in this order: `conflicten, persoonDag, locatieDag, kandidaten, werklijst, productieDag, voorstellingen, mijnProducties`; sections "Overzichten" add them)
- Test: `packages/theatre/test/step3-queries.test.ts`

**Interfaces:**
- Consumes: Task 1's datasets and seeds.
- Shared SQL terms:
  - **live assignment**: `tw.deleted_at IS NULL AND tw.persoon_id IS NOT NULL AND tw.state IN ('voorlopig','uitgenodigd','bevestigd')`;
  - **live activity**: `a.deleted_at IS NULL AND a.status != 'geannuleerd'`;
  - **logistics**: `soort IN ('maaltijd','overnachting','reis')`;
  - **window**: a timed activity runs `[start_at, COALESCE(eind_at, start_at)]`, an untimed one `[datum||'T00:00', datum||'T23:59:59']`;
  - **resolved locatie**: `COALESCE(a.locatie_id, sr.locatie_id)`;
  - **own parameters**: `json_extract(parameters, '$.<key>')` of the first live `organisatie` with `soort = 'eigen'`, with default 14 for `waarschuwingshorizon_dagen` and 7 for `bevestigingstermijn_dagen`.
- Produces the query **`conflicten`**:
  - columns:
    - `id`: `<type code> * 1e12 + x * 1e6 + y`, an integer, unique and stable;
    - `type`: options `overlap · afwezig · onzeker · open_slot · onbevestigd · locatie_dubbel`, with Dutch labels;
    - `ernst`: options `conflict · waarschuwing`, tones bad · warn;
    - `persoon_id` → persoon, nullable;
    - `toewijzing_id` → toewijzing, nullable;
    - `ander_toewijzing_id` → toewijzing, nullable;
    - `activiteit_id` → activiteit;
    - `ander_activiteit_id` → activiteit, nullable;
    - `locatie_id` → organisatie, nullable;
    - `productie_id` → productie;
    - `plandag`: date;
    - `omschrijving`: text, a Dutch sentence;
  - title `omschrijving`, date `plandag`, `scoped: 'productie_id'`, icon `flag`;
  - the six rules:
    - **overlap**: two live assignments of one person on one plandag, on live non-logistics activities. Both timed and windows overlapping (`s1 < e2 AND s2 < e1`) gives `conflict`. One or both untimed gives `waarschuwing`. Both timed and apart gives no row.
    - **afwezig**: a live assignment whose activity window overlaps a live Beschikbaarheid with soort afwezig for that person gives `conflict`.
    - **onzeker**: the same with soort onzeker gives `waarschuwing`.
    - **open_slot**: a live Toewijzing in state open whose live activity's plandag is between today and today + horizon gives `conflict`.
    - **onbevestigd**: state uitgenodigd, where the invite moment (the latest `revision` row with `entity='toewijzing'`, `field='state'`, `new='"uitgenodigd"'`, else `tw.created_at`) is at least `bevestigingstermijn_dagen` days before today, gives `conflict`.
    - **locatie_dubbel**: two live activities with the same non-null resolved locatie and overlapping windows (the untimed rule and the logistics exclusion as in overlap), where `a.productie_id != b.productie_id`, or both have a speelreeks and the speelreeksen differ.
- Produces the query **`persoon_dag`**, one row per live, non-name-only Toewijzing on a live activity:
  - columns:
    - `id` (the toewijzing id) and `toewijzing_id`;
    - `persoon_id`;
    - `activiteit_id`, `productie_id` and `rol_id`;
    - `omschrijving`, `soort`, `plandag`, `datum`, `start_at` and `eind_at`;
    - `locatie_id`, resolved;
    - `state`, with `writes: { dataset: 'toewijzing', field: 'state', key: 'toewijzing_id' }`;
    - `beschikbaarheid`: the soort of an overlapping Beschikbaarheid, nullable;
    - `conflicten`: integer, `badge: 'bad'`, counting conflicten rows where `toewijzing_id` or `ander_toewijzing_id` is this id;
  - title `omschrijving`, date `plandag`, `scoped: 'productie_id'`;
  - `calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['persoon_id', 'productie_id'] }`.
  - "Live" here includes geweigerd and geannuleerd states, so a fixed row stays visible. The seeded views filter them.
- Produces the query **`locatie_dag`**, one row per live activity with a non-null resolved locatie:
  - columns:
    - `id` (the activity id) and `activiteit_id`;
    - `locatie_id`;
    - `productie_id`;
    - `omschrijving`, `soort`, `plandag`, `datum`;
    - `start_at` and `eind_at`, each with `writes` to activiteit;
    - `status`, with `writes` to activiteit;
    - `conflicten`: integer, `badge: 'bad'`, counting locatie_dubbel rows on either activity;
  - title `omschrijving`, date `plandag`, `scoped: 'productie_id'`;
  - `calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['locatie_id', 'productie_id'] }`.
- Produces the query **`kandidaten`**, one row per open slot × candidate:
  - a candidate is an active persoon holding Persoon_rol for the slot's `rol_id`;
  - excluded: anyone afwezig over the activity window, anyone with any non-cancelled Toewijzing on that activity, and anyone with a live assignment whose timed window overlaps a timed slot activity (non-logistics);
  - columns:
    - `id`: `slot * 1e6 + persoon`;
    - `toewijzing_id` → toewijzing;
    - `persoon_id` → persoon;
    - `naam`, the weergavenaam;
    - `activiteit_id` and `rol_id`;
    - `voorkeur`, boolean;
    - `rang`, integer;
  - ranked by `voorkeur DESC, COALESCE(pr.dagtarief, r.dagtarief) ASC NULLS LAST, naam`. Rates are not columns. `rang` = `ROW_NUMBER() OVER (PARTITION BY slot ORDER BY …)`, and the query's default order is `toewijzing_id, rang`.
  - Title `naam`.
- Produces the query **`werklijst`**:
  - one row per open Taak (`persoon_id` = `toegewezen_aan`);
  - one per open slot inside the horizon (`persoon_id` null);
  - one per uitgenodigd past the termijn (`persoon_id` = the invitee);
  - one per activity with status optie and plandag within 14 days (`persoon_id` null);
  - columns:
    - `id`, a coded integer;
    - `soort`: options `taak · open_slot · onbeantwoord · optie`;
    - `persoon_id`, nullable;
    - `titel`;
    - `deadline`, a date;
    - `taak_id` → taak, nullable;
    - `status`, with `writes: { dataset: 'taak', field: 'status', key: 'taak_id' }`;
  - title `titel`, date `deadline`.

- [ ] **Step 1: Write the failing tests** in `step3-queries.test.ts`. For each rule, write the rows through the engine as an administrator on a fresh seeded db. Freeze "today" by inserting data relative to `new Date()`; never mock SQLite's clock.
  - `conflicten lists one row per seeded type`: on the fresh seed, overlap, afwezig, onzeker and locatie_dubbel are present. Then add an open slot on a new activity dated today + 1, and backdate one uitgenodigd row's `created_at` by 30 days with a direct `UPDATE`: open_slot and onbevestigd appear. Assert `new Set(types).size === 6`.
  - `the untimed rule`:
    - two untimed work activities on one day → one overlap row, ernst `waarschuwing`;
    - a timed and an untimed work activity → `waarschuwing`;
    - two timed that touch (14:00 end, 14:00 start) → no row;
    - any pair with maaltijd, overnachting or reis → no row;
    - a 22:00–01:00 and a 00:30–01:30 on one plandag → `conflict`.
  - `name-only rows count toward nothing`: a naam-only row overlapping a timed assignment and an afwezig → no conflicten row names it.
  - `geweigerd, geannuleerd and cancelled activities count toward nothing`.
  - `kandidaten for the seeded open slot`: persoon names in order `['Lotte Verhaegen', 'Bram De Wilde']`. Noor (afwezig) and Sam (assigned) are absent.
  - `persoon_dag writes state through refuse()`:
    - `PATCH /rows/toewijzing/<Noor's id>` with `{ state: 'geannuleerd' }`, sent as the grid sends a mapped write;
    - then `GET /rows/persoon_dag` shows `conflicten: 0` for that row, and before the write it was 1;
    - a disallowed transition (geannuleerd → bevestigd is refused by the lifecycle) answers the lifecycle's refusal.
  - `werklijst`: the open Taak for Lotte is listed. A PATCH of `status: 'gedaan'` on its row lands on Taak. The seeded optie activities within 14 days are listed only when the test inserts one dated today + 3.
  - `owners read none of them`: an owner gets 404 on all five `/rows/<query>`.
- [ ] **Step 2: Run** → FAIL (unknown source).
- [ ] **Step 3: Implement** the five SQL files and the declarations. Use `UNION ALL` per conflict type, and a CTE for the window terms in each file. SQLite views cannot share a CTE, so repeat the terms; each file stays under one screen per type.
- [ ] **Step 4: Run** the file → PASS; `bun test packages` → PASS.
- [ ] **Step 5: Check visually**: start an engine on a fresh db (`bun packages/engine/src/serve.ts --domain @worktable/theatre --db <scratch>/s3.db --port 4320 --fresh`) and the grid against it (as `playwright.config.ts`'s grid webServer does, on a free port, never :4330/:5180/:4341/:5181) → Conflicten, Per persoon per dag and Kandidaten open as tables. Screenshot Conflicten into `specs/step-3/task-2-conflicten.png`.
- [ ] **Step 6: Commit** `feat(theatre): conflicten with six types and the untimed rule, persoon_dag and locatie_dag with a conflict count, kandidaten, werklijst`

### Task 3: Engine — lookups on datasets with owners (F2), and Toewijzing's lookups

**Files:**
- Modify: `packages/engine/src/declare.ts` (`LookupDecl.owner_visible?: true`)
- Modify: `packages/engine/src/validate.ts:210-240` (`checkLookups`: drop the owners refusal at :214; refuse `owner_visible` unless the target field is `owner_visible` and the target dataset declares `owners`)
- Modify: `packages/engine/src/lookups.ts` (add `lookupsFor(source: Source, scope: Scope): string[]`: every lookup under `all`, else only `owner_visible` ones)
- Modify: `packages/engine/src/rows.ts:53,137` (`orderOf` and the select use `lookupsFor`); `packages/engine/src/filter.ts:36` (`resolveKey` takes the scope and refuses a lookup outside `lookupsFor` with `bad_filter` "unknown filter key"); `packages/engine/src/app.ts:153` (`servedLookups` uses the actor's scope)
- Modify: `packages/theatre/src/datasets.ts` (toewijzing `lookups`: `datum`, `start_at`, `eind_at` and `productie`, each `via: 'activiteit_id'`)
- Modify: `docs/SPEC.md` only if a line disagrees with what the code must do (stop and report instead)
- Test: `packages/engine/test/lookups-privacy.test.ts`, `packages/engine/test/fixtures/lookup-domain.ts`

**Interfaces:**
- Produces `lookupsFor(source: Source, scope: Scope): string[]` in `lookups.ts`, which Task 5 does not need. `Scope` is `access.ts`'s type.

- [ ] **Step 1: Turn the probes around (RED).**
  - In `lookup-domain.ts`, give the owned dataset `team` a lookup, `team.home_name` via a relation, and drop the "validateDomain refuses owners" expectation.
  - Add these tests:
    - `an owner's rows carry no lookup` → no `home_name` key;
    - `an owner's filter on a lookup is 400 bad_filter`;
    - `an owner's sort on a lookup is 400 bad_sort`;
    - `/schema for an owner serves no lookup`;
    - `an editor reads, filters and sorts it` → 200 with values;
    - `owner_visible on a lookup whose field is not owner_visible is refused` (validateDomain throws, naming the lookup);
    - `an owner_visible lookup is served, filtered and sorted for its owner`.
- [ ] **Step 2: Run** `bun test packages/engine/test/lookups-privacy.test.ts` → FAIL on validation (owners refusal) and on the owner filter (no refusal).
- [ ] **Step 3: Implement** as listed in Files.
- [ ] **Step 4: Run** the file and `bun test packages` → PASS. The theatre tests show Toewijzing rows carrying `lookups.datum` for an editor and none for Lotte's owner session (add that case to `packages/theatre/test/lookups.test.ts`).
- [ ] **Step 5: Commit** `feat(engine): lookups on datasets with owners — served to editors and administrators, refused in an owner's filter and sort unless owner-visible; Toewijzing shows the activity's date, times and production`

### Task 4: Engine — `options_from` (F1)

**Files:**
- Modify: `packages/engine/src/declare.ts`:
  - `export interface OptionsFrom { source: string; match: Record<string, string>; value: string }`;
  - `ColumnDecl.options_from?: OptionsFrom`;
  - the relation `ActionInput` variant gains `options_from?: OptionsFrom`.
- Modify: `packages/engine/src/validate.ts`. Add `checkOptionsFrom(domain, where: string, from: OptionsFrom, target: string, owner: Source)`, called for each column with `options_from` (requires `relation`) and for each relation action input (`owner` = the action's `on` dataset):
  - `source` must be a declared query;
  - `value` must be a column of it whose `relation === target`;
  - each `match` key must be a query column, and each value a column of `owner` or `id`.
- Modify: `packages/engine/src/app.ts`. `servedColumn` and the actions' served inputs drop `options_from` when the actor cannot `readable(actor, source)`.
- Modify: `packages/theatre/src/datasets.ts` and `actions.ts`. `toewijzing.persoon_id` and `vulSlot.input.persoon_id` gain `options_from: { source: 'kandidaten', match: { toewijzing_id: 'id' }, value: 'persoon_id' }`.
- Test: `packages/engine/test/options-from.test.ts` (a fixture domain `test/fixtures/options-domain.ts` with datasets `slot` and `member`, a query `pick_list`, and an action `fill_slot`)

**Interfaces:**
- Produces `OptionsFrom` (above), served as-is on `/schema` columns and on action inputs.

- [ ] **Step 1: Write the failing tests:**
  - `refuses an unknown source`;
  - `refuses a value that is not a relation to the same target`;
  - `refuses a match column missing on the query`;
  - `refuses a match column missing on the row`;
  - `refuses options_from on a column without relation`;
  - `/schema serves options_from to an editor`;
  - `/schema leaves options_from out for an owner who cannot read the source`;
  - `a filter on the match column returns that slot's rows in the query's order`, via `GET /rows/pick_list?filter={"slot_id":N}`.
- [ ] **Step 2: Run** `bun test packages/engine/test/options-from.test.ts` → FAIL.
- [ ] **Step 3: Implement** as listed in Files.
- [ ] **Step 4: Run** the file and `bun test packages`, then `bun run check` (the vocabulary) → PASS.
- [ ] **Step 5: Commit** `feat(engine): options_from — a relation's picker lists a query's rows matched to the current record; theatre's slot pickers read kandidaten`

### Task 5: Engine — the `calendar` skin need and skin, and `badge`

**Files:**
- Modify: `packages/engine/src/declare.ts`:
  - `export interface CalendarDecl { day: string; start?: string; end?: string; lanes: string[] }`;
  - `calendar?: CalendarDecl` on `DatasetDecl` and `QueryDecl`;
  - `ColumnDecl.badge?: Tone`;
  - `SavedViewSeed.skin: 'table' | 'matrix' | 'calendar'`.
- Modify: `packages/engine/src/validate.ts`:
  - add `checkCalendar(source)`:
    - `day` must equal the source's `date` (the window the rows route already filters);
    - `start` and `end` must be datetime columns;
    - `lanes` must be non-empty, and each must be a relation column;
  - in `checkTones`, refuse `badge` on a non-integer column or with a tone outside `TONES`.
- Modify: `packages/engine/src/views.ts:27,94,127`:
  - `ViewFields.skin` adds `'calendar'`;
  - `skinOf` accepts `calendar` when `source.calendar`;
  - with skin calendar, `groupOf` accepts null or one of `calendar.lanes`, else `bad_view` "cannot group a calendar on …".
- Modify: `packages/engine/src/app.ts` (`/schema` serves `calendar` per source; `badge` rides on the column as declared)
- Modify: `packages/theatre/src/queries.ts` (productie_dag `calendar: { day: 'plandag', lanes: ['productie_id'] }`)
- Test: `packages/engine/test/calendar.test.ts` (fixture domain with an invented `event` dataset: `day` date, `begins` and `ends` datetime, `room_id` → `room`)

**Interfaces:**
- Produces `CalendarDecl`. `/schema` source key `calendar`. Skin string `'calendar'`.

- [ ] **Step 1: Write the failing tests:**
  - `refuses a calendar whose day is not the source's date`;
  - `refuses a lane that is not a relation`;
  - `refuses an empty lanes list`;
  - `refuses badge on a text column`;
  - `refuses a badge tone outside the palette`;
  - `a view on the calendar skin saves with group_by a lane`;
  - `refuses a calendar view grouped on a non-lane`;
  - `refuses skin calendar on a source without calendar`;
  - `/schema serves calendar and badge`.
- [ ] **Step 2: Run** `bun test packages/engine/test/calendar.test.ts` → FAIL.
- [ ] **Step 3: Implement** as listed in Files.
- [ ] **Step 4: Run** the file and `bun test packages` → PASS.
- [ ] **Step 5: Commit** `feat(engine): the calendar skin need and skin, grouped by a declared lane; badge on an integer column`

### Task 6: Grid — the calendar view

**Files:**
- Create: `apps/grid/src/calendar/layout.ts`. It exports:
  ```ts
  placeEvents(rows: Row[], cal: CalendarDef, window: DateWindow, lane: string | null): { lanes: { id: number | null; title: string }[]; days: string[]; events: Placed[] }
  ```
  where `Placed = { row: Row; day: string; lane: number | null; allDay: boolean; from: number; to: number }`. `from` and `to` are minutes after 00:00 of `day`, and a time past midnight on the same plandag counts beyond 1440.
- Create: `apps/grid/src/calendar/Calendar.tsx`:
  - a header with Maand · Week, previous and next (`shift` / `shiftMonth` from `ui/Window.tsx`), today, and the lane select from `cal.lanes` written to the view's group;
  - week: one row per lane, seven day columns, all-day chips above the timed blocks;
  - month: a Monday-first grid of 5 or 6 weeks, each event a chip prefixed with its lane title;
  - clicking an event opens `PanelDrawer`'s pattern (`matrix/Matrix.tsx:543-560`) for the row.
- Modify: `apps/grid/src/types.ts:93,124` (`ViewType` adds `'calendar'`; `TableDef.calendar?: CalendarDef`, where `CalendarDef = { day: string; start: string | null; end: string | null; lanes: string[] }`)
- Modify: `apps/grid/src/engine.ts`:
  - :92 `EngineView.skin` adds `'calendar'`;
  - :234-251 `tableDefOf` adds `'calendar'` to `types` and sets `calendar` when the source declares it;
  - :369 maps skin `calendar` to type `calendar`.
- Modify: `apps/grid/src/api.ts:302` (type calendar → skin calendar)
- Modify: `apps/grid/src/ui/App.tsx`:
  - :264-271: calendar window = the shown week, or the month's whole weeks;
  - :488-499: the `Calendar` branch;
  - the toolbar takes no add and no export on a calendar.
- Modify: `apps/grid/src/ui/Rail.tsx:91` (Kalender runs `onNew('calendar')` when `table.types` includes it, else stays blocked), `ui/NewViewDialog.tsx:18,29`, `ui/ViewList.tsx:107` (icon `CalendarDays` from lucide-react, already a dependency: check `package.json`), `i18n.ts` (`kindCalendar`, `month: 'Maand'`, `week: 'Week'`, `allDay: 'Hele dag'`)
- Test: `apps/grid/src/calendar/layout.test.ts`, `apps/grid/src/calendar/Calendar.test.tsx`, `apps/grid/src/engine.test.ts` (mapping)

**Interfaces:**
- Consumes: Task 5's `/schema` `calendar` and skin `'calendar'`.

- [ ] **Step 1: Write the failing tests:**
  - layout:
    - `an untimed row is all-day`;
    - `a 22:00–01:00 row sits on its plandag with to = 1500`;
    - `an end before start is a point`;
    - `rows group into their lane, unknown lane last`;
    - `a month from a Sunday the 1st spans six weeks`;
  - Calendar:
    - `week shows lanes as rows and a chip per event`;
    - `clicking an event opens the drawer`;
    - `Maand switches to the month grid`;
  - engine.test:
    - `a calendar source offers the calendar type`;
    - `skin calendar maps to type calendar and back`.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test` → FAIL.
- [ ] **Step 3: Implement** as listed in Files. Use React Aria's `ToggleButtonGroup` for Maand/Week and `Select` for the lane, as `ui/SpaceSelect.tsx` does.
- [ ] **Step 4: Run** the grid tests → PASS; `bun run check` → PASS.
- [ ] **Step 5: Commit** `feat(grid): the calendar view — month and week, lanes, untimed rows all-day, an event opens the row`

### Task 7: Grid — the candidates source in the slot pickers

**Files:**
- Modify: `apps/grid/src/types.ts` (`Field.options_from?: OptionsFrom`; `ActionInput` relation variant `options_from?`), `apps/grid/src/engine.ts:6-21,136-152` (carry `options_from` onto `Field`)
- Modify: `apps/grid/src/api.ts`. Add:
  ```ts
  optionsFrom(from: OptionsFrom, record: Record<string, unknown>): Promise<{ id: number; title: string }[]>
  ```
  It reads every row of `from.source` (paged like `everyRow`) with `filter` = `{ [queryColumn]: record[rowColumn] }` for each `match` pair, maps each row to its `value` id and that relation's title, and keeps the server's order. Ids are deduplicated by first occurrence.
- Modify: `apps/grid/src/matrix/Matrix.tsx:155-187` `FillPicker`. When the fill input has `options_from`, after the slot is chosen it lists `optionsFrom(...)` for the slot's join row (`slot.cell`, its fields), with these states:
  - "Laden…" while it loads;
  - "Geen kandidaten" when the list is empty;
  - an "Iedereen tonen" button that switches to today's list of every title.
- Modify: `apps/grid/src/grid/cells/RelationPicker.tsx` (optional `candidates?: () => Promise<{id: number; title: string}[]>`: listed in that order, plus "Iedereen tonen" switching to `records`), `grid/cells/Relation.tsx:49-71` (pass `candidates` when the field has `options_from`, the row is open and the persoon is empty; filled rows keep the plain picker), `grid/Drawer.tsx:226-235` (same, from the action input and the drawer's row)
- Modify: `apps/grid/src/matrix/store.ts` / `engine.ts:223-228` `openOf` (carry the fill input's `options_from` onto `open`)
- Modify: `i18n.ts` (`candidatesNone: 'Geen kandidaten'`, `candidatesAll: 'Iedereen tonen'`)
- Test: `apps/grid/src/api.test.ts`, `apps/grid/src/matrix/Matrix.test.tsx`, `apps/grid/src/grid/cells/RelationPicker.test.tsx` (create if missing)

**Interfaces:**
- Consumes: Task 4's served `options_from`.

- [ ] **Step 1: Write the failing tests:**
  - `optionsFrom filters the source on the match and keeps its order` (the fetch URL holds `filter={"toewijzing_id":7}`; the result follows the server's order);
  - `FillPicker lists candidates only, then everyone after Iedereen tonen`;
  - `FillPicker says Geen kandidaten for an empty list`;
  - `a filled row's relation cell keeps the plain picker`.
- [ ] **Step 2: Run** the grid tests → FAIL.
- [ ] **Step 3: Implement** as listed in Files.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(grid): slot pickers list candidates from the declared query, with Iedereen tonen`

### Task 8: Grid — the badge cell

**Files:**
- Create: `apps/grid/src/grid/cells/Badge.tsx`. It exports `BadgeCell({ column, row }: CellProps)`, which renders `<span className={`nv-badge nv-badge--${tone}`}>{n}</span>` when n > 0, and nothing at 0 or null. The `aria-label` is `t('badgeCount', { count })`.
- Modify: `apps/grid/src/types.ts` (`Field.badge?: Tone`), `apps/grid/src/engine.ts` (carry `badge`), `apps/grid/src/grid/columns.ts:115-130` (kind `'badge'` for a field with `badge`), `grid/cells/index.tsx:39` (dispatch), `ui/app.css` (`.nv-badge` beside `.nv-pill`, reusing the tone variables at :1427-1512)
- Modify: `i18n.ts` (`badgeCount: '{count} conflicten'`; the label stays generic in code, and the theatre words come from the column label: use `` `${count} · ${column.label}` `` if `i18n` cannot take the label)
- Test: `apps/grid/src/grid/cells/Badge.test.tsx`

- [ ] **Step 1: Write the failing test** `shows 3 and 1 as badges and nothing at 0`, rendering with a real `Column` built by `fieldColumn`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(grid): badge cells — a tinted count above 0, nothing at 0`

### Task 9: Seeded views and the gate

**Files:**
- Modify: `packages/theatre/src/seed.ts` `views`. Append:
  - `Conflicten` (conflicten, table, sort `plandag`, `type`; all columns but the ids);
  - `Per persoon per dag` (persoon_dag, table, filter `state` `$nin` geweigerd, geannuleerd, with `conflicten` visible);
  - `Persoonskalender` (persoon_dag, calendar, `group_by: 'persoon_id'`, same filter);
  - `Locatiekalender` (locatie_dag, calendar, `group_by: 'locatie_id'`);
  - `Bedrijfsweek` (productie_dag, calendar, `group_by: 'productie_id'`);
  - `Werklijst` (werklijst, table, filter none, sort `deadline`);
  - `Kandidaten` (kandidaten, table).
- Create: `e2e/step-3.spec.ts`. Use `openView` and `openWeek` from `e2e/tree.ts`, and `writeDb` copied from `e2e/step-2.spec.ts:105` (move it to a shared `e2e/db.ts` and import it in both).
  - **candidates-picker**:
    - in "Toewijzingen per activiteit", in the week of 2026-10-12 (production Nachtwacht), open activity 15's open cell;
    - the picker lists Lotte Verhaegen and Bram De Wilde, in that order, and neither Noor Claes nor Sam Peeters;
    - "Iedereen tonen" lists Noor;
    - picking Bram fills the slot (voorlopig).
  - **conflicten-six-types**:
    - in `beforeAll`, through the API as admin, create an activity dated today + 1 with an open Speler slot;
    - with `writeDb`, set one uitgenodigd row's `created_at` to 30 days ago;
    - open Conflicten: the Type column shows all six Dutch labels.
  - **badge-clears**:
    - in "Per persoon per dag", Noor's row on 2026-10-14 shows a badge "1";
    - set its Status cell to Geannuleerd; after the grid reloads, the badge is gone (the row stays until the view's filter applies on the next load; assert on the reloaded rows).
  - **person-calendar**:
    - open Persoonskalender, which shows the calendar (the Week toggle is visible);
    - in the week of 2026-10-12 there is a lane "Lotte Verhaegen" with her repetitie chip;
    - the untimed overnachting shows under "Hele dag" in Productie 2's lane when laned by production.
  - **company-week**: open Bedrijfsweek; the week of 2026-10-12 shows lanes De Kersentuin and Nachtwacht.
- Create: `e2e/smoke/step-3.spec.ts`: `/api/rows/conflicten asks for a session @smoke` → 401; `a calendar link lands on the sign-in page @smoke`.
- Modify: `specs/CHECKS.md` (register the five flows `@e2e` and the two `@smoke`; `/shakeout` refines them)

- [ ] **Step 1: Write the e2e spec** and run it: `bunx playwright test e2e/step-3.spec.ts` → it fails only where Task 9's seed views are missing.
- [ ] **Step 2: Add the seed views.** Run again → PASS. Then `bun run gate` → PASS.
- [ ] **Step 3: Commit** `test(e2e): step 3 gate — candidates in the slot picker, six conflict types, the badge clears, the person calendar and the company week; seeded views`

### Task 10: The untimed-rule counts on the real copy

**Files:**
- Create: `scripts/conflict-counts.ts`. `bun scripts/conflict-counts.ts <db>`:
  - copies `<db>` to a temp file in `os.tmpdir()` with mode 0600;
  - runs the engine's migration on the copy (`migrate` + `--seed-missing`'s config path, as `serve.ts` does, without serving);
  - prints `type · ernst · rows · people · days` from `conflicten`;
  - prints the logistics-excluded pair count, using `findings.md`'s SQL;
  - deletes the copy.
  
  It prints counts only: no names, ids or dates.
- Modify: `specs/step-3/findings.md` (append "Counts after the build" with the output, run on `~/laika-export/step2-copy.db`)

- [ ] **Step 1: Run** `bun scripts/conflict-counts.ts ~/laika-export/step2-copy.db`, and check `ls -l ~/laika-export/step2-copy.db` shows the same mtime before and after.
- [ ] **Step 2: Append the counts** to findings.md and **commit** `docs(step-3): the untimed rule's counts on the real copy after the build`.
