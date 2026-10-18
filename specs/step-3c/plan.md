# Step 3c: Skins and the Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid opens on a dashboard that answers what is wrong, what happens this week and what waits, one click from each fix. Board, timeline and gallery join grid and calendar as declared, read-only skins.

**Architecture:**
- The engine gains these declarations:
  - `board`, `gallery` and `calendar.spans`, with `timeline` riding on `calendar`;
  - one batched attachments read;
  - a source-less saved view with skin `dashboard` and a `layout` column, validated and seeded like any view.
- The grid gets one component per skin and a dashboard page whose tiles read saved views through the existing rows route.
- Theatre declares the needs and seeds a view per skin and one shared dashboard.

**First working version:** Task 4. The grid opens on the seeded dashboard, showing the "Nu" stats and the Werklijst list on the running engine. Tasks 1–3 are what it stands on.

**Simplest design:** The simplest version that meets the brief is one hard-coded planner page in the grid, with no engine changes. Stefan's verdict rules that out: the dashboard is a saved view, composed by administrators, with generic tiles. So the plan keeps everything else at its smallest:
- no new route but the batched attachments read;
- no aggregate in the rows route (a sum is computed in the grid over at most 5000 rows);
- the tile `set` writes through the existing write path;
- quick creates use `POST /rows`;
- timeline reuses the calendar need;
- every skin is read-only.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, TypeScript, React with React Aria Components. Tests: Bun tests (engine, theatre), Vitest + Testing Library (grid), Playwright (e2e).

**Spec:** `specs/step-3c/spec.md` (R1–R9, G). Design: `specs/step-3c/findings.md` (F4 as Stefan ruled). Spec of record: `docs/SPEC.md` at `62fead3`.

**Execution (recommended):** Tasks 1–2 subagent-driven, because they are security-boundary units: who lists a dashboard, and the batched attachments read. Tasks 3–7 native, as in step 3.

## Global Constraints

- `packages/engine` knows no domain word and imports no domain package (`bun run check`). New theatre names join the vocabulary. Engine fixtures use invented generic names.
- No client data. Commit by path, never `git add -A`. The untracked `specs/grid-ux/shakeout/*.url` and `specs/step-3/shakeout/*.url` files are never added.
- User-facing strings are Dutch (`apps/grid/src/i18n.ts`). Engine names are English and generic.
- Writer refusals answer 422 `refused` (house style). Engine refusals stay 400 `bad_view`.
- Skins other than the grid and the matrix are read-only: an item opens its row in the existing drawer, beside the content, as the calendar's does (`945b4c1`).
- Run `bunx biome check --write .` before every `bun run gate`. The gate is `bun run gate`; e2e flakes on WSL: rerun alone and grep the trace for `net::ERR_`.
- e2e flows build their own rows in weeks no other spec uses (2028-06 and later), as ruling R-7 of step 3 does, and open views on those weeks with `openWeek`. The exception is the dashboard's week strip, which shows this week: its flow creates an activity relative to today (review S7).
- Never touch ports :4330/:5180/:4341/:5181 or `~/laika-export`.

## Threat model

**Assets:**
- what an owner may read (dashboards, other people's rows through tiles, files through the batched read);
- the write path's checks (tile `set`, quick creates);
- the engine's availability (layout size).

**Attacks and mitigations:**
1. **An owner (a session or a link account) lists or opens a dashboard.** → `listViews` (`views.ts:249`) keeps a dashboard row only for an actor whose role is not owner. An owner cannot write views at all (`changing`, `views.ts:269`). The grid never shows the rail item without a listed dashboard. Test map row T1.
2. **A dashboard is published or shown to owners.** → Both routes already refuse a source-less view: `checkPublishable` (`views.ts:334`) and `forOwnersProblem` (`views.ts:360`) answer 400 `not_query`, and `/public/views/:token` requires `source_type = 'query'` (`views.ts:434`). No new guard is needed; T1 asserts the 400 for an administrator (review N1, N6).
3. **A tile reads rows the caller may not read.** → Every tile read is the existing `/rows` read of its view's source under the caller's scope. A dashboard stores no rows, and no tile read bypasses `/rows`. T4 (grid uses `rows()`), and T1 validates that every tile names an existing view.
4. **The batched attachments read leaks a file of a row outside the caller's scope.** → The route resolves the dataset through `declaredOf` (`attachments.ts:84-89`), answering 404 `unknown_source` exactly as the single read does for an owner without `owner_visible`. It resolves each id through `liveRecord(store, dataset, id, actor)` and leaves out an id that fails, giving the same answer as an id with no file. At most 200 ids, else 400. T2's fixture declares `owner_visible`, so the scope test reaches `liveRecord` (review S6).
5. **A tile `set` writes past the writer.** → It is an ordinary `PATCH /rows/<dataset>/<id>`, or a mapped query write, so the writer and the lifecycle judge it. Validation refuses a `set` on a column that does not write, or with a value outside its options. T1 (validation), T4 (grid call shape).
6. **An oversized or malformed layout.** → `viewBody` refuses a layout over the caps (6 sections, 12 tiles each, 8 actions, labels at most 80 characters), an unknown tile kind, a tile naming no live view, and a layout on any skin but `dashboard`. T1.

**Deferrals:** A dashboard tile can name a private view of its composer. Another reader then sees that tile empty, because the view is not listed to them. Accepted: the tile shows "Geen toegang" rather than failing.

## Test map

| Row | Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|---|
| T1 | Dashboard view: schema, validation, owner refusal, seeding by name | `POST/PATCH /views`, `GET /views`, `PUT …/share-token`, `migrate`/`--seed-missing` | integration · `packages/engine/test/dashboard.test.ts` · `bun test packages/engine/test/dashboard.test.ts` | none; the owner's refusal is `who lists a dashboard (attack 1)` here, the owner's rail and landing `owner-has-no-switcher` (grid-ux) |
| T2 | Board, gallery and spans needs; timeline skin; batched attachments read | `validateDomain`, `POST /views`, `GET /attachments/:dataset?ids=` | integration · `packages/engine/test/skins.test.ts` · `bun test packages/engine/test/skins.test.ts` | — |
| T3 | Theatre needs and seeds | `GET /schema`, `GET /views`, the seeded dashboard | integration · `packages/theatre/test/step3c.test.ts` · `bun test packages/theatre/test/step3c.test.ts` | — |
| T4 | Grid dashboard page: plumbing, stat and list tiles, `set`, refresh | `<Dashboard>` render; `dashboard/tiles.ts` | unit · `apps/grid/src/dashboard/*.test.ts(x)` · `bun run --filter @worktable/grid test` | dashboard-landing, stat-red-then-neutral, stat-opens-view, werklijst-set |
| T5 | Week strip, progress, quick create (Task 5); composer (Task 5b) | `<WeekTile>`, `<ProgressTile>`, `<QuickCreate>`, composer | unit · same | week-opens-activity, quick-create, space-narrows |
| T6 | Board, timeline, gallery skins; calendar spans | `<Board>`, `<Timeline>`, `<Gallery>`; `calendar/layout.ts` spans | unit · `apps/grid/src/{board,timeline,gallery}/*.test.tsx`, `calendar/layout.test.ts` · same | skins-open |
| T7 | The gate | the running grid | e2e · `e2e/step-3c.spec.ts` (its smoke tests are gone: the R11 sign-in test and the engine route tests in `auth.test.ts` cover them) · `bunx playwright test e2e/step-3c.spec.ts` | all above |

## Review Focus

- **Denied actor** (T1): an owner session and a person link both list no dashboard. An administrator cannot share-token or show a dashboard to owners.
- **Empty** (T4, T5):
  - a dashboard with no sections shows an empty state with "Bewerken" for an administrator;
  - a stat over an empty view reads 0, neutral;
  - a list over an empty view says so;
  - a tile on a view the reader cannot see says "Geen toegang".
- **Boundary** (T2, T6):
  - a span from before the window to after it fills the window, clipped at both edges;
  - a timeline over 92 days falls back to the window's first week;
  - 201 ids to the batched read answer 400.
- **Re-entry** (T4): a quick create or `set`, then focus, refreshes once. An action that fails shows its refusal and leaves the stat as it was.
- **Shape, not behaviour** (T7): the stat flow reads the number and its tone from the screen before and after fixing a conflict through the grid, never from the tile's props.

---

### Task 1: Engine — the dashboard view

**Files:**
- Modify: `packages/engine/src/saved-view.ts`:
  - `source_type` and `source` become nullable;
  - skin options add `timeline · gallery · dashboard`;
  - add `layout: { type: 'json', label: 'Layout', nullable: true }`.
  
  The engine-table migration rebuilds `saved_view`, keeping its ids. Check that `migrate.test.ts` holds.
- Modify: `packages/engine/src/declare.ts`:
  - `SavedViewSeed` gains `skin: … | 'board' | 'timeline' | 'gallery' | 'dashboard'`, an optional `source`/`source_type` (absent only on a dashboard) and `layout?: DashboardLayout`.
  - Export these types:
    ```ts
    type Tile =
      | { kind: 'stat'; view: string | number; label?: string; measure: 'count' | { sum: string }; tone?: { above: number; tone: Tone } }
      | { kind: 'list'; view: string | number; rows: number; columns?: string[]; set?: { column: string; value: string; label: string } }
      | { kind: 'week'; view: string | number }
      | { kind: 'progress'; done: string | number; total: string | number; label: string }
    type QuickAction = { create: string; label: string }
    interface DashboardLayout { sections: { label: string; tiles: Tile[] }[]; actions: QuickAction[] }
    ```
    A seed names views by name (string). A stored layout names them by id (number).
- Create: `packages/engine/src/dashboard.ts`:
  - `layoutOf(domain, sqlite, raw: unknown, actor): DashboardLayout` validates and throws `bad_view`. It checks:
    - the caps, a list tile's `rows` between 1 and 50 included (review 2 N5);
    - each tile's view is a live view the actor can list;
    - a `sum` column is a numeric column of that view's source;
    - a `set` column is an options column that writes (a dataset column, or a query column with `writes`) and `value` is one of its options;
    - a `week` tile's view has skin `calendar`;
    - a `create` names a dataset with a create writer.
  - `resolveSeedLayout(sqlite, layout, seededIds: Map<string, number>)` maps names to ids and throws naming an unknown view.
- Modify: `packages/engine/src/views.ts`:
  - `viewBody`: skin `dashboard` takes no source, takes a layout, and keeps filters, sort, group and visible fields empty. Every other skin needs a source and takes no layout; a `layout: null` counts as none, since a PATCH rebuilds from `outOf` (review 2 N9).
  - `groupOf` restricts a timeline's `group_by` to `calendar.lanes`, as it does a calendar's (review 2 N3); T1 test `a timeline grouped on a non-lane is 400`.
  - `skinOf` accepts `timeline` where `source.calendar`, `board` where `source.board`, `gallery` where `source.gallery`, and `dashboard` with no source.
  - `listViews` keeps a dashboard for a non-owner actor and drops it for an owner.
- Modify: `packages/engine/src/migrate.ts:150` (fresh seed) and `seed-missing.ts` `seedViews`. Insert views first, then each dashboard seed with its layout resolved against the seeded views' ids.
- A null source touches every `name\0source` key. One helper, `viewKey(name, source: string | null | undefined): string` in `views.ts`, maps a missing source to `''`, and SQL matches with `source IS ?`. The places (review S3):
  - `seed-missing.ts:148` (`source = ?` becomes `source IS ?`);
  - `removeUndeclared` (`seed-missing.ts:169-172`);
  - `seedOrdered` (`views.ts:262-263`);
  - `adoptUnowned` (`migrate.ts:121`);
  - `nameOrphans` (`seed-missing.ts:200`): a dashboard is never named as having no source;
  - `DECLARED` and `storedView` (`seed-missing.ts:42,88-101`) carry `layout`, so a changed seed layout is brought up to date;
  - `viewOf` and `stored()` (`views.ts:48-60,204-208`) carry `layout`, so a PATCH rename keeps it.
- `layoutOf` reads a `writes` column's options from its target, as `servedColumn` does (`app.ts:105-112`), so werklijst.status's `gedaan` validates (review S1).
- `resolveSeedLayout` refuses a name two seeds share (review N3).
- A layout also counts toward `checkSize`'s 16 KB per view (`views.ts:141-145`). That is the effective cap beside the counted ones (review N5).
- Interface (review S4): `viewBody(input: unknown, domain: Domain, creating: boolean, ctx: { sqlite: Database; actor: Actor }): ViewFields`. Its two callers are `views.ts:282` and `views.ts:293`.
- Test: `packages/engine/test/dashboard.test.ts`, with an invented fixture domain: a `slot` dataset, a `pick_list` query and seeded views.

- [ ] **Step 1: Write the denial tests first (RED):**
  - `an owner lists no dashboard; an editor and an administrator list the shared one`;
  - `an administrator's share-token and for-owners on a dashboard are 400 not_query` (the existing guards; review 2 S5);
  - `a link account lists no dashboard`.
- [ ] **Step 2: Write the rest:**
  - `a dashboard takes no source, every other skin needs one`;
  - `a layout on a grid view is refused`;
  - `caps: 7 sections / 13 tiles / 9 actions / an 81-character label are refused`;
  - `a tile naming no view is refused, naming it`;
  - `sum on a text column, set on a column that does not write, set to a value outside the options, week on a non-calendar view, create on a dataset without a writer are each refused`;
  - `PATCH /views/:id composes: a new layout saves and reads back`;
  - `a seeded dashboard's tiles resolve to the seeded views' ids, fresh and by --seed-missing; an unknown name fails seeding, naming it`;
  - `--seed-missing twice leaves exactly one live system dashboard, with its layout`;
  - `a PATCH rename of a dashboard keeps its layout`;
  - `a set on a query column that writes takes its target's options`.
- [ ] **Step 3: Implement.** **Step 4:** `bun test packages`, `bun run check` → PASS.
- [ ] **Step 5: Commit** `feat(engine): the dashboard view — skin dashboard, no source, a validated layout; owners never list one`

### Task 2: Engine — board, timeline, gallery, spans and the batched attachments read

**Files:**
- Modify: `declare.ts`:
  - `board?: { column: string }` and `gallery?: { kind: string }` on `DatasetDecl`;
  - `board` on `QueryDecl`;
  - `CalendarDecl.spans?: true`.
- Modify: `validate.ts`:
  - `checkBoard`: an options column of the source;
  - `checkGallery`: datasets only, with `kind` one of `attachments.kinds`; a query declaring `gallery` is refused;
  - `checkCalendar`: with `spans`, `end` may be a date or datetime column of the source, and `day` stays the source's date.
- Modify: `app.ts` (`/schema` serves `board`, `gallery` and `calendar.spans` as declared), `views.ts` `skinOf` (Task 1 already lists them).
- Modify: `attachments.ts`. Add `GET /attachments/:dataset` with query `ids` (comma list of at most 200 positive integers, else 400 `bad_ids`) and `kind` (a declared kind, else 400). It answers `{ files: { [id]: { id, mime, name } } }`, holding each readable id's newest live attachment of that kind.
  - The route is registered after `/attachments/file/:id` and before `/attachments/:dataset/:id`.
  - Owners: the dataset is resolved through `declaredOf`, as the single read does, so an owner without `owner_visible` gets 404 `unknown_source` (review S6).
- Test: `packages/engine/test/skins.test.ts`.

- [ ] **Step 1: RED:**
  - `the batched read answers each readable id's newest file of the kind, and none of another kind` (the positive path);
  - `the batched read leaves out an id the owner cannot read`, on a fixture dataset with `attachments.owner_visible`, asking for ids in and out of the owner's scope;
  - `an owner on a dataset without owner_visible gets 404, as the single read`;
  - `201 ids are 400`;
  - `an unknown kind is 400`;
  - then the validation tests for board, gallery and spans, and `a timeline view saves where the source declares calendar`.
- [ ] **Step 2–4:** implement; `bun test packages`; `bun run check`.
- [ ] **Step 5: Commit** `feat(engine): board and gallery needs, calendar spans and the timeline skin; one batched attachments read`

### Task 3: Theatre — needs, a view per skin, the dashboard

**Files:**
- Modify: `packages/theatre/src/datasets.ts`:
  - Activiteit: `calendar` (R8), `board: { column: 'status' }`, `gallery: { kind: 'foto' }`.
  - Toewijzing: `board: { column: 'state' }`.
  - Beschikbaarheid and Speelreeks: `calendar` with `spans` (R8).
  - Speelreeks gains `date: 'start_datum'` (review B1): `checkCalendar` requires `day` to be the source's date. This also gives the Tourstops grid a date window, and `newRow` fills `start_datum` from it. Check the step-1 and step-2 e2e specs that create tourstops through the grid.
- Modify: `packages/theatre/src/seed.ts`. Append these views:
  - **Bord toewijzingen:** toewijzing, board.
  - **Tijdlijn tourstops:** speelreeks, timeline, `group_by: 'productie_id'`.
  - **Galerij activiteiten:** activiteit, gallery.
  - **Kalender activiteiten:** activiteit, calendar, `group_by: 'productie_id'`.
  - **Kalender afwezigheden:** beschikbaarheid, calendar, `group_by: 'persoon_id'`.
  - **Open plaatsen:** werklijst, `{ soort: 'open_slot' }`.
  - **Onbeantwoord:** werklijst, `{ soort: 'onbeantwoord' }`.
  - **Vandaag:** activiteit, `{ plandag: { $period: 'today' } }`.
  - **Plaatsen:** toewijzing, `{ rol_id: { $exists: true } }`, plus the activity's week through a lookup. Use `datum` (Task 3 of step 3 added it) with `$period: 'week'`.
  - **Plaatsen gevuld:** the same with `persoon_id: { $exists: true }`.
  - The dashboard `Overzicht`: skin `dashboard`, no source, shared, with this layout:
    - **Nu:**
      - stat Conflicten: count, `tone: { above: 0, tone: 'bad' }`;
      - stat Open plaatsen;
      - stat Onbeantwoord;
      - progress Plaatsen gevuld / Plaatsen.
    - **Deze week:** week Bedrijfsweek; list Vandaag (5 rows).
    - **Te doen:** list Werklijst, 8 rows, `set: { column: 'status', value: 'gedaan', label: 'Gedaan' }`.
    - **Actions:** create activiteit "Nieuwe activiteit", speelreeks "Nieuwe tourstop", taak "Nieuwe taak".
  - If a filter above cannot be expressed (for example `$exists` on a relation), the seed falls back to the nearest expressible one and the task report says which.
- Test: `packages/theatre/test/step3c.test.ts`:
  - the schema serves every need;
  - every seeded view saves through `/views`: the existing test (`step3-queries.test.ts:376-385`) resolves the dashboard seed's view names to the ids `GET /views` lists before posting it (review 2 S6);
  - the dashboard reads back with ids for every tile;
  - an owner lists none of the new views it cannot read, and no dashboard;
  - `seed-missing.test.ts` counts updated.
- [ ] Steps: RED, implement, `bun test packages`, `bun run check`, run the e2e specs that assert view lists (`rail-tree`, `grid-ux`) and fix counts. Commit `feat(theatre): calendar, board and gallery needs; a view per skin; the Overzicht dashboard`.

### Task 4: Grid — the dashboard page, stat and list tiles

**Files:**
- Modify `types.ts`: add view types `board · timeline · gallery · dashboard`, and `View.layout?: DashboardLayout`.
- Modify `engine.ts`:
  - `toSavedViews` keeps a dashboard (`source` null): `model: ''`, `table: 'dashboard'`, `type: 'dashboard'`, `layout`.
  - The skin→type mapping covers the new skins.
  - `tableDefOf` adds `'board'` when `source.board`, `'timeline'` when `source.calendar`, and `'gallery'` when `source.gallery`.
- Modify `api.ts`:
  - `createView` and `updateView` skip `sourceOf` for a dashboard.
  - `updateView` takes `layout`.
- Modify `ui/tables.ts`, `useSavedViews.ts` and `Rail.tsx`:
  - the rail's first item is a "Dashboard" group listing the dashboard views;
  - `App.tsx:218`'s landing default is the first dashboard view, then today's fallback.
- Modify `App.tsx`:
  - a `view.type === 'dashboard'` branch first;
  - the rows effect skips a dashboard;
  - the toolbar shows no add, no export and no filter for it.
- Create `dashboard/Dashboard.tsx`: sections and tiles, refresh on `window` focus, after its own actions and when the space changes. It takes `views: SavedView[]` (the listed ones), `space` (the `useSpace` state, not App's `scope`, which is null for a source-less view; review S2), `onOpenView(key)` and `onOpenRow(model, id)`.
- Each tile applies `space.scope` only where its own view has `space === 'scoped'`. A quick create applies it where its dataset is scoped.
- Create `dashboard/tiles.ts`:
  - `statOf(view, layout, scope, measure, previous: boolean): Promise<number>`. `rows()` gains an optional `limit` (passed to `rowsQuery`), and a count reads `total` with `limit: 1`; a sum reads every row. For `previous`, the view's date condition moves back one period: a month by `shiftMonth(window, -1)`, anything else by `shift(window, -days(window))` (review 2 N1, N2).
  - `toneOf(value, tile, column): Tone | null`.
- Create `dashboard/StatTile.tsx` and `dashboard/ListTile.tsx`:
  - The list's title carries its view's `total` ("Werklijst · 12"), so a drop shows on screen (review 2 S1). It shows the first N rows in the view's sort, the title plus the given columns, "Alles tonen", and the `set` button.
  - The `set` button shows only on a row whose write key is set (`row.fields[writes.key]` for a query column; always for a dataset). It calls `update(model, id, { [column]: value }, row)`; with `row`, `update` routes a query column through `updateThrough` (`api.ts:264-288`). Then the dashboard refreshes.
- Tests:
  - `dashboard/tiles.test.ts`: count from `total`, sum over rows, the previous period shift for a week and a month, tone above a threshold and from a badge.
  - `dashboard/Dashboard.test.tsx`:
    - stat number and tone render;
    - a stat title opens its view;
    - list rows and "Alles tonen";
    - `set` calls update and then refreshes;
    - a tile on a view not listed says "Geen toegang";
    - focus refreshes once;
    - a stat over an empty view reads 0 with no tone;
    - a list over an empty view says "Geen rijen";
    - a `set` the writer refuses shows the refusal and leaves the stat as it was;
    - the change against the previous period renders ("+2 t.o.v. vorige week");
    - a scoped tile sends the space filter, and an unscoped one does not (review S5, S2, N8);
    - a list row whose write key is null shows no set button (review 2 S3);
    - a list title shows its view's total.
- Existing landing assertions move with the landing (review 2 S2): `e2e/rail-tree.spec.ts:9` (Activiteiten expanded on landing) and `:25-35` (`goto('/')` lands on Planning) open their view explicitly; `App.test.tsx`'s landing cases expect the dashboard.
- The rail's Dashboard group is rendered before `sectionsOf`'s sections (not as an unlisted table, which `sectionsOf` puts last); it has no rename and no `+` (review 2 N6).
- [ ] Steps: RED, implement, grid tests, `bun run check`, `bunx playwright test e2e/rail-tree.spec.ts`, then a screenshot of the landing page (the e2e `shot`). Commit `feat(grid): the dashboard page — the grid opens on it; stat and list tiles with an inline set; refresh on focus`.

### Task 5: Grid — week strip, progress, quick create, composer

**Files:**
- `dashboard/WeekTile.tsx` reuses `calendar/layout.ts` `placeEvents` with this week, seven columns and today marked. An event opens the row drawer.
- `dashboard/ProgressTile.tsx`: two counts and a bar, "x van y".
- `dashboard/QuickCreate.tsx`:
  - A React Aria modal in the `NewViewDialog` pattern.
  - Fields come from `newRow(model, …)`'s `needs` and `offers`. Typed inputs and relation pickers come from the drawer: export `TypedInput` and `RelationPicker`'s use as a small `FieldInput` in `grid/FieldInput.tsx`.
  - The space column is filled from the switcher.
  - It creates through `create(dataset, fields)` and pushes to history as `createThrough` does (`App.tsx:341`), then refreshes the dashboard. A refusal shows in the dialog.
- Tests:
  - the week tile puts an event on its day and today is marked;
  - progress reads "3 van 5";
  - quick create sends the required fields and the space id, and shows a refusal;
  - the quick-create dialog is keyboard reachable: Tab reaches each header button, and Enter opens the dialog with focus in its first field (review N8).
- Quick-create inputs (review N2):
  - `grid/FieldInput.tsx` maps a `Field` to an input: text, longtext, int, float or real, date, datetime, select (its options), boolean, and a single relation through `RelationPicker`.
  - The dialog takes its fields from `madeFrom` (`App.tsx:540-544`, exported to `grid/newRow.ts`), which already builds the `View`, applies the scope where the dataset is scoped and calls `newRow` (review 2 N7).
- [ ] Commit `feat(grid): week strip, progress and quick creates on the dashboard`.

### Task 5b: Grid — the in-place composer

**Ruling (Stefan via the orchestrator, 2026-10-12, review B2):** the system-seeded dashboard cannot be patched (`ownedView` 403 `read_only_view`), so composing it saves a copy, the existing view pattern. The landing is the caller's own first dashboard, else the first dashboard shared by someone else, else the system one, and the rail orders the same way.

- `dashboard/Composer.tsx`:
  - "Bewerken" toggles edit mode on any dashboard;
  - add a section and rename it;
  - add a tile (kind, then view from the views the caller can read, then its options);
  - remove one, and move it up or down.
  - "Opslaan" depends on the view:
    - an editable view (`view.editable`) saves through `updateView(view, { layout })`;
    - otherwise it saves a copy through `createView` with the layout and opens it. **Ruling R-3c-1** (review 2 S4): an administrator's copy is `shared: true`, so it lands for everyone as "shared by someone else"; anyone else's copy is `shared: false`, so it lands only for them.
  - The engine's refusal shows inline.
- `useSavedViews` / `App.tsx:218` landing: the caller's own first dashboard, else the first dashboard shared by someone else, else the system one. The rail's Dashboard group lists the same order.
- Tests:
  - the composer adds, moves and removes a tile and sends the layout;
  - on the system dashboard an administrator's "Opslaan" creates a shared copy that then lands for an editor too; an editor's creates a private copy that lands only for that editor;
  - a refusal shows inline;
  - an empty dashboard shows the empty state with "Bewerken".
- [ ] Commit `feat(grid): compose a dashboard in place; a seeded one saves as a copy that then lands`.

### Task 6: Grid — board, timeline, gallery; calendar spans

**Files:**
- `board/Board.tsx`: columns in the board column's option order with their labels and tones, "Geen" last; cards show the title and up to three visible fields; a click opens the drawer beside it.
- `timeline/Timeline.tsx`:
  - days across the window, from a new `timelineWindow(condition, today)` in `timeline/layout.ts` (review S8): a week, a month or a range of up to 92 days as it is; a longer range, its first week; none, this week. Lanes run down, and bars from start to end are clipped to the window;
  - a non-spanning row is a bar on its day;
  - a click opens the drawer.
- `gallery/Gallery.tsx`: cards with the image from the batched read (`api.ts` `filesOf(dataset, ids, kind)`) as `<img src={fileUrl(id)} loading="lazy">`; a plain card without one; a click opens the drawer.
- With spans, `App.tsx` drops the view's own date condition on `day` when it sends the overlap filter, as `rowsQuery` does for from/to (`engine.ts:444-445`; review 2 N8).
- `calendar/layout.ts` `placeEvents`: with `cal.spans`, a row covers every day from its day to its end, in the all-day band. Spanning rows are fetched by overlap: `App.tsx` sends `{ [day]: { $lte: to }, [end]: { $gte: from } }` in place of from/to, as `awayRows` does.
- `Rail.tsx` `kinds()` enables Bord, Tijdlijn and Galerij where `table.types` includes them; `NewViewDialog` and `ViewList` get icons and words; i18n.
- Tests:
  - board columns in option order, "Geen" last;
  - timeline bar left and width, clipping, a span across the window;
  - `timelineWindow`: a 60-day range stays, a 120-day range becomes its first week (review S5);
  - gallery image and plain cards, one batched request per page;
  - spans in the calendar band on every covered day.
- [ ] Commit `feat(grid): board, timeline and gallery skins; spanning rows on the calendar`.

### Task 7: The gate

- Create `e2e/step-3c.spec.ts` with these flows, each building its own rows in an unused week:
  - **dashboard-landing:** `/` opens on Overzicht; every stat shows a number equal to its view's row count, read through the API in the test. The dark theme is grid-ux's `dark-and-density`.
  - **stat-red-then-neutral:**
    - create a production of its own with one overlap conflict, and select it in the space switcher;
    - the Conflicten stat reads at least 1 and is red (class `nv-stat--bad`; one overlap may give one row per side, review 2 N10);
    - fix the conflict through the grid by cancelling one assignment;
    - back on the dashboard after focus, the stat reads 0 and is neutral (review S7).
  - **stat-opens-view:** clicking the Conflicten stat opens the Conflicten view.
  - **week-opens-activity:** create an activity dated today (the one exception to the 2028 weeks; the strip shows this week). Clicking it in the week strip opens its drawer.
  - **werklijst-set:** make an open taak with no deadline (it sorts first: SQLite puts NULL first ascending; the second exception to the 2028 weeks). "Gedaan" on its row in the Te doen list removes it, and the list title's count drops by one (review 2 S1).
  - **quick-create:** "Nieuwe taak" with a title creates a Taak; the Te doen list title's count rises by one.
  - **space-narrows:** selecting one production lowers or keeps every stat, and a stat equals the view's count under that scope.
  - **owner-no-dashboard:** no e2e of its own (it read only the owner session's views): an owner session listing no dashboard is pinned by `who lists a dashboard (attack 1)` in `packages/engine/test/dashboard.test.ts`, the owner's rail and landing by `owner-has-no-switcher` (grid-ux.spec.ts).
  - **skins-open:** build rows in a 2028 week, open each seeded skin (Bord, Tijdlijn, Galerij with an uploaded image, both calendars) on that week with `openWeek`, and see the rows (review S7). Where a spanning bar sits is `a spanning row` in `apps/grid/src/calendar/Calendar.test.tsx`.
- (Smoke collapse: the former `e2e/smoke/step-3c.spec.ts` is gone; `/api/views` is pinned by `auth.test.ts` "auth denials: no session", the landing page by the R11 sign-in test in `e2e/smoke/step-2.spec.ts`.)
- [ ] `bun run gate` → green. Commit `test(e2e): step 3c gate — the dashboard lands, stats live and toned, actions and quick creates, space, owner refused, every skin opens`.
