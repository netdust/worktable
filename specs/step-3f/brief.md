# Step 3f brief

From worktable-ac (the orchestrator, relaying Stefan), received 2026-10-14. Kept here because the orchestrator's copy was lost in a restart (2026-10-15). The brief is verbatim; the rulings that followed it are listed after it.

---

Step 3f brief. Start AFTER step 3e is merged. Don't let it disturb 3e's close: no edits in the shared checkout and no Playwright while the close runs. In 3e's review and fix pass, put board-drag findings into 3f instead, unless they lose data.

Stefan's words, verbatim, after using the 3e preview: "the drag&drop is not working smoothly... i drop and it ends up on different place. i can't rearrange either. maybe look to folio or a repo that solves this. very smooth intuitive drag&drop"
His answers, 2026-10-14:
- Should Worktable store a card's place like Folio? → "Yes, like Folio": a stored position per record, written like any edit, on dnd-kit.
- The four held engine questions → yes to all four (Q1 long text, Q2 conflict flags, Q6 production colour, Q11 group totals).

DIAGNOSIS (mine, from reading Board.tsx at 4941a7e; confirm by driving it before you fix):
- react-aria's useDragAndDrop uses native HTML5 drag. You get a browser ghost image, and the cards don't move aside.
- The DropIndicator draws a slot between two cards, but the drop writes only the group column, so the card lands at its sort position ("ends up on a different place").
- getDropOperation cancels a drop on the card's own column ("can't rearrange").

REFERENCE: Folio at /home/ntdst/Projects/folio (read only):
- apps/web/src/components/views/kanban-view.tsx: the dnd-kit setup. Its comments say why dropAnimation is null and why pointerWithin comes before closestCorners.
- apps/web/src/components/kanban/{board-drag,board-reorder,closest-edge}.ts, with their tests.
- packages/shared/src/board-rank.ts: rankBetween, a fractional text rank.
- apps/web/tests/e2e/{hardening-pass,view-drag-reorder}.spec.ts: the drag bugs Folio hit, with proofs.
Folio's model: board_position is a text rank on the record, and null sorts last. A view is either sorted or manual. A within-column drop on a sorted board switches it to manual (auto-manual-reorder). The four drop kinds are reorder, regroup, regroup-reorder and auto-manual-reorder. Cross-column placement goes by the closest edge. Folio drags by pointer only; we keep keyboard drag with dnd-kit's KeyboardSensor and sortableKeyboardCoordinates.

COPY RULE: AGENTS.md and SPEC.md line 122 allow only three things to be copied from Folio. Stefan's word adds a fourth: its board drag logic and rank. Record that in the SPEC commit.

ENGINE: Stefan has given his word. docs/SPEC.md changes first, in ONE commit covering all five:
1. A generic record position: an engine-managed text rank on every dataset table, with Folio's board_position semantics. Pick a generic English name the vocabulary check allows. It is written as any edit, with a revision and one ⌘Z, and it is sortable through REST; null sorts last. A cross-column drop writes the group column and the rank in ONE write.
2. Q1: `long: true` on ColumnDecl, served as a textarea, for the drawer's NOTITIES block.
3. Q2: a generic query `flags` declaration. It drives the conflict banner (actions "Openen" and "Toon conflicten", no "Negeren"), the marks on cards, bars and events, and the "N conflicten" insight.
4. Q6: a `kleur` select on productie plus a tone pointer, for timeline lanes and bars and the card lines. It replaces the lane-palette fallback.
5. Q11: a `sum` group fact for the grid's group-head totals ("bezetting 24/31").
Lift Q1, Q2, Q6 and Q11 from your own specs/step-3e/spec.md.

APP:
- Rebuild the board's drag on @dnd-kit/core and @dnd-kit/sortable, with one SortableContext per column. Cards move aside smoothly while dragging. A DragOverlay carries the lifted card with the 2° tilt and shadow from the 3d prototype. The slot is exactly where the card will land.
- Outcomes, all persisted:
  - within a column: reorder;
  - into another column: regroup at the slot, in one write;
  - within a column on a sorted board: switch to manual order, then reorder.
- A refusal snaps the card back and shows its text. One ⌘Z restores both the column and the place, wherever the focus is.
- Keep keyboard drag: lift, move across and within columns, drop.
- How a view stores sorted or manual mode, including on a locked system view a planner can't save: propose it in the spec and ask me. Don't guess.
- Out of scope: the rail's view reordering, and the timeline and calendar drag.

PROOF (e2e, RED first where a bug exists):
- Drop between cards 2 and 3 of another column: the card lands there and stays after a reload.
- A reorder within a column persists after a reload.
- A within-column drop on a sorted board switches it to manual and the card stays where it was dropped.
- One ⌘Z undoes a regroup plus reorder.
- Keyboard: lift, move in all four directions, drop.
- A refusal snaps back.
- Each of the four engine additions has its proof, as specced in 3e.
Before merging, I'll drive the drag by mouse in small steps on the preview. Smoothness is judged there.

PROCESS: netdust-gates:policy → specs/step-3f/spec.md → plan → /plan-review → build, from main after the 3e merge. You may draft the 3f spec in a separate worktree while 3e's gate runs. Close lean: gate alone → review → one fix pass → shake-out → one final gate alone. Ask me, not Stefan.

The same brief is at /tmp/claude-1000/-home-ntdst-Sites-worktable/a95060bf-f8c3-4e31-bbb6-118662a3a5ae/scratchpad/step-3f-brief.md.
---

## Rulings after the brief (worktable-ac, 2026-10-15)

- **Manual order (question (a)):** option 1. A board in manual order sorts on `position`: the view's sort is `[{ id: 'position' }]`, stored like any sort. There is no new storage and no change to the view shape. `position` is reserved in the spec the way `id` is.
- **Locked views:** a within-column drop on a sorted board switches the sort in the planner's own layout, with the "changed" mark, as any change to a locked view does. No confirm dialog. The rank write itself is a record edit everyone sees, with a revision and one ⌘Z; only the switch to manual is local.
- **The drop indicator shows where the card will land.** On a sorted board, a cross-column drop highlights the target column, draws no line, lands the card at its sorted place, and leaves the sort as it was. A within-column drop draws the line, switches to manual and lands at the slot. Folio draws a line on a sorted cross-column drop and then lands the card at its sort position (`apps/web/src/components/views/kanban-view.tsx:325-336`, Folio 15bd9886, never checks `reorderEnabled` at :274; `board-drag.ts:44-48` resolves it to a plain `regroup`). We do not copy that. An e2e proves it next to the auto-manual one, with no "changed" mark after reload.
- **Copy rule:** the fourth item is Folio's board drag and rank, less its sorted-board cross-column drop line (kanban-view.tsx:325-336). AGENTS.md's line changes in the same commit.
- **Q2 "Negeren" (supersedes the brief's "no Negeren"):** Stefan said yes to Q2, so the 3e fallback no longer applies. The record drawer's conflict band offers "Iemand anders kiezen" and "Negeren", as the mockups draw (board-prototype.html:704, timeline:743, matrix:744). "Negeren" hides the band in the open drawer and stores nothing, like the cell drawer's "Toch laten staan". A lasting dismissal would need a stored acknowledgement the scope does not hold, so a conflict ends when its rows change. The view's banner offers "Openen" and "Toon conflicten". An action shows only where it can act: "Iemand anders kiezen" only on a conflict about a person's place.
- **Timeline overlap, part of Q2, is in 3f** and computed in the client from the timeline's packing, as the mockup does (timeline-prototype.html:818, 857-860, 878). It counts bars in the same lane that overlap in time, leaving out the bars drawn as cancelled by the same rule as `nv-tl__bar--cancelled` (the status option's tone `bad`). Each such bar gets the warn mark with the mockup's title text, and "N overlap" is the title-line insight. No engine shape, no flags, no new conflict type.
- **Scope lock:** the Out column stays as it is. Not listed means out.
- **Carried from 3e:** board-drag-refused on a crowded board (Stefan, 2026-10-15: "ok, continue"); the Tijd cell cut-off on Planning ("wo 14/10 00:…" needs about 190px against 124; planning-details and ui-fit updated); the sweep for tests that lean on seed dates being ahead of today, as a separate small commit, reported before anything changes.
- **Close:** gate alone, review, one fix pass, shake-out, final gate alone. worktable-ac drives the preview before merging. Ask worktable-ac, not Stefan.
