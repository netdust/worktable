# Step 3c: findings, before any code

Stefan, 2026-10-12, the step 3c brief (relayed by the orchestrator):
- "The skin list on a source becomes grid, calendar, board, timeline, gallery, dashboard; each a declared need, on datasets and queries alike."
- "Findings (stop for approval): F1 board skin. F2 timeline skin. F3 gallery skin. F4 dashboard skin, tiles and quick actions, declared generically. F5 the Activiteiten and Beschikbaarheid calendar declarations."

**Decision (Stefan via the orchestrator, 2026-10-12):** approved, with F4 changed: a dashboard is a saved view with skin `dashboard`, no source and its own layout column; no dashboard table, no `/dashboards` routes, no per-role dashboards. Questions 2–7 on the recommended answers. Question 1 is answered by that change.

Read against `docs/SPEC.md` at `e817d16` (the 3c spec commit) and the source at main `f067682`. Nothing here is built.

## What exists

- **Skins.**
  - The engine serves `table`, `matrix` and `calendar` (`views.ts` `skinOf`).
  - `saved_view.skin` lists `table · calendar · matrix · list · board` as options (`saved-view.ts:16`).
  - Skin needs are `calendar` (day, start, end, lanes), `matrix` and `badge`.
  - The grid has view types `grid · matrix · calendar`, and the Rail's `+` menu shows "Bord" blocked as "later".
- **Lifecycle and options.**
  - `LifecycleDecl.column` is always an options column. Theatre declares one on Toewijzing `state`.
  - Other options columns include Activiteit `status`, Taak `status` and Speelreeks `status`.
- **Attachments.**
  - They are declared per dataset (`attachments: { kinds }`), not as a column.
  - Theatre carries them on Activiteit, Toewijzing and Speelreeks, with kinds rider, zaalblad, bonnetje, foto and document.
  - Files are read one record at a time: `GET /attachments/:dataset/:id` lists a record's files, and `GET /attachments/file/:id` serves one.
  - A query carries none.
- **Rows and actions.**
  - `/rows` answers rows and an exact `total`. It filters and sorts, but it has no aggregate.
  - Actions (`POST /actions/:name`) run from one record of their `on` dataset.
  - Grid creates go through the inline draft row. There is no create dialog.
- **Space.** Every rows read takes the space scope as one more filter.

## F1. Board skin

**The need.** Cards grouped in columns by the values of an options column. For example, Toewijzingen by state or Activiteiten by status. It is read-only in v1, and a card opens its row.

**Smallest design.**
- Skin need `board: { column }` on a dataset or query. `column` must be an options column. A lifecycle column qualifies, because it is always one.
- The board's columns are the option keys in declared order, labelled and toned as the column declares. A row with no value goes in a trailing "Geen" column.
- Cards show the row title and up to three of the view's visible fields.
- `skinOf` accepts `board` where the source declares it. The saved view's `group_by` stays null. The board column is the declaration's.
- No drag and no transition.

**Threats.** None new. It reads `/rows` under the caller's scope.

**Tests.**
- Validation refuses a non-options column.
- A view saves with skin `board` only where the source declares it.
- Grid unit tests: columns in option order, "Geen" last, a card opening the drawer.
- e2e: the seeded board opens.

## F2. Timeline skin

**The need.** Rows as bars across the days of a window, in lanes. For example, tourstops across weeks per production, or absences per person.

**Smallest design.**
- No new key. A source that declares `calendar` offers `timeline` as well. Days run across, lanes run down (`calendar.lanes`; one lane per row when none is chosen), and a bar runs from `day` (or `start`) to `end`.
- Spans need one key on the calendar need: `calendar.spans: true`. It means a row covers every day from its start to its end, as an absence or a tourstop does. Without it the end is a time on the same plandag, as an activity's is.
  - On the calendar, a spanning row sits in the all-day band of every day it covers, never as a 24-hour block on the hour axis.
  - On a timeline it is one bar.
  - The window reads spanning rows by overlap (start before the window's end, end after its start). This is the filter the matrix's away rows already send, so there is no route change.
- `end` may be a date column when `spans` is set, as Speelreeks's `eind_datum` is.
- The window is the view's date condition, as for the calendar. A week, a month, or a range of up to 92 days is shown as it is.

**Tests.**
- Validation: `spans` takes an `end` of the source.
- Grid unit tests: bar position and width over the window, a span clipped at both edges, lane grouping.
- e2e: the seeded timeline opens.

## F3. Gallery skin

**The need.** One card per row, showing its first image. For example, activities and tourstops with their photos.

**Smallest design.**
- Skin need `gallery: { kind }` on a dataset that declares `attachments`. `kind` must be one of its kinds, for example `foto`.
- The card shows the row's first live attachment of that kind with an image mime type, scaled by CSS from the existing file route. A row without one shows its title on a plain card.
- Attachments belong to datasets, so a gallery on a query is refused. The brief says "on datasets and queries alike"; see question 3.
- **Reading files for a page of rows.**
  - Per-row reads mean one request per card.
  - The smallest addition is one batched read on the existing route: `GET /attachments/:dataset?ids=1,2,3&kind=foto`. It answers each id's newest live file of that kind, at most 200 ids, under the caller's scope for the dataset and its `attachments.owner_visible` rule, exactly as the single read applies them.
  - This grows the route list by one. See the surface section.

**Threats.**
- The batched read must not answer a file of a row the caller cannot read. It reads the ids through the same scope as `/rows`, and an id outside the scope is left out of the answer silently, with the same answer as an id with no file.
- A test asserts an owner's ids outside its scope come back empty.

**Tests.**
- Validation: a gallery on a query is refused, as is a kind not declared.
- The batched read: its scope denial, the kind filter, and the 200 cap.
- Grid unit tests: an image card and a plain card.
- e2e: a seeded gallery opens with a seeded image.

## F4. Dashboard skin, tiles and quick actions

**The need.** The page the grid opens on. Three sections of tiles over existing saved views, quick creates in the header, composed by administrators, seeded per role.

**Where a dashboard lives (Stefan, 2026-10-12: an aggregated skin, not a table).**
- A dashboard is a `saved_view` row with skin `dashboard`, no source (`source` and `source_type` null), and its layout in a column of its own: `layout` (json, nullable).
- `layout` is `{ sections: [{ label, tiles: [tile] }], actions: [quick action] }`.
- The view machinery gives it the rest:
  - composition is the existing `PATCH /views/:id`, by its owner or by an administrator on a system view, as today;
  - sharing is `shared`;
  - the rail lists it;
  - `listViews` shows a dashboard to every actor who is not an owner, and never to an owner.
- A dashboard can be neither public nor for owners: share token and for-owners are refused (400 `bad_view`).
- Validation in `viewBody`:
  - a dashboard has no source, and every other skin must have one;
  - a dashboard's filters, sort, group_by and visible_fields stay empty;
  - its layout is validated against the views it names and capped (6 sections, 12 tiles each, 8 quick actions, labels of at most 80 characters).
- Tiles name saved views by id.
- The domain seeds a dashboard as it seeds any view: a `SavedViewSeed` with skin `dashboard`, no source, and a `layout` whose tiles name seeded views by name. Seeding and `--seed-missing` resolve each name to the seeded view's id and refuse a name no seeded view has, naming it.
- There is no dashboard table, no `/dashboards` route, no `Domain.dashboards` and no role key. Editors and administrators see a shared dashboard like any shared view. The grid opens on the first dashboard view the caller can read.

**Tile kinds**, each a declaration in `layout`, validated against the view it names:
- **stat** `{ kind: 'stat', view, label?, measure: 'count' | { sum: column }, tone?: { above: n, tone } }`.
  - The number is the view's rows `total`, or the column's sum over its rows. The sum is computed in the grid over at most 5000 rows, the rows route's own cap, so the route gains no aggregate.
  - Tone: a column's declared `badge` tone applies above 0. Otherwise the tile's own threshold applies.
  - Change: where the view has a date condition, the same measure over the previous period of equal length is shown beside it.
- **list** `{ kind: 'list', view, rows: n (≤ 20), columns?: [≤ 3], set?: { column, value, label } }`.
  - It shows the first N rows in the view's sort, with the title and the given columns, and "Alles tonen" opens the view.
  - Row actions: a declared dataset action runs only from a record of its `on` dataset, so a list on a query such as werklijst has none to run.
  - The generic inline action is `set`: one click writes `value` to an options `column` through that column's existing write path. That is `writes` on a query and a plain PATCH on a dataset. It shows only on rows whose write key is set. Werklijst declares `set: { column: 'status', value: 'gedaan', label: 'Gedaan' }`, which writes Taak's status.
  - See question 4.
- **week** `{ kind: 'week', view }` on a calendar view. Seven day columns for this week, today marked. Each event is a chip that opens its row in the drawer.
- **progress** `{ kind: 'progress', done: view, total: view, label }`. Two counts and a bar. "Slots filled of open" needs a view of filled slots and a view of all slots on the same window. Theatre seeds both on Toewijzing.

**Quick actions** in the header: `{ create: dataset, label }`.
- It opens a dialog with the dataset's required columns, plus the space column filled from the switcher. It creates through `POST /rows/:dataset`, so the writer judges it.
- The dialog uses the drawer's input widgets: the relation picker and typed inputs.
- Declared dataset actions run from a record, so they are not header actions in v1 (question 5).
- Keyboard: the actions are buttons in the header's tab order, and the dialog is a React Aria modal.

**Composition.** An administrator, or a dashboard's own owner, edits it in place: add, remove and move a section or tile, and pick each tile's view and kind from the views they can read. It saves through `PATCH /views/:id` with the new `layout`. A system-seeded dashboard is changed by saving a copy, as any system view is.

**Space.** Every rows read takes the space scope as one more filter.

## F1. Board skin

**The need.** Cards grouped in columns by the values of an options column. For example, Toewijzingen by state or Activiteiten by status. It is read-only in v1, and a card opens its row.

**Smallest design.**
- Skin need `board: { column }` on a dataset or query. `column` must be an options column. A lifecycle column qualifies, because it is always one.
- The board's columns are the option keys in declared order, labelled and toned as the column declares. A row with no value goes in a trailing "Geen" column.
- Cards show the row title and up to three of the view's visible fields.
- `skinOf` accepts `board` where the source declares it. The saved view's `group_by` stays null. The board column is the declaration's.
- No drag and no transition.

**Threats.** None new. It reads `/rows` under the caller's scope.

**Tests.**
- Validation refuses a non-options column.
- A view saves with skin `board` only where the source declares it.
- Grid unit tests: columns in option order, "Geen" last, a card opening the drawer.
- e2e: the seeded board opens.

## F2. Timeline skin

**The need.** Rows as bars across the days of a window, in lanes. For example, tourstops across weeks per production, or absences per person.

**Smallest design.**
- No new key. A source that declares `calendar` offers `timeline` as well. Days run across, lanes run down (`calendar.lanes`; one lane per row when none is chosen), and a bar runs from `day` (or `start`) to `end`.
- Spans need one key on the calendar need: `calendar.spans: true`. It means a row covers every day from its start to its end, as an absence or a tourstop does. Without it the end is a time on the same plandag, as an activity's is.
  - On the calendar, a spanning row sits in the all-day band of every day it covers, never as a 24-hour block on the hour axis.
  - On a timeline it is one bar.
  - The window reads spanning rows by overlap (start before the window's end, end after its start). This is the filter the matrix's away rows already send, so there is no route change.
- `end` may be a date column when `spans` is set, as Speelreeks's `eind_datum` is.
- The window is the view's date condition, as for the calendar. A week, a month, or a range of up to 92 days is shown as it is.

**Tests.**
- Validation: `spans` takes an `end` of the source.
- Grid unit tests: bar position and width over the window, a span clipped at both edges, lane grouping.
- e2e: the seeded timeline opens.

## F3. Gallery skin

**The need.** One card per row, showing its first image. For example, activities and tourstops with their photos.

**Smallest design.**
- Skin need `gallery: { kind }` on a dataset that declares `attachments`. `kind` must be one of its kinds, for example `foto`.
- The card shows the row's first live attachment of that kind with an image mime type, scaled by CSS from the existing file route. A row without one shows its title on a plain card.
- Attachments belong to datasets, so a gallery on a query is refused. The brief says "on datasets and queries alike"; see question 3.
- **Reading files for a page of rows.**
  - Per-row reads mean one request per card.
  - The smallest addition is one batched read on the existing route: `GET /attachments/:dataset?ids=1,2,3&kind=foto`. It answers each id's newest live file of that kind, at most 200 ids, under the caller's scope for the dataset and its `attachments.owner_visible` rule, exactly as the single read applies them.
  - This grows the route list by one. See the surface section.

**Threats.**
- The batched read must not answer a file of a row the caller cannot read. It reads the ids through the same scope as `/rows`, and an id outside the scope is left out of the answer silently, with the same answer as an id with no file.
- A test asserts an owner's ids outside its scope come back empty.

**Tests.**
- Validation: a gallery on a query is refused, as is a kind not declared.
- The batched read: its scope denial, the kind filter, and the 200 cap.
- Grid unit tests: an image card and a plain card.
- e2e: a seeded gallery opens with a seeded image.

## F4. Dashboard skin, tiles and quick actions

**The need.** The page the grid opens on. Three sections of tiles over existing saved views, quick creates in the header, composed by administrators, seeded per role.

**Where a dashboard lives (Stefan, 2026-10-12: an aggregated skin, not a table).**
- A dashboard is a `saved_view` row with skin `dashboard`, no source (`source` and `source_type` null), and its layout in a column of its own: `layout` (json, nullable).
- `layout` is `{ sections: [{ label, tiles: [tile] }], actions: [quick action] }`.
- The view machinery gives it the rest:
  - composition is the existing `PATCH /views/:id`, by its owner or by an administrator on a system view, as today;
  - sharing is `shared`;
  - the rail lists it;
  - `listViews` shows a dashboard to every actor who is not an owner, and never to an owner.
- A dashboard can be neither public nor for owners: share token and for-owners are refused (400 `bad_view`).
- Validation in `viewBody`:
  - a dashboard has no source, and every other skin must have one;
  - a dashboard's filters, sort, group_by and visible_fields stay empty;
  - its layout is validated against the views it names and capped (6 sections, 12 tiles each, 8 quick actions, labels of at most 80 characters).
- Tiles name saved views by id.
- The domain seeds a dashboard as it seeds any view: a `SavedViewSeed` with skin `dashboard`, no source, and a `layout` whose tiles name seeded views by name. Seeding and `--seed-missing` resolve each name to the seeded view's id and refuse a name no seeded view has, naming it.
- There is no dashboard table, no `/dashboards` route, no `Domain.dashboards` and no role key. Editors and administrators see a shared dashboard like any shared view. The grid opens on the first dashboard view the caller can read.

**Tile kinds**, each a declaration in `layout`, validated against the view it names:
- **stat** `{ kind: 'stat', view, label?, measure: 'count' | { sum: column }, tone?: { above: n, tone } }`.
  - The number is the view's rows `total`, or the column's sum over its rows. The sum is computed in the grid over at most 5000 rows, the rows route's own cap, so the route gains no aggregate.
  - Tone: a column's declared `badge` tone applies above 0. Otherwise the tile's own threshold applies.
  - Change: where the view has a date condition, the same measure over the previous period of equal length is shown beside it.
- **list** `{ kind: 'list', view, rows: n (≤ 20), columns?: [≤ 3], set?: { column, value, label } }`.
  - It shows the first N rows in the view's sort, with the title and the given columns, and "Alles tonen" opens the view.
  - Row actions: a declared dataset action runs only from a record of its `on` dataset, so a list on a query such as werklijst has none to run.
  - The generic inline action is `set`: one click writes `value` to an options `column` through that column's existing write path. That is `writes` on a query and a plain PATCH on a dataset. It shows only on rows whose write key is set. Werklijst declares `set: { column: 'status', value: 'gedaan', label: 'Gedaan' }`, which writes Taak's status.
  - See question 4.
- **week** `{ kind: 'week', view }` on a calendar view. Seven day columns for this week, today marked. Each event is a chip that opens its row in the drawer.
- **progress** `{ kind: 'progress', done: view, total: view, label }`. Two counts and a bar. "Slots filled of open" needs a view of filled slots and a view of all slots on the same window. Theatre seeds both on Toewijzing.

**Quick actions** in the header: `{ create: dataset, label }`.
- It opens a dialog with the dataset's required columns, plus the space column filled from the switcher. It creates through `POST /rows/:dataset`, so the writer judges it.
- The dialog uses the drawer's input widgets: the relation picker and typed inputs.
- Declared dataset actions run from a record, so they are not header actions in v1 (question 5).
- Keyboard: the actions are buttons in the header's tab order, and the dialog is a React Aria modal.

**Composition.**
- An administrator edits the dashboard in place: add, remove and move a section or tile, and pick each tile's view and kind from the views they can read.
- It saves with `PUT /dashboards/:role`. The engine validates every tile against its view and the view's source (a sum column exists, a set column is writable options, a week tile's view is a calendar).

**Routes.**
- `GET /dashboards/mine` returns the caller's role's dashboard, or 404. An owner always gets 404.
- `PUT /dashboards/:role` is for administrators only.

**Space.**
- Every tile reads its view through the existing rows route with the selected space as a filter. Nothing is new.
- Previous-period stats use the same filters, with the date condition shifted by its own length.

**Refresh.**
- On window focus.
- After every quick action or `set` it ran.
- After the space changes.

**Grid.**
- The rail's first item is Dashboard, and the grid opens on it when the caller's role has one. Otherwise it opens on its first view, as today.
- A tile's title opens its view.

**Threats.**
- An owner never lists a dashboard (`listViews`). An owner cannot write views at all, which is already refused.
- Every tile read is an ordinary rows read under the caller's scope. A tile naming a view whose source the caller cannot read shows nothing.
- A dashboard cannot be published or shown to owners.
- The layout JSON is validated and capped.

**Tests.**
- Validation: a dashboard has no source and every other skin has one; each tile kind is checked against its view; the caps hold.
- An owner never lists a dashboard. Publishing or showing a dashboard to owners is refused.
- Seed resolution by view name.
- Grid unit tests per tile.
- The e2e gate as the brief lists it.

## F5. Calendar declarations on Activiteit and Beschikbaarheid

- **Activiteit:** `calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['productie_id', 'speelreeks_id'] }`. Its date is already `plandag`, and its title is the omschrijving. The inherited Locatie is a lookup, not a relation column, so it cannot be a lane (question 6).
- **Beschikbaarheid:** `calendar: { day: 'start_at', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'], spans: true }`.
  - Its date is `start_at`, a datetime. `day` already takes the source's date, and the calendar reads the date part.
  - An absence covers every day from start to end in the all-day band (F2's `spans`).
  - Its tone can follow `soort` through the board and grid. On the calendar, the lane colour stays the person.
- **Speelreeks** (for the seeded timeline): `calendar: { day: 'start_datum', end: 'eind_datum', lanes: ['productie_id'], spans: true }`.

## Theatre seeds (scope)

One view per skin:
- **Bord:** Toewijzingen by state.
- **Tijdlijn:** Tourstops by production.
- **Galerij:** Activiteiten, kind foto.
- **Kalender:** Activiteiten by production, and Afwezigheden by person.
- **Dashboard:** one shared dashboard view in three sections.
  - **Nu:**
    - stat Conflicten (count, red above 0);
    - stat open slots inside the horizon (a werklijst view filtered to `open_slot`);
    - stat invitations past the deadline (werklijst `onbeantwoord`);
    - progress slots filled of open (two Toewijzingen views on this week).
  - **Deze week:**
    - week strip on Bedrijfsweek;
    - list of today's activities (Planning with `$period: today`).
  - **Te doen:** list Werklijst with `set` Gedaan.
  - **Quick actions:** new activity, new tourstop, new task.

## The engine's surface beyond F1–F5

It grows, inside the findings:
- F2: `calendar.spans`.
- F3: one batched attachments read.
- F4: skin `dashboard`, a nullable `source` and a `layout` column on `saved_view`, and the tile `set`.

Nothing outside F1–F5: the rows route gains no aggregate, and actions are unchanged.

## Questions for Stefan

1. **Where a dashboard lives.** Recommended: its own engine table, one per role, as above, not a saved view. A saved view needs a single source.
2. **Composition in v1.** Recommended: administrators edit in place (add, remove, move a section or tile, pick the view and kind), as the brief says. The alternative is seeded-only in 3c with the composer in a later step. That would cut about a third of the grid work.
3. **Gallery on queries.** Attachments belong to datasets. Recommended: gallery on datasets only, and a query is refused at validation. The brief's "on datasets and queries alike" then holds for every skin but the gallery.
4. **The werklijst row action.** Recommended: a generic tile `set` (one click writes one option through the column's existing write path), not engine actions on queries.
5. **Quick actions.** Recommended: creates only in v1 (activity, tourstop, task, as the scope lists). Declared dataset actions need a record, so they stay in the drawer.
6. **Activiteit's lanes.** Recommended: production and tourstop. Venue as a lane would need lookups as lanes; it stays out.
7. **The progress tile's two views.** Recommended: "Plaatsen gevuld" (Toewijzingen with a persoon, this week) of "Plaatsen" (all Toewijzingen with a rol, this week), both seeded, so the bar reads filled of open.
