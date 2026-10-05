# Step 0d: the matrix, saved views, and the parity items

The fourth slice of build step 0 in `docs/SPEC.md`. It ports the grid's matrix skin onto the engine, so Toewijzing runs across persoon and down activiteit, with writes through the writers. It lets planners save, share and delete views. It normalises the person↔name switch in the Toewijzing writer. It gives Toewijzing and Beschikbaarheid titles derived from their person. And it closes the parity items collected so far.

Branch: `feature/step-0d`, from `main` @ `c2f5ee0`.

## Decisions taken before this spec (Stefan, 2026-10-05)
- **Matrix: the domain declares it, the engine serves the cells.** The matrix skin need grows from "relation pair, match, label" to a declaration on the join dataset: `down`, `across`, `label`, `cell`, `note`, `keys`, `marks`, `count`, and `away { dataset, across, label, end }`. `GET /rows/<down>?cells=1` returns each down row with its live join rows in one generic query. This amends the spec's Skin needs shape.
- **SavedView gains `shared`** (and drops the unused `scope`).
  - `visible_fields` carries column order and hidden columns.
  - Column widths and the matrix's picked columns stay per viewer, in the browser.
  - The owner is the dev actor until auth; a view is editable by its owner.
  - Delete is soft, with restore.
  - Prefs (view order, last view) stay unsaved.

  This amends the SavedView table.
- **A title may come through a relation.** A dataset may declare `title: { via: '<relation column>', else: '<column>' }`. The engine resolves it on read, like a lookup: the related row's title, else the fallback column. It is never stored, so it never goes stale. This amends the Dataset shape.
- **`/rows` gains `offset`.** It is an integer of 0 or more, beside `limit`. The grid pages relation targets until it reaches `total`. This amends the `/rows` line.

## Requirements

### R1 The matrix in the engine
- **The declaration.** A dataset may declare `matrix: { down, across, label?, cell, note?, keys, marks, count, away? }`:
  - `down` and `across` are relation columns of the join dataset;
  - `label` is a text column, for a free-text entity;
  - `cell` is an options column, and `note` a text column;
  - `keys` maps a typed key to a `cell` option, and `marks` maps a `cell` option to a glyph;
  - `count` is one `cell` option;
  - `away` is `{ dataset, across, label, end }`: a dataset whose `across` relation targets the same dataset as the join's `across`; the away dataset must declare `date`, and `end` names its end column. Away rows for a window are read by overlap (start before the window's end, end after its start), so a period that starts before the week still marks it.
- **Validation.** `validateDomain` checks every name and option at startup.
- **`/schema`** serves the declaration on the join dataset and marks the down source `matrix_join: <join dataset name>`.
- **Cells.** `GET /rows/<down>?cells=1` requires `from` and `to`, else 400 `window_required`. It returns each row with `cells`: the live join rows whose `down` equals the row id, in the `/rows` row shape.
- **Writes.** Matrix cells write through the join dataset's writer, with the routes and refusals of step 0b.

Source: "the matrix skin, ported with the match-column and label-column declarations from the spec (Toewijzing across persoon, down activiteit; an "open" column is deferred until slots exist), plus its write path through the writers" · the declaration shape: Stefan's decision above.

### R2 The matrix in theatre and the grid
- **Theatre declares** on `toewijzing`:
  - `down: activiteit_id`, `across: persoon_id`, `label: naam`;
  - `cell: state`, `note: notitie`;
  - keys `u`→uitgenodigd, `b`→bevestigd, `g`→geweigerd, `x`→geannuleerd;
  - marks uitgenodigd `?`, bevestigd `✓`, geweigerd `✗`, geannuleerd `–`;
  - `count: bevestigd`;
  - `away: { dataset: beschikbaarheid, across: persoon_id, label: reden, end: eind_at }`; Beschikbaarheid declares `date: start_at`.
- **A new SavedView,** "Toewijzingen per activiteit", on `activiteit`, with the matrix skin.
- **The grid** renders it from `/schema` and `?cells=1`:
  - record columns are personen, titled by `weergavenaam`, and name columns are free-text `naam`s;
  - away cells are marked from Beschikbaarheid;
  - typing a key, or picking in the panel, creates, updates or (when cleared) deletes a Toewijzing through its writer;
  - a writer's refusal (for example a duplicate) shows in the cell's existing error handling.
- **No open column** until slots exist (step 2).

Source: as R1 · keys, marks and count: invented, pending Stefan (Dutch domain words in the theatre package).

### R3 Saving saved views
- **Routes, all engine-owned:**
  - `GET /api/views`: the caller's own views plus the shared ones;
  - `POST /api/views`: create, 201;
  - `PATCH /api/views/:id`: `name`, `shared`, and the arrangement fields;
  - `DELETE /api/views/:id`: soft;
  - `POST /api/views/:id/restore`.
  - Every write goes through the 0b write guard (JSON content type, `Sec-Fetch-Site`, Host).
- **Validation:**
  - `name` is 1–80 characters after trimming;
  - `source` must be a declared source, and is fixed at create;
  - `skin` is `table` or `matrix`, matrix only on a source that has one, and also fixed at create;
  - `filters` must be accepted by `filterCompile` against the source's columns;
  - `sort`, `group_by` and `visible_fields` must name declared columns;
  - `shared` must be a boolean;
  - the view as it would be stored is at most 16 kB (400 `view_too_large`);
  - the owner is never taken from the body;
  - each failure is 400 with its code.
- **Ownership.** The owner is the dev actor until auth, and only the owner may change, delete or restore a view.
  - Someone else's unshared view answers 404 `unknown_view`;
  - someone else's shared view answers 403 `not_owner`.
- **Responses and audit.** A view comes back with `mine` and `editable`. Writes are revised in Revision like rows.
- **`/schema`** no longer lists views; `GET /api/views` does. The seeded views are owned by the dev actor and shared.

Source: "saving saved views, with the SavedView writes and routes, owner and shared flags" · shape: Stefan's decision above · validation rules: invented, pending Stefan, carried over from the ntdst-baseline server's own rules.

### R4 The grid saves views
- **What the grid sends:** "Save", "Save as new", "+ New view", "Duplicate", rename, share, delete with undo, and restore all go through R3's routes.
- **The arrangement:**
  - the chips and every saved non-`$eq` filter (R10) map to `filters`;
  - `sort` maps to `sort`, and `group` to `group_by`;
  - column order and hidden columns map to `visible_fields`;
  - widths and matrix picks stay local.
- **Refusal codes.** The grid's existing refusal handling maps `unknown_view` and `not_owner` onto its current vanished and not-owner flows.

Source: as R3.

### R5 The person↔name switch in the Toewijzing writer
- **On update:**
  - a body that sets a non-null `persoon_id` and does not mention `naam` also clears `naam`;
  - a body that sets a non-empty `naam` and does not mention `persoon_id` also clears `persoon_id`.
- **Still refused** with the 0c messages: a body that sets both, or a merged row with neither.
- **In the grid,** picking a person on a name row, or typing a name on a person row, switches the assignee in one edit.

Source: "the person↔name switch normalised in the Toewijzing writer, with the refusals kept for ambiguous API writes."

### R6 A title through a relation
- **The declaration.** `title` may be a column name or `{ via, else }`.
- **On read,** the engine fills the row's title from the relation target's title, else from the `else` column. The `/rows` row shape gains `title` for every source. The adapter reads it, so `toRow` stops taking the title column.
- **Theatre:**
  - Toewijzing's title is `{ via: persoon_id, else: naam }`;
  - Beschikbaarheid's title is `{ via: persoon_id, else: reden }`.
- **Read-only.** A derived title is not editable in the grid.
- **Filtering and sorting.** A title through a relation is filterable and sortable only through its columns.

Source: "derived titles for Toewijzing and Beschikbaarheid" · shape: Stefan's decision above.

### R7 Datetime display
- **Display.** A `datetime` cell shows as the locale's short date plus `HH:mm`, for example `di 14/10 20:30`.
- **Editing** uses a datetime-local input, and the value sent stays `YYYY-MM-DDTHH:mm`.
- **Sort and group** keep working on the stored text.

Source: "the collected parity items: datetime display" · the format: invented, pending Stefan.

### R8 "+ New" without asking for a title first
"+ New" asks first for the required columns the app cannot fill itself. It asks for a title only when the title is a required, writable column. Activiteit's `omschrijving` is nullable, so "+ New" asks for `productie_id` and `start_at` first. The title of a derived-title dataset (R6) is never asked for.
Source: "'+ New' without asking for a title first" · ledger row 44.

### R9 Relation options beyond 5000 rows
`/rows` takes `offset` (an integer of 0 or more). `records()` pages until it reaches `total`. Relation chips and the picker see every live row of the target.
Source: "relation options not capped at 5000 rows" · offset: Stefan's decision above.

### R10 Saved views keep non-`$eq` filters
A saved view's `filters` that are not single `$eq` chips (`$in`, `$gt`, `custom.<key>` and so on) are sent with every rows request beside the chips, and they survive saving. A view showing a filter that has no chip says so in the toolbar ("+ n vaste filters").
Source: "saved views keeping non-$eq filters" · `specs/step-0/carry-over.md` · the toolbar note: invented, pending Stefan.

### R11 Gate
`bun run gate` passes, and Playwright proves in a real browser:
1. A cell edited in the matrix persists after reload.
2. A view is created and saved, and is still there after reload.
3. A Toewijzing switches from a person to a name in one edit.
4. A datetime shows formatted.
5. A saved view with an `$in` filter applies it.
6. "+ New" on Activiteit asks for productie first, not omschrijving.
7. A relation picker lists a target row beyond the first page. The grid's relation page size is a test-only setting (`VITE_RECORDS_PAGE_SIZE`, 5000 by default), so this is provable without 5000 rows.

Then stop.
Source: "Gate in a browser: edit a cell in the matrix and see it persist, create and save a view and see it after a reload, switch a person to a name, and the parity items."

## Out
Auth, import, the WordPress block, slots (and with them the matrix's open column), lifecycle. Also out: prefs (view order and the last view), sharing by token or publication (`share_token`, `public`), and a datetime picker beyond the native input.

## Requirement for 0e, recorded now
The permission check runs before the in-use check, with a test. Source: Stefan, 2026-10-05 ("add to the spec: the permission check runs before the in-use check, with a test, as a 0e requirement").

## Report (at the end)
- The matrix's ledger rows and line counts first, then the other ledger rows moved.
- Hours for the slice.
- What in `docs/SPEC.md` can't be built as written.
- The proposed `docs/SPEC.md` diff, including the 0e requirement above.
