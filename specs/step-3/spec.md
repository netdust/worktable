# Step 3: queries, views on queries, Persoon_rol

The spec of record is `docs/SPEC.md` at `8768723`. The design is in `specs/step-3/findings.md` (approved 2026-10-12). This file lists step 3's requirements, each with its source. "Brief" means Stefan's step 3 brief of 2026-10-12, relayed verbatim by the orchestrator. "Findings" means `findings.md` as approved, with its six answers.

## Engine shapes

- **R1 Options from a query (F1).** A relation column or relation action input may declare `options_from: { source, match, value }`. Its picker lists the `value` records of the `source` query's rows whose `match` columns equal this row's, in the query's order, read in the caller's scope. Validation refuses an unknown query, a `value` that is not a relation of the query to the same target, and a `match` column missing on either side. The writer still judges the value.
  Source: brief, "F1 Candidates option source. A relation input whose options come from a query filtered by the current record, declared generically." Key name: findings, as amended (orchestrator, 2026-10-12).
- **R2 Lookups on datasets with owners (F2).** They are served to editors and administrators. Under any other scope, the row carries no lookup value, `/schema` serves none, and a filter or sort on a lookup is refused. `owner_visible: true` on a lookup is allowed only when its `field` is owner-visible and an owner can read its target dataset. Only such a lookup may appear in a view for owners.
  Source: brief, "F2 Lookups on owner datasets, per specs/virtual-columns/future-lookups-on-owners.md, served to editors and administrators only and never to owner actors, unless the lookup is owner-visible under the rules in that file."
- **R3 Calendar skin (F3).** Skin need `calendar: { day, start?, end?, lanes }` on a dataset or query. A saved view may take skin `calendar` when its source declares one, with `group_by` one of `lanes`. The grid shows month and week, places rows on `day`, and shows a row without `start` as all-day. It is read-only: an event opens the row.
  Source: brief, "F3 Calendar skin. A view skin on a declared date column (and end column where present), month and week, grouped by a declared lane relation (person or production). Untimed rows are all-day. Read-only in v1, no drag."
- **R4 Badge column (F4).** `badge: <tone>` on an integer column. The grid shows a tinted count above 0 and nothing at 0.
  Source: findings F4, approved 2026-10-12 ("including F4 (the badge column)").

## Theatre data and rules (3a)

- **R5 Persoon_rol.** Columns `persoon_id`, `rol_id`, `dagtarief`, `uurtarief` and `voorkeur`. One row per person and role. Only an administrator writes `dagtarief` and `uurtarief`.
  Source: brief, "Persoon_rol (rates per role; rate columns admin-only through the writer)".
- **R6 soort on Beschikbaarheid.** Values are afwezig · onzeker · beschikbaar · voorkeur. The default is afwezig, added by ALTER. There is no `organisatie_id`.
  Source: brief, "soort on Beschikbaarheid (afwezig · onzeker · beschikbaar · voorkeur)"; findings answers 5 and 6.
- **R7 Taak.** Columns `titel`, `deadline`, `toegewezen_aan` → Persoon, `gekoppeld_aan` (productie · speelreeks · activiteit · organisatie), `record_id`, `status` (open · gedaan) and `notitie`.
  Source: brief, "Taak"; SPEC Taak row.
- **R8 conflicten.** Six types: overlap, afwezig, onzeker, open_slot, onbevestigd and locatie_dubbel. Each row carries `ernst` (conflict · waarschuwing). The untimed rule is in SPEC Conflict types. Name-only assignments count toward nothing. werktijd comes in step 7.
  Source: brief, "the conflicten query with six types (werktijd moves to step 7) … Untimed rule: logistics soorten (maaltijd, overnachting, reis) never conflict; two timed activities overlapping conflict; two untimed work activities on one day are a warning. Name-only assignments count toward nothing."; findings answers 1 and 2.
- **R9 kandidaten.** One row per open slot × candidate. A candidate holds the slot's rol in Persoon_rol and is active. Excluded: anyone afwezig over the activity, anyone already assigned to it, and anyone with a timed overlap. Ranked by voorkeur, then rate.
  Source: brief, "kandidaten"; the gate, "excludes anyone afwezig or already assigned"; SPEC queries row.
- **R10 werklijst.** One row per person × to-do: open Taak, open slots inside the horizon, invitations unanswered past the deadline, and activities still optie inside 14 days. `status` writes back to Taak. The registrations item comes in step 6.
  Source: brief, "werklijst"; orchestrator answer 2, 2026-10-12.

## Views (3b)

- **R11 persoon_dag and locatie_dag.** Query views, as in SPEC. `state` on persoon_dag writes back to Toewijzing. Each carries a `conflicten` badge count.
  Source: brief, "Scope, 3b (views): persoon_dag, locatie_dag, the company week, the calendar skin on them, and the Conflicten view with its badge on rows"; findings answer 3.
- **R12 Seeded views.** A Conflicten view; a person calendar (persoon_dag, laned by person); a venue calendar (locatie_dag, laned by locatie); the company week (productie_dag on the calendar skin, laned by production).
  Source: brief, as R11; SPEC queries row "productie_dag … Company week across productions".

## Gate

- **G** An open slot's picker lists candidates and excludes anyone afwezig or already assigned. The Conflicten view lists all six types from seeded data. A person calendar and the company week open on the calendar skin. A badge appears on a conflicting row and disappears when fixed. The untimed rule's counts on the real copy are reported, not asserted.
  Source: brief, "Gate".

## Out

werktijd, Publication, Field, the board skin, any website page (brief). Plan-side cost (`bedrag_gepland`) is pending Stefan's confirmation; this plan leaves it out (orchestrator, 2026-10-12, question 1).
