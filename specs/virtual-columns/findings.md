# Lookup columns on datasets: findings, before any code

Stefan, 2026-10-09: "we are bumping into architecture problem where we have the dataset and then regular views … the queries (like dagplanning) are valuable but something else while they sit next to these normal views"; "column wise, it should be possible to add any possible column and also create columns that link to a different dataset"; "relational we have, then we need lookup columns. this way a domain can define everything with columns; no confusion with those queries"; on editing: "ok do inherited".

Branch `feature/virtual-columns`, cut from main at d834274. `feature/one-planning` (renaming Dagplanning to Planning) is parked: it hid the problem instead of solving it.

## The problem

A view Stefan creates on Activiteiten is a plain grid. The rich planning (people, the venue inherited from the tourstop) exists only as the query `dagplanning`, a second source with its own views beside the dataset's. Of what Dagplanning carries:

| Dagplanning has | Today | Source |
|---|---|---|
| Mensen (people on the activity) | a `links` declaration on the query; datasets support `links` too (`declare.ts:68-76`, `rows.ts:192-210`), it was never declared on `activiteit` | `queries.ts` links.mensen |
| the venue inherited from the tourstop, editable, "via Tourstop" | SQL `COALESCE(a.locatie_id, s.locatie_id)` and a `locatie_bron` CASE (`queries/dagplanning.sql`); `inherited` on a query column, refused on a dataset (`validate.ts:358-365`); the grid routes the edit to `activiteit.locatie_id` (`api.ts:224-235`) | **the gap** |
| the production's title | a join (`p.titel`) | already on the dataset as the relation's title |
| day facts in the bands | `group_facts` | already declared on `activiteit` (`datasets.ts:100`) |

## The column kinds after this

| Column | What it does | Status |
|---|---|---|
| Relation | picks one record of another dataset | exists |
| Link | the records that point back (Mensen) | exists |
| **Lookup** | a field of the selected relation, live, read-only | new |
| **Inherited lookup** | a lookup the record can override with its own value; an edit writes the record's own column, never the related record; clearing it inherits again | new (today's query-only `inherited`, moved to datasets) |

Out: rollups (counts and sums over links) and write-through lookups (an edit that changes the related record) — later, when a screen needs one.

## What exists in the engine today
- **Every declared column is physical.** `source.columns` drives the DDL (`ddl.ts:40-46`), the drizzle table (`tables.ts:15-30`), the row copy (`rows.ts:82`), writes (`writes.ts:89-121, 167-175, 399`), import, OpenAPI, history, and the owner and public projections (`owner-views.ts:37-45, 105`; `views.ts:320-324, 420-437`). A lookup placed inside `columns` would become a table column and accept writes.
- **Rows are read with `SELECT *`** over the table, no joins (`rows.ts:93-112`); relation titles come from a second query per relation (`titlesOf`, `rows.ts:53-63`) with **no scope and no `deleted_at` filter**.
- **Filters, sort and group accept only declared columns** (`filter.ts:28-29`, `params.ts:79-80`, `views.ts:40-44`) and resolve a key to `table[key]`. The compiler's operators accept any SQL expression (`filter.ts:100-135`), so a lookup filters and sorts once its key resolves to its expression.
- **The grid already renders inheritance** (`grid/cells/index.tsx:12-21`, "via Tourstop") from `Field.inherited`, and has a lookup cell kind, unused on the engine backend (`apps/grid/src/engine.ts:214-230, 397-400`).

## Proposal

### 1. Declaration: `lookups`, beside `columns`
`DatasetDecl.lookups?: Record<string, LookupDecl>`, never inside `columns`, so DDL, writes, import and projections stay untouched by construction. Declared by the domain in code ("datasets are code" stands).

```ts
lookups: {
  locatie: { via: 'speelreeks_id', field: 'locatie_id', own: 'locatie_id', label: 'Locatie' },
}
```

- `via`: a relation column of this dataset. `field`: a column of the related dataset.
- `own` (optional): a physical column of this dataset of the same type as `field`. With `own`, the lookup is inherited: the value is `own` when set, else the related field, served with where it came from (`own` or `via`).
- Validation refuses: an unknown `via` or `field`, an `own` of another type, a name colliding with a column, link or reserved name. A lookup of a lookup is refused (one hop).
- A lookup of a relation column carries its target's title like any relation.

### 2. Read path
- `readRows` adds each lookup as one correlated subquery in the SELECT (`COALESCE(own, (SELECT field FROM target WHERE id = via AND deleted_at IS NULL))` for an inherited one), plus its source for an inherited one; `total` uses the same WHERE.
- `resolveKey` (filter), `hasColumn` (sort, group, saved views) and `orderOf` resolve a lookup key to that expression and the field's type.
- The related row is read only when live; the caller's scope applies to it (a lookup exposes a field, not only a title as `titlesOf` does).

### 3. Writes
- A write naming a plain lookup is 400, like an undeclared key.
- A write naming an inherited lookup is a write to its `own` column, through the writer and the lifecycle check like any write; the revision records `own`. Null makes it inherit again.

### 4. Who sees them
- Owners (sessions and link actors) are served a lookup only when the domain marks it `owner_visible`, as with columns; public views only through `visible_fields`, checked like a column.
- `/schema` serves each lookup with its type, label, `inherited` and the label of where it comes from; OpenAPI lists plain lookups read-only and inherited ones writable.

### 5. Theatre
- `activiteit` declares `links.mensen` (moved from the query) and the inherited lookup `locatie` above.
- The seeded "Planning" view on Activiteiten takes Dagplanning's columns; every view on Activiteiten, seeded or made by a user, in every skin, has Mensen and the inherited venue.
- The query `dagplanning` and its views are removed; `--seed-missing` removes its system views from existing databases (user views on it are reported, not silently dropped).
- Query `inherited` is removed from the engine once nothing declares it.

### 6. Queries in their own place
Queries stay for rows that are not one dataset's records — the website's Voorstellingen, `mijn_producties` for owners, step 3's conflicts. The grid's tree shows them in their own section, not under a dataset.

## Tests (summary)
- **Validation:** unknown `via`/`field`, `own` type mismatch, name collision, lookup of a lookup are refused.
- **Read:** a lookup's value on `/rows`; an inherited lookup's own value, its fallback value and its source; a deleted or out-of-scope related row yields null.
- **Filter, sort, group:** on a lookup, through `/rows` and saved views.
- **Write:** an inherited lookup's write lands on `own` and is revised; null inherits again; a write to a plain lookup is 400.
- **Who sees them:** an owner's rows and owner views never carry an unmarked lookup; a public view only when listed.
- **Theatre:** Planning on `activiteit` shows Mensen and the inherited venue and edits it; `dagplanning` is gone; `--seed-missing` on a step-2 database removes its system views and keeps user views.
- **Browser:** a new view made on Activiteiten offers Locatie (via Tourstop) and Mensen in its column picker; overriding the venue on one activity leaves the tourstop and its other activities unchanged.

## Scope against the spec of record
- `docs/SPEC.md`'s Dataset row gains `lookups` (with optional `own`); the Query row says queries are overviews that are not one dataset; query `inherited` goes.
- "Datasets are code. Admins create fields, views, templates and publications, never datasets" stands; lookups are code too.
- Out: rollups, write-through lookups, admin-created lookups.

## Questions for Stefan
1. **User views on Dagplanning.** A database may hold views someone made on Dagplanning. Recommended: `--seed-missing` lists them and leaves them until you delete them (their source is gone, so they show an empty-state message), rather than moving them onto Activiteiten automatically.
2. **Order of work.** Recommended: this first, then plandag/datum, then the calendar and kanban skins, then adding people from Planning into open slots.
