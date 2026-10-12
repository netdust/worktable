# Step 3: findings, before any code

Stefan, 2026-10-12 (the step 3 brief): "Findings (stop for approval): F1 Candidates option source … F2 Lookups on owner datasets … F3 Calendar skin." Scope 3a: Persoon_rol, soort on Beschikbaarheid, Taak, conflicten with six types, kandidaten, werklijst, the untimed rule. Scope 3b: persoon_dag, locatie_dag, the company week, the calendar skin on them, the Conflicten view with its badge on rows. Out: werktijd, Publication, Field, the board skin, any website page.

**Decision (Stefan via the orchestrator, 2026-10-12):** approved as filed, F4 included; all six questions on the recommended answers. While planning, F1's key became `options_from`, because `options` already names a column's select options (approved by the orchestrator).

Read against `docs/SPEC.md` and the source at `6c76f6b` (main `3997cb5` plus the spec-additions commit). Nothing here is built.

## What exists

- **Pickers.** `RelationPicker` reads every row of the target model (`api.ts` `records` → `everyRow`) and narrows titles in the browser. A relation cell and an action's relation input (`Drawer.tsx`; `vul_slot`'s `persoon_id`, `actions.ts`) both use it. Nothing can narrow the options per row.
- **Lookups.** One hop, plain or inherited (`LookupDecl`). `validate.ts` `checkLookups` refuses them on a dataset with `owners`; the two leaks are pinned by `packages/engine/test/lookups-privacy.test.ts` (`specs/virtual-columns/future-lookups-on-owners.md`).
- **Skins.** The engine serves `table` and `matrix` only (`views.ts` `skinOf`, `ViewFields`); `saved_view.skin` already lists `calendar`, `list` and `board` as options. Skin needs carry `date` only. The grid has `ViewType = 'grid' | 'matrix'`.
- **Theatre.** Datasets: organisatie, productie, activiteit, persoon, toewijzing, beschikbaarheid (`persoon_id`, `start_at`, `eind_at`, `reden`: no `soort`, no `organisatie_id`), rol, speelreeks, sjabloon. Queries: `productie_dag`, `voorstellingen`, `mijn_producties`. No Persoon_rol, Taak, persoon_dag, locatie_dag, conflicten, kandidaten or werklijst. The organisation parameters hold no warning horizon or confirmation deadline yet.

## F1. Candidates option source

**The need.** On an open slot, the person picker lists who can fill it: the kandidaten query's rows for that slot, never the whole Persoon table.

**Smallest design.**
- A relation column, or a relation action input, may declare `options_from: { source: <query>, match: { <query column>: <this row's column> }, value: <query column> }`. Validation checks that the source is a declared query, that `value` is a relation column of it to the same target, and that every `match` column exists on both sides.
- `/schema` serves the declaration. The picker then reads `GET /rows/<source>?filter={<query column>: <row value>}` under the reader's own scope and lists each row's `value` record in the query's order (kandidaten ranks by voorkeur, then tarief). The title comes from the row's relation title, as today.
- Theatre declares it on `vul_slot`'s `persoon_id` input and on `toewijzing.persoon_id`, with `match: { toewijzing_id: id }`, `value: persoon_id`.
- The writer still decides. The picker narrows, it never authorises: a PATCH naming a non-candidate goes through `refuse()` as it does today.

**Threats.** Read only, under the caller's scope; it adds no route. An owner never gets a picker on Toewijzing. kandidaten ranks on rates without serving them as columns, so an editor reads the order and not the rate.

**Tests.** Validation refuses a bad `options` (unknown query, wrong target, missing match column). A grid unit test: the picker requests the filtered query and lists its rows in order. The e2e gate: an open slot's picker lists candidates and leaves out the person who is afwezig and the person already assigned.

## F2. Lookups on owner datasets

**The need.** Views on Toewijzing and Beschikbaarheid show the activity's date, times and production beside each row. Both declare `owners`, so a lookup is refused today.

**Smallest design.** As `future-lookups-on-owners.md` lists:
- A lookup on a dataset with `owners` is served to editors and administrators only. Under any scope other than `all`, `filter.ts` `resolveKey` and `rows.ts` `orderOf` refuse a lookup key, closing the filter oracle.
- A lookup may declare `owner_visible: true` only when its target field is `owner_visible` and the owner can read the target dataset. Validation checks both. `holdKeys` and `forOwnersProblem` accept such a key and nothing else.
- Theatre: Toewijzing gets `datum`, `start_at` and `eind_at` through `activiteit_id`, plus `productie` through the activity. None is owner-visible in v1, because an owner does not read Activiteit as a dataset.
- A spec line replaces "A dataset that declares `owners` declares no lookups".

**Threats.** The two leaks the probes already pin. The tests flip from "refused at validation" to "refused under owner scope".

**Tests.** `lookups-privacy.test.ts` extended: an owner's filter and sort on a lookup key give 400; an owner's row carries no lookup value; an owner-visible lookup on a non-owner-visible field is refused at validation; the owner-view leak script finds no lookup key.

## F3. Calendar skin

**The need.** A person calendar (persoon_dag), a venue calendar (locatie_dag) and the company week, in month and week, grouped by a lane.

**Smallest design.**
- Skin need `calendar: { day: <date column>, start?: <datetime column>, end?: <datetime column>, lanes: <relation column>[] }` on a dataset or query. `day` is the column the calendar places a row on: `plandag`, so a 01:00 strike stays on its show's day, as every other view does. A row with no `start` is all-day.
- `skinOf` accepts `calendar` where the source declares it. A saved view on the calendar skin stores its lane in `group_by`, which must be one of `lanes`. A month or week window is the existing filter (`$period` or a date range on `day`), so the engine adds no route.
- The grid gets a third view type: a read-only month and week grid, lanes as rows in week view and as a filter in month view. Clicking an event opens the existing drawer. No drag and no create from a cell.

**Threats.** None new. It reads `/rows` under the caller's scope.

**Tests.** Validation refuses a calendar with no `day`, with a lane that is not a relation, or with a `group_by` outside `lanes`. Grid unit tests place a timed event, an untimed (all-day) event and a 22:00–01:00 event on the right day. The e2e gate: a person calendar and the company week open on the calendar skin.

## F4, beyond the brief: the conflict badge

The brief asks for "the Conflicten view with its badge on rows". Nothing in the engine or the grid can show a computed count on a row today. **The engine's surface grows beyond F1–F3 by this one item.**

**Smallest design.**
- A column may declare `badge: <tone>`: an integer column the grid shows as a small tinted count when above 0, and not at all at 0.
- Query views only. persoon_dag and locatie_dag carry a `conflicten` column counted from the conflicten query, so the badge is SQL and goes away on the next read once a conflict is fixed.
- A dataset view (Toewijzingen, Planning) gets no badge. That would need a per-row count from another source, a bigger shape. See question 3.

**Tests.** Validation allows `badge` only on an integer column. A grid unit test: no badge at 0. The e2e gate: a badge on a conflicting persoon_dag row, gone after the conflict is fixed.

## Domain work (theatre only, no engine change)

- **Persoon_rol:** `persoon_id`, `rol_id`, `dagtarief`, `uurtarief`, `voorkeur`. The writer refuses the rate columns for anyone but an administrator, and so does Rol's writer for its rates. Plan-side cost (`bedrag_gepland`) moves to step 6, beside the actual side; confirmed by Stefan on 2026-10-12, though the Oct 9 revision had put it in step 3.
- **Beschikbaarheid.soort:** `afwezig · onzeker · beschikbaar · voorkeur`. The existing rows need a value; see question 5. `organisatie_id` (an organisation row covering its people) is in the SPEC row but not in the brief; see question 6.
- **Taak:** `titel`, `deadline`, `toegewezen_aan` (→ Persoon), `gekoppeld_aan` (an option: productie · speelreeks · activiteit · organisatie), `record_id` (an integer, not a relation, because the engine has no polymorphic relation), `status` (open · gedaan), `notitie`.
- **Parameters:** the own organisation's `waarschuwingshorizon_dagen` and `bevestigingstermijn_dagen`, seeded, read by conflicten and werklijst.
- **Queries:** persoon_dag, locatie_dag, conflicten (six types: overlap, afwezig, onzeker, open_slot, onbevestigd, locatie_dubbel), kandidaten, werklijst. The company week is a calendar view on `productie_dag`, which exists, laned by production.
- **Spec edits** (in the spec commit): "seven types" becomes six, with werktijd moved to step 7; step 3's acceptance row is replaced by the brief's gate; the untimed rule goes into the Conflict types table.

## The untimed rule, counted on the real copy

Read-only (`bun:sqlite`, `readonly: true`) on `~/laika-export/step2-copy.db`, counts only. The copy holds 290 live activities (the step-0e import had 246; later shake-outs added rows), 122 of them untimed. Of the assignments, 383 are bevestigd, 108 uitgenodigd, 13 voorlopig, 12 open and 4 geweigerd; 30 bevestigd rows are name-only.

Same person, same `plandag`, pairs of different activities, cancelled activities left out, name-only rows left out:

| Pair kind | Bevestigd only | Voorlopig, uitgenodigd or bevestigd |
| --- | --- | --- |
| A logistics soort involved (never a conflict) | 274 pairs, 14 people, 14 days | 445 pairs, 14 people, 18 days |
| Both timed, overlapping (conflict) | 0 | 0 |
| Both timed, apart | 0 | 8 pairs, 8 people, 1 day |
| Both untimed work (warning) | 0 | 0 |
| One timed, one untimed work (no rule yet) | 0 | 5 pairs, 5 people, 1 day |

Beschikbaarheid: 12 rows over 4 people. 2 assignments overlap one of them (1 bevestigd, 1 voorlopig).

**Reading.** The logistics exclusion carries the whole rule. Without it, the real copy would show hundreds of false conflicts. With it, the copy shows no conflict and no warning on confirmed work. The carry-over's 90 untimed pairs were almost all logistics.

## Questions for Stefan

1. **The overlap's states.** SPEC says "two confirmed Toewijzingen"; the brief says "two timed activities". Recommended: count voorlopig, uitgenodigd and bevestigd, because a planner wants the clash before the invite goes out. On the copy that changes nothing for timed overlaps.
2. **A timed and an untimed work activity on one day** (5 pairs on the copy). Recommended: a warning, the same as two untimed ones. Both are a same-day clash the times cannot settle. The overlap type gets an `ernst` column (conflict · waarschuwing), as onzeker already is a warning, so the six types stay six.
3. **The badge on dataset views.** Recommended: in v1 the badge is on persoon_dag and locatie_dag (F4 as written). The Toewijzingen matrix and the Planning get none until a domain needs it.
4. **F1 on a slot with no candidate** (the real copy has no Persoon_rol rows yet, so every slot's list starts empty). Recommended: the picker shows candidates only, and below them one line "Iedereen tonen", which switches to the plain picker. Filled rows keep the plain picker.
5. **soort on existing Beschikbaarheid rows.** Recommended: default `afwezig`, because Laika's rows are absences. `--seed-missing` migrates it by `ALTER` with that default.
6. **organisatie_id on Beschikbaarheid** (SPEC: "an organisatie row covers all its people"). It is not in the brief. Recommended: leave it out of step 3 and remove it from the SPEC row in the spec commit, unless you want it now.

## Counts after the build (2026-10-12)

`bun scripts/conflict-counts.ts ~/laika-export/step2-copy.db`. The script works on a temporary 0600 copy, migrated with the step-3 declarations and then deleted; the source file's mtime and size were the same before and after. Counts only. They are reported, not asserted (gate G).

| type · ernst | rows | people | days |
| --- | --- | --- | --- |
| afwezig · conflict | 2 | 1 | 2 |
| open_slot · conflict | 6 | 0 | 3 |
| overlap · waarschuwing | 5 | 5 | 1 |

Same-day pairs left out as logistics: 445. No timed overlap. No onzeker row, because every existing Beschikbaarheid reads `afwezig`. No locatie_dubbel.

These match the counts taken before the build. The 5 overlap warnings are the 5 timed + untimed work pairs; the 2 afwezig rows are the 2 assignments that overlap an absence.

**onbevestigd is 0 only because of the date.** The rule counts an invitation made at least `bevestigingstermijn_dagen` (7) days ago, and the copy's 108 uitgenodigd rows date from the 2026-10-06 import (`created_at`, no revision). From 2026-10-13 all 108 count as onbevestigd. Some of them came from Laika's `maybe` status, which step 0e mapped to uitgenodigd ("a planner skims that list before cutover").
