# Step 3f: the board's drag like Folio, and the four held shapes

**Contract:** `docs/SPEC.md`, "Step 3f adds five shapes" (e31433b). The brief and every ruling after it: `specs/step-3f/brief.md`. The mockups are `design/*-prototype.html`.

Stefan, after using the 3e preview: "the drag&drop is not working smoothly... i drop and it ends up on different place. i can't rearrange either. maybe look to folio or a repo that solves this. very smooth intuitive drag&drop". Asked whether Worktable should store a card's place like Folio: "Yes, like Folio". The four held engine questions: yes to all four (2026-10-14).

## B. The board's drag

| # | Requirement | Source |
|---|---|---|
| B1 | The board drags on `@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0 and `@dnd-kit/utilities` ^3.2.2, with one SortableContext per column. The other cards move aside smoothly while a card is dragged. A DragOverlay carries the lifted card with the 2° tilt and the shadow of the 3d prototype. The pointer starts a drag after 5px. | brief APP; Folio `kanban-view.tsx` |
| B2 | What the board draws is where the card lands, in one look: on a manual board, a drop into another column tints that column and shows the mockup's card-height slot box with the column's name at the pointer's place (`board-prototype.html:342, 357, 852-863`); within a column, the sortable's gap shows in the same tint. On a sorted board, a drop into another column tints the column only. The slot never moves the hit test: the insertion index comes from the target column's card rects without the slot, as the mockup removes its slot before measuring (`:854`, `:858`). | brief APP; worktable-33 2026-10-15 (mockup is the visual source, Folio the mechanical one) |
| B3 | A board in manual order sorts on `[{ id: 'position' }, …its previous keys]`: ranked cards by rank, then unranked cards in the order they had. A drop within a column writes fresh increasing ranks to the still-unranked cards above its slot, in their shown order, then to the dropped card; nothing on the board moves but the dropped card, and the order stays after a reload. A move down in a column of unranked cards lands at its slot. | brief APP, PROOF; ruling Q1 (B), 2026-10-15 |
| B4 | A drop into another column of a board in manual order writes the group column and `position` in one write. The card lands at the slot and stays there after a reload. | brief APP, PROOF |
| B5 | On a sorted board, a drop within a column writes as B3, then switches the view's sort to `[{ id: 'position' }, …the previous keys]`; no card but the dropped one changes place, in any column, then or after a reload. On a locked or standard view the switch stays in the planner's own layout, with the "changed" mark, and no dialog. A drop into another column tints the column, draws no slot, writes the group column only, lands the card at its sorted place, and leaves the sort as it was. Known limit: a card that already holds a rank from another manual view sorts among the ranked cards on the switch. | ruling (a), the indicator rule and Q1 (B), 2026-10-15 |
| B6 | A refused drop snaps the card back and shows the refusal's text. This holds on a crowded board (60+ cards, the target column scrolled), by mouse and by keyboard. | brief APP; 3e row 11, Stefan 2026-10-15 "ok, continue" |
| B7 | One ⌘Z restores both the column and the place, wherever the focus is. The page-level ⌘Z (ad4ed2a, in `Workspace`) moves into its own small hook as part of this change, and it no longer fires behind an open dialog such as QuickCreate. | brief APP; worktable-33 2026-10-15; 3e review Minor 11 |
| B8 | The keyboard drags too, through dnd-kit's KeyboardSensor with the board's own coordinates getter (not `sortableKeyboardCoordinates`, which needs pointer rects): Space lifts and drops, ↑↓ move the slot within the column, ←→ move it to the neighbour column at the same index, Escape cancels, Enter keeps opening the card. The drag's screen-reader announcements are Dutch, through i18n, and the footer hints name these keys. | brief APP; ruling Q2, 2026-10-15 |
| B9 | A board over a query does not drag, as today (`App.tsx:624` passes no `onMove` for a query): no lift, no line, no write. | ruling 4, 2026-10-15 (no line on a query board) |
| B10 | Drag state lives in `board/` (its own hook and module), never in `Workspace`. The board's CSS sits with the board, and the react-aria drag rules it replaces are deleted in the same change. | memory ui-code-has-a-place; worktable-33 2026-10-15 |

Out: the rail's view reordering, and dragging on the timeline and the calendar. Deferred: the rest of an editable Mensen section in the record drawer ("Open plek invullen", "+ Toewijzen"); the dashboard drawer (no store) and the matrix row drawer (move repaints rollups only) offer "Negeren" only.

## E. The engine's five shapes

| # | Requirement | Source |
|---|---|---|
| E1 | `position`: a nullable TEXT column on every domain dataset table, added by migration to existing databases. A domain may not declare a column, lookup or link named `position`. The rows route serves it on each row and sorts on it, with nulls last. The writer path accepts it, revises it and puts it under the write's batch. An owner account never writes it. `/history` lists its change as a move, without the rank. `/schema` marks it sortable on each dataset. Engine tables and queries have none. | SPEC step 3f |
| E2 | `long: true` on a text column, served as long text (`textarea`). Theatre: `activiteit.notities`. | SPEC step 3f, Q1 |
| E3 | `flags: { marks, tone }` on a query, validated (each mark's key a declared dataset and its column an integer column of the query; `tone` an options column whose options all carry tones) and served in `/schema` on the query. Nothing else in the engine. Theatre: conflicten marks activiteit, toewijzing (by its bare integer `toewijzing_id`; the via-title rule stays, validate.ts:208-215) and speelreeks (its SQL adds `speelreeks_id`, an integer relating to speelreeks), toned by `ernst`. | SPEC step 3f, Q2 |
| E4 | `tone: <options column>` on a dataset, validated (every option carries a tone) and served in `/schema`. Theatre: a `kleur` select on productie, options named for tones, each seed production given one. | SPEC step 3f, Q6 |
| E5 | `{ kind: 'filled', link, label }` as a group fact, validated (the link exists on the source) and served in `/schema`. Theatre: `{ kind: 'filled', link: 'mensen', label: 'bezetting' }` on activiteit. | SPEC step 3f, Q11 |

## G. The grid's use of them

| # | Requirement | Source |
|---|---|---|
| G1 | The record drawer shows a long text field as its own NOTITIES block after the link sections, as the mockups draw (`grid-prototype.html:1118`), and edits it in place as long text. Empty, it reads the mockup's prompt to add one. | 3e spec C4, Q1 |
| G2 | Flags mark cards, timeline bars, calendar events, matrix cells and the dashboard's week tile with the alert badge, where the mockups draw it (`board:790`, `calendar:841`, `dashboard:847`). The badge reads the flag's tone option label, and its title is the flag's text. The record drawer's Mensen list marks a flagged person (`board:695-696`). | 3e spec D8, Q2 |
| G3 | The title line shows "N <the flag query's label>" when the view's rows hold flags, as a button that opens the flag query's view in the same space. There is no view banner. | ruling 3, 2026-10-15 |
| G4 | The record drawer shows each flag on its record as the mockups' band (`board:704`), with "Iemand anders kiezen" and "Negeren". "Iemand anders kiezen" shows only where the flag marks a row of one of the record's link sections whose target column declares `options_from`; it opens that row's person picker in place, on the marked row of the link section (the mockup marks that row, `board:695-696`, and draws nothing for the click), listing its candidates; a pick writes the row's target through the record edit route, one ⌘Z undoes it, and the flag re-read ends the band once the conflict is gone. "Negeren" hides the band in the open drawer and stores nothing. | ruling 2, 2026-10-15; Stefan 2026-10-16: "iemand anders kiezen is a good feature to have" |
| G5 | The timeline counts the bars of one lane that overlap in time, leaving out the bars whose status is toned `bad` (the rule behind `nv-tl__bar--cancelled`). It marks each such bar with the mockup's warn mark and title text (`timeline-prototype.html:857-860`), and shows "N overlap" in the title line (`:878`). | ruling 3 (overlap), 2026-10-15 |
| G6 | A dataset's tone colours its records as calendar and timeline lanes and bars, and on the card lines of rows that point at it (the drawer subline's tone bar, 3e C2). Without a tone, lanes keep the palette by order. | 3e spec D3, Q6 |
| G7 | A `filled` fact shows on a group head as "bezetting 24/31", summed over the group's rows from the same count the Mensen cell's meter reads (`crewOf`). | 3e spec D1b, Q11 |

## C. Carried from 3e

| # | Requirement | Source |
|---|---|---|
| C1 | Planning's Tijd cell is not cut off: "wo 14/10 00:00" fits (about 190px against the column's 124). The `planning-details` and `ui-fit` specs follow. | worktable-33 2026-10-15 |
| C2 | The sweep for tests that lean on the seed's dates being ahead of today: reported first, fixed as its own small commit after the orchestrator rules. | worktable-ac 2026-10-15 |

## Proof (e2e, in `e2e/step-3f.spec.ts`; RED first where a bug exists today)

- board-drop-between: a card dropped between cards 2 and 3 of another column lands there and stays after a reload (B2, B4).
- board-slot-steady: moving the mouse in small steps down a crowded target column, the slot's index only grows, never flickers back (B2). If it cannot be made steady, the fallback is Folio's line, shown to the orchestrator with the evidence before building on it.
- board-reorder: a reorder within a column stays after a reload (B3).
- board-reorder-fresh: a move down in a column of unranked cards lands at its slot after a reload (B3).
- board-sorted-to-manual: a within-column drop on a sorted board switches it to manual; the full order of every column, read before and after the drop and after a reload, differs only by the dropped card (B5).
- board-sorted-cross-column: on a sorted board, hovering another column tints it and shows no slot; after the drop and a reload the card is at its sorted index there, the view's stored sort is unchanged, and there is no "changed" mark (B5).
- board-undo-both: one ⌘Z after a drop that also ranked the cards above it restores the column, the place and every rank written, with the focus on a drawer button or the page (B7).
- board-keyboard: lift, move in all four directions, drop; Escape cancels (B8).
- board-drag-refused: on 60+ cards with the target column scrolled, Bevestigd › Geweigerd is refused with its text and the card snaps back, by mouse and by keyboard; the full order of both columns is as it was (B6).
- notities-block, conflict-marks-and-insight, conflict-band-negeren, timeline-overlap, production-tone, group-filled: one flow per engine addition and its grid use (E2–E5, G1–G7).
- Engine units: position's migration onto a filled table, nulls last then the sort's other keys, one batch for column plus position, the 255-character and alphabet refusals, an owner refused, history without the rank; each declaration's refusals.
