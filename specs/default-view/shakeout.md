# Shake-out: default-view

Driven 2026-11-06 on `feature/default-view`, on the reviewed and fixed code of 554e6ea. The shake-out's own commit changes
`e2e/`, `specs/CHECKS.md` and this folder only, so the product is the same as 554e6ea. Every row was driven on that commit.

The runner is the repo's own Playwright harness (`playwright.config.ts`):
- it starts a fresh invented Studio engine and its grid on 127.0.0.1:4313 and :5176 (and theatre on :4311/:5174 for
  row 6);
- it signs in its invented accounts through the magic-link form (`e2e/global-setup.ts`): the administrator
  `beheer@studio.e2e.test` drives every flow, the editor `claude@studio.e2e.test` is the denied actor, and the
  service token `claude` is the denied service account;
- every flow ran in a real Chromium at 1440×900.

Each flow puts the seeded marks back in a `finally` (Taken → Per status) and deletes the views it made, so the file's
other tests start on the seed. Each screenshot is the viewport, written by `e2e/shots.ts` with
`SHAKEOUT_SHOTS=specs/default-view/shakeout`.

Sweep:
- `bun test packages/engine/test/default-view.test.ts packages/engine/test/route-matrix.test.ts packages/studio`: 470
  tests in 14 files, green;
- the grid's Vitest suites the diff touches (views, ViewList, Toolbar, useSavedViews, App, i18n): 264 tests in 6
  files, green;
- row 3 re-driven alone on c8de21e (the fix), 1 test, green;
- the flows, the hunt's repro, the two registered checks the diff touches and the smoke, in one run, 11:59–12:00: 7
  tests, 6 passed. mark-on-a-gone-view failed on its assertion (row 3), as a repro should. mark-a-default passed alone
  again at 12:05 after its boundary edges were added.
- Two earlier runs stopped in global setup, on the sign-in form of the first instance. The grid served and rendered the
  form when probed alone, and the third run signed in. This is the WSL network flake; no product code was involved.

`bun run gate` was not run here: the gate and the shake-out never overlap.

Flows: the plan's Test map names two E2E flows, taken-opens-on-board and mark-a-default (rows 1, 2 and the wire half of
2 in row 4). Row 3 is the hunt's confirmed bug. Rows 5 and 6 re-drive the registered checks whose wording the diff
changed. Row 7 is the read-only smoke.

Edges, from the edge-class catalog:
- empty: Sites has no mark and opens its first view (row 1). After "Geen standaardweergave meer", Taken opens its first
  view (row 2).
- denied actor: the editor's ⋯ offers only Kopie maken. The editor's PUT and DELETE and the service account's PUT are
  each 403 `forbidden`, and the mark is unchanged (rows 2, 4).
- re-entry: within a visit, a rail click returns to the view last chosen in the node, a query view too. A new visit
  opens the default again. A second PUT on the marked view changes nothing (rows 1, 2).
- boundary: one's own unshared view is not offered the mark, and the wire refuses it 400 `not_shared`. A dashboard is
  refused 400 `dashboard_not_default`. A query view (`Op tafel`, `of` taak) can be Taken's default (row 2).
- concurrent: two tabs of the administrator marking different views of Taken leave one default on the server (hunt,
  charter 3; second rejected line).
- mid-flow failure: a view deleted by its owner between the menu opening and the click (row 3, fail).
- delivery seam: the editor's rail shows the moved house and a toolbar lock reading "Systeemweergave: maak een kopie om
  aan te passen" (row 2).

Bite check, the diff's dangerous paths and the test that goes RED:
- the rail's fallback to the default (`lastIn`, `defaultIn`): row 1 (Taken opens Per status), views.test.ts;
- the administrator-only menu item (`App.tsx` role gate): row 2 (the editor's menu is exactly Kopie maken);
- the engine's `marking()` guard: row 4 (editor and service 403), route-matrix.test.ts;
- one default per node, across a node's queries: row 2 (exactly one default after each mark, Op tafel opens Taken);
- `markable` (shared, not a dashboard): row 2 (own unshared view);
- the grid's handling of a refused mark (`markDefault` in useSavedViews.ts): nothing caught it before this shake-out.
  Row 3 now does: RED at 554e6ea, green after the fix c8de21e.

Where the tests are:
- the flows and the repro: `e2e/studio.spec.ts`, describe "default-view, the shake-out" (`@e2e`);
- the re-driven checks: `e2e/studio.spec.ts` › seeded-view-menu-by-role, `e2e/grid-ux.spec.ts` › colleague-shared-view;
- the read-only checks: `e2e/smoke/default-view.spec.ts` (`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | taken-opens-on-board. The seed holds one default in Taken's node, Per status. From Overzicht, a rail click on Taken opens Per status: a board with Open, Bezig, Geblokkeerd and Gedaan lanes, and the house "Standaardweergave" on its rail row. Features opens Per fase (lanes Ontwerp, Bouwen, Klaar) and Agenda opens its calendar. Sites, with no mark, opens Sites. Op tafel is then chosen in Taken, Sites opened, and Taken clicked again: Op tafel. A new visit (the landing page) opens Per status again. The house reads in dark too (taken-per-status-donker.png). | browser | pass | Browser: http://127.0.0.1:5176/#view=18 · shakeout/taken-per-status.png — Test: `e2e/studio.spec.ts` › `taken-opens-on-board @e2e` |
| 2 | mark-a-default. The administrator opens ⋯ on the Taken table: Kopie maken, Naam wijzigen, Standaardweergave, Verwijderen. Standaardweergave moves the house from Per status to Taken, and `/api/views` holds one default in the node, Taken. A second PUT changes nothing. On a new visit, a rail click on Taken opens the table, with no board columns (taken-opent-op-tabel.png). The editor's rail shows the house on Taken beside the lock "Systeemweergave, alleen te kopiëren" and none on Per status (redacteur-rail-huis-en-slot.png). Their toolbar lock reads "Systeemweergave: maak een kopie om aan te passen". Their ⋯ on Taken and on Per status offers only Kopie maken. "Geen standaardweergave meer" takes the house off, the node has no default, and Taken opens its first view. One's own unshared view "e2e eigen taken" offers Delen met het team and no mark. Marking Op tafel (a query of taak) makes Taken open on Op tafel. The `finally` marks Per status again. | browser | pass | Browser: http://127.0.0.1:5176/#view=18 · shakeout/beheerder-menu-standaardweergave.png — Test: `e2e/studio.spec.ts` › `mark-a-default @e2e` |
| 3 | mark-on-a-gone-view (hunt, confirmed bug, fixed in c8de21e). The editor makes a shared view "e2e weg gedeeld" on taak (POST /api/views, `shared: true`). The administrator opens Taken from the landing page, sees the view in the rail with the colleague mark, and opens its ⋯. The editor then deletes it (DELETE /api/views/:id → 200). The administrator clicks Standaardweergave; the PUT answers 404 `unknown_view`. At 554e6ea the gone view stayed listed in Taken's rail with its ⋯, because `markDefault` only noted the refusal (RED: expected 0 rows, received 1). At c8de21e `markDefault` rejects through `refused()` like every other view write: the row leaves the rail at once, the toolbar shows the refusal, and the server keeps Per status as the default (re-driven alone, green). The note reads "Deze weergave bestaat niet meer" in the grid's own Dutch (the engine's English "unknown view N" no longer shows), the same on every view write; a site's own `error.unknown_view` still wins. | browser | pass | Browser: http://127.0.0.1:5176/#view=18 · shakeout/markeren-weggehaalde-weergave.png — Test: `e2e/studio.spec.ts` › `mark-on-a-gone-view @e2e` |
| 4 | mark-a-default, denied actors on the wire. As the signed-in editor (their session cookie, through the grid's proxy): PUT /api/views/:id/default on Per status and DELETE on the marked Taken are each 403 `{code: forbidden}`. As the service account `claude` (bearer token straight to the engine on 4313): PUT on Per status is 403. After all three, `/api/views` still holds one default in Taken's node, Taken. The administrator's PUT on an own unshared view is 400 `not_shared`, and on the dashboard Overzicht 400 `dashboard_not_default`. | wire | pass | Test: `e2e/studio.spec.ts` › `mark-a-default @e2e` |
| 5 | seeded-view-menu-by-role (registered, re-driven). The administrator's ⋯ on the seeded SLA-sites reads Kopie maken, Naam wijzigen, Standaardweergave, Verwijderen, and the rename works. The editor sees the new name and is offered only Kopie maken. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/rail-menu-beheerder.png — Test: `e2e/studio.spec.ts` › `seeded-view-menu-by-role @e2e` |
| 6 | colleague-shared-view (registered, re-driven, theatre). A colleague's shared view carries the people mark and the toolbar's "Gedeeld door een collega" lock, never the Systeemweergave lock. The seeded Tourstops keeps "Systeemweergave, alleen te kopiëren". | browser | pass | Browser: http://127.0.0.1:5174/#view=34 · shakeout/colleague-view.png — Test: `e2e/grid-ux.spec.ts` › `colleague-shared-view @e2e` |
| 7 | smoke, sessionless. The grid answers 200 with the sign-in form and serves the rail's two-mark rule (`.nv-view__mark > :nth-child(2)`), with no error text. PUT and DELETE /api/views/1/default without a session are each 401 `unauthenticated`, so nothing is written. | wire | pass | Test: `e2e/smoke/default-view.spec.ts` (both `@smoke` titles) |

Hunt: 5 charters · 1 confirmed · 0 not ours · 3 rejected

The hunt ran once, at 554e6ea, in the harness's real Chromium, on the same fresh invented Studio, from scratch specs
under the gitignored `e2e/.tmp`. It took about 100 browser actions. The confirmed finding then went RED on its own
expect assertion, never on a timeout. The scratch specs are deleted.

Charter 1, numbers and copy, the editor's rail row of a default with a long name, about 12 actions. The house and the
lock both sit right of the name: the name ends at 193 px, the marks start at 199 px, with no overlap, hovered or not.
The house's title reads Standaardweergave, and the toolbar lock reads Systeemweergave. No bug.

Charter 2, error paths, marking a view that changed under the administrator, about 22 actions. An editor's shared view
is offered the mark. If its owner unshares or deletes it before the click, the mark is refused 404, and the row stays.
A dashboard has no ⋯ in the rail, and the wire refuses it 400. An unknown id is refused 404. Finding: confirmed bug 1.

Charter 3, state after reload, deleting the default and two tabs, about 34 actions. Deleting Per status from its ⋯ makes
Taken open its table, and Undo brings the view back without its house. An unsaved filter change on the open view
survives marking another view. Two tabs of the administrator each mark a different view of Taken, and the server keeps
one, the last. See the first and third rejected lines.

Charter 4, odd input, one's own view through share, mark and unshare, about 16 actions. Unshared, its menu has no mark.
Shared, the menu offers Standaardweergave. Marked, it offers Geen standaardweergave meer. Unsharing it takes the house
off, the node is left with no default, and Taken opens its first view. The wire refuses an own unshared view 400. No
bug.

Charter 5, first-time visitor, the editor arriving on a link to the Taken table, about 14 actions. Agenda opens its
calendar, Features opens Per fase, and Opdrachten opens Opdrachten. Enter on the focused Taken node opens Per status.
After landing on the table by its link, a later rail click on Taken opens Per status, not the table. See the second
rejected line.

confirmed bug 1, row 3, fixed in c8de21e and re-driven green. A mark refused with 404 because the view is gone left the gone view in the rail. The toolbar
shows the engine's English message. Cause: `markDefault` in useSavedViews.ts skips `refused()` / `vanished()`, which
every other view write uses. useSavedViews.ts is in this branch's diff, so the bug is ours. RED at 554e6ea: expected
0 rows, received 1; green at c8de21e.

rejected: Undo after deleting the default brings the view back without its house. The spec intends it: deleting a view
clears its mark, so a restore never brings it back (docs/SPEC.md, Default view).
rejected: a view opened by a link is not the node's last-used view, so a later rail click opens the default. This is
deliberate: App.tsx:205 reads "Only a switch the user made is remembered as the table's last view; the landing is not
one". Before this branch, the same click opened the first view.
rejected: a second tab of the same administrator keeps the old house and offers Geen standaardweergave meer on a view
that is no longer marked, until it reloads. Saved views are not pushed live between tabs. The server still holds
exactly one default per node, and the review declined the same refresh race as the existing pattern.
