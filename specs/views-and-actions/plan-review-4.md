# Plan review: views-and-actions (round 4, narrow)
Reviewed-plan: d63e964e81b3b5215e8f90606213119a758db1d3 specs/views-and-actions/plan.md
Verdict: not ready

The plan resolves most of round 3: S1, S4, N1, N4, N6, N7, N9 fully, and B1, S2, S3, N2, N3, N8 in substance. Two of those fixes rest on premises that the source contradicts. The Blocking one is the definition of `known` added for S3. It drops layout ids the grid itself writes, which breaks the board's manual order (an existing feature, with an existing e2e test). The second is in B1: the Composer can still send back a gone tile in the same session as the delete. Each fix is a line or two.

## Round 3, finding by finding
- **B1 resolved in design** (Ruling :56; Task 4 :303-305; Task 5 :336, :347).
  - The engine's check is unchanged (`dashboard.ts:55-64`).
  - The only grid route that PATCHes a dashboard is the Composer. The Rail only opens and removes dashboards (`Rail.tsx:66-77`), and `autosaves` excludes dashboards.
  - A PATCH whose layout leaves the gone tile out passes `views.ts:348`. One residual issue: S-B below.
- **S1 resolved.** `added.saved_view` gains `'seed_key'` (:314), and the file is in row 1's command (:98). `migrate.test.ts:75-88` holds.
- **S2 resolved in intent** (:348). Residual issue in the `finally`: S-A below.
- **S3 resolved for `title`, lookups, rollups and matrix keys** (:332-333, :346; `App.tsx:266` is in Files :326). Ids the definition still misses: B-1 below.
- **S4 resolved** (:196, :219). `Dashboard.tsx:40-43, 48, 58-64, 119-120` and `Grid.tsx:333-341` hold.
- **N1 resolved** (:195). `App.tsx:351-360`, `:364-387` and `:389` hold.
- **N2 partly resolved.**
  - Fixed: the QuickCreate and useOpenRow paths, `actions.ts:43`, and one name for `Runs`.
  - Not fixed: Ruling :64 still cites `App.tsx:220,738`. The source is `:219, :628, :717`.
  - Not fixed: :229 still cites `studio.spec.ts:34-38`. The worker helper is at `:33-37`.
- **N3 resolved.** One line is still unnamed (Note).
- **N4 resolved** (:60). The cost line holds: grid-ux runs as editor by default (`playwright.config.ts:13`), and `grid-ux.spec.ts:644-646` is the editor's page.
- **N6 resolved** (:306). The new line matches the existing report lines (`seed-missing.ts:115, 144, 209`).
- **N7 resolved in effect.**
  - `views.test.ts:338-361` compares a table view.
  - Dashboard tests compare only ids and layouts (`dashboard.test.ts:161-232, 377, 393, 425-463`).
  - Wording remnant (Note).
- **N8 ruled** (:55). `dashboard.ts:211-212` holds. One ambiguity is left (Note).
- **N9 accepted** (:92). `useSavedViews.ts:181-189` and `views.ts:181` hold.

## Blocking

**B-1. `known` = the ids of `columnsFor(model, view)` drops valid layout ids, and `useLayout` writes the drop back to storage.**
- **Plan:** Task 5 Interfaces :332 ("`known` is the ids of `columnsFor(model, view)`, which covers `title`, `lookups…`, `rollups…`"), :334 and :335.
- **Source:** `columnsFor` (`columns.ts:269-277`) returns `title`, the keys of `model.fields`, lookups and rollups. `model.fields` never holds the source's title column or `id` (`engine.ts:194-195`), and `position` is served as a flag, not a column (`app.ts:331`). Layouts still name all three:
  - **Board drag.** A board turns manual with sort `{ id: 'position' }` (`board/useBoardDrag.ts:244`; read at `board/Board.tsx:71`). The fit drops it on the next read and stores the result. `e2e/step-3f.spec.ts:301-312` asserts that the manual order and the stored `position` sort survive a reopen, so that test turns red, and the plan does not name it.
  - **Studio's Opdrachten.** "Opdrachten" and "Opdrachten per status" are seeded with sort `-id` (`packages/studio/src/seed.ts:283, 291`). Their newest-first order is dropped on every load and they show the changed mark. Under R8 an administrator's next change autosaves the view without that sort, for everyone.
  - **Title filters.** The filter builder offers a title filter as `field: model.title_field` (`grid/filter.ts:41`). Stored filters keep the source's column name (`grid/conditions.ts:129-141`). Such a filter is dropped and written back.
- **Smallest change:**
  - :332 becomes: "`known` is the ids of `columnsFor(model, view)`, plus `id`, `position` and `model.title_field`."
  - Extend the test at :346: "… a board's `position` sort, a `-id` sort and a title filter survive the fit."
  - Name `e2e/step-3f.spec.ts:301-312` as a test that must stay green.

## Should fix

**S-A. The rewritten composer-team-dashboard test cannot restore the Overzicht with `--seed-missing`.**
- **Plan:** Task 5 Step 1 :348: "Its `finally` restores the seeded layout (`--seed-missing` brings an untouched one back, or a PATCH of the saved layout)".
- **Source:**
  - The test's in-place save writes a revision as the administrator (`views.ts:268-275`). By the plan's own Rulings :51-52 the dashboard is then touched, and `--seed-missing` leaves it alone.
  - The theatre harness is started with `--fresh` once (`playwright.config.ts:20`), and step-3c never runs a seed.
  - If the rewrite also presses "Dashboard verwijderen" to prove the dashboard can be deleted (`Rail.tsx:72`; `App.tsx:634`), then the existing `finally` (`step-3c.spec.ts:383-386`) only deletes new dashboards. The seeded one stays deleted for every later spec.
- **Smallest change:** strike the `--seed-missing` option. The `finally` PATCHes the layout read before the test, and restores the Overzicht with `POST /api/views/:id/restore` if the test deleted it.

**S-B. `gone_views` is stale after a delete in the same session, so the Composer can still send a gone tile.**
- **Plan:** Ruling :56 ("the Composer never sends back a tile the engine refuses") and :336.
- **Source:**
  - A delete from ViewList or the Rail only drops the view locally (`useSavedViews.ts:89, 203-206`). The list is not reloaded.
  - The open dashboard keeps the `gone_views` it was loaded with (`App.tsx:676-678`; `Dashboard.tsx:67-70`).
- **Realistic case:** Stefan deletes "Storing", opens the Overzicht he changed, and presses Bewerken. The tile reads "Geen toegang" instead of "Weergave verwijderd". If he changes anything else and saves, the PATCH returns 400 `bad_view` "a tile names no view N" in English (`dashboard.ts:63`; `i18n.ts:444-446`).
- **Smallest change:** the Composer's save leaves out every tile whose view is not in the `views` it holds. That is exactly what the engine refuses (`dashboard.ts:55-56`). Keep `gone_views` for the label only. Add that case to the :347 test.

## Note
- **Ordering at App.tsx:266.** `useLayout(view)` at `App.tsx:266` comes before `models` and `model` (`:389-390`). Computing `known` there from `model` is the same TS2448 error as round-3 N1. Read `served?.models[view.model]`, or move the `models` memo above `:266`.
- **N3 remnant.** `studio.spec.ts:212-215` asserts `[1, 'wacht', null]`. testmans-bestel is site 2 (`seed.ts:26, 38`), so that line changes too. Add it to :373.
- **N8 ambiguity.** "When no seed_key matches" (:55) should say that a key on a deleted row counts as a match, so the tile drops. Otherwise a person-deleted seed whose name matches a colleague's shared view resolves to that view instead of dropping. This is rare, and the R10a tests pass on either reading.
- **N7 wording.** :286 and :317 still say "ViewOut gains no field", but :287 adds `gone_views`. Say "no `locked` field; `gone_views` on dashboards only".
- **N2 citations.** :64 → `App.tsx:219, 628, 717`. :229 → `studio.spec.ts:33-37`.

## Premises checked
- The Composer sends back `{layout}`, and its target is the dashboard or the team copy → `Composer.tsx:188, 194-197` → holds.
- The Composer labels a gone tile `#id` today → `Composer.tsx:63` → holds (the plan changes it).
- Unknown tile keys are refused → `dashboard.ts:33-36` → holds.
- A tile on a deleted view is refused, and a PATCH re-validates the merged layout → `dashboard.ts:55-64`; `views.ts:348` → holds. A layout without the gone tile passes → holds.
- No other grid PATCH reaches a dashboard → `Rail.tsx:66-77`; `useSavedViews.ts:19` → holds.
- `gone_views` reaches the Composer through `dashboardOf` → `engine.ts:441-446` → holds as a change. Its freshness after an in-session delete → `useSavedViews.ts:89, 203-206` → does not hold (S-B).
- The name fallback for tiles → `dashboard.ts:211-212` → holds.
- `theatre/test/migrate.test.ts:75-88` with `'seed_key'` → holds.
- composer-team-dashboard turns red → `step-3c.spec.ts:346-388`; `Rail.tsx:72`; `App.tsx:634`; `Composer.tsx:194-197` → holds.
- Restoring that test's change by `--seed-missing` → `views.ts:268-275`; `playwright.config.ts:20` → does not hold (S-A).
- `columnsFor` covers every layout id → `columns.ts:269-277`; `engine.ts:194-195, 316`; `app.ts:331`; `useBoardDrag.ts:244`; `studio/seed.ts:283, 291`; `filter.ts:41` → does not hold (B-1).
- Matrix keys pass through untouched, and the open column cannot be hidden → `ui/views.ts:50, 56, 75`; `matrix/columns.ts:29-50` → holds.
- `App.tsx:266` is `useLayout`'s only caller → holds. The ordering → Note.
- The dashboard drawer is re-read on `ended` → `Dashboard.tsx:40-43, 48, 58-64, 119-120`; `Grid.tsx:333-341` → holds.
- The `ended` effect sits after `useRunFollower` → `App.tsx:351-360, 364-387, 389` → holds. The provider is around the work column (`:673-708`). App's QuickCreate (`:718-725`) is outside it but takes its callback from Workspace → holds.
- N2 paths → `dashboard/QuickCreate.tsx`, `grid/useOpenRow.tsx:45`, `studio/src/actions.ts:43` hold. `App.tsx:219/628/717` and `studio.spec.ts:33-37` → still miscited.
- Moving the N3 test to Sites met aandacht → `studio.spec.ts:145-148, 189-215`; `studio/seed.ts:26, 38, 72` → holds, with the `:213` remnant.
- The lock-mark cost line → `grid-ux.spec.ts:644-646` (editor); `ViewList.tsx:36, 48-56` → holds.
- The dropped-tile report line's style → `seed-missing.ts:115, 144, 209` → holds.
- `ViewOut` comparisons → `views.test.ts:338-361`; `dashboard.test.ts` (ids and layouts only) → holds for a dashboard-only `gone_views`.
- The N9 deferral → `useSavedViews.ts:181-189`; `views.ts:181` → holds.

Verdict: not ready. B-1 needs one interface line, one test clause and one named guard. S-A and S-B are one clause each.
