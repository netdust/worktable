# Plan review — react-aria
Reviewed-plan: 3941bc8eb18c06c8fe735c05f2581e930ba9260b specs/react-aria/plan.md
Verdict: not ready

Every spec requirement (R1 to R7) has a task. The `docs/SPEC.md` sentence and the field-contract update are already committed in 0e96e48 (SPEC.md:37, field-contract.md:371-375), so they need no task. Most premises hold. One does not, and Review Focus 1 rests on it.

## Blocking

**B1. The `Pop` does not fix the click problem it claims to fix (Simplest design; Review Focus 1; Task 1 `Pop.test.tsx` "a click in the popover keeps the edit").**
- The plan says the popover sits "outside `[data-editor]` where the sheet looks for an open edit (`Grid.tsx:67`)", and that marking `Pop` `data-editor` means "a click in the popover keeps the edit".
- What the source does:
  - `fromCell` (Grid.tsx:66-68) is only checked in `onKeyDown`, `onCopy` and `onPaste` (Grid.tsx:260, 279, 286). It never decides anything about a click.
  - A click inside a React portal still bubbles up the React component tree. The editor is rendered inside the `<td onClick={() => actions.click(cell)}>` (GridBody.tsx:56-61), so a calendar-day or option click reaches `actions.click`.
  - `click` goes to `focus(cell)`, which sets `editing: null` (keys.ts:141-142, 77-79). The edit is dropped without a write.
  - The codebase already knows this. Links.tsx:106-108 says "A click in here would reach the cell, and selecting the cell ends the edit" and stops propagation on its wrapper.
- As written, the `Pop` test passes (the attribute is there) while the property it is meant to prove fails.
- Smallest change:
  - `Pop` stops click and double-click propagation. RAC `Popover` accepts `onClick` through `GlobalDOMAttributes` (@react-types/shared dom.d.ts:298-326).
  - Point Review Focus 1 at a test that renders the editor through `Grid`, clicks a calendar day or option, and asserts the edit committed and the cell's `onClick` did not end it.
  - Restate the reason in the Simplest design paragraph. `data-editor` only routes keyboard events from the portal to the key machine; that is a separate concern (see S2).

## Should fix

**S1. Task 6, Step 4 points at the wrong e2e lines and leaves out the ones that break.**
- `e2e/dagplanning.spec.ts:166-167` is the filter builder's "ligt tussen" range (FilterBuilder.tsx:106-107). That belongs to Task 10, not to a cell.
- The specs that type into date and time cells with `locator('input').fill(ISO)` are not named:
  - step-0b.spec.ts:108, 163-171, 205
  - step-0e.spec.ts:192-196, 262, 312-334, 377, 383, 420
  - step-1.spec.ts:175-177, 311, 335, 342
- step-0e.spec.ts:270-290 asserts `validity.badInput` on a native input, so it needs rewriting as an incomplete-segments flow.
- They break at Task 1, but the first e2e gate is Task 6.
- Fix: list these files in Task 1 or Task 6, with one shared helper for typing into segments (five specs each have their own `typeInto`). Drop the 166-167 reference from Task 6.

**S2. The "exactly once" Review Focus lines (3 and 4) are tested where a double write cannot be seen.**
- Every editor test renders the editor alone. A second commit comes from the sheet: a key that is not stopped reaches the `<table onKeyDown>` through the React tree, `fromCell` accepts it (the portal now carries `data-editor`), and keys.ts:93-96 commits `editing.draft` again.
- One concrete case is Enter on a ListBox option or calendar day: the editor commits it, then the sheet commits again.
- Fix: for Tasks 1 to 4 and 6, put the "commits once on Enter / Escape writes nothing" tests at the `Grid` seam, counting `update` calls. The pattern already exists in `Grid.test.tsx` ("picks a select from its listbox by letter and Enter", "cancels on Escape without a write"). Name those existing Grid tests in the Test map; they will break on the markup change and are the real guard.

**S3. Task 1, Step 3: the code shown contradicts its own tests.**
- No `data-editor` on the field:
  - Today `<input data-editor>` (Date.tsx:53) is what lets segment keys reach the sheet. Step 3 puts `data-editor` only on `Pop`.
  - Without it on the DatePicker/TimeField root, Enter and Tab from a segment never reach the key machine, because `matches('td[data-cell]')` does not match descendants.
  - Fix: state that every in-cell editor root keeps `data-editor`.
- Required columns can still be cleared:
  - `onChange={(d) => onDraft(fromDate(d))}` drafts `''` when every segment is cleared. RAC calls `setDate(null)` on a cleared value (react-stately useDateFieldState.mjs:154-156), and `isRequired` only validates.
  - Fix: show the guard (`d === null && column.required` → ignore).
- The "Escape writes nothing … `onCancel` called once" test:
  - Today Escape in a date editor is handled by the sheet (keys.ts:91), not the editor.
  - Asserting `onCancel` in isolation forces the editor to own Escape. Unless it also stops propagation, that cancels twice.
  - Fix: decide which of the two owns Escape, and test it at the Grid seam.

**S4. Test map row "Buttons, MoreMenu, Confirm, SidePanel, Drawer — existing `*.test.tsx` of each": three of those tests do not exist.**
- There is no `MoreMenu.test.tsx`, `Confirm.test.tsx` or `SidePanel.test.tsx` in `apps/grid/src/ui`. Only `Drawer.test.tsx` exists.
- Fix: name what really covers them (`Grid.test.tsx` drawer and DeleteRow tests; `e2e/model-menu.spec.ts` for MoreMenu), or add a test for MoreMenu's Escape-returns-focus, which the RAC swap changes.

**S5. Task 5 has no path for a related record the caller cannot read.**
- `rowOf` (api.ts:161-164) throws on 404 and returns null for an out-of-scope row.
- An owner account reads only the titles of related rows, never the rows (docs/SPEC.md Dataset row). The open button would show and then fail.
- Fix:
  - Show the button only when the target model is in `models`.
  - Handle `null` or a throw from `rowOf` with no drawer and a toast.
  - Add tests: "no open button when the target is not readable" and "a missing record opens no drawer".

**S6. Task 10's "a reversed range is not drafted" is new behaviour.**
- Today the two native inputs draft whatever is typed (FilterBuilder.tsx:106-107).
- R7: "no new behaviour beyond R4's editors."
- Fix: drop the test, or note it as a ruling for Stefan.

**S7. Task 11's "existing `ViewList.test.tsx`, kept" cannot hold.**
- The existing tests drive `useDragOrder` with `pointerDown`/`pointerMove`/`pointerUp` on `window` and check `nv-view--dragging`/`nv-view--drop` (ViewList.test.tsx:209-289). RAC `useDragAndDrop` uses its own drag events and drop indicators.
- `useDragOrder` is used only by ViewList, so "delete if nothing else uses it" is already decided.
- Fix:
  - Say the reorder tests are rewritten against RAC's keyboard drag or `onReorder`.
  - Delete `useDragOrder.ts` unconditionally.
  - State which current drag behaviours must survive: moving only within its own group, dropping past the last view.

**S8. Test map E2E flows give existing flows new names.**
- "toggle-theme-density" is `dark-and-density`, "period-between" is `period-is-a-filter`, and "new-view" is `create-team-and-personal-view` in specs/CHECKS.md.
- Fix: use the registered names.
- The new names (edit-date-cell, edit-select-cell, add-and-remove-link, open-related-record, reorder-views …) exist nowhere and no task writes them. Either say `/shakeout` creates them, or assign them to tasks.

## Note

- **N1. A simpler design the plan did not consider.**
  - In 1.22, `UNSTABLE_portalContainer` on Popover and Modal is marked `@deprecated - Use a parent UNSAFE_PortalProvider` (RAC dist/types/src/Popover.d.ts:46, Modal.d.ts:36).
  - One `<UNSAFE_PortalProvider getContainer={() => document.getElementById('root')}>` beside the `I18nProvider` in main.tsx would send every popover, menu and modal into `#root`. Tasks 7 and 9 would then stop passing the prop per call site.
  - `Pop` would shrink to class + `data-editor` + click stop.
  - The provider is exported from `react-aria` 3.53.0 (exports/index.d.ts:92), not from `react-aria-components`. It would need adding as a direct dependency.
  - Even with the plan's own design, Tasks 7 and 9 use a bare `Popover` or `Modal` with the prop, while Task 1 says "every later task's popover, menu and modal uses these". That is two ways of doing one thing.
- **N2. Modal or non-modal `Pop` for cell editors is undecided.**
  - A modal RAC Popover adds a full-screen underlay and contains focus (Popover source: underlay `position: fixed; inset: 0`).
  - A click on another cell would then close the popover instead of committing and selecting that cell, as blur does today.
  - Decide `isNonModal` (or how `onOpenChange(false)` maps to `onLeave`/`onCancel`) in `Pop`'s interface.
- **N3. An incomplete date followed by Enter.**
  - RAC emits no `onChange` for an incomplete value (useDateFieldState.mjs:164-180), so the draft keeps the last complete value.
  - Enter then commits that value and closes the editor. The contract says "keeps the editor open and writes nothing". This needs a ruling at Task 1.
- **N4. Arrows in an editor opened by typing.**
  - In `enter` mode, arrows commit and move (keys.ts:99-100). The contract says ↑↓ step the focused segment.
  - Whether RAC segments stop propagation of arrow keys decides which one wins. Rule on it and test it at the Grid seam.
- **N5.** Task 1's typed-digit handling is already deferred to a `Ruling:`. That is fine as written.
- **N6.** There is no `## Threat model`. No security-boundary file is touched; Task 5's new read is enforced by the server. S5 covers the UX side.

## Premises checked
- `fromCell` at Grid.tsx:67 → Grid.tsx:66-68 → holds as a location. "Where the sheet looks for an open edit" / keeps a click's edit → Grid.tsx:260,279,286; GridBody.tsx:56; keys.ts:141 → does not hold (keyboard, copy and paste only).
- `locale()` at i18n.ts:259, page `<html lang>` → i18n.ts:258-266 → holds
- `rowOf(model, id)` at api.ts:162 → api.ts:161-164 → holds (returns null, or throws on 404)
- `columnsFor(model, view, false, models)` at columns.ts:260 → columns.ts:260 → holds
- `records(model, search)` at api.ts:135 → api.ts:135 → holds
- `RelationPicker` props and `PICKER_CAP = 50`, 150 ms debounce → RelationPicker.tsx:7-8, 12-34 → holds
- `Pick` props `label, value, searchable, className` → Pick.tsx:11-19 → holds (plus `options`, `onChange`)
- Theme tokens on the app root → theme.css:62, 110; Theme.tsx:25-27; RailFoot.tsx:31 → holds
- MoreMenu has its own portal → MoreMenu.tsx:4, 46-50 (already portals into `#root`) → holds
- FilterBuilder lines 106-107 are the "ligt tussen" range → FilterBuilder.tsx:106-107 → holds
- `e2e/dagplanning.spec.ts:166-167` are cell date flows (Task 6) → dagplanning.spec.ts:166-167 is the filter range → does not hold
- RAC popovers portal to `document.body` → Popover.d.ts:47 `@default document.body` → holds
- RAC Popover and Modal accept `UNSTABLE_portalContainer` → Popover.d.ts:49, Modal.d.ts:39 → holds, but deprecated
- `Pop` can carry `data-editor` → Popover spreads `filterDOMProps(props, {global: true})` → holds
- `react-aria-components` 1.22 → npm latest 1.22.0 → holds
- Sakani 0.3.29 in the lockfile → bun.lock:245 → holds
- `[class*="_…"]` rules in app.css → app.css:768 (one rule) → holds
- `docs/SPEC.md` names React Aria → SPEC.md:37, committed in 0e96e48 → holds (no task needed)
- Field contract already updated → field-contract.md:363-375, committed in 0e96e48 → holds
- Existing tests for MoreMenu, Confirm, SidePanel → ls apps/grid/src/ui → does not hold
- `useDragOrder` used elsewhere → only ViewList.tsx → nothing else uses it
- Existing ViewList tests survive GridList DnD → ViewList.test.tsx:209-289 (pointer-driven) → does not hold
- The Drawer is read-only and takes no `title` → Drawer.tsx:12-40 → holds (`writable = false` is `columnsFor`'s argument)

## The cut
One plan for one spec: one feature, one boundary (the grid's UI library). Twelve tasks is large, but they share that one boundary. Splitting the editors from the chrome would leave Sakani's removal (Task 12) depending on both.
