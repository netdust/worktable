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
- The writer's refusals stand and show as any write refusal does, for example the same person twice on one activity.
- Adding a person is one batch that one undo takes back. Removing is final, as every delete is (docs/SPEC.md, Revision). Removing a person whose state is not uitgenodigd first asks "Toewijzing van <naam> verwijderen?" (the word Toewijzing comes from the link's declared `item`), because adding them again starts at uitgenodigd.
- Source for the last point: Stefan's choice "No undo; confirm when not 'uitgenodigd'", 2026-10-07.
- State changes stay in the Toewijzingen matrix.
- A Toewijzing with only a free-text naam and no persoon is not a person. It shows as a grey tag with its naam and has no ×.
- Source: the quote above; tag content, Stefan's choice "Name + status colour", 2026-10-07.

**R3. The engine shape behind R2 is generic.** A query or dataset may declare a link column:
- `links: { label, item, dataset, key, target, state? }` (`item`: the word for one link, used in the grid's question before removing one): the rows of `dataset` whose `key` column equals this row's id.
- Each is served as `{ id, target, title, state }`. `title` is the target's title, or the link row's own title when it has no target.
- The engine reads them for a page of rows in one query per link column. It reads them through the caller's scope on the link dataset and through the target's title rule. An owner sees only the link rows its scope allows, and only the titles of their targets.
- Writes are not new. The grid creates and deletes link rows with the existing `POST /rows/<dataset>` and `DELETE /rows/<dataset>/:id`.
- On a dataset, `key` must be a relation to that dataset. On a query, the query must declare `creates`, and `key` must be a relation to that dataset: a query that declares `creates` promises that its `id` is the id of a row of that dataset.
- A link column is shown and kept in a saved view like a column. It is not sortable, groupable or filterable, and a published view leaves it out.
- The engine knows no domain word for this. Theatre declares `mensen: links { dataset: toewijzing, key: activiteit_id, target: persoon_id, state: state }` on Dagplanning.
- Source: invented, to meet R2 without a domain word in the engine; approval pending with this spec.

**R4. The period is a filter.** The week control leaves the toolbar. Every source with a date column gets a "Periode" chip in the filter bar. It is always there and cannot be removed, the way the scope chip cannot.
- The chip shows the current period and has ‹ › to step. Its menu offers Deze week, Volgende week, Deze maand, Alles and Van–tot (two dates).
- The default is the current week. Alles is offered only in the table skin; the matrix needs a bounded period.
- The period stays in the URL (`from`, `to`, or `period=all`), so a reload keeps it. A URL with only `from` still means that week. The period is not saved in a view.
- ‹ › steps by the period's shape: a week by a week, a calendar month by a month, any other range by its length.
- A matrix opened while the period is Alles shows the current week.
- "Geen rijen" in an empty result names the period and sits centred in the grid.
- Source: the quote above; default and presets, Stefan's choice "Date filter, default this week", 2026-10-07.

**R5. A query's views sit under the data model it reads.** The sidebar lists only data models. Each model folds out to its own views, then the views of every query over it, each with the query icon.
- Theatre: Dagplanning, Per productie per dag and Voorstellingen all sit under Activiteiten, in that order.
- A query without `of` stays a node of its own (fiche's query is one). A query's own label and icon are no longer reachable from the rail: the model's `…` menu acts on the model. Dagplanning leaves the Planning section, and the other two leave the bottom of the rail.
- The engine shape: a query declares `of: <dataset>`. Validation refuses an unknown dataset, and a section that lists a query. `/schema` serves `of`.
- "+ Weergave" on a model makes a view on the model itself. A new view on a query starts as a copy of one of its views (`…` → Kopie maken).
- Source: Stefan, 2026-10-07: "they are query views of activiteiten en should be listed under the activiteiten tab"; the tree shape: "that schema seems correct yes".

**R6. Speelreeks is shown as Tourstop.** The dataset's label, the add button, the column on an activity, the inherited hint ("via tourstop"), the seeded view and the writers' messages say Tourstop. In Planning, Tourstops comes first.
- The internal name stays `speelreeks`.
- Source: Stefan, 2026-10-07: "ok, Tour stop... call it that, speelreeks a bad translation"; "in the sidebar a tourstop comes before activities". Built on this branch before the plan's tasks.

## Out
- Changing a Toewijzing's state from Dagplanning: it stays in the matrix (Stefan's choice).
- Free-text (naam) people added from Dagplanning.
- People columns on other views. The shape allows them; only Dagplanning declares one now.
- A filter builder with operators (contains, before, …). Not asked for.

## Proposed docs/SPEC.md lines (shown to Stefan before commit)
- Query row and Dataset row: "may declare `links: { label, item, dataset, key, target, state? }`: a column holding the rows of `dataset` whose `key` is this row's id, served as `{ id, target, title, state }`, read through the caller's scope on that dataset. They are written with that dataset's own create and delete. On a query, `key` must relate to the dataset the query `creates`, and a query that declares `creates` promises that its `id` is that dataset's id. A link is shown and saved in a view like a column, never sorted, grouped, filtered or published."
- Skin needs / Sidebar: "the period is a filter chip over the declared date column, with the window in the URL; Alles only where the skin allows an unbounded read."
