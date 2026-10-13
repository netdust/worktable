# Step 3c: skins and the dashboard

The spec of record is `docs/SPEC.md` at `62fead3` (Skins, Dashboard, SavedView row, step 3c rows). The design is in `specs/step-3c/findings.md`, approved by Stefan on 2026-10-12 with F4 changed. "Brief" means Stefan's step 3c brief of 2026-10-12, relayed by the orchestrator. "Verdict" means his verdict on the findings, relayed the same day.

## Engine shapes

- **R1 Board (F1).** A skin need `board: { column }` on a dataset or query, where `column` is an options column (a lifecycle column qualifies). A saved view takes skin `board` only where its source declares it. Read-only.
  Source: brief, "board on a lifecycle or option column"; findings F1, approved.
- **R2 Timeline and spans (F2).** A source that declares `calendar` also offers skin `timeline`. `calendar.spans: true` means a row covers every day from its start to its end. On the calendar such a row sits in the all-day band of every day it covers, and on a timeline it is one bar. Spanning rows are read by overlap.
  Source: brief, "timeline on the calendar's need"; findings F2, approved.
- **R3 Gallery (F3).** A skin need `gallery: { kind }` on a dataset that declares `attachments`, where `kind` is one of its kinds. A query is refused. One batched read, `GET /attachments/:dataset?ids=…&kind=…` (at most 200 ids), answers each readable id's newest live file of that kind, under the same scope as the single read.
  Source: brief, "gallery on an attachment column"; verdict, "gallery datasets only".
- **R4 Dashboard (F4).** A saved view with skin `dashboard`, no source, and a `layout` column. A dashboard has no source and every other skin has one. Its layout's sections, tiles (stat, list, week, progress) and quick actions (creates) are validated against the views they name and capped: 6 sections, 12 tiles each, 8 actions, labels of at most 80 characters. A dashboard can be neither public nor for owners. An owner never lists one. Composition is `PATCH /views/:id`. A seed's tiles name seeded views by name, resolved to ids at seeding and by `--seed-missing`.
  Source: verdict, "a dashboard is a saved_view row with skin dashboard, no source, and its layout in a column of its own; composition is the existing view update route; sharing, the rail and the owner refusal come from the view machinery … Validation: a dashboard view has no source and every other skin must have one; the layout is validated and capped as you wrote."
- **R5 Tile `set`.** A list tile may declare `set: { column, value, label }`: an options column of its view that writes (a dataset column, or a query column with `writes`), and one of its options. One click writes that value through the existing write path. It shows only on rows whose write key is set.
  Source: verdict, "questions 2 to 7 on your recommendations (… the generic tile set …)".

## Grid

- **R6 Skins in the grid.** Board, timeline and gallery are view types. The Rail's `+` offers each one where the source declares it. All are read-only, and an item opens its row in the drawer.
  Source: brief, "Read-only skins in v1, no drag on the board".
- **R7 Dashboard page.** The rail's first item is Dashboard. The grid opens on the first dashboard view the caller can read.
  - The tiles are:
    - stat: count or sum, toned by the column's badge or a threshold, with the change against the previous period where the view has a date condition;
    - list: N rows, with "Alles tonen" and the inline `set`;
    - week strip: seven days with today marked, each event opening its row;
    - progress: done of total.
  - Quick creates sit in the header: a dialog of the dataset's required columns with the space filled in, keyboard reachable.
  - The space switcher narrows every tile.
  - The page refreshes on focus, after a quick action or `set` it ran, and when the space changes.
  - A stat's or list's title opens its view.
  - Administrators compose the dashboard in place.

  Source: brief, the Dashboard paragraph and its bullets; verdict, "admins compose in place", "creates only as quick actions".

## Theatre (F5 and seeds)

- **R8 Calendar needs.**
  - Activiteit: `{ day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['productie_id', 'speelreeks_id'] }`.
  - Beschikbaarheid: `{ day: 'start_at', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'], spans: true }`.
  - Speelreeks: `{ day: 'start_datum', end: 'eind_datum', lanes: ['productie_id'], spans: true }`.
  - Board needs: Toewijzing `state` and Activiteit `status`.
  - Gallery need: Activiteit `foto`.

  Source: brief, F5; verdict, "lanes production and tourstop".
- **R9 Seeded views.**
  - **Bord:** Toewijzingen by state.
  - **Tijdlijn:** Tourstops.
  - **Galerij:** Activiteiten foto.
  - **Kalenders:** Activiteiten and Afwezigheden.
  - **Dashboard (shared):**
    - **Nu:** stat Conflicten, red above 0; stat open slots inside the horizon; stat invitations past the deadline; progress "Plaatsen gevuld" of "Plaatsen".
    - **Deze week:** week strip on Bedrijfsweek; list of today's activities.
    - **Te doen:** list Werklijst with `set` Gedaan.
    - **Quick creates:** activiteit, speelreeks, taak.

  Source: brief, "Scope"; verdict, "progress from two Toewijzing views".

## Gate

- **G**
  - Each skin opens on a seeded view in the real artifact.
  - The dashboard is the landing page, and every stat is a live count.
  - The conflicten stat is red while a conflict exists and neutral after it is fixed.
  - A stat opens its view.
  - The week strip opens an activity.
  - A werklijst row action runs from the list, and the stat updates after.
  - A quick action creates a record.
  - The space switcher narrows the dashboard.
  - An owner never sees a dashboard.

  Source: brief, "Gate".

## Out

Editing inside a skin other than the grid; owner dashboards; any website page (brief). Drag on the board, charts, free text (brief). Declared dataset actions as quick actions (verdict, question 5).
