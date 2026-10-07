# Grid UX: the grid after the prototype

Branch `feature/grid-ux`, from main after step 1. The design is `design/grid-prototype.html` (approved by Stefan on 2026-10-07: "this looks amazing. can you build the grid like this?").

## Requirements

### R1. The production switcher (an engine `space`)
- **Engine:** a domain may declare `space: { dataset }`, the dataset whose records split the work (theatre: `productie`). A dataset or query may declare `scoped: '<relation column>'`, the column that points at the space (theatre: `productie_id` on `activiteit`, `speelreeks`, `dagplanning` and `productie_dag`). Validation refuses a `scoped` column that is not a relation to the space dataset. `/schema` serves `space: { model, field }`, and per source `space: 'scoped' | 'global'`. The engine never filters by space: the grid adds `{ <field>: <id> }` to the rows filter it already sends. A space is a view filter, not access control.
- **Grid:** the rail's top-left shows the switcher, using the existing `SpaceSelect` and `useSpace`:
  - the selected production's name and a dot;
  - a searchable list of the space's records;
  - "Alle producties", which removes the scope.
- **Remembering:** the selection is kept per browser, as `useSpace` already does.
- **Scoped views:**
  - they show only the selected production's rows;
  - the scoped column's filter chip is hidden;
  - a new row gets that production pre-filled;
  - a scoped view is never asked to "choose a space" when "Alle producties" is selected.

Source: "the project selector top left is gone. here we should be able to select which production/project we are looking at so bring it back"; Stefan chose the engine `space` shape (2026-10-07).

### R2. The sidebar: a tree of data models and their views
- **Tree:** every source the caller can read is a node.
  - A dataset has a table icon and a query has a query icon.
  - On hover, or keyboard focus, the icon turns into the fold chevron.
  - Clicking a node folds it open or shut. Open nodes are remembered per browser.
  - Under an open node sit its saved views, each with its kind's icon:
    - a lock for a read-only (seeded) view;
    - a person icon for one's own unshared view.
  - The active view is highlighted.
- **Sections:** a source may declare `section: '<label>'`, and the tree groups by it, in declaration order.
  - Theatre:
    - Planning: Dagplanning, Activiteiten, Speelreeksen, Toewijzingen, Afwezigheden;
    - Gegevens: Producties, Personen, Organisaties;
    - Instellingen: Rollen, Sjablonen.
  - Undeclared sources go under one section without a label.
- **`+` on hover:** a menu of view kinds.
  - Grid always.
  - Matrix where the source has a matrix.
  - Kalender and Bord shown disabled, marked "later".
  - Choosing one opens the new-view dialog.
- **New-view dialog:**
  - a name, pre-filled with the kind's name;
  - "Wie mag ze aanpassen": Het team (shared) or Alleen ik (personal), with a one-line hint;
  - the source, and the scope when a production is selected;
  - Cancel and Weergave maken. The new view opens and appears in the tree.
- **`…` on a view:** today's actions:
  - Kopie maken (always);
  - Naam wijzigen, Delen with or Niet meer delen, and Verwijderen, only when the view is editable.

  Deleting keeps today's notice with Undo.
- **Kept as they are:**
  - drag ordering;
  - the accessible names `navigation "Views"` and `More actions: <name>`;
  - the rail foot: account, sign out, theme, and the density setting from R4.

Source: Stefan's NocoDB references (2026-10-07): "the datamodel has a tree of views, rolling over the datamodel reveals + and ... menu"; "in nocodb, the icon becomes the collapse arrow on rollover". The theatre section names and order are invented (approval pending).

### R3. The title line
- One line:
  - the view kind's icon;
  - the view name;
  - a lock with the tooltip "Standaardweergave: maak een kopie om aan te passen" on a read-only view;
  - a summary such as "21 rijen · 3 groepen".
- No breadcrumb line: the rail shows the production and the model.

Source: Stefan: "this also is not good, dagplanner shouldn't drop like that" (2026-10-07).

### R4. The grid's look
- **Typography:** IBM Plex Sans for the interface and IBM Plex Mono for times and numbers, self-hosted with the grid. No request to Google.
- **Theme:** the prototype's tokens become `theme.css`:
  - the light palette;
  - a layered dark palette (canvas, surface, card);
  - `--color-bg-selected` and `--color-bg-hover`.

  The `#root` scoping stays.
- **Rows:** default height 40px.
- **Density setting:** Compact (32px), Normaal (40px) and Ruim (46px), in the rail foot beside the theme, kept per browser.
- **Lines and header:**
  - no vertical lines between body cells;
  - the header is light, with an icon per field type;
  - only the status-like select is a tinted pill;
  - other selects show a colored dot.

Source: Stefan's references and "i don't need everything to be a pill button like here, but its a good example" (2026-10-07). Self-hosted Plex: Stefan's choice (2026-10-07).

### R5. Group bands
A grouped view's group header is a slim band:
- a chevron;
- the group label (a date as "Dinsdag 3 november");
- a count badge;
- the declared facts (R6);
- on the right, the totals of the numeric and rollup columns for that group.

Clicking the band, or pressing Enter or Space on it, folds the group's rows away. A folded band keeps its count, facts and totals. Folded groups are remembered per view, per browser. The group foot row ("3 rows") goes, because the badge carries the count.

Source: "the colors are functional? or just pretty? these should be collapsable too" (2026-10-07); the prototype's band.

### R6. Declared group facts (an engine shape)
A source may declare `group_facts`: a short list of facts the grid computes from a group's rows. Each fact is one of:
- `{ kind: 'first', column, where: { <column>: <value> }, label }`: the earliest value of `column` among the rows matching `where`;
- `{ kind: 'count', where?, label }`: how many rows match;
- `{ kind: 'empty', column, label }`: how many rows have no value in `column`.

The grid renders the facts in the band, skipping any that come out empty or zero:
- a `first` fact as "● label value";
- the others as "value label".

The engine validates that every named column exists.

Theatre's `dagplanning` and `activiteit` declare:
- the first `start_at` where `soort` is `voorstelling`, labelled "voorstelling";
- the count of empty `start_at`, labelled "zonder tijd".

Source: Stefan chose "Domain declares them" (2026-10-07).

### R7. An inherited value (an engine hint)
A query column may declare `inherited: { flag: '<column>', own: '<value>' }`. When the row's flag column holds a value other than `own` (and not empty), the grid shows the cell grey and italic with a small "via <the flag's option label>" tag.

Theatre's `dagplanning.locatie_id` declares `{ flag: 'locatie_bron', own: 'eigen' }`, so a venue taken over from the Speelreeks reads "Zaal De Spiegel · via Speelreeks".

Source: docs/SPEC.md Inheritance: "The grid shows an inherited value greyed and an own value solid"; the step 1 finding (R4 of step 1).

### R8. Gate
These flows pass in a browser on invented fixtures:
- switching the production narrows Dagplanning and Activiteiten, and "Alle producties" widens them;
- the tree folds open and shut, and hover shows the chevron, `+` and `…`;
- creating a team view and a personal view through `+` and the dialog: each opens and sits in the tree with its mark;
- copying, renaming and deleting a view through `…`, with Undo;
- folding a day band in Dagplanning keeps its count and facts;
- the band shows "voorstelling 20:00" and "1 zonder tijd" for an applied speeldag;
- an inherited venue shows "via Speelreeks";
- the dark theme and the density setting.

Existing gates stay green, with their selectors updated where the markup changed.

## Out
- The Dagkolommen layout (a column per day). It waits until Stefan has used the new table (2026-10-07: "Not now, table first").
- Per-model row counts in the tree.
- A crew ("bezetting") column. No rollup is served by the engine yet.
- The "nog in optie" insight in the title.
- Calendar, list and board views; their menu entries stay disabled.
- Sorting untimed rows last in a day. That is a query sort rule; noted for later.
- An engine filter by space. A space is a grid filter, never access control.

## `docs/SPEC.md` lines (proposed, committed after Stefan sees the diff)
- **Skin needs row:**
  - the space (`space: { dataset }` on the domain, `scoped: <column>` per source);
  - `section` per source;
  - `group_facts` per source;
  - `inherited` per query column.
- **Delivery/grid paragraph:** the sidebar is a tree of sources and their views, with a production switcher.
