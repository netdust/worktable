# Step 3d part 2: the app styled as the mockups

**Source for the whole step:** Stefan, 2026-10-13: "for now, we stay with the current design of the mockups. have a second look that everything is good and then start a session. the session stops when the tool looks like the mockups, in detail. this is a styling session, no new features and for sure no engine changes."

**The spec is the seven files in `design/`**: grid, board, timeline, calendar, gallery, matrix and dashboard, each `*-prototype.html`. This document maps every visible element of a prototype to the app component that renders it, with a check that says when it is done. Where a prototype shows something the app cannot render from what the API serves, or a behaviour the app does not have, the element is **out**. Each out item is listed in the ledger at the end with what it would need. It is never approximated with invented data.

**The stop condition** (orchestrator, relaying Stefan): the app, opened on the same view in the same state at 1600×900, in light and dark, reads as the prototype in detail. That covers the shell, toolbar, chips, type sizes, weights, spacing, colours, pills, dots, bands, drawer, Bijstellen panel and footer hints. The proof is a pair per skin, `specs/step-3d/compare/<skin>-proto.png` and `<skin>-app.png`, with `-dark` variants.

The data differs. The prototypes use invented rows and the app the theatre seed, so the pairs compare treatment, not content.

**Standing rules** (Stefan, 2026-10-12/13):
- "i really don't like colored rounded borders": tone sits in a dot, badge text or a flat fill.
- "the toolbar of the grid is perfect and this stays designed the same way".
- "don't overdo it, it looks like an airplane cockpit".
- Side panels, never bottom panels.

**Scope** (orchestrator, 2026-10-13):
- Styling and layout in `apps/grid` only. Nothing in `packages/engine`.
- The theatre package changes only where a seed or view declaration is needed to put a prototype's state on screen.
- No new behaviour. Chrome that binds to an existing behaviour is in; chrome for a behaviour the app lacks is out.

## 1. The shell (all seven files)

| Prototype element | App component | Done when |
|---|---|---|
| Tokens: IBM Plex Sans/Mono, 13.5px body, the `--color-*` set light and dark, radii 4/6/10 | `ui/theme.css` | Every value in the prototype's `:root` and dark blocks equals the theme's; `--today` added |
| Rail, 268px: brand line "Worktable · {organisation}" | `ui/Rail.tsx` + `app.css` | Brand line at 12px uppercase subtle with the name at 13px bold. The organisation word is out (see ledger) unless the schema names one; the line then reads "Worktable" alone. |
| Production switcher card: 28px mark with initials, name, meta, chevron | `ui/SpaceSelect.tsx` | Card is surface on the sidebar with a 1px default border and radius 6; the mark in the accent; name 600. A production tone and meta line are out (ledger). |
| Tree: section labels 11px 600 uppercase .06em; model rows 30px with glyph that becomes a chevron on hover (counts out, ledger); views indented 26px under a 1px guide line; the active view on `--color-bg-selected` in accent 500; a lock on standard views | `ui/Rail.tsx`, `ui/ViewList.tsx` | Side by side, the rail rows match in height, indent, guide line, active state and type |
| "Dashboards" section with Overzicht | `ui/Rail.tsx` | Dashboards sit under their own section label like the prototype |
| Bijstellen in the rail foot: collapsed by default, a header with a chevron; when open, segmented rows: Rijhoogte, Dagkop, Rasterlijnen, Zebrarijen, Thema | `ui/RailFoot.tsx` (replaces the Sneltoetsen block and the loose toggles) | One collapsible card above the account line; state remembered; Rijhoogte and Thema keep their current storage keys; Dagkop, Rasterlijnen, Zebrarijen set `data-groups`, `data-lines`, `data-zebra` on `#root`. Indeling is out (ledger). |
| Account line: avatar initials + email | `ui/RailFoot.tsx` | Avatar circle and email at 12px muted; Afmelden stays reachable (in the line, quiet) |
| Title row: 30px glyph tile on `--color-bg-muted`, h1 19px 600 −.01em, lock, summary pill (12px muted on muted, 999px) (the insight is out, ledger); then search (kbd ⌘K), history and share as 32px icon buttons, the primary button with a plus | `ui/Toolbar.tsx` | Same order, sizes and padding (10px 18px); history before share as in the prototype |
| Chip row: scope chip, filter chips (set = accent subtle), Filter chip with a count bubble, Groep chip, then row count and Kolommen icon button on the right | `grid/GridBar.tsx` and each skin's bar | One row, padding 8px 18px, chips 3px 9px radius 999 12.5px; row count 12px subtle tabular |
| Footer hints: "↑↓←→ bewegen · ↵ bewerken · ⌘Z ongedaan maken" on `--color-bg-subtle` | a `Foot` in the main column (exists as `GridFoot` for totals) | A hints line at the bottom of every skin, 12px subtle, padding 6px 18px; the grid's total row stays above it |
| Record drawer as a full-height column, 392px, beside the work, never over it: head line (kind and close; position, up, down and expand are out, ledger), 19px title, sub line, props as label/value rows with icons, sections with 11px uppercase headings | `ui/SidePanel.tsx` (a portal into the app's slot), `ui/App.tsx` | The drawer is the third column of `.nv-app`, full height; the work narrows; below 760px it overlays, as the prototype's rule does; side by side its type and spacing match |
| Popovers: 6px radius, shadow-pop, 4px padding, items 7px 10px | `ui/Pop.tsx`, `ui/Pick.tsx` | Same |
| Minimal scrollbars | `app.css` | Thin, no arrows, quiet thumb |

## 2. Grid (`grid-prototype.html`, view Planning)

| Prototype element | App component | Done when |
|---|---|---|
| Header cells 34px, 12px subtle, weight 400, icon before the label, sorted column accent 600 with an arrow | `grid/GridHeader.tsx` | Matches |
| Body cells at 16px (the approved prototype rendered its table in quirks mode; kept on purpose), padding 0 12px, row height `--row-h` 40/32/46 | `grid/GridBody.tsx` + `app.css` | Text sizes match the prototype pair |
| No vertical cell borders by default; Rasterlijnen Aan draws them | `app.css` `[data-lines="on"]` | The compare pair (jsdom loads no CSS) |
| Zebra rows under `data-zebra="on"` | `app.css` | Matches |
| One Tijd column "13:00–14:00" with the end dimmed, mono 12.5px; "zonder tijd" as a dashed pill | `grid/cells/Date.tsx` + `grid/columns.ts`: a display format of the start cell in a day-grouped view that does not show the end | Vitest: Planning's start cell reads `13:00–14:00` under "Tijd"; a view that shows both columns is unchanged; editing stays on Start |
| Description column wide, 500 weight, default ink | column widths in `grid/columns` | Description is the widest column |
| Inherited location in italic subtle with a "via tourstop" chip | `grid/cells/index.tsx` (`.nv-inherited`) | A lookup value that comes from the tourstop renders italic with the chip |
| Soort as an 8px square in its tone plus the label | `grid/cells/Badge.tsx`/Select | Matches |
| Status as a pill with a dot (optie amber, bevestigd green, geannuleerd red) | `grid/cells/Select.tsx` | Matches |
| Day band: sticky under the header, 32px on `--color-band`, chevron, day 600 13px, date muted, count in mono, facts ("● voorstelling 20:00 · 1 zonder tijd") | `grid/GridBody.tsx` group row | Matches; the facts come from `group_facts` |
| Day band "bezetting 24/31" on the right; Bezetting bar column | none | **Out** (ledger: needs a per-row have/need) |
| Dagkop Lijn: the band as a 44px line with the day at 15px | `app.css` `[data-groups="line"]` | Matches |
| Row number column 44px mono subtle | `GridBody` | Matches |
| Selected row `--color-bg-selected`, focused cell 2px accent outline | existing | Matches |

## 3. Board (`board-prototype.html`)

A board view on Activiteiten grouped by status needs a seed declaration: a view "Per status", skin `board`, source `activiteit`, filtered on plandag this week. The dataset already declares `board: { column: 'status' }`.

| Prototype element | App component | Done when |
|---|---|---|
| Toolbar: the grid's chip row (scope, Plandag deze week, Filter, "Groep: status", rows, Kolommen) | `board/Board.tsx` gets the shared bar | Same chip row as the grid; "Groep: status" shows the column without a chooser |
| Columns 300px on `--color-bg-column`, 1px subtle border, radius 6; header: a dot in the option's tone, the name 600 13px, a count in mono on muted, a plus | `board/Board.tsx` | Matches without the plus: the board takes no new row today (`ui/App.tsx:499`), so there is none. |
| Card: surface, 1px default border, radius 6, padding 10px 12px. Lines: soort dot + label (12px muted), title 14px 600, date + time in mono, location (italic when inherited), people as avatar initials | `board/Board.tsx` | Matches for the fields the row carries: soort, title, plandag/start_at/eind_at, locatie, mensen |
| Conflict badge on a card | none | **Out** (ledger: needs conflicts per activity on the row) |
| Selected card: flat fill `--color-bg-selected` | Board + drawer | Clicking a card opens the drawer column and marks the card |
| Empty column: "Geen activiteiten" centred, subtle | Board | Matches |
| Drag between columns, the drop slot, the undo toast | none | **Out** (behaviour) |

## 4. Timeline (`timeline-prototype.html`)

| Prototype element | App component | Done when |
|---|---|---|
| Chip row: scope, Filter, "Groep: productie", then Vandaag, ‹, › and Week/Maand as chips | `timeline/Timeline.tsx` | Same chip styles; the Groep chip is static; ‹ › bind to the existing paging and Vandaag to the same `onShown` with this week; Week/Maand is out (ledger) |
| Axis: a corner cell over the lane heads, a weeks row ("Week 42 12–18 okt") and a days row (weekday letter + number, Mondays stronger, weekends lighter, today in `--today` on a tint) | `timeline/Timeline.tsx`, `timeline/layout.ts` | Matches |
| Lanes: head 232px sticky, a dot in the lane's tone, name 600, count in mono; tracks with day lines and shaded weekends | Timeline | Matches |
| Bars: 40px, radius 4, flat fill of the lane tone at 16%; two lines (name 600; dates mono + venue muted); optie hatched; geannuleerd muted and struck; overlap warning icon | Timeline | Matches where the row has those fields. Overlap is out (ledger). |
| Today as a 2px `--today` line with a dot | Timeline | Matches |
| One dark line of detail on hover | Timeline | Matches, as a native-looking tip |
| Move and resize a bar | none | **Out** (behaviour) |

## 5. Calendar (`calendar-prototype.html`)

| Prototype element | App component | Done when |
|---|---|---|
| Chip row: scope, Filter, Vandaag, ‹, ›, Maand/Week as chips; the period in the title row's summary pill | `calendar/Calendar.tsx` + Toolbar | Same chip styles; the lane/colour switch (Productie/Tourstop/Geen) moves into a "Groep: …" chip |
| Week: day head (weekday + 20px number; today as a filled `--today` pill), the "Hele dag" band always on top, an hour grid 08–24 at 46px per hour with half-hour lines, events as flat tinted blocks (title 600, time mono, venue when tall), optie hatched, the now line | Calendar | Matches |
| A date-only source: the hours fall away and the band fills the week | Calendar | Matches |
| Month: six weeks with week numbers, spanning bars packed per week, timed rows as "● 20:00 title" lines, "+n meer" | Calendar | Matches |

## 6. Gallery (`gallery-prototype.html`)

| Prototype element | App component | Done when |
|---|---|---|
| Chip row: Plandag deze week, Filter, "Groep: plandag", S/M/L chips | `gallery/Gallery.tsx` | The grid's chip row without Groep and S/M/L (both out, ledger) |
| Day sections with the grid's day band heading | none | **Out** (ledger: the gallery does not group) |
| Card: picture 4:3 on top, title 600, date + time mono, soort dot + label; hover lifts the shadow and zooms the picture slightly | Gallery | Matches |
| A card without a picture: dot field in the soort tint with the initials | Gallery | Matches (no grey block) |
| Upload tile, picture count badge | none | **Out** (behaviour / data) |

## 7. Matrix (`matrix-prototype.html`)

| Prototype element | App component | Done when |
|---|---|---|
| Chip row: scope, Plandag deze week, Filter, "Groep: plandag", Afwezigheden | `matrix/Matrix.tsx` | Same chip styles. "+ Kolom" stays as a chip. Afwezigheden is out unless a toggle exists (ledger). |
| Head: first column "Activiteit" 280px, "Open", one column per person with avatar initials, name 500 and role subtle, "Bezet" last; sticky | Matrix | Matches. The role line is out unless the column record carries it (ledger). |
| Day band as the grid's | Matrix | Matches |
| Row head: time mono + title 500 | Matrix | Matches |
| Cells: marks ✓ ? ~ ✗ on flat tints (bevestigd green, uitgenodigd/voorlopig amber), away hatched with the reason, away and assigned red with ⚠, a note dot | Matrix | Matches |
| Open cell as an amber flat badge "1 Speler" | Matrix `OpenCell` | Matches |
| Selected cell 2px accent ring; row and column heads highlighted | Matrix | Matches |
| Legend in the footer | Foot | Matches |
| "Wie kan in de plaats" in the drawer | none | **Out** (behaviour) |

## 8. Dashboard (`dashboard-prototype.html`)

| Prototype element | App component | Done when |
|---|---|---|
| Title row: dash glyph, "Overzicht", summary "{space} · week 42", a plain Bewerken button; chip row: scope chip and the quick actions as chips ("bijgewerkt hh:mm" is out, ledger) | `dashboard/Dashboard.tsx` + Toolbar | Matches |
| Section labels 11px 600 uppercase subtle | Dashboard | Matches |
| Stat tiles: surface, subtle border, radius 6, label 12.5 muted, number 32px 600 tabular in its tone, one change line 12px subtle | `dashboard/StatTile.tsx` | Matches; no coloured left border |
| Progress tile: "48 van 57" with a 6px flat bar | `ProgressTile.tsx` | Matches |
| Week tile: the calendar's week band (day head + band), header with "Naar de kalender" | `WeekTile.tsx` | Uses the same band component as the calendar |
| Vandaag beside the week (2.6:1) | Dashboard layout | Matches |
| Werklijst: rows of soort dot, title + context, person avatar, deadline mono (red when past, amber today), Gedaan as a small button | `ListTile.tsx` | Matches with the columns the tile declares |
| Composer (Bewerken): fieldsets with the name in the legend, tiles editable in place, Snelle acties | `Composer.tsx` | Matches in treatment |

## Ledger: out, with what each would need

| Element | Needs |
|---|---|
| Bezetting count in the grid's day band and the Bezetting bar column | a have/need count per activity in the activiteit rows (a lookup or query column); engine/theatre change |
| Conflict badge on board cards and gallery pictures | conflicts per activity on the row; a theatre query column |
| Dagkolommen layout (Bijstellen › Indeling) | a new grid layout; behaviour |
| Drag a card or bar, resize a bar, the drop slot, undo toasts for those | behaviour |
| Board group-by chooser | behaviour (the view's board column is declared by the dataset) |
| Gallery S/M/L size, upload tile, picture count | behaviour / attachment counts on the row |
| Timeline overlap warning | an overlap check; behaviour |
| Matrix Afwezigheden toggle, role line under a person, "Wie kan in de plaats" | behaviour / the person's role on the column |
| Quick-create forms in the drawer | behaviour (the dashboard keeps its existing quick create) |
| Organisation name in the brand line | a schema field naming the organisation |
| Rail counts per model | a row count per table in the schema or a read per model |
| Production tone and meta line on the switcher card | a colour and a period/status on `productie`, served with the space records |
| Toolbar insight ("19 nog in optie") | a per-view insight declaration |
| Drawer position "n van m", up, down and expand | behaviour |
| Dashboard "bijgewerkt hh:mm" | a refresh time the dashboard does not keep |
| Timeline Week/Maand switch | behaviour (a window switch in the timeline) |
| Gallery day sections | behaviour (grouping in the gallery) |
| Afbouw's own brown hue | a tone decision in theatre (`afbouw` is declared amber) |
