# Plan review, round 2: drawer-actions
Reviewed-plan: 0d020075bf6da1bc2fb67ab03f9324ab162235ba specs/drawer-actions/plan.md

I checked the plan against /home/ntdst/Sites/worktable-selection (feature/selection-actions at 984bf85, which already contains main 7a1679d), read-only. Spec blob 4323005 verified.

**Result:** every round-1 finding is resolved in the plan text. But one fix (B2) brought in a premise that is false in source. Two smaller problems are new.

## Round 1, finding by finding
- **B1: resolved.**
  - `lookupSelect(linked, scope)` works for link rows. `pointingAt` is a bare `db.select()` (rows.ts:204-205). `lookupSelect` qualifies columns by dataset name (lookups.ts:48-55), and `readRows` (rows.ts:161) and `rowOf` (writes.ts:721) already use it over the same `.from(table)`.
  - `cellsOf` stays unchanged as long as `pointingAt` takes the select as an argument (or `linksOf` gets its own read) and `cellsOf` (rows.ts:228) does not pass it.
  - `withLookups` picks the lookups up by key (rows.ts:107-110), and `linkOf` still strips them (rows.ts:245-256).
  - An owner's link row carries only owner_visible lookups (lookups.ts:71-76). That matches threat 4.
  - The route's `rowOf` gives the same `EngineRow` shape as `GET /rows`, so the mark and the 422 agree. One caveat: N1.
- **B2: resolved in the file lists, but the re-read the plan states for the calendar does not work.** See new B1.
- **S1: resolved.**
  - `Grid.openRelated(target, id)` exists at Grid.tsx:318-326.
  - `api.runAction` and `api.runSelection` already return `created` (api.ts:331-342).
  - `act` and `actOnSelection` are wired only to Grid (App.tsx:643).
  - One design point remains: N2.
- **S2: resolved.**
  - `available.state` is read from the link record's own lifecycle column, so a `link.state` that names some other column no longer matters.
  - The grid knows the link dataset's lifecycle column: `Model.lifecycle` comes from engine.ts:215, and every source becomes a model, `listed: false` included (engine.ts:296).
  - One edge remains, a null state: N3.
- **S3: resolved.** `reply` (app.ts:44-48) gains `available`, with a test.
- **S4: resolved.** The drawer filter has a test.
- **S5: resolved,** but the spec has since been corrected too: N4.
- **S6: resolved.** `OVERWRITTEN` (validate.ts:229-234) is checked for datasets and queries alike, `LOOKUP_RESERVED` is at validate.ts:282-296, and `toRow` at engine.ts:444-451.
- **S7: resolved in the plan text,** but its test cannot be written on the fixture: new S1.
- **S8: resolved.** Dashboard.test.tsx:94 has `describe('a list tile')`.
- **Notes: all applied.** That covers:
  - the stale-press race, threat 4's wording, and threat 5's stop on `null`;
  - dropping a `'*'` transition to the current state, and `refresh: onDone`;
  - the matrix staying out by construction, and the vocabulary scope;
  - a new action instead of changing `gather`, a second e2e account, and `i18n.ts`;
  - the studio rulings, and the two reasons in the simplest-design section.

## Blocking

**B1. In the calendar, board, timeline and gallery drawers, a re-read never shows.**
- **Plan:**
  - Task 2 Files, l.178: "`calendar/Calendar.tsx` (its own drawer; its re-read is `setOpen(found)`)".
  - Task 2 Step 2, l.195: "Every drawer host passes `onDone` to re-read its row".
  - Task 3, l.207: `useLive` stops "on leaving a live state", judged on the host's `row`.
- **Source:**
  - Calendar.tsx:223: `const open = opened ? (rows.find((row) => row.id === opened.id) ?? opened) : null`. useOpenRow.tsx:21 does the same for Board, Timeline and Gallery.
  - `rows` is App's store rows for calendar, board and timeline (App.tsx:396, 625, 628, 631). For gallery it is `result.rows` (App.tsx:635).
  - The press (plan l.182) calls `api.update` and pushes history. Nothing replaces the row in the store.
  - So `setOpen(found)` is always overridden by the stale row from `rows`.
- **Effect:**
  - In those four drawers, a press lands but the drawer keeps the old state and buttons. A second press gets 409 `transition_lost`.
  - A poll's answer never shows.
  - Because `useLive` never sees the record leave a live state, the poll runs until the drawer closes. That is the spec's anti-goal (spec l.79) and breaks Review Focus 3.
  - Task 2's test "the board's, calendar's, related and dashboard drawers show the buttons too" only checks that buttons appear, so it would pass anyway.
- **Smallest change:**
  - State where the re-read lands for these hosts. For calendar, board and timeline: in App's store, with `store.replace(found)` as `repaint` does (App.tsx:486-488). For example, `DrawerWrite` also carries a `fresh(row)` that App applies to its store.
  - For the gallery, which reads `result.rows`: re-read the view, or have useOpenRow prefer the re-read row.
  - Add a Task 2 test: "a press in the board's and calendar's drawer shows the new state and its next button".
  - Drive `useLive`'s "stops on leaving a live state" through a host built on useOpenRow.

## Should fix

**S1. No link in the fixture lets an owner see a link item, so the owner `detail` test cannot be written.**
- **Plan:** Task 1 Step 3, l.157 ("an owner gets a link item's detail only when its column is owner_visible"). Step 2, l.145-146, extends only "the link dataset".
- **Source:**
  - The fixture's only link is `bundle.members` → `tie` (selection-domain.ts:15).
  - `tie` declares no `owners` (selection-domain.ts:32-43). So `readable` is false for an owner (access.ts:59-61), and `linksOf` skips the link (rows.ts:275).
  - Giving `tie` owners would break selection-actions.test.ts:154, where an owner running `tidy` on `tie` must get 404 `unknown_source`.
  - Separately, `tieWriter` has no `update` (selection-domain.ts:80-86). Every link-item press on `tie` would get 405.
- **Change:** Step 2 adds a second link dataset that declares `owners`, with one `detail` column owner_visible and one not. Leave `tie` unchanged. The link dataset that gets a lifecycle also gets a writer `update`.

**S2. The `useLive` stop conditions and their test disagree.**
- **Plan:** the interface at l.207 and threat 5 at l.51 say it stops on 401 or 403. The test at l.216 says "backs off after errors and stops on 404".
- **Source:** a gone or out-of-scope record is `null` from a 200 (api.ts:304-307), which l.217 already tests. Nothing drives 401 or 403.
- **Change:** make the test "stops on 401 and 403". Say whether a 404 (a source the viewer lost) also stops it.

## Note

- **N1. The action route: keep `readRecord` first.**
  - `rowOf` (writes.ts:717-726) filters neither `deleted_at` nor scope. Its `scope` only chooses which lookups are selected. A missing id makes `withLookups([undefined])` throw, a 500.
  - Task 1 Step 5 (l.169) should say: `readRecord`'s 404 comes first (actions.ts:101-108), `run` still receives `readRecord`'s record, and `rowOf` is read only to judge `when`.
  - The existing 404 tests would catch a straight swap.
- **N2. Opening "the record it ran on" through `openRelated` replaces the table drawer with the bare related drawer.** The table drawer has actions, nav, `onWrite`, `onLink` and delete (Grid.tsx:366-371). The related drawer has none of them (Grid.tsx:364-365). When the target is the view's own model, `setDrawer(id)` keeps the full drawer.
- **N3. A null lifecycle value.**
  - `allowed` lets a `'*'` transition start from `null` (writes.ts:279).
  - But `expectedOf` answers 400 to an expect that is not a string (writes.ts:305-314), and `api.update` types expect as `Record<string, string>` (api.ts:295).
  - `availableOf` should mark no button when the state is not a string.
- **N4. The spec already carries the `/schema` ruling.** Spec l.85 says "revised after the plan review: `/schema` does not list the transitions themselves". Global Constraints l.27 ("against the spec's Constraints line; the spec is corrected in Task 1's docs commit") is stale. Drop the spec edit from Task 1 Step 1.
- **N5. Pressing a button on the dashboard.**
  - There is no store on the dashboard, so `saves` is null (App.tsx:402) and the toast's Undo does nothing (App.tsx:659). The press's Undo entry cannot be reached. Give a successful press a notice with Undo, as `finished` does (App.tsx:544-547), and have it call the entry's `refresh`.
  - Task 4's e2e expects "the tile's count updates". For that, the dashboard's `onDone` must also call its `refresh` (Dashboard.tsx:39-40), not only re-read the drawer.
- **N6. Review Focus 4 (l.86) overclaims for inline edits.**
  - It says that after an inline edit the drawer shows its link items' buttons. But the write reply carries no `links` (app.ts:44-48), and the store replaces the row with that reply (store.ts:261).
  - The reply's marks restore the row's own buttons, not the link items'. This is existing behaviour. Narrow the line.

## Premises checked
- `lookupSelect` usable on link rows, with `cellsOf` untouched → rows.ts:200-234, lookups.ts:48-87 → holds, given a select argument to `pointingAt`
- `rowOf` carries lookups in the caller's scope, inside the transaction → writes.ts:717-726, actions.ts:125-139 → holds for lookups; it does not filter scope or `deleted_at` (N1)
- `available.state` as expect for link items → rows.ts:245-256 (`link.state` is separate), engine.ts:215, engine.ts:296 → holds
- `expect` accepts only a string on the lifecycle column → writes.ts:305-314 → holds (N3)
- The write reply is `rowOf` plus revision, so `available` can be added → app.ts:44-48 → holds
- `act` / `actOnSelection` can resolve `created` → api.ts:331-342, App.tsx:549-561 → holds
- `Grid.openRelated` reads with `rowOf` and shows `recordGone` → Grid.tsx:318-326 → holds
- Calendar's re-read is `setOpen(found)` → Calendar.tsx:223 → does not hold (B1)
- useOpenRow hosts can re-read by `setOpen` → useOpenRow.tsx:21 → does not hold (B1)
- `available` can be reserved → validate.ts:229-234 and 282-296; engine.ts:444-451 → holds
- The parent is created first, so `created[0]` is it → writes.ts:489-494 → holds
- `gather` is used by selection-actions.test.ts:78-94 and tools.test.ts:194-201 → holds
- An owner can read the fixture's link dataset → selection-domain.ts:32-43, access.ts:59-61 → does not hold (S1)
- Dashboard list-tile tests → Dashboard.test.tsx:94 → holds
- Second e2e account on 4314 → e2e/auth.ts:26-32 has only `selection` (editor) → the plan adds one; holds

## Verdict
**Not ready.** B1 is a false premise in source. The fix is a few lines in Task 2: name where each host's re-read lands, and add one test. S1 and S2 are small edits to the fixture and to one test name.
