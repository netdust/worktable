# Step 1: Speelreeks + Sjabloon + Rol

Branch `feature/step-1`, from `main` after step 0e. The build order says "Four days of logistics in one apply" (SPEC.md, build order).

## Requirements

### R1. Rol
Rol has these columns:
- `naam` (title)
- `categorie`: artistiek · techniek · productie · logistiek
- `standaard_verrekening`: free text, nullable
- `dagtarief` and `uurtarief`: real, nullable
- `kleur`: `#rrggbb`, nullable

The theatre package seeds it. The rate columns can be written only by an administrator, and the Rol writer enforces this: an editor who sends `dagtarief` or `uurtarief` gets 403 `forbidden` with a Dutch message. An editor may still edit the other columns.

Source: "Rol: naam, categorie, standaard_verrekening, dagtarief, uurtarief, kleur, seeded; the rate columns writable by administrators only, through the writer." The `kleur` format and the seeded rows are invented, approval pending.

### R2. Speelreeks
Speelreeks has these columns:
- `productie_id` → Productie, required
- `naam` (title)
- `locatie_id` → Organisatie, nullable
- `start_datum` and `eind_datum`: dates, required
- `status`: optie · bevestigd · geannuleerd, default optie

The writer refuses each of these, in Dutch:
- an `eind_datum` before the `start_datum`
- an unknown or deleted productie or locatie
- a write by an owner
- a Speelreeks longer than 31 days, which keeps one apply bounded (invented, approval pending)

Deleting a Speelreeks is refused while live activities reference it: 409 `in_use` through the engine's in-use check. Speelreeks gets a seeded "Speelreeksen" view.

Source: "Speelreeks: productie, naam, locatie (an Organisatie, nullable), start_datum, eind_datum, status; the writer refuses an end before the start and an unknown productie or locatie; delete is refused while activities reference it." The status options are invented, approval pending.

### R3. Activiteit.speelreeks_id becomes a relation
`activiteit.speelreeks_id` gets a relation to `speelreeks`, and the writer refuses an unknown speelreeks. The migrator rebuilds the table on a copy of the populated `~/laika-export/engine.db`. Afterwards, the value parity (`scripts/shakeout/value-parity.ts`) on the migrated copy still reports 0 mismatches.

Source: "Activiteit.speelreeks_id becomes a relation. Migrate a copy of the populated ~/laika-export/engine.db by rebuild, and re-run the value parity afterwards: still 0 mismatches."

### R4. Inheritance
An activity without a `locatie_id` takes its Speelreeks's locatie, resolved in the SQL views, not stored:
- `dagplanning` gains `locatie_id` (the resolved value, a relation to organisatie, read-only) and `locatie_bron` (`eigen` · `speelreeks` · empty).
- `voorstellingen` reads the venue through the same resolution.

The smallest grid display is these two read-only columns in Dagplanning.

The spec's "inherited value greyed" needs a new engine shape: a declared hint that one column says whether another is inherited. It is reported as a finding and not built.

Source: "an activity without a locatie takes its Speelreeks's, resolved in the SQL views; propose the smallest grid display, and if it needs a new engine shape, report it as a finding."

### R5. Sjabloon
Sjabloon has two columns:
- `naam` (title)
- `items`: JSON, a list of `{ soort, omschrijving, offset_dag, start_tijd?, duur?, locatie_regel }`

The Sjabloon writer validates items:
- `soort` is an Activiteit soort.
- `omschrijving` is non-empty text.
- `offset_dag` is an integer ≥ 0.
- `start_tijd` is `HH:mm` when present.
- `duur` is an integer number of minutes > 0, and only together with `start_tijd`.
- `locatie_regel` is `speelreeks`, the only rule in step 1.

The writer has a create and no update or delete, so the grid shows Sjabloon read-only. A test runs every seeded Sjabloon through the writer.

It is seeded with "speeldag op locatie", the Calais show day in the real data. Times are local; Overnachting is untimed, as in the real data.

| soort | omschrijving | offset_dag | start_tijd | duur |
| --- | --- | --- | --- | --- |
| maaltijd | Lunch | 0 | 13:00 | 60 |
| repetitie | Voorbereiding | 0 | 14:00 | 210 |
| maaltijd | Diner | 0 | 17:30 | 60 |
| repetitie | Voorbereiding avond | 0 | 18:30 | 90 |
| voorstelling | Voorstelling | 0 | 20:00 | 75 |
| andere | Afwas | 0 | 21:15 | 60 |
| overnachting | Overnachting | 0 | — | — |

Every item has `locatie_regel` = `speelreeks`.

Source: "Sjabloon: naam and items JSON (soort, omschrijving, offset_dag, optional start_tijd, optional duur, locatie_regel), validated by its writer, seeded with "speeldag op locatie" from the Calais pattern in the [real production's] data, read-only in the grid. Untimed items stay untimed, as in the real data." The `locatie_regel` value is invented, approval pending.

### R6. Apply a template
From a Speelreeks, a planner chooses a Sjabloon and applies it. The items repeat for every day from `start_datum` to `eind_datum`. For each day *d* and each item, an Activiteit is created through the Activiteit writer:
- `datum` = *d* + `offset_dag`
- `start_at` = `datum` + `start_tijd` when present
- `eind_at` = `start_at` + `duur` when present
- `productie_id` and `speelreeks_id` from the Speelreeks
- `locatie_id` left empty, so it inherits
- `soort` and `omschrijving` from the item
- `status` = optie

All of them are written in one transaction with one Revision batch. One undo removes them all.

Applying to a Speelreeks that already has live activities is refused: "Deze speelreeks heeft al activiteiten. Maak de vorige toepassing ongedaan of verwijder die activiteiten, en pas het sjabloon dan opnieuw toe."

Source: "Apply template: from a Speelreeks, choose a Sjabloon and create its activities (datum = start_datum + offset_dag, productie from the Speelreeks, locatie inherited) through the Activiteit writer, in one transaction with one Revision batch, with one undo that removes them all." "Per-day repetition is confirmed." "the twice-applied refusal says how to proceed."

### R7. Engine: actions and undo by batch
This is the approved finding, with Stefan's three changes. Every name is in English and generic, with no domain word in the engine.

1. **Write reply.** The reply to every row `POST` and `PATCH` gains `revision: { batch_id, changed: [columns] }`, listing the columns the write actually changed. A dataset or query may not declare a column named `revision`.
2. **Batch table.** A new engine table `batch` holds `(id, actor_id, kind, at, undone_by)`, with kind one of `write` · `action` · `undo` · `import`. Every write, action, undo and import records its batch there. Revision gains an index on `batch_id`.
3. **`POST /batches/:id/undo`.** It runs in one transaction under a new batch of kind `undo`.
   - It undoes only a batch of the caller's own, of kind `write`, `action` or `undo`, that is not yet undone.
     - An `import` batch, or a batch recorded before this table existed, is refused (`not_undoable`).
     - Another account's batch is refused (403).
     - An already undone batch is refused (409 `already_undone`).
     - A batch holding a delete is refused (`not_undoable`); undoing a delete stays out.
   - It restores a column only if its current value is still what the batch wrote. Otherwise it changes nothing and answers 409 `changed_since` with `{ dataset, id, column, label }`. The grid says so in Dutch, naming the column.
   - Old values go back through the dataset writer's `update`, one call per record. A record the batch created is removed through the writer's `delete` and the in-use check. Any refusal rolls back the whole undo.
   - Scope and role checks are those of a normal write by the caller.
4. **Redo.** Redo is undoing the undo batch. It is allowed only while nothing has changed since the undo, and the same check applies.
5. **Actions.** A domain declares `actions: { <name>: { label, on: <dataset>, input: { <key>: { relation: <dataset>, label } }, run(record, input, ctx) } }`.
   - `run` returns a list of `{ dataset, values }` creates.
   - `POST /actions/:name` takes `{ id, input }`.
   - The action runs as the caller, with the same owner scope and role checks as a write: the record must be readable by the caller, and every create goes through its dataset's writer for the caller.
   - It runs in one transaction under one `action` batch, and answers `{ batch_id, created: [{ dataset, id }] }`.
   - `/schema` lists each dataset's actions.
   - A test proves an owner is refused.
6. **Grid.** Every undo entry is a batch id; undo and redo call `POST /batches/:id/undo`. The before-image widening of 81b7a4b is removed. The row drawer shows a dataset's actions as a button with a picker for each input. An applied action is one undo entry, and the views reload after it.

Source: the finding as approved: "approve the apply-template finding with three changes: redo is only an undo of the undo while nothing has changed since; actions run as the caller with the same scope and role checks, tested for an owner; the twice-applied refusal says how to proceed." And: "The write reply reports the columns the writer changed, and undo restores a column only if its current value is still what the undone edit wrote, otherwise a Dutch refusal naming the column."

### R8. Gate
The gate runs in a browser on invented fixtures:
- Create a four-day Speelreeks at a venue and apply "speeldag op locatie". The 28 rows match the Calais day pattern on the right dates, with the inherited venue (Dagplanning `locatie_bron` = `speelreeks`).
- One undo removes them all, and their Revision rows share one batch.
- Applying twice is refused with the R6 message.
- Deleting a Speelreeks that has activities answers 409 `in_use`.
- An end before a start is refused in Dutch.

The report covers:
- the four things reported before: value parity, data profile, edit session and findings by severity;
- the migration result on the copy.

Source: "Gate, in a browser, on invented fixtures: create a four-day Speelreeks at a venue and apply "speeldag op locatie". …" "Report the same four things as before, plus the migration result on the copy."

## Out
These stay out of step 1:
- slots and open Toewijzingen
- kandidaten
- a template editor
- Taak
- lifecycle
- record tokens
- Persoon_rol
- undoing a delete
- the greyed inherited display

Source: "Out: slots and open Toewijzingen, kandidaten, a template editor, Taak, lifecycle, record tokens, Persoon_rol." The last two items are this spec's.

## `docs/SPEC.md` lines (proposed, committed after Stefan sees the diff)
- **Sjabloon row:** `naam, items (JSON: soort, omschrijving, offset_dag, start_tijd?, duur?, locatie_regel)`. Its note becomes: "Activity bundle for one day. Applied to a Speelreeks, it writes the activities of every day from start_datum to eind_datum in one batch."
- **Step 1 gate:** "Applying "speeldag op locatie" to a four-day Speelreeks produces the Calais day pattern's rows on every day, with the inherited venue, in one batch; one undo removes them."
- **Revision row and Writer row:** the batch table, the write reply, undo by batch, and actions, as R7.

## Open, for Stefan
- **Seeds into an existing database.** Rol and Sjabloon are seeded only into a fresh database, so the migrated copy has them empty. Two options:
  - They stay empty, and the gate runs on fresh invented fixtures.
  - Seed a dataset the migration just created. This is an engine change.

  The plan takes the first.
