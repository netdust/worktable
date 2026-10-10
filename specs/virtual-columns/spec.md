# Step 2b: lookup columns on datasets

Branch `feature/virtual-columns`, rebased onto the parked `feature/one-planning` (9eedc13..71d18d0: one Planning view, fewer seeded views, parity counted from activiteit, served view order, e2e flows addressed by view name). Design: `specs/virtual-columns/findings.md` (4d1b7c8), approved by Stefan 2026-10-10 ("approved, do the spec edit and write the plan"). Spec of record: `docs/SPEC.md` at 117e29a.

## Requirements

**R1. Lookups, a dataset shape.**
- `DatasetDecl.lookups?: Record<string, { label, via, field, own?, from? }>`, never inside `columns`.
- The value is the `field` of the live row `via` names, computed on every read. With `own`, it is `own` when set, else the related field (inherited).
- `via` is a relation column; `field` a non-json column of its target; `own` a column of this dataset with `field`'s type and relation; a lookup name is not a column's or a link's; a dataset with `owners` declares none.
- Source: Stefan, "relational we have, then we need lookup columns. this way a domain can define everything with columns"; "ok do inherited"; findings §1.

**R2. Read like a column.**
- `/rows` serves each lookup on the row under its name; a relation-typed one also under `lookups` with the target's title; `inherited: [name]` lists the inherited lookups whose value came through the relation.
- Filter, sort, group and saved views accept a lookup key; `/schema` serves `lookups` with type, options, tones and relation taken from `field`, plus `inherited` and `from`.
- Source: Stefan, "the filter can work on these virutal columns ?"; findings §2, §4.

**R3. Writes.**
- A plain lookup in a write body is dropped like a read-only column.
- An inherited lookup in a write body is written to `own`, through the writer and the transition check, revised under `own`; null inherits again. A body naming both the lookup and its `own` is 400.
- Source: Stefan, "ok do inherited" (an override on the record, never a write to the related record); findings §3.

**R4. The grid.**
- Lookups are fields of the dataset's model: shown in the column picker, rendered as their field type, read-only unless inherited; an inherited value shows greyed with "via <from>".
- Filter, sort and group work on them; an inherited one edits the activity's own value.
- Source: Stefan, "if i create a new view from 'activiteiten' … thé view to use"; findings §6.

**R5. Theatre: one Planning on Activiteiten.**
- `activiteit` declares `links.mensen` and `lookups.locatie = { via: 'speelreeks_id', field: 'locatie_id', own: 'locatie_id', from: 'Tourstop' }`.
- The seeded Planning view is on `activiteit` with Dagplanning's filter, sort, group and columns (the lookup in place of `locatie_id`). The `dagplanning` query is removed.
- `--seed-missing` names every live view whose source is no longer declared and leaves it (findings question 1, recommended answer approved).
- Source: Stefan, "if dagplanning is the better one, but then planning should not exist and every view should be created from dagplanning"; findings §5.

**R6. Queries are overviews.**
- A section may list a query without `of`. Theatre drops `of` from its remaining queries and lists them under their own section, "Overzichten".
- Query-column `inherited` is removed from the engine and the grid.
- Source: Stefan, "we keep queries for something else"; findings §6; `docs/SPEC.md` (117e29a).

## Out
Rollups, write-through lookups, lookups of lookups, admin-created lookups, removing `of` from the engine, lookups on datasets with `owners`.

## Done when (step 2b's gate, in a browser, on invented fixtures)
1. A view made new on Activiteiten offers "Locatie" (the inherited lookup) and Mensen in its column picker and shows both.
2. Overriding the venue on one activity leaves its Tourstop and the Tourstop's other activities unchanged; clearing it shows "via Tourstop" again.
3. The venue filters, sorts and groups.
4. The tree shows no Dagplanning; the remaining queries sit under Overzichten.
