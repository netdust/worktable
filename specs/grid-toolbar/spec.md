# Grid toolbar: fewer words, a real filter, history and sharing

Branch `feature/grid-toolbar`, cut from main at 56240dd. The approved look is in `design/grid-prototype.html` (commit 5714046).

## Why
Stefan, 2026-10-08, looking at the toolbar and the filter bar:
> "there's 'gewijzigd', 'opslaan', 'opgeslagen'... none of them are useful. if we have a history of changes, a icon button for that is useful and export (or share)"
> "periode should be a filter, not something that's always on and visible"
> "the sort pill 'start', should be removed. a blue arrow in the table header itself can indicate what column is used and what direction"
> "kolommen can be aligned to the right, only an icon"
> "the filter has to be more complex. if we have long lists 'soort', 'locatie' etc... it's an endless scroll. it should also allow for IS, IS NOT, CONTAINS etc"
> "if you can style the scrollbars a little bit? more minimal"

## Requirements

**R1. The title line holds no save words.**
- "gewijzigd", "Opslaan" and "Opgeslagen" leave the title line.
- A cell edit shows nothing while it saves. Only a refused or failed write shows, as it does today.
- Source: the first quote.

**R2. A view saves itself.**
- A change in filters, columns, widths of the stored kind, grouping or sorting on one's own view is stored at once.
- On a view one cannot change (a starting view, a colleague's), the change stays in this browser. "… → Kopie maken" keeps it as one's own view.
- Source: Stefan's choice "Own views save automatically", 2026-10-08.

**R3. Geschiedenis.**
- An icon button in the title line opens a panel with the recent changes to the records this view shows, newest first.
- Each entry says who changed what and when: the row's title, the column, the old and new value (a relation by its title), and creations.
- A change the caller made, of a kind the engine can undo, shows "Ongedaan maken", which runs the existing batch undo. Anyone else's change, a deletion or an import has no undo.
- The panel reads only what the caller may read, through the same scope as the rows. A person account sees no colleague's email; it sees "planning" for others and "jij" for itself.
- A computed view has a history only when the query declares `creates` (its row id is that record's id). Its entries are those of the created dataset, limited to the columns the query writes.
- Deletions are not listed: a deleted row is no longer in the view, so it cannot be found by the view's rows. This was not asked for; "creates and deletes" was the first draft's wording.
- Source: the first quote; scope from Stefan's choice "Recent changes to this view's records", 2026-10-08.

**R4. Exporteren / delen.**
- An icon button in the title line opens a menu:
  - Excel, the current export moved here;
  - Agenda (.ics), the view's dated rows as calendar events;
  - Link kopiëren: the address with the view and its conditions. Whoever opens it sees those conditions in this browser, as a change they did not save. Their own view saves only once they change something themselves.
  - Publiceren, the existing public link, for administrators only.
- Source: the first quote; contents from Stefan's choice of all four, 2026-10-08.

**R5. The period is an ordinary filter.**
- The always-on Periode chip leaves.
- A date column takes the conditions: is deze week, is volgende week, is deze maand, ligt tussen (two dates).
- Such a condition is a chip with × like any other, stored in the view and resolved at read time, so "deze week" moves with the calendar.
- Dagplanning's starting view begins with "Plandag is deze week". Other views begin without a period.
- A matrix still needs a bounded period: without a date condition it reads the current week.
- Source: the second quote; the default from Stefan's choice, 2026-10-08.

**R6. Sorting lives in the column header.**
- The sort chip leaves the bar. The sorted column's header shows its arrow in the accent colour.
- Clicking a header sorts by it, as it does today.
- Source: the third quote.

**R7. Kolommen is an icon at the right of the bar**, beside the row count.
- Source: the fourth quote.

**R8. A filter builder.**
- Filter opens a list of conditions, each one row: field · operator · value. Conditions combine with "en".
- The operators by field type:
  - choice and relation: is (one or more values), is niet, is leeg, is niet leeg;
  - text: bevat, bevat niet, is, is leeg;
  - yes/no: is ja, is nee;
  - date: as R5.
- A choice or relation value is picked in a box that searches as one types and lists only what is not chosen yet, as the people box does.
- Each condition is a chip in the bar: "Locatie is Zaal Kompas of CC De Vlinder" with ×.
- The engine gains what "bevat" needs on a text column: a case-insensitive substring match whose value is bound, never pasted into SQL. Nothing else in the filter language changes.
- Source: the fifth quote.

**R9. Minimal scrollbars** in the grid app: thin, no arrow buttons, a quiet thumb that darkens on hover, in both themes.
- Source: the sixth quote.

## Out
- Or-groups of conditions ("of" between rows): not asked for.
- Filtering on a link column (Mensen): links are not filterable (dagplanning R3).
- Undoing someone else's change from the history: the engine refuses it (403), by design.
- Changes to linked rows (Mensen) in a view's history: they live in another dataset. Their own view (Toewijzingen) has them.
- "is niet" and "bevat niet" both leave out empty cells, as the database's NOT IN does. Showing empty cells is "is leeg".
