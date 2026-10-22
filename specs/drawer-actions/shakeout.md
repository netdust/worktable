# Shake-out: drawer-actions

Driven 2026-10-22 on `feature/drawer-actions` at 0934260, the review's fix pass. The shake-out adds tests, screenshots and this file, no product code.

The artifact is the selection fixture instance the harness boots fresh (engine 4314, grid 5177, invented data, `packages/engine/test/fixtures/selection-domain.ts`), driven in a real Chromium at 1440 by 900 as the seeded editor, with the seeded administrator as the outside process. Every run held the machine-wide e2e lock. Committed flows: `e2e/drawer-actions.spec.ts` and `e2e/smoke/drawer-actions.spec.ts`. Step 0: the 17 selection-actions e2e tests and its 2 smoke tests were re-driven at this head, all green, and their `verified` cells bumped.

Flows driven are the Test map's E2E flows column (press-a-button, link-item-button, action-opens-its-result, drawer-follows-an-outside-change, dashboard-row-opens-drawer) plus the review's two cases (S2: closed drawer and Undo). Not driven: other roles (only an editor and an administrator exist on this instance; the denial tests are the integration tier's), and the engine-only cases of the Test map (no E2E flow).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | press-a-button: Ann's drawer shows Start and Park (Finish, Back and Reopen absent); Start moves her, the drawer then shows Finish, one notice "Start gedaan." with Ongedaan maken; Undo restores Start. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-buttons.png · Test: e2e/drawer-actions.spec.ts "press-a-button @e2e" |
| 2 | link-item-button: a bundle's drawer lists its entry with the detail "Bring a pen" and Confirm and Decline; Confirm shows "Confirmed" and drops the button. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-link-item-button.png · Test: e2e/drawer-actions.spec.ts "link-item-button @e2e" |
| 3 | action-opens-its-result: Ann and Bob ticked, Sweep run; the bundle it made, "Swept 2", opens in the drawer and the selection bar is gone. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/drawer-action-result.png · Test: e2e/drawer-actions.spec.ts "action-opens-its-result @e2e" |
| 4 | drawer-follows-an-outside-change: Di is active (moved by the administrator); her drawer shows Finish and the busy mark Bezig…. The administrator moves her to done; within 5 s Finish and the mark are gone and Park shows. | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/drawer-live.png · Test: e2e/drawer-actions.spec.ts "drawer-follows-an-outside-change @e2e" |
| 5 | dashboard-row-opens-drawer: the Waiting members tile's first row opens its drawer on the dashboard; Start moves it, the tile's count falls by one; Undo restores the record and the count. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/dashboard-row-drawer.png · Test: e2e/drawer-actions.spec.ts "dashboard-row-opens-drawer @e2e" |
| 6 | Review S2 (a): Cy is live; the poll answer is held, the drawer closed, the answer released: the drawer stays closed, and no further poll goes out for 7 s. | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/drawer-live.png · Test: e2e/drawer-actions.spec.ts "live-drawer-closed-mid-poll @e2e" |
| 7 | Review S2 (b), dashboard: press Start in the dashboard drawer, close it, Undo from the notice: the drawer stays closed. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/dashboard-undo-after-close.png · Test: e2e/drawer-actions.spec.ts "press-then-close-then-undo @e2e" |
| 8 | Review S2 (b), related drawer: from a bundle's drawer open an entry, Confirm it, close the entry drawer and the bundle drawer, Undo from the notice: no drawer reopens. | browser | pass | Browser: http://127.0.0.1:5177/#view=5 · shakeout/drawer-link-item-button.png · Test: e2e/drawer-actions.spec.ts "press-in-related-drawer-then-close-then-undo @e2e" |
| 9 | Undo of an action's result: on "All members" tick Ann, run Sweep (drawer "Swept 1" opens), press Ongedaan maken in the notice. The bundle is deleted (the API no longer lists it) but the drawer of "Swept 1" stays open on the deleted record, with its Verwijderen button. Expected: the drawer closes with the record. Cold repro: tick Ann, Sweep, Ongedaan maken, read `getByRole('complementary', { name: 'Swept 1' })` count: 1, want 0. The same ghost shows when the administrator deletes an open live record (DELETE /api/rows/member/2 with Bob's drawer open: the busy mark goes, the drawer keeps Bob with Finish, Park). | browser | fail | Browser: http://127.0.0.1:5177/ · shakeout/undo-ghost-drawer.png · Test: e2e/drawer-actions.spec.ts "undo-closes-the-opened-record @e2e" (RED at 0934260 on its toHaveCount(0) assertion) |
| 10 | Smoke: the dashboard without a session answers 200 with the Aanmelden form and no drawer. | browser | pass | Browser: http://127.0.0.1:5177/ · shakeout/smoke-signin.png · Test: e2e/smoke/drawer-actions.spec.ts "drawer surface @smoke" |
| 11 | Smoke: GET /api/rows/member without a session answers 401 `unauthenticated`, so no row marks are served. | wire | pass | Test: e2e/smoke/drawer-actions.spec.ts "drawer buttons and their marks @smoke" |

Hunt: 3 charters · 1 confirmed · 0 not ours · 3 rejected

The hunt ran in the browser on the freshly booted instance, about 60 browser actions in all (scratch specs under `e2e/.tmp`, since deleted). The one confirmed bug is row 9.

**Charter 1, drawer buttons, odd input:** a double-click on Start, a closed-bundle record's drawer (Cy), a record outside a button's `when`, in about 20 actions.
- The double-click made one write and one notice "Start gedaan." (the buttons guard a press in flight).
- Cy's drawer shows no Settle (his bundle is closed) and no Skip; Ann's and Di's drawers show Settle and Sweep as declared.

**Charter 2, live drawer, state after change:** an outside delete, an outside move to parked, an outside rename, navigating to the next record, a reload, in about 25 actions.
- Leaving the live state drops the busy mark and the buttons follow. An outside rename lands in the drawer within one poll. Moving to the next record stops polling the old one.
- An outside delete leaves the record's drawer open as last read: row 9.

**Charter 3, an action opens its result:** Settle on a record, Sweep with a record its `when` excludes, a double-click on Sweep, Undo with the result open, in about 15 actions.
- Settle opens (keeps) the record it ran on; Sweep is disabled with Cy ticked and runs once on a double-click.
- Undo with the result drawer open: row 9.

rejected: after a reload the drawer is closed. The spec names no URL state for an open drawer; drawers opened at any time behave the same.

rejected: the outside-deleted live record's drawer stops polling and shows no message. Threat model 5 says polling stops when the record is gone; the grey drawer content is the ghost of row 9, recorded there.

rejected: the action notice reads "Settle uitgevoerd." in English. The action's label is the fixture's own English word; the sentence around it is the grid's Dutch.

## The registry

`specs/CHECKS.md` gained 9 e2e rows (one per test of `e2e/drawer-actions.spec.ts`, the row 9 repro among them, RED until the fix) and 2 smoke rows (`e2e/smoke/drawer-actions.spec.ts`), verified 0934260 2026-10-22; the selection-actions rows were re-driven and bumped to the same. `bun scripts/check-checks.ts` exits 0.

## Bite check

Each dangerous path of the diff and the test that should go RED when it breaks (by reading the assertions; none hand-broken, the tree is not mine to edit; a run of the new tests against the pre-fix commit 2f62f11 was not allowed here, so rows 6 to 8 have not been seen RED):
- a poll answer after close reopens the drawer (S2): row 6 on the drawer count after release, and on the poll counter;
- Undo after close reopens the drawer (S2): rows 7 and 8 on the drawer count after Undo;
- the busy mark and following an outside change: row 4 on Finish gone within 5 s and the mark gone;
- an action's result opening: row 3 on the "Swept 2" drawer.
