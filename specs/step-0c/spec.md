# Step 0c: fiche proof, in-use refusal, theatre parity

The third slice of build step 0 in `docs/SPEC.md`. It proves the engine is domain-free by serving a second domain (`fiche`) with zero engine changes, adds one generic engine rule (a referenced row cannot be soft-deleted), brings the theatre package to parity with what Laika runs today (Organisatie, Persoon, Toewijzing without slots, Beschikbaarheid, and the `voorstellingen` view), and fixes clearing a select in the grid.

Branch: `feature/step-0c`, from `main` @ `5fa7cbe`.

## Decisions taken before this spec (Stefan, 2026-10-05)
- **Fiche proof covers declared columns only.** The fiche dataset has real columns that render and edit with zero engine changes. Its `custom` values are seeded, served in `/rows` and filterable with `custom.<key>`, but not shown or edited: the grid flattens custom values "using Field", which is step 5. Recorded as a spec finding.
- **Toewijzing carries the spec's `state` without `maybe`.** It is a free enum now; the lifecycle is step 2. Laika's `requested`, `confirmed` and `declined` map at import to `uitgenodigd`, `bevestigd` and `geweigerd`. Laika's `maybe` has no state: a finding for Stefan to place.
- **Beschikbaarheid uses the spec's datetimes.** `start_at` and `eind_at` are datetimes; a whole-day Laika absence imports as `00:00` to `23:59`. `soort` waits for step 2.
- **New relations are declared, and old databases need `--fresh`.** `Activiteit.locatie_id` and `Productie.organisatie_id` become relations to Organisatie. That changes their DDL, ALTER/rebuild is not built, and an existing database refuses to start, naming the dataset. No real data exists yet; dev and e2e already run `--fresh`. ALTER stays the step 1–2 item.

## Requirements

### R1 The fiche proof, first and with zero engine changes
- **What `packages/fiche` declares:**
  - one dataset, `fiche` (`custom: true`), with declared columns: `titel` (title), `type` (options `hulp` · `preventie` · `vroeginterventie`), `gemeente`, `postcode`, `telefoon` (nullable), `email` (nullable), `website` (nullable), `prioriteit` (integer, default 0) and `verborgen` (boolean, default false);
  - a writer that refuses, in Dutch: a missing `titel`, a `type` outside its options, and a `postcode` that is not four digits;
  - one read-only query, `zichtbare_fiches`: live fiches with `verborgen` false, ordered by `prioriteit` descending, then `titel`;
  - seeds: invented fiches with custom values (for example `talen`, `crisisopvang`), and two SavedViews, "Fiches" and "Zichtbare fiches".
- **How it is served:** `bun packages/engine/src/serve.ts --domain @worktable/fiche --db <file>`. The grid renders it, edits a fiche's declared columns, and shows the writer's refusal.
- **Zero engine changes.** This requirement's commits change nothing under `packages/engine/`, which is checked with `git diff --stat`. If an engine change turns out to be needed, the work stops, and that change is reported as a spec finding before anything else is built.

Source: "the fiche proof first: packages/fiche declares one fiche dataset with custom fields, a writer and one query, is served with --domain @worktable/fiche, and renders and edits in the same grid with zero engine changes. If an engine change is needed, stop and report it as a spec finding." · the custom-field scope: Stefan's decision above.

### R2 A referenced row cannot be soft-deleted
- **The rule.** `DELETE /api/rows/:dataset/:id` answers 409 `{ code: 'in_use', message, by: [{ label, count }] }` when any live row of any domain dataset has a declared relation column pointing at that record. Nothing changes.
- **The message** is an English fallback naming each referencing dataset by its label, with a count (for example `Still referenced by Activiteiten (3), Personen (1)`). `by` carries the same as data, one entry per referencing dataset; the grid formats its own Dutch sentence from `by` through i18n (Stefan, 2026-10-05).
- **Scope.** The engine's generic tables (Revision, SavedView) and queries do not count. A soft-deleted referencing row does not count.
- **Order.** The check runs inside the write transaction, before the writer's `delete`.

Source: "A generic engine rule: refusing a soft-delete of a row that live rows reference answers 409 in_use."

### R3 Theatre: Organisatie
- **Columns:** `naam` (title), `soort` (options `eigen` · `partner` · `venue` · `agentschap` · `leverancier`), `adres`, `lat`, `lng`, `toegang`, `contact` (all nullable except `naam` and `soort`), and `parameters` (json, nullable).
- **The writer** refuses a missing `naam` and a `soort` outside its options. Delete is allowed, and R2 guards it.
- **New relations.** `Activiteit.locatie_id` and `Productie.organisatie_id` become relations to `organisatie`.

Source: "Theatre datasets at parity with Laika today: Organisatie" and `docs/SPEC.md` (Reference datasets).

### R4 Theatre: Persoon
- **Columns:** `voornaam`, `achternaam`, `email`, `telefoon`, `organisatie_id` (relation, nullable), `contract_type` (options `vast` · `freelance` · `dagcontract`, nullable), `dietary` (nullable), `actief` (boolean, default true), and `weergavenaam`, a readonly column the writer derives from `voornaam` and `achternaam`. `weergavenaam` is the title column.
- **Left out of 0c:** `token` and `user_id`, because record tokens and auth are out.
- **The writer** refuses a missing `voornaam` or `achternaam`, and an `email` without an `@`.

Source: "Theatre datasets at parity with Laika today: … Persoon". The `weergavenaam` column is invented, approved with the plan on 2026-10-05: the spec gives Persoon no display column, and the title rule needs one so a Toewijzing's person shows a name.

### R5 Theatre: Toewijzing without slots
- **Columns:**
  - `activiteit_id` (relation, required);
  - `persoon_id` (relation, nullable);
  - `naam` (text, nullable; an external person without a record), which is the title column;
  - `state` (options `open` · `uitgenodigd` · `bevestigd` · `geweigerd` · `geannuleerd`, default `uitgenodigd`; a free enum until step 2);
  - `notitie` (nullable).
- **Waiting for later steps:** `rol_id`, `aantal`, `call_at`, `verrekening`, the cost columns and the actual side.
- **The writer refuses, in Dutch, checked on the merged row:**
  - not exactly one of `persoon_id` and `naam`;
  - a second live Toewijzing for the same `persoon_id` on the same `activiteit_id`, not counting the record itself on update. Name-only rows are exempt;
  - a `state` outside its options.

Source: "Toewijzing without slots (a person or a free-text name, one assignment per person per activity)" · Laika's `person_or_name` and `duplicate_assignment` rules (`AssignmentRepository.php:183`, `:198-215`). The duplicate rule needs `ctx.exists` (finding 6).

### R6 Theatre: Beschikbaarheid, persoon only
- **Columns:** `persoon_id` (relation, required), `start_at` (datetime), `eind_at` (datetime), and `reden` (nullable), which is the title column.
- **The writer** refuses an end before the start, compared as normalised datetimes.

Source: "Beschikbaarheid (persoon only)" and Stefan's datetime decision above.

### R7 The voorstellingen view, public columns only
- **What it holds:** one row per live Activiteit with `soort = 'voorstelling'` and `status = 'bevestigd'`, joined to its productie, and to its venue through `locatie_id`. A show without a venue is still listed, with empty venue columns.
- **Columns, and only these:** `id`, `productie` (titel), `plandag`, `start` (time `HH:mm`), `venue` (naam) and `adres`.
- **What it must not hold:** no notes, no status and no ids other than `id`.
- It is read-only and gets a SavedView, "Voorstellingen".

Source: "the voorstellingen view exposing public columns only" and `docs/SPEC.md` ("productie, date, time, venue name and address").

### R8 Writers for Productie and the seeds
- **The Productie writer** refuses a missing `titel`, a `status` outside its options, and an `organisatie_id` that names no live organisatie. Delete is allowed, and R2 guards it.
- **Seeds:**
  - invented organisaties, both venues and the company's own;
  - personen;
  - toewijzingen, including one name-only row;
  - beschikbaarheden;
  - venues on several activiteiten.
- **SavedViews:** Organisaties, Personen, Toewijzingen, Afwezigheden, Voorstellingen, and Producties (approved by Stefan, 2026-10-05: the gate's Productie delete needs a view to open it from).

Source: the gate's "deleting a referenced Organisatie or Productie" needs a Productie that can be deleted · invented seeds.

### R9 Grid: clearing a nullable select sends null
- Clearing a select cell whose column is nullable sends `null`, and a reload shows it empty.
- Clearing a non-nullable select still reaches the writer and is refused.

Source: "Grid: clearing a nullable select sends null."

### R10 Grid: deleting a row
- **The action.** The row drawer gets a two-step delete for a dataset whose writer has `delete`: "Verwijderen", then "Zeker?", which calls `DELETE` (Stefan, 2026-10-05).
- **On success** the row leaves the sheet.
- **On a refusal** the grid's existing error notice shows it and the row stays: a 409 `in_use` as the grid's Dutch sentence built from `by`, a 422 as the writer's message.
- **Undo:** none. Delete is soft, and undo is later.

Source: invented, approved with the plan on 2026-10-05; the two-step confirm is Stefan's, same date. The copied grid had no delete action (only the matrix calls `remove()`).

### R11 Gate
`bun run gate` passes, and Playwright proves in a real browser:
1. The fiche renders and edits: a second engine on the fiche domain plus a Vite server pointed at it; a fiche's declared column is edited, and the edit persists after a reload.
2. Deleting a referenced Organisatie, and a referenced Productie, through Verwijderen → Zeker?, shows the in-use message and leaves the database unchanged; the gate asserts the 409's `code` and the counts in `by`.
3. A duplicate assignment shows its refusal.
4. `voorstellingen` returns only confirmed voorstellingen and only the public columns.
5. Clearing a select persists a null.

Then stop.
Source: the brief's Gate list.

## Out
Matrix, saved-view saving, auth, import, the WordPress block, lifecycle, record tokens, slots, kandidaten. Also out: Rol, Speelreeks, Sjabloon, Taak, Field, rendering or editing custom values, and undo of a delete.
Source: "Out: matrix, saved-view saving, auth, import, the WordPress block, lifecycle, record tokens, slots, kandidaten."

## Spec findings already known (for the report)
1. **Fiche custom fields.** They cannot render or edit without Field (step 5); the engine cuts `custom` from writes, and the grid drops it on read.
2. **Laika's `maybe` assignment status** has no Toewijzing state.
3. **Persoon has no display column** in the spec (R4 proposes `weergavenaam`). Toewijzing and Beschikbaarheid have no natural title; 0c uses `naam` and `reden`, which are empty on most rows.
4. **Laika's organisation role is a multi-valued taxonomy** (venue, coproducer, funder, presenter); the spec's `soort` is a single value with different terms. The mapping is needed at import.
5. **Laika absences are whole days;** the spec's are datetimes (decided above).
6. **A writer cannot look rows up by value.** `WriteContext` offers only `find(dataset, id)`, so "one assignment per person per activity" cannot be refused in the theatre writer, and a UNIQUE index would answer 500, not the Dutch 422. Approved by Stefan, 2026-10-05: a second engine change, `ctx.exists(dataset, match, exceptId?)`, a live-rows equality lookup inside the write transaction.

## Entry condition carried forward
The table-rebuild migrator (ALTER and SQLite's table rebuild, 0a's R3) must exist before the first real import. It is the entry condition of step 0e: an import into a schema that cannot change in place would freeze it (Stefan, 2026-10-05).

## Report (at the end)
- Which ledger rows moved, with line counts.
- Hours for the slice.
- Whether the fiche needed any engine change.
- Anything in `docs/SPEC.md` that can't be built as written.
