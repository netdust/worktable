# Step 0b: writes

The second slice of build step 0 in `docs/SPEC.md`. It adds writers as the only path into a table, the `writes:` mapping on query columns, the Revision audit table, and the `/rows` limit, and it wires the grid's cell edits to the writers. Like 0a, it also measures something: which deferred ledger rows the writes pay off, and in how many lines, re-measures the writes estimate.

Branch: `feature/step-0b`, from `main` @ `d4837b7`.

## Requirements

### R1 Declarations are validated at startup
Before migrating, the engine checks every declaration:
- `title` and `date` name declared columns;
- every index column is declared;
- every `relation` names a declared dataset;
- every `writes:` target names a dataset that has a writer, and a declared column of that dataset, and its `key` is a declared column of the query.

A failing declaration stops startup with a message naming the declaration and the bad name.
Source: "Declaration validation at startup: title, date, index columns and relation targets exist", and `specs/step-0/carry-over.md`.

### R2 The window is a real calendar date
`from` and `to` must be real calendar dates: `2026-13-45` and `2026-02-30` are 400 `bad_window`.
Source: "the date window must be a real calendar date."

### R3 /rows limit
- `limit` defaults to 5000.
- A `limit` above 5000, below 1 or not an integer is 400 `bad_limit`.
- `total` is an exact count from a separate query over the same WHERE, never the length of the page.
- The 0a `$contains` timing test keeps a bound, re-measured with the second query in place.

Source: "/rows limit: default 5000, 400 above, with total an exact separate count." · `docs/SPEC.md` (The engine).

### R4 Writers
- **Registration.** A domain registers at most one writer per dataset: `create`, `update`, `delete`, each optional and each free to refuse.
- **The only path in.** A dataset without a writer, or without that operation, is read-only, and the route answers 405 `read_only`.
- **Routes:**
  - `POST /api/rows/:dataset`
  - `PATCH /api/rows/:dataset/:id`
  - `DELETE /api/rows/:dataset/:id`
- **Body handling:**
  - The body must be a JSON object.
  - It is cut to the dataset's declared, non-readonly columns; any other key is dropped.
  - Each kept value is checked against its column type and nullability: 400 `bad_value`, naming the column.
- **Calling the writer.** The writer receives the cut values, the current row (for update and delete), the actor, and a `find(dataset, id)` read inside the same transaction. It returns the values to store, which may add derived columns, or calls `refuse(message)`.
- **Responses:**
  - A refusal is 422 `{ code: 'refused', message }` and the database is unchanged.
  - An unknown or soft-deleted id is 404 `unknown_record`.
- **Delete is soft:** it sets `deleted_at`.
- **What a write returns:** the stored row in the `/rows` row shape (columns, `custom`, `lookups`).

Source: "Writers: a dataset may register a writer (create, update, delete, free to refuse). It is the only path into a table; a dataset without one is read-only. Routes POST /api/rows/:dataset, PATCH and DELETE /api/rows/:dataset/:id. The body is cut to declared columns, and delete is soft."

### R5 Readonly columns
A column may be declared `readonly`. A readonly column is cut from write bodies, as R4 says, and the grid does not offer it for editing. A writer may still set it; that is how derived columns work. Activiteit's `plandag` is readonly.
Source: invented, pending Stefan's approval. `docs/SPEC.md` says `plandag` "is the one that is stored, computed by the writer", but no column flag lets a planner's edit of it be refused. This adds one generic flag to the Dataset shape (proposed spec diff below).

### R6 The temporary dev actor
Until auth exists, every write runs as one fixed actor, `{ id: 0, role: 'admin' }`, defined in one engine file. That file is marked temporary, so step 0's auth replaces exactly that file. Writers receive this actor, and Revision rows carry its id.
Source: "Until auth, use one fixed dev actor with the admin role, clearly marked as temporary."

### R7 Revision
- **The table.** `revision` is the second generic table after SavedView, with the spec's columns: `entity`, `record_id`, `field`, `old`, `new`, `actor_id`, `at`, `batch_id`.
- **What gets a row.** Every write appends one row per field whose stored value changed, including derived columns and `deleted_at`. The rows are written in the same transaction as the write and share one `batch_id` per request.
- **What a create records.** A create records each stored field, with `old` null.
- **Audit only.** There is no undo route or UI.

Source: "Revision table: the first generic table after SavedView. One row per changed field, grouped by batch_id, written in the same transaction as the write. Audit only; the undo UI is later."

### R8 Reading revisions
`GET /api/revisions/:dataset/:id` returns that record's Revision rows, oldest first. It is read-only and exists so the gate can prove R7 in the browser.
Source: invented, pending Stefan's approval. The alternative is the e2e test opening the database file from Node, which needs a native SQLite dependency in the test runner.

### R9 Writes from a browser need JSON and an allowed Origin
- **The gap the Host rule leaves.** The Host rule stops DNS rebinding, but it does not stop a hostile page from sending a plain `text/plain` POST to `127.0.0.1:4310`. Such a POST carries a correct Host and runs without a CORS preflight.
- **The rule.** Every write route requires `Content-Type: application/json`, or it answers 415 `bad_content_type`. A request that carries an `Origin` header must carry an allowed one, or it answers 403 `forbidden_origin`.
- **Which origins are allowed:** the engine's own, plus each `--origin` given on the CLI. The grid's dev and e2e servers pass theirs.
- **Lifetime.** Kept when auth lands, like the Host rule.

Source: invented, pending Stefan's approval. This is the 0b threat model's consequence of shipping writes with no auth (proposed spec diff below).

### R10 Theatre: the Activiteit writer
- `create` and `update` compute `plandag` with the shared `plandag(start_at, 5)` whenever `start_at` is stored.
- The writer refuses, each with a Dutch message:
  - `eind_at` before `start_at`, checked on the merged row;
  - a `productie_id` that names no live productie;
  - a `status` or `soort` outside its declared options.
- `delete` is allowed.

Productie gets no writer in 0b, so it stays read-only.
Source: "Theatre: the Activiteit writer, computing plandag through the shared function and refusing end-before-start, an unknown productie and an invalid status or soort."

### R11 writes: on query columns
- **The mapping.** A query column may declare `writes: { dataset, field, key }`, and `/schema` serves it.
- **How the grid uses it.** An edit to a mapped column goes to `PATCH /api/rows/<dataset>/<row[key]>` with `{ <field>: value }`. The returned row and every undo entry refer to that target record. The grid then reloads the query row, so the view shows what the query now computes.
- **The stand-in.** One query over Activiteit proves it: `dagplanning`, one row per live activiteit joined to its productie, with `status` and `start_at` mapped to `activiteit` through `key: activiteit_id`.
- **The engine test.** It uses a fixture whose `id` differs from `key`, so routing by `row[key]` is proven, not assumed.

Source: "writes: on query columns: a mapped column routes its edit to the target dataset's writer using row[key], and the returned row and undo key refer to the target record. Prove it with one stand-in query over Activiteit."

### R12 Grid
- **Writable sources.** A dataset with a writer is writable, and so is a query with at least one mapped column. Readonly columns and unmapped query columns are not editable. The title column maps to the dataset's declared title column.
- **Writes go through the engine routes.** Replies are mapped through the adapter, and a refusal shows the writer's message in the grid's existing cell-error handling.
- **Relation chip options** come from the relation target's rows, not from the loaded page.
- **The ledger.** `specs/step-0a/wp-assumptions.md` is updated: every deferred row the writes pay moves to done, with its lines, and the totals are re-derived.

Source: "Grid: wire cell edits to the writers, pay the deferred writes rows in the ledger, show a refusal in the grid's existing error handling, and fix relation chip options so they come from the relation target's rows."

### R13 Gate
`bun run gate` passes, and Playwright proves in a real browser:
1. Editing a status persists after reload.
2. A refused edit shows the writer's message and leaves the database unchanged.
3. Editing through the query view lands in `activiteit`.
4. Revision rows exist for each change.
5. Moving `start_at` across the 05:00 line changes `plandag` and the group header.
6. A limit above the cap returns 400.

Then stop.
Source: the brief's Gate list.

## Out
Actors and auth, lifecycle, record tokens, public create, the board, import, Persoon, Organisatie, Toewijzing, Beschikbaarheid, and saving saved views. Also out: Productie writes, custom-field (`custom`) writes (Field is step 5), and the undo UI.
Source: "Out: actors and auth, lifecycle, record tokens, public create, the board, import, Persoon, Organisatie, Toewijzing and Beschikbaarheid, and saved-view saving."

## Proposed change to docs/SPEC.md (needs Stefan's approval before committing)
- **Dataset shape:** columns "(type, nullable, default, readonly)". A readonly column is cut from write bodies and set only by the writer.
- **Access**, after the Host rule: "Writes require a JSON content type and, when the request carries an Origin, an allowed one; this check stays when auth lands."

## Report (at the end)
- Which ledger rows moved from deferred to done, with line counts (the re-measure of the writes estimate).
- Hours for the write slice, separate from the ledger.
- Anything in `docs/SPEC.md` that can't be built as written.
