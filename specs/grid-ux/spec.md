# Grid UX: the grid after the prototype

Branch `feature/grid-ux`, from main after step 1. The design is `design/grid-prototype.html` (approved by Stefan on 2026-10-07: "this looks amazing. can you build the grid like this?").

## Requirements

### R1. The production switcher (an engine `space`)
- **Engine:** a domain may declare `space: { dataset }`, the dataset whose records split the work (theatre: `productie`). A dataset or query may declare `scoped: '<relation column>'`, the column that points at the space (theatre: `productie_id` on `activiteit`, `speelreeks`, `dagplanning` and `productie_dag`). Validation refuses a `scoped` column that is not a relation to the space dataset, and scoped columns that do not all share one name. `/schema` serves `space: { model, field }` (only to a caller who can read the space dataset; an owner who cannot gets no space), and per source `space: 'scoped' | 'global'`. The engine never filters by space: the grid adds `{ <field>: <id> }` to the rows filter it already sends. A space is a view filter, not access control: a space narrows what a planner sees and never limits what they may read (Stefan, 2026-10-07).
- **Grid:** the rail's top-left shows the switcher, using the existing `SpaceSelect` and `useSpace`:
  - the selected production's name and a dot;
  - a searchable list of the space's records;
  - "Alle producties", which removes the scope.
- **Remembering:** the selection is kept per browser. Nothing stored means "Alle producties": the switcher never narrows on its own (ruling, 2026-10-07).
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
- **Opening and folding:** clicking a model's name opens it and shows its first (or last-used) view, as clicking a table does today; clicking the chevron that replaces the icon on hover folds or unfolds it without changing the view (ruling, 2026-10-07: it keeps the NocoDB behaviour and every existing "open a view by its name" path). On a first visit the active view's model is open.
- **Sections:** the domain declares `sections: [{ label, sources: [...] }]`, which fixes both the section order and the source order inside each; sources it does not list sit in a final, unlabelled section.
  - Theatre:
    - Planning: Dagplanning, Activiteiten, Speelreeksen, Toewijzingen, Beschikbaarheden;
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

Source: Stefan's NocoDB references (2026-10-07): "the datamodel has a tree of views, rolling over the datamodel reveals + and ... menu"; "in nocodb, the icon becomes the collapse arrow on rollover". The theatre section names and order are a draft pending Stefan's approval (2026-10-07).

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
  - subtle vertical dividers between cells, and a leading row-number column on every table view (Stefan, 2026-10-07: "the row numbering and the cell dividers really make it more readable"; this reverses the earlier "no vertical lines");
  - the header is light, with an icon per field type;
  - only a select column keyed `status` is a tinted pill;
  - other selects show a colored dot (ruling, 2026-10-07: a domain-free rule; tones stay as today).

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

When the read limit cut off the rows (the response's total exceeds the rows loaded), a group the cut may have shortened shows "…" for each fact instead of a number (Stefan, 2026-10-07).

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

### R9. The model menu: name, icon and export (Stefan, 2026-10-07)
A model's `…` menu holds Naam wijzigen, Icoon wijzigen, Exporteren and In-/Uitklappen.
- **Name and icon are display settings for everyone, set by an administrator** (option a). The engine keeps them in a small table of its own (`source_display`: source, label, icon). `/schema` serves the overriding label and icon. A source's declared label stays the default.
- **The icon** is picked from a fixed, generic set (no domain words), such as table, calendar, users, clock, tag, pin, check, list, film, box, star and flag.
- **Writes are administrator-only** (403 for anyone else) and revised like any write. An editor sees Naam wijzigen and Icoon wijzigen disabled, with a reason.
- **Exporteren** exports the model's open view as xlsx, using the existing export.
- **Dupliceren is out.** Datasets are code (AGENTS.md; the scope lock).

Source: Stefan, 2026-10-07: "that ... menu should hold rename, change icon, duplicate, export... stuff like that"; "agreed, option a, add task 10".

### R10. The details pass (Stefan, 2026-10-07: "its the details, colors, icons etc…")
From the side-by-side comparison of the prototype and the tool:
1. **Dutch throughout.** The page language is `nl`, so dates read "maandag 2 november", "ma 02/11" and "Week 45 · 2–8 nov". The grid's default strings are Dutch (Vorige/Volgende, Zoeken, Groeperen, Kolommen, rijen, Totaal …).
2. **Time ranges.** In a day group a timed row shows `13:00–14:00` in monospace with the end muted. An untimed row shows a dashed "zonder tijd" pill. `dagplanning` gains `eind_at`.
3. **Soort.** It shows its label with a coloured square. A column may declare a colour per option from a fixed, generic palette (the same mechanism as Task 9's tones). Theatre colours each soort as in the prototype. A query column that writes to a dataset column takes that column's tones, so Dagplanning's status pills are coloured too.
4. **Dagplanning's default columns.** In order: #, Tijd, Omschrijving, Soort, Locatie, Status. Productie and "Locatie van" are hidden. On an existing database the system view is brought up to date by `--seed-missing`.
5. **The tree.**
   - A model reads stronger than its views: model 13.5px weight 500; view 13.5px weight 400, muted, 28px rows.
   - Every model has its own icon. A source may declare a default icon from the generic set, and an administrator's choice (Task 10) wins.
6. **The filter bar.** One chip style, with icons, tinted when set: "Groep: plandag", "Start ↑", "Kolommen", "Filter".
7. **Scope chip.** When a production is selected, a tinted chip that cannot be removed reads "<Space label> is <name>" (theatre: "Productie is Nachtwacht"), and the scoped column is hidden. This reverses the plan's earlier "strip the chip" (Stefan, 2026-10-07).
8. **The "via" tag** is lower-case ("via speelreeks") and never clipped. "Locatie van" leaves the default view.
9. **Title and week navigator.**
   - The h1 is 19px, with the view icon in a 30px tile.
   - The week navigator is one bordered control: "‹ Week 45 · 2–8 nov ›".
10. **Create from a query.** A query may declare `creates: '<dataset>'`. Its `+ Nieuw` then creates a row in that dataset ("Nieuwe activiteit"), and the query reloads (Stefan, 2026-10-07).

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
  - `sections` on the domain;
  - `group_facts` per source;
  - `inherited` per query column;
  - `new_label` per dataset: the grid's words for adding a row, served while the dataset keeps its declared name.
- **Delivery/grid paragraph:** the sidebar is a tree of sources and their views, with a production switcher.
