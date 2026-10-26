# Review — fix/drawer-and-selection-room (519e872..338b861)

Whole-branch review, fresh reviewer (opus), read-only, 2026-10-26.

## Blocking
None.

## Should fix
- S1 app.css:3747 `.nv-selection__actions {overflow:hidden}` clips a visible selection action's relation picker (`.nv-pop` absolute at top:32px inside `.nv-action__input`); search input clipped, user types blind. Also: picking a record widens the button ("Bundle: <title>") without a signature change, so no re-measure; the line overflows and clips Meer.
- S2 Selection.tsx:84-86, 112-120: folded action with input — focus stays on Meer after picking; panel after "Selectie wissen" in DOM order; Escape/X unmounts focused element so focus drops to body. ActionRow has focus-into-panel (useLayoutEffect on asking) and leave(); reuse.
- S3 Selection.tsx:69, 78: `asking` survives clearing the selection (bar stays mounted, returns null at count 0); reselecting shows the old panel open.
- S4 place.css:36-41: grid li lost align-items:center; with DrawerButtons rows the name/avatar/pill sit at top and labels ~10px lower; `.nv-flag` stretches into a tall capsule. New e2e only covers a pill row without buttons.
- S5 New selection paths untested: folded input action (open, run, refusal, Escape, focus), re-measure on resize, re-measure after action list change. SelectionBar takes no `measure` prop like ActionRow.

## Note
- N1 drawer-actions.spec.ts:91,:153, studio.spec.ts:226: toHaveText doesn't check visibility; add toBeVisible on the 2px status.
- N2 The three new tests fail without their fix (verified by reading). selection-bar-one-line hard-codes toBe(9) and relies on the default viewport folding.
- N3 Drawer.tsx:222 live region mounts with its text; many screen readers won't announce. Predates branch.
- N4 Selection.tsx:85: folded items not marked blocked while busy; they look live and do nothing.
- N5 Selection.tsx:119: ActionInputs has no key; a second folded input action reuses the first's typed/picked state. Same in ActionRow.
- N6 app.css:3765/3780: `.nv-action__refused` and `.nv-selection__ask` overlap; neither counts toward --nv-dock-h.
- N7 Dead CSS: `.nv-selection {gap: 8px 16px}` row gap, `.nv-selection .nv-action {flex-wrap:wrap}`, `.nv-dw-list .nv-dw-buttons {flex:none}`.
- N8 ActionRow.tsx:19 re-exports `fitting` only for ActionRow.test.tsx; import from ./fit instead. Fit edge cases (0 actions, one too-wide, long middle label, room 0, resize) read correct.
- N9 Constraints met: no domain words, reduced motion, dark tokens, portaled Meer, e2e finally cleanup.

Findings: 0 Blocking · 5 Should fix · 9 Note
