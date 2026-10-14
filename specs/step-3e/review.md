# Step 3e review: 64cc5d3..e34cec9 (feature/step-3e)

This was a static review only. I ran no tests, servers or Playwright. I checked `packages/engine` with `git diff --stat 64cc5d3 e34cec9 -- packages/engine`, which is empty, so the engine is untouched.

## Strengths

- **`ui/period.ts` is small and pure, and it owns the whole period model.**
  - `periodOf`, `pressMonth/Week`, `todayPeriod`, `stepPeriod` and `withPeriod` replace three inline code paths in App/ChipBar. They hold the R1–R5 rules in one place.
  - The calendar, timeline and matrix windows (including the 92-day matrix cap) now come from `shownOf`, so the toolbar and the skin cannot disagree.
- **The period chip is hidden without copying state.** `Filters` drops the period by identity (`f !== period`). `dateCondition` is the same object found in `layout.filters`, so the comparison is sound, and the builder still edits the period (as ruled).
- **The new key listeners don't leak.** The calendar/timeline ←→/T listener in `App.tsx:105-120` reads the latest period through a ref (`stepping.current`), registers once per `keyed` change and cleans up. There is no stale closure. Board ⌘Z in `Board.tsx:151-163` follows the same pattern.
- **`drawer/derive.ts` is generic and unit-tested.** It has no domain words: the kind is the first toned non-state select, state is detected through status tones, and inbound relations come from the schema. `propsOf` is one function with one rule.
- **The kandidaten change is careful.**
  - The open-slot branch gains `NULL AS persoon_id`, and `p.id IS NOT NULL` is always true, so the slot rows are unchanged.
  - `PARTITION BY s.id` cannot mix the two branches, because a toewijzing is either open (persoon_id NULL) or assigned.
  - The ids `s.id*1e6+p.id` stay unique.
  - `KANDIDATEN` matches on `toewijzing_id`, so the open-slot picker cannot see the new rows.
  - `seedMissing` updates the system Kandidaten view, so existing databases also get the `vervangt` filter.
- **The calendar packing in `calendar/layout.ts:157-187` is correct.** It goes in start order with the lane as tiebreak, then widens an event into free columns to its right. Widening stops at the first overlapping column, so boxes never overlap.
- **The tests track the plan's Review Focus closely.** `period.test.ts` covers the press/step/today table. `Drawer.test.tsx` covers "–" when the row left the view, no history on a query, Escape on the wide drawer before close, and the icon when there is no kind.

## Issues

### Critical (Must Fix)

**C1. "Wie kan in de plaats → Kiezen" loses the place's role, note and other fields, and needs two undo steps.** `apps/grid/src/matrix/Panel.tsx:214-218`

```ts
if (await store.set(row.id, to, status || null)) await store.set(row.id, column, null)
```

- `store.set` on the new column creates a fresh join record through `created()` (`matrix/store.ts:165-173`). That record only holds the row, the person and the status. The note comes from `opFor`'s `before?.note` for the new column (`store.ts:415`), which is empty.
- The second `set(..., null)` then deletes the original toewijzing, and its `rol_id`, `notitie`, `aantal` and anything else go with it.

What a planner sees:
- The substitute's place has no role. The Rol line reads "–" and the head's role line drops it.
- The place also falls out of `kandidaten` for any later substitution, because the SQL needs `t.rol_id IS NOT NULL`.
- The note ("Brengt eigen instrument") is gone.
- The status is copied as-is, so a `bevestigd` place is created already `bevestigd` for someone who was never asked.
- These are two separate `single()` ops, so two undo stack entries. One ⌘Z restores the original and leaves both people on the activity.
- If the second write is refused, both people stay assigned and nothing tells the user.

The e2e at `e2e/step-3e.spec.ts:433-446` only checks that Lotte is gone and that the new column exists. It never checks `rol_id` or the note on the new record.

**Fix:** move the place, don't recreate it.
- Add a `move(row, cell, to: MatrixColumn)` op to the matrix store.
- It does one PATCH of `join.column_field` on the existing join record, so role, note and history are kept. That gives one batch and one undo step, and it repaints both columns.
- Leave any state reset (e.g. back to `uitgenodigd`) to the theatre writer, which is where domain rules belong.
- Extend the e2e to assert `rol_id` and `notitie` survive and that one ⌘Z restores the original.

### Important (Should Fix)

**I1. The inbound section's "alle n" link does nothing inside the running app.** `apps/grid/src/grid/drawer/Sections.tsx:76-78`

- The `<a href="#view=…&f=…">` only changes the hash.
- `App.tsx` reads `view` and `f` once, at mount (`activeKey` initial state at :186, `landing` ref at :272).
- The only `hashchange` listener (`App.tsx:111-118`) handles token landings, so a click updates the URL and nothing else. It works only after a reload.
- No test covers it: I found no "alle" in the e2e or the Drawer tests.

**Fix:** pass an `onOpenView(key, filters)` through `SchemaContext`, or a callback prop, and call `setActiveKey` plus `storeLayout` the way the link landing does. Alternatively, have the `hashchange` handler apply `view` and `f`. Add a component or e2e test.

**I2. Domain words are hardcoded in apps/grid.** `apps/grid/src/i18n.ts` (`person: 'Persoon'`, `role: 'Rol'`, `onActivity: 'Activiteit'`, `awayLayer: 'Afwezigheden'`), used in `matrix/Panel.tsx:166-169` and `ui/SizeChips.tsx:23`.

- The matrix is a generic rows × columns join. These labels name theatre concepts.
- A fiche matrix, or any other domain, would read "Persoon / Rol / Activiteit / Afwezigheden".
- `check-vocabulary` doesn't scan i18n values, so the gate can't catch this. It still breaks AGENTS.md's one rule ("apps/grid holds no domain words").

**Fix:** use the labels the model already serves:
- `models[join.model].fields[join.column_field].label` for the person line
- `fields[join.open.match_field].label` for the role line
- the row model's field label or `models[view.model]` for the activity line
- `models[view.away.model].label` for the away chip

**I3. Later single clicks open the status choices after one keyboard hand-off.** `apps/grid/src/matrix/Panel.tsx:97` with `matrix/Matrix.tsx:253,371,379,624`

- `asking` is a counter that only grows. `CellDrawer` is keyed `${row.id}:${column.key}`, so each new cell remounts `StatusLine` with `useState(asking > 0 && store !== undefined)`.
- After one Enter or double-click anywhere, `asking` stays ≥ 1. Every later single click on another cell then mounts the drawer with its status list already open.
- That contradicts "a click leaves it on the cell": the keyboard stays on the cell, but the open list is visual noise and a misclick risk.

**Fix:** have the matrix pass an "ask" that is tied to the cell. One option is `asking={{ key: \`${row}:${column}\`, n }}`, opening only when the key matches the current cell. Another is to keep the drawer mounted across cells and compare only against `seen`, starting `seen` at the mount value. Add a Panel or Matrix test: Enter on cell A, then click cell B, and B's status must be closed.

**I4. The gate is not green, and two promised tests are missing.**
- The caller reports e2e at 260/262. `board-drag-refused` fails in full-suite runs, and `ui-fit picker` depends on the first row's data. Under the working rules, close requires `make gate` green. Order- and load-dependent e2e failures will keep voiding gates.
- Plan Review Focus 3 promised the refused-drop case in `Board.test.tsx`. That file only covers columns, handles, `+` and Enter. Nothing at component level proves a refused move snaps back.
- The plan's Test map lists `gallery/Gallery.test.tsx (new)`. It doesn't exist, so `sectionsOf` (ordering, "Geen" last, day labels) is covered by e2e only.
- Board drag is rebuilt in 3f, so the board part of this is "3f". Still, the flaky spec should be quarantined or fixed so the gate means something until then.

**I5. The title-line insight is stale after edits, and it recomputes on every render.** `apps/grid/src/ui/App.tsx:173`
- `insightOf(model, result.rows)` reads the loaded rows, not the store's rows.
- After a grid edit or a board drop from `optie` to `bevestigd`, the badge keeps the old count until the view reloads.
- It is also computed inline on every Workspace render, which is O(rows) each time.

**Fix:** feed it `store ? state.rows : result.rows` (as the board already does) and wrap it in `useMemo`.

### Minor (Nice to Have)

1. **The drawer's ↑/↓/j/k only work with focus on the ↑↓ buttons.** `grid/Drawer.tsx:78-83` with `ui/SidePanel.tsx:46-55`. The `onKeyDown` sits on `.nv-dw-head`, while expand and close are siblings outside it in `.nv-drawer__head`. The grid's drawer focuses close on open, so j/k do nothing until the user tabs. Spec C1 says "while focus is in the head". Move the handler onto `<header className="nv-drawer__head">`.
2. **"N van M" follows the raw `rows` order, not the screen order, on board, calendar and gallery.** In `useOpenRow.tsx:14-17` and `Calendar.tsx:236-237`, ↓ on a board jumps across columns in load order. Pass the displayed order (lanes, then cards; sections in a gallery).
3. **The drawer's HistorySection duplicates HistoryPanel's formatting and does it worse.** `grid/drawer/Sections.tsx:93-133` versus `ui/HistoryPanel.tsx:21-42`.
   - `by: 'self'`, `'hidden'` and `'gone'` all become "iemand".
   - Booleans print as `true`, objects as `[object Object]`, and relation changes as raw ids ("zette persoon op 12").
   - A failed read shows "Nog geen wijzigingen".

   Export and reuse `whose` and `shown`. History also never re-reads after an edit, a drop or an undo while the drawer is open (deps `[model.key, id]`).
4. **Uploads from read-only skins skip the undo history.** `useOpenRow.tsx:20-21` passes `attachments` but no `onBatch`, so a file uploaded or removed from a board, gallery or timeline drawer is missing from the tab's undo. The grid passes `batchOn`.
5. **Rail counts ignore the space and never refresh.** `App.tsx:124-136` with `api.ts:254-257`. The count is "the scope aside", so with a space selected, "Activiteiten 240" sits beside a view of 28 rows. A create, delete or undo leaves the count stale. Note this as a known limitation, or re-read on `reloads` and the scope change.
6. **`withPeriod` silently removes every date condition on the period's field.** `ui/period.ts:90-91`. A second condition such as "Plandag na 1 nov" from the builder shows as a chip, but the next › or Maand drops it. Remove only `p.condition`, by identity.
7. **The period memo pins `new Date()`.** `App.tsx:292` (deps `[view, layout?.filters]`). A tab left open over midnight or a week boundary keeps yesterday's "today" for relative names and for Vandaag until the filters change. This is low impact.
8. **`dashboardSum` relies on the i18n template's shape.** `App.tsx:147` uses `.replace(/^ · /, '')`, which breaks if a served string reorders. Add a `dashboardWeek` string for the no-space case.
9. **The wide drawer hardcodes `left: 268px`,** the rail width (`app.css`, `.nv-drawer-slot:has(.nv-drawer--wide)`). A collapsed or resized rail misaligns it. Use a CSS variable the rail sets.
10. **Several new elements put `aria-label` on a plain `<span>`.**
    - Rail count (`Rail.tsx:161`), `.nv-crew` (`cells/Links.tsx:41`) and the board faces (`Board.tsx:45`) put `aria-label` on a generic `<span>`. ARIA prohibits naming the generic role, and screen readers mostly ignore it. Use visually hidden text, or `role="img"` where it is a picture.
    - The toolbar insight (`Toolbar.tsx:94`) reads as "Optie 3" with no context.
11. **The board's page-level ⌘Z also fires behind QuickCreate.** `Board.tsx:153-163`. With the modal open and focus on a non-text control (its Pick or buttons), ⌘Z undoes the last board move. Also skip targets inside `[role="dialog"]` and `select`. Mark this "3f": dnd-kit replaces it.
12. **Board drag edge cases ("3f", no data loss found).** A card whose value isn't an option sits in "Geen". Dragging another card into "Geen" writes `null`, which is the right meaning, but a required field gets a refusal. `getDropOperation` refuses outside drags because `dragging.current` is only set by an in-board drag start. I found no path that writes to the wrong record.
13. **`werklijst.onderwerp` for an activiteit-linked taak can show a raw option key.** `werklijst.sql:20` uses `COALESCE(ta.omschrijving, ta.soort)`, which yields "repetitie", not "Repetitie". Fall back to the production title, or let the grid map the option.
14. **The person picker on an assigned toewijzing now offers candidates.** This is a side effect of the kandidaten union: before, the candidate list was empty for an assigned place and the picker went to "everyone". It is reasonable and arguably better, but nobody ruled on it and no test covers it. Worth one line in the spec's rulings.
15. **The calendar's `stepsPeriod` scope is narrow.** `hints.ts:579-584` only steps from `body` or `.nv-sheet`. After the user clicks › or Maand, focus sits on the toolbar chip, so the next → does nothing. Consider allowing `.nv-bar` chips that aren't text inputs or open panels.

## Recommendations

- Fix C1 before merge, with a store-level `move` and an e2e that asserts the role and note survive and that one undo restores the original.
- Fix I1 and I2 in the same pass. Both are small, and I2 is a standing-rule breach the vocabulary check can't see. Consider extending `check-vocabulary` to scan `apps/grid/src/i18n.ts` values against the domain packages' declared labels.
- Make the gate's two order-dependent e2e specs independent: seed their own rows, and keep `board-drag-refused` on keyboard only, as b533065 began. Otherwise every later gate on this box is ambiguous.
- When 3f rebuilds the board on dnd-kit, keep the page-level ⌘Z decision explicit and test it at component level.

## Declined to judge

- **The visual fidelity of each skin against its prototype:** no browser was allowed, so I couldn't take the compare pairs. The D9 walk claims them.
- **Held items Q1, Q2, Q6 and Q11** (NOTITIES, conflicts, production tone, group-head totals): explicitly held for Stefan and not built.
- **The not-built list in spec D9:** "+ Toewijzen" in the drawer, gallery Beelden, werklijst avatars, the timeline overlap insight, the dashboard cross-day band, and the cell drawer's place and ↑↓. The spec lists each as out.
- **Board drag UX details** (tilt, ghost 35%, drop-slot look): rebuilt on dnd-kit in 3f. I only checked for data loss.
- **The privacy of showing the email local part as the actor:** ruled as Q7.
- **Rail counts ignoring the space as a design choice:** the comment states it deliberately (`api.ts:254`), so I list it under Minor only for the stale-count effect.
- **Timeline and gallery hint wording:** ruled in Q19 and the D9 ruling.
- **Whether a `today` or other non-week condition on a calendar should be visible as a narrower grid:** pre-existing `calendarWindow` behaviour, and the spec is silent.
- **The `+ 1 vaste filter` note on Kandidaten:** recorded as a known consequence in D9.
- **CSS density and colour choices beyond the "no coloured rounded borders" rule:** I grep-checked the added CSS (only one dashed neutral border, for the open-place avatar) and left the rest to the compare pairs.
- **Performance of `roleOf` and Bezet per render in the matrix:** O(columns × rows) at plausible sizes (≤ 92 days). Not worth flagging.

## Assessment

**Ready to merge: With fixes.**

The core of the step is sound and well factored: the one period model, the drawer derivations and the kandidaten union. The engine is untouched, and the open-slot candidate rows are provably unchanged. C1 is a real data-loss path on a button the step adds: substituting a person drops the place's role and note and splits the undo. It has to be fixed before merge. I1 (a dead link), I2 (domain words in apps/grid, against the standing rule) and I3 (status opening on plain clicks) are small and should land in the same fix pass. I4 means the gate isn't green as reported, so the close can't be called done until the two order-dependent e2e specs are made reliable.

---

## Fix pass (one, after this review)

Each fix was RED first, then GREEN, through the seam where the finding showed.

| Finding | Fix | Proof |
|---|---|---|
| C1 Kiezen loses the place's role and note, in two undo steps | `store.move`: one update of the person on the same join record (fill's path: one batch, one undo step). The writer decides the newcomer's state (it moves to `voorlopig`). | `matrix/store.test.ts` › move (RED: not a function); e2e `matrix-cell-drawer` checks the role and note kept, one record on the activity, and one ⌘Z giving the place back |
| I1 the drawer's "alle n" does nothing until a reload | App follows a `view`+`f` link on `hashchange` and lands it as at mount | `App.test.tsx` › "lands a link followed while the app is open" (RED: no filters) |
| I2 theatre words in apps/grid | The cell drawer names its lines by the join's own field labels. Ruling: the away chip keeps "Afwezigheden", the engine's generic away layer in the legend's words, as in i18n since step 3; the away table's label would read "Beschikbaarheden". | `Panel.test.tsx` › "names its lines by the join's own field labels" (RED: Persoon/Activiteit) |
| I3 every click opens the status after one Enter | The hand-off asks one cell, keyed by row and column; a plain click asks nothing | `Panel.test.tsx` › "opens the status for the hand-off only" (RED) |
| I4 gate and missing tests | `board-drag-refused` is a `test.fixme` pointing to step 3f, by worktable-ac's ruling. `ui-fit` › `select-and-picker-fit` opens a row it creates itself, an open place with known candidates. `gallery/Gallery.test.tsx` covers `sectionsOf`. The refused board write's revert stays covered by the grid store's refusal tests. | ui-fit e2e 7/7; Gallery.test 3/3 |
| I5 stale insight | Counted on the store's rows and memoised | `App.test.tsx` › "counts the rows as the sheet now holds them" (RED: badge kept after the edit) |
| Minor: drawer ↑↓/j/k only on the ↑↓ buttons | The head line handles the keys, the close button included | `Drawer.test.tsx` › "steps with j and k from anywhere in its head" (RED) |

Not fixed, noted:
- "N van M" follows load order on board, calendar and gallery.
- The drawer's history words: relation ids are raw, and self/hidden/gone all read "iemand".
- Files uploaded from a skin drawer skip the undo history.
- Rail counts ignore the space and never refresh.
- `withPeriod` keeps one date condition per field (by design: one period).
- The `dashboardSum` string; the wide drawer's 268px; `aria-label` on spans.
- werklijst `onderwerp` can show an activity's raw soort key.
- The person picker on an assigned place now offers its candidates.
- Board ⌘Z behind the QuickCreate modal, carried to step 3f.
