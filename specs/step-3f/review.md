# Feature review: step-3f

Reviewed: `b9d0730..67f6b62` (merge-base with origin/main → local `feature/step-3f`, 45 commits, 108 files, +6440/−775), at review level full. Plan: `specs/step-3f/plan.md`: its requirements, Review Focus and Threat model, with the spec (`specs/step-3f/spec.md`), the contract (`docs/SPEC.md` "Step 3f adds five shapes") and the controller's ledger of rulings and deferred minors.

Reviewers:
- superpowers' whole-branch reviewer (`requesting-code-review/code-reviewer.md`, opus);
- `security-sentinel` (opus), because the plan carries a threat model.

There is no `ARCHITECTURE-INVARIANTS.md`, so invariant-auditor did not run. The gate on the head is green: packages 2008/0, grid 1319/1319, e2e 285 passed and 0 failed.

## Blocking

None. Neither reviewer found a Critical issue. Nothing loses data or crosses a security boundary.

## Should fix

1. **"Iemand anders kiezen" exists only in Planning's (Grid) drawer** (code reviewer, Important 1).
   - `onLink` is wired only at `apps/grid/src/grid/Grid.tsx:355`. The record drawers of the board, timeline and calendar (`grid/useOpenRow.tsx:21`), the calendar's own drawer, the dashboard drawer and the matrix row drawer get `flags` but no `onLink`. `grid/Drawer.tsx:172-175` therefore offers only "Negeren" there.
   - G4 and SPEC 9080f1f say "the record drawer", and the source is the board's drawer (`design/board-prototype.html:704`).
   - `e2e/step-3f.spec.ts:951` pins `['Negeren']` on the board. `specs/CHECKS.md:246` reads "met alleen Negeren".
   - The cause is in the plan: Task 12 tied the pick to "the store's write path the drawer already uses for a field edit", which only Grid has.
   - This needs the orchestrator's ruling:
     - (a) pass a place writer into useOpenRow from App's store (one prop through Workspace, a second recorded exception like `onFlagged`) and update conflict-band-negeren and its CHECKS row; or
     - (b) amend G4 and the SPEC line to "the sheet's drawer".
2. **CHECKS.md stamps name commits where the flows could not pass** (code reviewer, Important 2).
   - Rows 233-241, the nine board flows, are stamped `ffb52ec`; `e2e/step-3f.spec.ts` did not exist until `c5bee2b`.
   - skins-open, drawer-in-slot, groep-everywhere, board-drag, board-column-plus-in-window and title-line-insight are restamped `ffb52ec`, while their specs still looked for react-aria roles.
   - Row 242, notities-block, is stamped `a660b59`, before the block existed.
   - planning-details (row 50) and fold-day-band, band-facts and inherited-venue were not restamped after they changed.
   - Fix: restamp every touched row on the final gate's commit at the shake-out's registration. This must be done before merge.

## Note

Code reviewer, minors:
3. Timeline overlap compares days even when bars carry times (`timeline/Timeline.tsx:81-85`, `timeline/overlap.ts`). On a timeline over Activiteiten laned by productie, a 10:00–12:00 repetitie and a 20:00 voorstelling on the same day count as an overlap. Compare `start`/`end` when `cal.start` exists, as conflicten.sql does.
4. A refused drop leaves an undo step that does nothing visible (`grid/store.ts:396-402`, asserted at `store.test.ts:733`). The next ⌘Z undoes rank writes that change no order. This touches the SPEC's "one ⌘Z undoes them together", so it needs a ruling. The option is to drop the entry when the card's own write did not land.
5. Letting go outside every column lands the card at the last target instead of cancelling (`board/useBoardDrag.ts:148`, `end` at :216-221). Cancel when the pointer is outside the board's box at drop.
6. Every card ranked as a side effect gets its own "verplaatst" entry and its own undo button in HistoryPanel; undoing one alone reorders the board. This follows from the SPEC's "each is its own write". Collapse consecutive moved-only entries, or add a batch route later.
7. `.nv-dw-long` adds about 30 lines to app.css's shared drawer section (`ui/app.css:3228-3258`). By the memory rule, styles go with their view, as place.css and flags.css do. `board/board.css:227` adds a second `!important`.
8. The drawer keys its flag bands by index (`grid/Drawer.tsx:186`, `${row.id}:${at}`). After a flag re-read, "Negeren" hides whichever flag is now at that index. Key the band by the flag's text and marks.

Security-sentinel: no Critical, High or Medium. Threats 1–5 and 7 are verified with their denial tests. Lows:
- L1. A valid 255-character rank blocks drops beside it (`packages/engine/src/writes.ts:125`, `board/rank.ts:61-80`, `board/drop.ts:31-46`). An editor can send one, and about 1530 moves to one spot reach one. Only an API PATCH with `position: null` recovers. Fix: when `rankBetween` would pass the cap, re-rank the neighbouring cards evenly in the same step; add a `drop.test.ts` case with a maximum-length `hi`.
- L2. Threat 6 (an undo after the maker's role became owner) is gated (`writes.ts:805-818` → `rankOf` :559-564) but has no committed test. A scratch probe confirms 403. A three-line test in `position.test.ts` closes the deferral.
- L3. A drop's writes are not atomic, and cards that were not moved get history entries (plan-accepted; a step endpoint later if wanted).
- L4. The client's "can write" is per dataset (`app.ts:315` `writable`, used at `App.tsx:614` and `derive.ts:92`). An owner on a shared board would see drag offered and get 403. This is informational; the server enforces it.
- L5. Rank masking in `/history` is cosmetic, because `/rows` and `/revisions` serve ranks. An owner learns only its own rows' ranks. Informational, by design.

Triage of the ledger's deferred minors (code reviewer):
- Must fix before merge: the CHECKS stamps (Should fix 2).
- Already resolved, close them:
  - Task 1's rank→rank undo test (now asserted);
  - Task 2's part-way undo re-read (24eeefd);
  - Task 4's targeted-only board-drag-refused (gate run 4, 285/0).
- Cheap, recommended in the fix pass:
  - focus after "Negeren" falls to body, so Escape no longer closes the drawer; move it to the drawer's close button (Task 9);
  - board-undo-both's drawer variant should assert `toBeFocused()` on Sluiten (Task 4);
  - `!tones` in useTones' early return (Task 8);
  - an `applyStep` assertion that no two changes name one record (Task 2 M2);
  - a few px of slack on `RANGE_WIDTH` 208 (Task 5).
- Stefan's call:
  - the note field's blue rounded focus ring;
  - the empty "NOTITIES —" block on read-only drawers;
  - bezetting counting place rows, not `aantal` (G7 reuses `crewOf`);
  - the gallery card's relation line staying untoned (Task 8).
- Before cutover: the conflicten read on undated views (Toewijzingen) is unwindowed and capped at 5000 rows. Check the count and read time on the Laika import.
- Stay deferred: the rest of the ledger's minors, as listed by task in the reviewer's report.

Declined to judge (code reviewer):
- drag smoothness, which the orchestrator judges on the preview;
- pixel parity, left to the shake-out;
- bezetting vs `aantal`, an owner decision;
- k+1 PATCHes and no rebalancing, which is the SPEC's design;
- ⌘Z not undoing the switch to manual (the spec is silent; the order is restored);
- read-only notes outside the Grid drawer (ruled in Task 6);
- a conflicten re-read per write and Workspace re-renders, carried to the UI-architecture feature;
- threat 6's deferral;
- Biome off for apps/grid, carried to the UI-architecture feature.

## Rulings on this review (orchestrator, 2026-10-16)

- Should fix 1: option (a). "Iemand anders kiezen" goes in every record drawer that has a store behind it, the board's first.
  - Workspace builds one writer factory, `places`, once from App's store and notify, and passes it beside onDrop through the skins' props into useOpenRow and the calendar's and dashboard's drawers. That is a line plus props, no state, and App.tsx stays at or under 694 lines. It is recorded in plan.md as the second exception.
  - The matrix row drawer uses the matrix store's existing pick if that is a prop wiring; otherwise it keeps "Negeren", and the orchestrator is told.
  - conflict-choose-other also runs from the board's drawer.
- Note 4: yes. A refused drop leaves no undo step; the ranks it wrote match the order already shown. The SPEC changes in the same commit, and board-drag-refused gets one ⌘Z after the refusal that undoes the edit before the drop.
- Note 6 stays a Note.
- Security L1: deferred. It is recorded in plan.md's carried list as: a 255-character rank refuses drops next to it; reachable by an API PATCH or about 1530 moves to one slot; recovery is a PATCH of null; fix: rebalance the neighbours evenly when rankBetween would pass the cap, inside the step.
- Stefan's notes, ruled from his recorded rules:
  - The note field gets no coloured rounded focus ring ("i really don't like colored rounded borders"). It takes the same focus treatment as the drawer's other in-place fields, and focus stays visible. If those fields carry the same ring, the orchestrator is told first.
  - A read-only drawer with an empty note shows no NOTITIES block; an editable one keeps its empty block.
  - The gallery card's relation line takes the tone, like the board card's (Q6, "card lines").
- To Stefan, not holding the close: bezetting counts place rows, not `aantal` (it reuses crewOf, as the Mensen meter does).
- Carried in plan.md, before cutover: the conflicten read on undated views (Toewijzingen) is unwindowed and capped at 5000 rows; measure on the Laika import.

## Fix pass (2026-10-16)

- Fifteen commits, b66c8e2..9c6133e, each behaviour fix RED→GREEN. The fix report is kept in the controller's workspace.
- Should fix 1: "Iemand anders kiezen" is in the board, timeline and calendar drawers through one `places` factory in Workspace (App.tsx 686 lines). conflict-choose-other also runs from the board's drawer.
- Should fix 2, the CHECKS stamps: restamped at the shake-out on the final gate's commit.
- Notes 3, 4, 5, 7 and 8, security L2, the cheap list, and Stefan's NOTITIES block and gallery card line: done.

## Deferrals

- The app-wide focus ring vs Stefan's no-coloured-rounded-borders rule: his call, a whole-app change, never note-only (orchestrator, 2026-10-16; theme.css untouched).
- The dashboard drawer (no store) and the matrix row drawer (move repaints rollups only) offer "Negeren" only. They are deferred with the editable Mensen section.
- Security L1, a 255-character rank refuses drops next to it: carried in plan.md.
- Note 6 (one history entry per ranked card) stays a Note.
- With the board.css `!important` gone, a keyboard drag no longer forces the grabbing cursor on a resting mouse. Left as it is (orchestrator, 2026-10-16).

Findings: 0 Blocking · 2 Should fix · 13 Note
