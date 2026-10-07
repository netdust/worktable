# Dagplanning: people, editing and the period as a filter

Branch `feature/dagplanning`, cut from `feature/grid-ux` at 2c3f733 (grid-ux is not merged yet).

## Why
Stefan, 2026-10-07, after the grid-ux shake-out:
> "dagplanning: these are also activities, so people are attached, but they are not showing. i can't change any of the values either? for people, i would like to see a multiselect dropdown and selected people as tags"
> "I think the week selector at the top is not correct. it shouldn't be there, this can be a filter"

The third point, "the filter is not working at all" (a Locatie filter in Dagplanning left no rows), was a bug. It was fixed on grid-ux in 2c3f733: a numeric text filter now matches a view's computed integer column.

## Requirements

**R1. Dagplanning's own columns can be edited.** Omschrijving, Soort and Locatie in Dagplanning write to the activity, like Start, Einde and Status already do.
- Locatie writes the activity's own venue. A venue picked in Dagplanning becomes the activity's own and loses its grey "via speelreeks". Clearing it falls back to the speelreeks' venue, which shows grey again.
- Source: the quote above; for Locatie, Stefan's choice "Sets the activity's own venue", 2026-10-07.

**R2. People as tags.** Dagplanning shows a "Mensen" column. It holds one tag per person assigned to the activity: a live Toewijzing that has a persoon.
- Each tag shows the person's name and is coloured by the Toewijzing's state (the state column's own tones: uitgenodigd amber, bevestigd green, geweigerd and geannuleerd red).
- Editing the cell opens a multiselect dropdown of people with a search. Picking a person creates a Toewijzing for that activity through the Toewijzing writer, in its default state (uitgenodigd). The tag's × removes that Toewijzing through the writer, as a delete.
- The writer's refusals stand and show as any write refusal does, for example the same person twice on one activity. Each add or remove is one batch that one undo takes back.
- State changes stay in the Toewijzingen matrix.
- A Toewijzing with only a free-text naam and no persoon is not a person. It shows as a grey tag with its naam and has no ×.
- Source: the quote above; tag content, Stefan's choice "Name + status colour", 2026-10-07.

**R3. The engine shape behind R2 is generic.** A query or dataset may declare a link column:
- `links: { dataset, key, target, state? }`: the rows of `dataset` whose `key` column equals this row's id.
- Each is served as `{ id, target, title, state }`. `title` is the target's title, or the link row's own title when it has no target.
- The engine reads them for a page of rows in one query per link column. It reads them through the caller's scope on the link dataset and through the target's title rule. An owner sees only the link rows its scope allows, and only the titles of their targets.
- Writes are not new. The grid creates and deletes link rows with the existing `POST /rows/<dataset>` and `DELETE /rows/<dataset>/:id`.
- The engine knows no domain word for this. Theatre declares `mensen: links { dataset: toewijzing, key: activiteit_id, target: persoon_id, state: state }` on Dagplanning.
- Source: invented, to meet R2 without a domain word in the engine; approval pending with this spec.

**R4. The period is a filter.** The week control leaves the toolbar. Every source with a date column gets a "Periode" chip in the filter bar. It is always there and cannot be removed, the way the scope chip cannot.
- The chip shows the current period and has ‹ › to step. Its menu offers Deze week, Volgende week, Deze maand, Alles and Van–tot (two dates).
- The default is the current week. Alles is offered only in the table skin; the matrix needs a bounded period.
- The period stays in the URL as today (`from`, `to`), so a reload keeps it. It is not saved in a view.
- "Geen rijen" in an empty result names the period and sits centred in the grid.
- Source: the quote above; default and presets, Stefan's choice "Date filter, default this week", 2026-10-07.

## Out
- Changing a Toewijzing's state from Dagplanning: it stays in the matrix (Stefan's choice).
- Free-text (naam) people added from Dagplanning.
- People columns on other views. The shape allows them; only Dagplanning declares one now.
- A filter builder with operators (contains, before, …). Not asked for.

## Proposed docs/SPEC.md lines (shown to Stefan before commit)
- Query row and Dataset row: "may declare `links: { dataset, key, target, state? }`: a column holding the rows of `dataset` whose `key` is this row's id, served as `{ id, target, title, state }`, read through the caller's scope on that dataset. They are written with that dataset's own create and delete."
- Skin needs / Sidebar: "the period is a filter chip over the declared date column, with the window in the URL; Alles only where the skin allows an unbounded read."
