# Plan review, round 3: drawer-actions
Reviewed-plan: 8b4f1240c085ea2c6bf27fdc863a8e2bc797714b specs/drawer-actions/plan.md

**Verdict: ready with fixes.**

I checked the plan against /home/ntdst/Sites/worktable-selection (feature/selection-actions at 984bf85), read-only. Plan blob 8b4f124 and spec blob 4323005 both match.

All round-2 findings are applied. The changes to the re-read text (plan l.189-193) leave three new problems: S1 and S2 below are two separate defects in that text, and S3 comes from the new gallery line.

## Round 2, finding by finding
- **B1: resolved for the four hosts.**
  - Plan l.189-193 names where each host's re-read lands.
  - Plan l.206 adds the board and calendar press test.
  - Plan l.232 drives useLive's stop through the board.
  - The premises hold:
    - `store.replace` exists (store.ts:304-307).
    - `repaint` is at App.tsx:486-488.
    - Calendar, timeline and board get `store ? state.rows : result.rows` (App.tsx:625, 628, 631). The gallery gets `result.rows` (App.tsx:635).
- **S1: resolved.** Plan l.149-150 adds a second link dataset with `owners`.
  - `bundle` declares `owners: { owner: 'id' }` (selection-domain.ts:13), so a link dataset with an owner column `bundle_id` is readable by an owner (access.ts:59-61).
  - `tie` keeps the 404 that selection-actions.test.ts:154 relies on.
  - The only users of the fixture are selection-actions.test.ts, tools.test.ts and e2e/auth.ts. None asserts on bundle's `links` as a whole.
- **S2: resolved.** Threat 5 (l.51), the interface (l.220) and the test (l.231) now say the same thing: stop on 401, 403 or 404, and on `null`.
- **N1: resolved.** Plan l.171-174 matches actions.ts:101-108 and 145-151. `rowOf` (writes.ts:717-726) is used only to judge `when`.
- **N2: applied.** Plan l.222. One gap remains: Note 1.
- **N3: resolved.** Plan l.169 agrees with writes.ts:305-314.
- **N4: resolved.** Plan l.27 is corrected and Step 1 no longer edits the spec.
- **N5: resolved.**
  - Dashboard.tsx:39-42 `refresh` exists.
  - The press notice follows `finished` (App.tsx:539-547), and the Toast renders a notice without `saves` (App.tsx:659).
  - Undo calling `refresh: onDone` works: store.ts:316 runs `entry.refresh` instead of re-reading itself.
- **N6: applied.** But the new l.189 contradicts it: see S1.

## Blocking
None.

## Should fix

**S1. "Every host prefers its re-read row" hides later store writes in the same drawer.**
- **Plan:** Task 2 Interfaces, l.189: `open = fresh ?? rows.find(…) ?? opened`, for every host, the table included. Review Focus 4 (l.86) relies on the opposite: after an inline edit, the drawer shows the store's row.
- **Source:** the drawers follow their store on purpose:
  - useOpenRow.tsx:20: "a drop or an undo repaints the drawer too";
  - Calendar.tsx:222: "a place chosen in the drawer repaints it", through `placeWriter(store, …)` (App.tsx:512);
  - Grid's table drawer reads `state.rows.find` (Grid.tsx:328), and its `onWrite={apply}` writes through the store (Grid.tsx:369).
- **Effect:** the plan says nothing about when `fresh` clears. So after a press:
  - an inline edit in the table drawer, a place chosen in the calendar or board drawer, or a drop or toolbar undo all land in the store;
  - the drawer keeps showing the press-time row;
  - outside a live state, this lasts until the drawer closes.
- **Why it is unnecessary:** `fresh` → `store.replace` already puts the re-read row into `rows` for the store hosts.
- **Smallest change:** rewrite l.189 as follows.
  - "A host whose rows are App's store reads them as today; `fresh` lands there through `store.replace`."
  - "Only the dashboard (`opened.row`, Dashboard.tsx:47) and Grid's related drawer (`related`, Grid.tsx:151) hold their own re-read row." The gallery is S3.
  - Add a Task 2 test: "after a press, an inline edit in the same drawer shows its value".

**S2. `fresh(row)` carries no model, so a related drawer's re-read overwrites a row of another dataset in the view's store.**
- **Plan:** l.191: "`DrawerWrite` carries `fresh(row)`. Where App has a store … it calls `store.replace(row)`." l.208 wires the related drawer as a host. Threat 5 ties every poll tick to `fresh`.
- **Source:**
  - `replace` patches by id alone: `patch(row.id, () => row)` (store.ts:304-307).
  - The related drawer shows a record of `related.model`, another dataset (Grid.tsx:364).
  - The store's own repaint guards with `entry.model === model` (store.ts:320). `fresh` has no such guard.
- **Effect:** this hits the spec's headline flow. Studio's Bijwerken opens the opdracht through `openRelated` (plan l.223) while the Sites store is on screen. Every 3 s, the poll would replace the site whose id equals the opdracht's id with the opdracht row.
  - The fixture reproduces it: a created bundle gets id 3, and member 3 is "Cy" (selection-domain.ts:121-126).
- **Smallest change:** `fresh(model: string, row)`, where App calls `store.replace` only when `model === view.model`. Add a Task 2 test: "a press in a related drawer leaves the table's row with the same id as it was".

**S3. The gallery's "re-reads the view" turns its live drawer into a view poll.**
- **Plan:** l.192, "The gallery, which reads `result.rows`, re-reads the view". Threat 5 (l.51) judges each poll tick on Task 2's `fresh`.
- **The plan's own bounds:** "every 3 s, one record plus its link items" (threat 5) and "No list view polls" (l.36; spec R4).
- **Effect:** if the gallery's `fresh` reloads the view, each tick re-reads the whole view.
- **Smallest change:** pick one.
  - Re-read the gallery's view after a press only, never on a poll tick.
  - Or, simpler: pass the gallery `store ? state.rows : result.rows`, as App.tsx:625-631 does for the other three skins. The gallery then becomes a store host and needs no reload.

## Note
- **N1. `setDrawer(id)` for a record the view does not yet hold.**
  - **Plan:** Task 3, l.222.
  - **Source:**
    - `finished` calls `reloadView()` without awaiting it (App.tsx:543).
    - Grid's drawer is `state.rows.find(...)` (Grid.tsx:328).
  - **Effect:** for a created record of the view's own dataset:
    - nothing opens until the reload lands;
    - if the record falls outside the view's filter, window or cut, nothing opens at all, with no `recordGone` notice;
    - a stale `drawer` id is left behind.
  - **Change:** use `setDrawer(id)` only when `state.rows` already holds the id (the single action's own record). Otherwise use `openRelated`, whose drawer carries R1, R2, R4 and R5 after Task 2.
- **N2. The fixture does not say which link dataset carries the lifecycle.**
  - **Plan:** l.145 and l.149 put a lifecycle and writer `update` on "the link dataset". l.150 says "`tie` stays unchanged".
  - **Change:** name the dataset. Simplest: put the lifecycle, the buttons, writer `update` and `detail` on the new owner link dataset, and leave `tie` and gather's ties (selection-domain.ts:96-99) untouched.

## Premises checked
- `store.replace(row)` exists and patches by id only → store.ts:304-307 → holds (S2)
- `repaint` uses `store.replace` → App.tsx:486-488 → holds
- Calendar, board and timeline read store rows; the gallery reads `result.rows` → App.tsx:625, 628, 631, 635 → holds
- The store-host drawers follow the store → useOpenRow.tsx:20-21, Calendar.tsx:222-223, Grid.tsx:328 → holds (S1)
- An undo with `refresh` runs only the refresh → store.ts:314-316 → holds
- `finished`'s notice with Undo → App.tsx:539-547 → holds
- The Toast shows a notice when `saves` is null → App.tsx:659 → holds
- Dashboard `refresh` and `opened` → Dashboard.tsx:39-42, 47, 105 → holds
- `setDrawer` and `openRelated` → Grid.tsx:149, 278-281, 318-326 → holds (N1)
- The related drawer is another dataset's record → Grid.tsx:151, 364 → holds (S2)
- `readRecord` 404 first; `run` gets its record → actions.ts:101-108, 145-151 → holds
- `rowOf(store, dataset, id, scope)` → writes.ts:717-726 → holds
- An owner can read a link dataset whose owner column points at bundle → selection-domain.ts:13, access.ts:59-61, 70-76 → holds
- `expect` takes a string only → writes.ts:305-314 → holds
- `runAction` and `runSelection` return `created` → api.ts:331-342 → holds
- The files Task 2 and Task 3 modify all exist (Sections.tsx, PlaceRow.tsx, i18n.ts, e2e/auth.ts, Dashboard.test.tsx:94 `describe('a list tile')`) → holds

## Applied after this review (Claude, 2026-10-22)

All three Should-fix items and both Notes are applied:
- **S1:** the store hosts read the store as today. Only the dashboard's and the related drawer hold their own re-read row. Test: "after a press, an inline edit in the same drawer shows its value".
- **S2:** `fresh(model, row)` replaces a store row only for the view's own model. Test: "a press in a related drawer leaves the table's row with the same id as it was".
- **S3:** the gallery becomes a store host, as the other three skins are.
- **N1:** `setDrawer(id)` is used only when `state.rows` holds the id; otherwise `openRelated`.
- **N2:** the lifecycle, buttons, `detail` and writer `update` go on the new owner link dataset; `tie` stays untouched.

The plan's blob after these edits is 3faba71809bde9764a4e67c72beb0cceb6be9d4f, and the spec is unchanged at 4323005b2b821efc5cd9049853615388c8bc2df8. With nothing blocking, no further round was run.
