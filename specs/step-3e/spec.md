# Step 3e: the app behaves and looks like the seven mockups

**Source for the whole step:** Stefan, 2026-10-14, relayed verbatim by worktable-ac after going through main 64cc5d3 on the preview: "i went through the toolbar with filter and skins. there are still issues. the toolbar is inconsistent in use ( clikcing month adds filter, but this filter stays if you click again for intanstance ) make sure the toolbar is untitief and consstent over all skins. i alos noticed that the boards are not dragable. i also notices that the drawer is not designed as in the mockups. so theres still some work to do here, can you go into detail and solve these issues and others you find?"

**Brief:** worktable-ac, 2026-10-14. It lists findings A1–A8, B1–B5, C1–C6 and D1–D9 and rulings R1–R7. Each finding below quotes its id. "Source: brief" means the brief's text. "Source: R<n>" means worktable-ac's ruling, which Stefan may overrule. "invented — to rule" marks my own finding, which waits for worktable-ac's word.

**The mockups are the spec of the look**: `design/{grid,board,calendar,timeline,gallery,matrix,dashboard}-prototype.html`. The data differs, so the pairs compare treatment and behaviour, not content.

**Scope:** `apps/grid`, plus theatre seeds and declarations where a mockup's state needs them. No change in `packages/engine` without worktable-ac's word. Nothing is built that no mockup draws, except board drag. The standing rules from step 3d still hold: tone in a dot or a flat fill, never a coloured rounded border; no cockpit density; side panels only.

**Proof:**
- Compare pairs retaken per skin, light and dark, at 1600×900, with the drawer open on the record the mockup shows.
- The period sequence (Maand, Maand again, Week, ›, Vandaag, remove) as e2e on all six skins.
- Board drag as e2e, with mouse and with keyboard.

## A. Toolbar: one period, one chooser, the same everywhere

Reproduced by reading `ui/App.tsx:284-311`, `ui/ChipBar.tsx:85-103` and `ui/Filters.tsx:20-41`:
- The period writes `{op:'between'}` on `view.date_field`.
- `Filters` draws every date condition as a chip, with `t('betweenDays')` showing the raw ISO dates.
- Maand's `onClick` is `!month && toMonth()`, so the lit Maand does nothing.
- Vandaag writes `between`.
- Week from a month calls `weekOf(from)` on the month's first day.
- `period` is null on grid, board and gallery unless a date condition is set.

The e2e sequence will reproduce each of these before its fix.

| Id | Done when | Source |
|---|---|---|
| A1/R1 | The condition on `view.date_field` that the period controls is never drawn as a chip and is not counted in the Filter bubble. The period's name ("deze week", "Week 42 · 12–18 okt", "oktober 2026") shows in the title-line pill on every skin. A date condition on any other column is still a chip, with Dutch dates ("12 okt – 18 okt"), never ISO. | brief A1, R1 |
| A2/R3 | On grid, board and gallery, pressing the lit Maand or Week removes the period: all dates, no chip lit. Vandaag then sets "deze week", and ‹ › are disabled. On calendar, timeline and matrix a period is always set, so pressing the lit chip does nothing. | brief A2, R3 |
| A3/R4 | Vandaag stores the relative op: `week` in a week, `month` in a month. A saved view keeps following the calendar. ‹ and › store `between` with fixed dates. | brief A3, R4 |
| A4/R5 | Week from a month gives today's week when the month holds today, else the month's first week. Maand from a week gives the month of that week's Thursday. | brief A4, R5 |
| A5/R2 | Every view whose table declares a date (`view.date_field`) shows Vandaag ‹ › Maand Week in the same slot, set or not. No click makes the control appear or disappear. A view with no date field shows none. This covers Tourstops grid, Afwezigheden and Bord toewijzingen if their table has a date, and none otherwise. | brief A5, R2 |
| A6 | On the timeline, removing the period is impossible. The period is no chip, so there is no ×, and the lit chip stays lit (R3). The timeline always names its window. | brief A6 |
| A7/R6 | Groep is a chooser on every skin. The board offers its table's select fields and regroups columns by the chosen one, stored as `layout.group` (layout save only). The gallery offers its date and select fields plus "geen" and draws sections (see B/D5). The calendar keeps its lanes chooser. | brief A7, R6 |
| A8 | Chip anatomy follows `grid-prototype.html`: a date chip carries the calendar icon, and the Filter count is the mono 11px accent pill (`nv-chip__count` gets its CSS; today it has none). The ×, the Filter icon and the Kolommen radius follow the mockup. | brief A8 |
| R7 | A skin's own chips sit after the period and before + Kolom: gallery S M L, matrix Afwezigheden. | R7 |
| A9 | One order on every skin: Maand before Week. The timeline mockup draws Week first. | Q20, ruled 2026-10-14 |

## B. Board

| Id | Done when | Source |
|---|---|---|
| B1 | Cards drag between columns, by mouse and by keyboard, using react-aria's `useDragAndDrop` on one `GridList` per column. ViewList already uses it. While dragging, the card is lifted and tilted 2° with a shadow, the origin is ghosted at 35%, the target column is tinted, and the drop slot shows in it. The drop writes the group column through the grid store's `apply` (one write, ⌘Z and the "Gewijzigd" toast for free). A refusal puts the card back and shows the refusal text. Within a column the order is the view's sort. Nothing drags when the source is a query, the column is read-only, or the table is not writable. | brief B1 |
| B2 | The column head's + opens the quick create with that column's value preset. QuickCreate gains a `preset`. | brief B2 |
| B3 | Every option of the group column shows as a column. An empty column shows "Geen {plural}" ("Geen activiteiten"). This is already true for options; the empty text is added. | brief B3 |
| B4 | The footer hints are per skin, as each mockup writes them, and only hints that work. Board: "Sleep een kaart naar een andere kolom · ↵ openen · ⌘Z ongedaan maken". Matrix: "↵ toewijzen". Calendar: "Klik om te openen · ←→ vorige of volgende periode · T vandaag", with ← → and T built as keys (Q19). Timeline: its drag and resize hints are not built, so it gets "Klik om te openen · ⌘Z ongedaan maken" (Q19). Gallery: "Klik om te openen", since drop-upload is not built. Dashboard: "Klik een getal om de lijst erachter te openen · Bewerken past het dashboard van het team aan". | brief B4 |
| B5 | The card face follows the mockup: the kind dot, a mono date and time or "zonder tijd", the inherited place in italic, and 22px avatar initials with per-person tones, a 2px ring, −2px overlap, a dashed "+" for an open place and "+N" beyond four. | brief B5 |

## C. The drawer

All seven mockups share one drawer function (`grid-prototype.html:778-813`): `.dw-head`, `.dw-title`, `.dw-sub`, `.dw-alert`, `dl.props` (112px | 1fr), then `.dw-sec` sections. The app's `grid/Drawer.tsx` is mounted in five places, so one rebuild covers them all. Nothing in it names a domain word: every part comes from the model's metadata.

| Id | Done when | Source |
|---|---|---|
| C1 | The head line shows the kind (the first toned select on the model: its tone dot and option label) · the dataset name, then "N van M" in the view's row order, ↑ ↓ buttons with keys (also `k`/`j` and ↑/↓ while focus is in the head), expand (Q15) and close. | brief C1 |
| C2 | The 19px title, then a subline with the record's relations to the space and to the date's parent: the space record (`Schema.space`) with its tone bar (Q6) and a place relation with its icon. Concretely, the relation fields shown as columns that point at a model with a title, in field order, up to two. | brief C2 |
| C3 | The fields are icon · label · value. Dates read "wo 14 okt 2026" in mono. The calendar's start and end pair reads "Tijd 20:00–21:15" on one line. An inherited value is italic with "via {relation}", from the `Field.via` and `Row.inherited` the grid already renders. Empty fields are not listed; a quiet "+ n lege velden" line at the foot of the list unfolds them for editing (Q14). A long text becomes a NOTITIES block (Q1). Technical fields (Legacy post, Bron, Verrekening) follow the view's hidden columns: a column the view hides is not listed. | brief C3 |
| C4 | Sections under the fields, in order: rows of datasets that point at this record, then Notities, then Geschiedenis (`GET /history/:source?filter={"id":N}`), then Bijlagen, then Verwijderen. The rows of pointing datasets are, first, the model's `links` fields (Bezetting: person, role, status, "+ Toewijzen") and then inbound relations (Q16). | brief C4 |
| C5 | An alert banner with two actions where the record has one: "afwezig" from `absentOn` (buildable); a conflict needs data (Q2); "over tijd" is dropped (Q3). | brief C5 |
| C6 | The matrix cell drawer follows the matrix mockup: head; Persoon, Rol, Status (a picker on the badge), Activiteit, Notitie; "Ook op {dag}" from the loaded matrix rows; "Wie kan in de plaats" with Kiezen (Q4); Geschiedenis. It replaces the grid of status buttons and the bare textarea. | brief C6 |

## D. Other gaps

| Id | Done when | Source |
|---|---|---|
| D1a | Inherited Locatie is italic with "via tourstop". Already built (`grid/cells/index.tsx:11-18`); checked in the compare pair. | brief D1 |
| D1b | A Bezetting column with a bar and have/need, from `links.mensen` (an open slot is an item with no target). Group-head totals need a new `GroupFact` kind, which lives in the engine's `declare.ts:60` (Q11). | brief D1 |
| D1c | The title-line insight: "N nog in optie" counts the rows on the warn-toned option and needs a declared wording (Q12); "N conflicten" needs data (Q2); "1 overlap" on the timeline comes from its packing. | brief D1 |
| D2 | Rail counts per table, from one `rows(limit 1).total` per dataset when the rail loads. Queries show none. | brief D2 |
| D3 | Timeline lanes and bars in each production's own tone. `productie` has no colour (Q6). Until it does, lanes take the calendar's lane palette by order. A hover card on a bar shows title · place · time · status (its content already exists as `data-tip`), styled as the mockup's card. | brief D3 |
| D4 | Calendar week: overlapping events get columns in start order, with lane as the tiebreak (`calendar/layout.ts:170` sorts by lane first). A cluster's width is shared only by the events that overlap, with a 2px gutter, as the mockup packs. Monday 12 Oct is readable. | brief D4 |
| D5 | Gallery: sections by Groep with a sticky head and count, S M L at 172/236/330px stored in the layout, and the placeholder as drawn (dotted tint, 52px mark). The picture-count badge needs attachment counts on the row (Q18). | brief D5 |
| D6 | Matrix: a role line under each head from the column's role (needs seeded `rol_id`, Q8); an Afwezigheden chip (on by default) that shows or hides the away layer. Whether the ✓ count column and Totaal row stay is Q9. | brief D6 |
| D7 | Dashboard: the title pill "{space} · week 42"; "bijgewerkt hh:mm" from the last read; the stat change line where a stat's view is dated (Q13); Werklijst rows with avatar and Gedaan (context words: Q13); the week tile as a cross-day band, as drawn. | brief D7 |
| D8 | Conflict marks on cards, bars, events, pictures and the week tile, where the mockups draw them. This needs data (Q2). | brief D8 |
| D9 | Every rail view is walked, light and dark, and each defect found is listed here before it is fixed. | brief D9 |
| D10 | Kolommen on grid, board, gallery, calendar and timeline. On a card or bar skin it shows, hides and orders the card's facts through the layout; the title always shows. Matrix has none. | Q17, ruled 2026-10-14 |

## Open questions (to worktable-ac, one message)

These are numbered as in the report to worktable-ac and filled with the rulings as they come back.

Ruled by worktable-ac, 2026-10-14:

| Q | Ruling |
|---|---|
| Q1 long text (NOTITIES) | **Held for Stefan** (engine shape). Fallback: notes stay a field line. |
| Q2 conflict flags | **Held for Stefan** (engine shape). Fallback: every conflict part is out. The banner's actions are "Openen" and "Toon conflicten", with no "Negeren". |
| Q3 Over tijd | Dropped. |
| Q4 Wie kan in de plaats | A theatre SQL change. The open-slot picker's rows and order stay exactly as they are, and its tests pass unchanged. |
| Q5 dataset name | Plural: "Voorstelling · Activiteiten". With no kind, the dataset name alone. |
| Q6 production tone | **Held for Stefan** (engine shape). Fallback: the lane palette by order. |
| Q7 actor | The email's local part. |
| Q8 role line | Seed `rol_id` (invented fixtures, theatre seed only). |
| Q9 matrix right column | "Bezet" with have/need, as in the mockup. The Totaal row stays (docs/SPEC.md, the `count` option), styled quietly. |
| Q10 have/need | have = toewijzingen with a person, not geweigerd or geannuleerd. need = have + open slots. |
| Q11 group-head totals | **Held for Stefan** (engine shape). Fallback: out. |
| Q12 insight | The warn-toned option drawn as its badge with its count beside it, in the title line, only where the view's rows hold it. **Rule:** the column is the lifecycle column when the table has one, else the first select whose options carry a `warn` tone. The count comes from the rows the view holds. |
| Q13 dashboard | The theatre werklijst gets a context column. The change line shows only where the stat's view is dated. |
| Q14 empty fields | A quiet "+ n lege velden" line at the foot of the fields. |
| Q15 expand | The drawer widens over the work column; Esc or the same button returns it. |
| Q16 inbound | Links first, then inbound relations from dated datasets, at most 5 rows. "alle n" opens that dataset's view with a condition on the key. |
| Q17 Kolommen | On grid, board, gallery, calendar and timeline. On a card or bar skin it shows, hides and orders the facts the card shows, through the same layout. The title always shows. The matrix keeps + Kolom and no Kolommen. |
| Q18 picture count | Out. |
| Q19 keys and hints | ← → and T on calendar and timeline only. Timeline and gallery hints as proposed. |
| Q20 order | Maand Week on every skin. |

Order: the four held parts (Q1, Q2, Q6, Q11) come last and are built only on Stefan's answer. On a yes, docs/SPEC.md changes first, in its own commit.
