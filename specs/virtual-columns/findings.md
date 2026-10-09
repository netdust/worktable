# Virtual columns on datasets: findings, before any code

Stefan, 2026-10-09: "we are bumping into architecture problem where we have the dataset and then regular views … the queries (like dagplanning) are valuable but something else while they sit next to these normal views"; "column wise, it should be possible to add any possible column and also create columns that link to a different dataset"; and, after the NocoDB comparison: "fine, we can keep that rule [datasets are code], but if those type of columns exist it makes more sense and we keep queries for something else".

Branch `feature/virtual-columns`, cut from main at d834274. `feature/one-planning` (renaming Dagplanning to Planning) is parked: it hid the problem instead of solving it.

## The problem

A view Stefan creates on Activiteiten is a plain grid. The rich planning (people, the venue inherited from the tourstop) exists only as the query `dagplanning`, a separate source with its own views. That is because three things only a query can carry today:

| Dagplanning has | Today | Source |
|---|---|---|
| Mensen (people on the activity) | a `links` declaration on the query; datasets support `links` too (`declare.ts:68-76`, `rows.ts:192-210`), it was just never declared on `activiteit` | `queries.ts` links.mensen |
| the venue inherited from the tourstop, editable, with "via Tourstop" | SQL `COALESCE(a.locatie_id, s.locatie_id)` plus a `locatie_bron` CASE (`queries/dagplanning.sql:1`), `inherited` on a query column — refused on a dataset (`validate.ts:358-365`); the edit is routed by the grid to `activiteit.locatie_id` (`api.ts:224-235`) | the only real gap |
| the production's title | a join (`p.titel`) | already served on the dataset as the relation's title (`lookups.productie_id.title`) |
| day facts in the bands | `group_facts` | already declared on `activiteit` too (`datasets.ts:100`) |

So one thing is missing for the dataset to be the planning: a column whose value is the record's own value, else a related record's value — editable, showing where it came from. NocoDB's model (Links, Lookup, Rollup, Formula as computed columns on the table itself) points at the general form.

## What exists in the engine today
- **Every declared column is physical.** `source.columns` drives the DDL (`ddl.ts:40-46`), the drizzle table (`tables.ts:15-30`), the row copy (`rows.ts:82`), the write path (`writes.ts:89-121, 167-175, 399`), import, OpenAPI, history, and the owner and public projections (`owner-views.ts:37-45, 105`; `views.ts:320-324, 420-437`). A virtual entry inside `columns` would be created as a table column and accepted in writes.
- **Rows are read with `SELECT *`** over the table, no joins (`rows.ts:93-112`); relation titles come from a second query per relation (`titlesOf`, `rows.ts:53-63`) that applies **no scope and no `deleted_at` filter**.
- **Filters, sort and group accept only declared columns** (`filter.ts:28-29`, `params.ts:79-80`, `views.ts:40-44`) and resolve a key to `table[key]`. The compiler's operators already accept any SQL expression (`filter.ts:100-135`), so a computed expression can be filtered and sorted once the key resolves to it.
- **The grid already renders inheritance** (`grid/cells/index.tsx:12-21`, "via Tourstop") from `Field.inherited`; its lookup and rollup cell kinds exist but are dead on the engine backend (`apps/grid/src/engine.ts:214-230, 397-400`).
- **The filter builder** offers select, relation, bool, date/datetime and text only (`grid/filter.ts:39-67`); numbers are never offered.

## Proposal

### 1. A separate declaration key: `virtual`
`DatasetDecl.virtual?: Record<string, VirtualDecl>` — never inside `columns`, so DDL, writes, import and projections stay untouched by construction. Domain-declared, like every dataset shape ("datasets are code" stands; admin-created virtual fields are a later step through Field).

Three kinds, each read as one SQL expression added to the row SELECT (a correlated subquery), so filter, sort and group work on it like on a column:

| Kind | Declaration | Value | Editable |
|---|---|---|---|
| **lookup** | `{ kind: 'lookup', via: <relation column>, field: <column of the target> }` | the related record's field (live rows only) | no |
| **rollup** | `{ kind: 'rollup', link: <links name>, fn: 'count' \| 'sum' \| 'min' \| 'max', field?: <column of the link dataset>, where?: { <column>: <value> } }` | an aggregate over the linked rows | no |
| **fallback** | `{ kind: 'fallback', own: <column of this dataset>, via: <relation column>, field: <column of the target>, label?: <word for where it came from> }` | the own value, else the related record's field; served with its source (`own` or `via`) | yes: a write sets `own`; clearing it inherits again |

Validation: `via` is a declared relation, `field` a declared column of the target with a compatible type, `link` a declared link, `own` a declared physical column of the same type as `field`; a virtual name collides with no column, link or reserved name.

### 2. Read path
- `readRows` adds each virtual expression to the SELECT under its name; `total` uses the same WHERE.
- `resolveKey` (filter), `hasColumn` (sort/group, saved views) and `orderOf` resolve a virtual key to its expression and declared type.
- A lookup or fallback reads the target **in the caller's scope** and skips deleted rows — unlike `titlesOf` today, a lookup exposes a field, not only a title.

### 3. Writes
- lookup and rollup are read-only (a write naming them is 400, as an undeclared key is today).
- A write to a fallback column is a write to its `own` column, through the writer and the transition check like any write; the revision records `own`. Clearing it (null) makes the value inherit again.

### 4. Who sees them
- Owners (sessions and link actors) are never served a virtual column unless the domain marks it `owner_visible`; a lookup or rollup could otherwise reach fields of records the owner may not read. Public views likewise only through an explicit `visible_fields` entry, checked like a column.
- `/schema` serves each virtual column with its kind, type, label and (for fallback) where it came from, so the grid renders, filters and sorts it; OpenAPI lists them read-only (fallback: writable as its type).

### 5. Theatre after this
- `activiteit` declares `links.mensen` (as the query does now) and `virtual.locatie = { kind: 'fallback', own: 'locatie_id', via: 'speelreeks_id', field: 'locatie_id', label: 'Tourstop' }`.
- Every view on Activiteiten — the seeded ones and the ones Stefan makes — has people and the inherited venue, in every skin.
- The query `dagplanning` and its view are removed; the seeded "Planning" (dataset) view gets Dagplanning's columns. `--seed-missing` brings existing databases along (it removes undeclared system views).
- Queries stay for overviews that are not one dataset — the website's Voorstellingen, step 3's conflicts and day overviews — shown in their own section of the tree, not under a dataset.

### 6. Grid
- Field types for the three kinds; `fallback` renders with the existing "via …" treatment; lookup and rollup render read-only; numbers become filterable (the filter builder gains number comparisons, since rollups are numbers).

## Tests (summary)
- **Validation:** a virtual declaration with a missing `via`, `field`, `link` or `own`, a type mismatch, or a name colliding with a column is refused.
- **Read:** lookup, rollup (count with `where`, sum) and fallback values on `/rows`; a deleted or out-of-scope target yields null for lookup/fallback.
- **Filter, sort, group:** on a virtual column, through `/rows` and saved views.
- **Write:** a fallback write lands on `own` and is revised; clearing it inherits; a write to a lookup or rollup is 400.
- **Who sees them:** an owner's `/rows` and owner views never carry an unmarked virtual column; a public view only when listed.
- **Theatre:** a Planning view on `activiteit` shows Mensen and the inherited venue; the dagplanning query is gone; `--seed-missing` on a step-2 database removes its views and keeps user views.

## Scope against the spec of record
- `docs/SPEC.md`'s Dataset row gains `virtual` (lookup, rollup, fallback); the Query row says queries are overviews that are not one dataset; `inherited` on query columns becomes the dataset's `fallback` (query `inherited` is removed once dagplanning is gone).
- "Datasets are code. Admins create fields, views, templates and publications, never datasets" stands; virtual columns are code too. Admin-created virtual fields are out (later, through Field).

## Questions for Stefan
1. **The three kinds.** lookup, rollup and fallback — enough for now, or is a fourth (e.g. a formula) needed for something you have in mind?
2. **Order of work.** Recommended: this first (it removes Dagplanning and makes Planning the one source), then plandag/datum, then the calendar and kanban skins, then adding people from Planning filling open slots.
3. **Number filters.** Rollups are numbers; the filter builder offers no number comparisons today. Add them with this (recommended), or later?
