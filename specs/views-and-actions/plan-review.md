# Plan review: views-and-actions
Reviewed-plan: b0e298f833fae61e0d4c6fdfad971544b4ccb085 specs/views-and-actions/plan.md

Verdict: not ready

## Blocking

**B1. `seed_key` has a third writer the plan does not name, and that writer breaks the feature on every fresh database.**
- **Plan:** Ruling 2 (line 45) says "Only addView and the migration's backfill (system-owned views only) write it." Task 4 Interfaces (line 226) and Task 4 Files list no `migrate.ts`.
- **Source:** `seedDomain` (`packages/engine/src/migrate.ts:146-158`) inserts every seeded view directly as `{ ...v, ...system }`. `serve.ts:94` runs it after `migrate` on `--fresh`. Every e2e harness starts with `--fresh` (`playwright.config.ts:20,38,53,69`). The engine fixtures also call migrate and then seedDomain (`test/fixture.ts:289-290`, `dashboard.test.ts:123-127`, `views.test.ts:74-79`).
- **Result:**
  - (a) Every seeded view on a fresh database has `seed_key` NULL. Attack 3 then treats each one as locked, so R8 is dead on the studio harness where Task 5's admin e2e runs.
  - (b) `seedMissing` matches by `seed_key`, finds nothing, and adds a second copy of every seed. `dashboard.test.ts:440-446` ("--seed-missing twice leaves exactly one live system dashboard") goes red.
  - (c) `insertRows` takes `Object.keys(row)` as its columns (`migrate.ts:134-142`). A seed declaring `locked: true` therefore writes an INSERT naming a column `saved_view` does not have, and `seedDomain` throws for the very fixture Task 4 Step 1 builds.
- **The backfill:** a nullable TEXT column is added by `ALTER`, with no rebuild and no backup (`schema-diff.ts:77-100`). The migrator has no data step except `adoptUnowned`, which runs on every start (`migrate.ts:107,115-132`). A one-shot backfill misses system views inserted after the column exists:
  - `packages/theatre/test/seed-missing.test.ts:116-122`: migrate, then raw system views, then the `--seed-missing` CLI;
  - the engine's `insertView(sqlite, SYSTEM_OWNER, …)` cases.
- **Fix:**
  - add `migrate.ts` to Task 4;
  - `seedDomain` writes `seed_key` and never spreads `locked` into the row;
  - the backfill is an idempotent step beside `adoptUnowned` on every migrate (`owner_id = -1 AND seed_key IS NULL`);
  - the Ruling names all three writers;
  - add the test "a --fresh database's seeded views carry seed_key, and a following seedMissing adds nothing".

**B2. R5a's "waiting" rule ends every studio follow at once.**
- **Plan:** Task 2 Step 1 (line 176) treats "the fake row has `available.buttons.length > 0`" as waiting on the person.
- **Source:** studio's actie lifecycle declares an Annuleren button from aangevraagd, voorbereiden and voorbereid for both roles (`packages/studio/src/datasets.ts:136`), and from bevestigd for administrators (`:132`). `available.ts:35-43` serves every transition that has a `button`.
- **Result:** a request just made in `aangevraagd` already has a button. The follow ends as "waiting" on its first read, R4's indicator never shows, and Task 2's own e2e step 1 ("the panel says busy") cannot pass.
- **Fix:** a ruling that waiting means the viewer holds the primary button (`buttons.some(b => b.primary)`). Only Bevestigen is primary (`datasets.ts:129`). "A button to another live state" would also work. Add a fixture case where Annuleren is present but not primary and the follow stays busy.

## Should fix

**S1. The drawer's spinner breaks R5a.** Task 2 puts an svg spinner in `.nv-dw-head__busy` whenever `useLive` is busy, and `useLive` is busy in every live state (`useLive.ts:16-17`). An opdracht in voorbereid, with Bevestigen in its head, would spin. That is exactly what R5a's "never spins over something that waits on the person" forbids.
- Fix: the drawer uses the B2 rule.
- Name `e2e/studio.spec.ts:828-850` (drawer-reads-right asserts "Volgt live" there).

**S2. R7 lands only in a fresh browser.** `useLook` writes the value it read back to localStorage on mount (`RailFoot.tsx:21-28`). So every browser that has opened the grid already holds `ntdst-views/lines=off`, which nobody chose. Changing the fallback at `RailFoot.tsx:58` leaves Stefan's screen as it is.
- Fix: a new key (for example `ntdst-views/lines/v2`).
- Name the tests that assert the default is off: `RailFoot.test.tsx:23-30` and `e2e/step-3d.spec.ts:87-94`.

**S3. R1's `visibility: hidden` takes the tick box out of the Tab order.**
- A hidden input is skipped by Tab, so `:focus-within` can never fire from the keyboard. R1's "keyboard focus … shows it too" fails.
- `e2e/selection.spec.ts:173-189` (tab-stops) goes red; the active row's box is the tab stop (`GridBody.tsx:149`).
- Fix: use `opacity: 0`, revealed on hover, focus-within, ticked and data-ticking.
- Also: the red test Step 1 cites is `Selection.test.tsx:134-143`, not `Selection.tsx:52` (that line is the source).

**S4. The plain create paths.** Task 2 Step 3 says "the create path at App.tsx:432-440 follows the created row". Only `createThrough` gets the created row back (`App.tsx:436-443`, `api.ts:289-293`). The other paths do not:
- The spec's own example, "+ Nieuwe opdracht" on Opdrachten (a dataset view), calls `void store.create(...)` (`App.tsx:432`), which answers void (`store.ts:438-447`).
- With needs, it calls `store.draft`, and the store commits the draft internally (`store.ts:225-230`).
- QuickCreate hands back only a batch (`QuickCreate.tsx:97-100`, `App.tsx:719-724`).

Fix: name each path and how it hands its row to `follow`, with a test per path. Also name the label a plain create's "… aangevraagd" toast uses.

**S5. `onEnded` calls handles App does not have.** The plan has App call "recount the rail + refreshDashboard() + re-read the open drawer":
- The rail counts are a one-shot effect keyed on `countKey` (`App.tsx:349-359`).
- `refresh` is local to `Dashboard` (`Dashboard.tsx:40-47`).
- Open drawers live in Grid, useOpenRow and Dashboard.

Fix: show the mechanism, for example an `ended` counter from `RunsProvider` that those three depend on. Add `Dashboard.tsx`, `useOpenRow.tsx` and `Grid.tsx`/`GridBody.tsx` to Task 2's Files; GridBody is where R4's `data-running` goes.

**S6. Task 2's e2e cannot be driven as written.**
- The action is labelled "Gezondheid checken" (`packages/studio/src/actions.ts:29`), not "Gezondheidscheck" as in Task 1 Step 4.3 and Task 2 Steps 1 and 4.
- The worker's status PATCH must carry `expect`; a service PATCH of the lifecycle column without it is 400 `bad_body` (`docs/SPEC.md:92`; the form is at `studio.spec.ts:58`).
- Step 2's "the dashboard's numbers re-read" has nothing to observe: an actie reaching klaar moves no Overzicht tile (`seed.ts:391-440`). The test worker should also write a site's gezondheid, so that the Storing stat moves.
- R3 turns red three existing tests that assert "… uitgevoerd.": `studio.spec.ts:222, 259, 303`. Name them.

**S7. R11's seam is wrong.** The plan says "App calls it on currentOf(view)", but App never calls `currentOf`.
- The sheet reads the stored layout through `layoutOf` (`ui/views.ts:62-64`) via `useLayout` (`grid/hooks.ts:13`).
- Dashboard tiles call `layoutOf` directly (`ListTile.tsx:58`, `WeekTile.tsx:31`, `tiles.ts:31`), so the same stale `start_at` sort would empty a tile.
- Fix: fit inside `layoutOf` (or `storedLayout`), so every reader gets it, and add a tile case to the tests.

**S8. R16 for `updates_core`: a null boolean shows as an off switch.** `Bool.tsx:12` sets `isSelected={Boolean(column.value(row))}`, so null reads "no core update". That is the false zero R16 exists to prevent.
- Integers are already blank (`columns.ts:64-69`) and totals already add 0 (`group.ts:160-164`).
- Task 6 is "declarations only", and its test runs in `packages/studio`, which cannot see the cell.
- Fix: a grid step plus a `Bool.test.tsx` case for "a null boolean shows blank". This also changes SLA, a nullable boolean (`datasets.ts:6`); say so.

**S9. The touched rule versus locked seeds.** The share-token and for-owners routes admit any shared system view (`views.ts:381-386`) and write revisions as the administrator (`views.ts:443, 456, 464, 478`).
- So a locked seed that was ever published or shown to owners, before this branch or after it, counts as touched.
- Once unpublished it never follows its declaration again, which contradicts R9.
- Fix: apply "touched" to unlocked seeds only, with a test.

**S10. The threat model misses "an administrator PATCHes shared:false on an unlocked seeded view".**
- `viewBody` accepts `shared` on a PATCH (`views.ts:211, 348`).
- `listViews` shows only one's own rows or shared ones (`views.ts:302`), and the owner here is -1. So the view leaves every list, the seed leaves it alone as touched, and the grid offers no restore.
- Fix: refuse or ignore a `shared` change on a system-owned view in `patchOf`, with a denial test.

**S11. Denial details.**
- A link account has role `owner` (`action-token.ts:32`) and is refused 403 `forbidden` at `changing` (`views.ts:324-327`, `access.ts:30,41`). It never reaches `ownedView`, so the denial "…link account … 403 read_only_view" will fail.
- Attack 5's hedge has an answer today: forged keys are ignored and the request answers 200 (`patchOf` refuses only `source` and `skin`, `views.ts:295-299`; "a PATCH of only forged fields changes nothing", `views.test.ts:135-152`). Add `seed_key` to that test's `forged` object, which covers both POST and PATCH.
- Attack 3's undeclared case (a `seed_key` whose seed is gone) has no denial test.
- The `validate.ts` check that `locked` is a boolean has no test; `validate.ts` validates no view today.

**S12. Existing tests that turn red but are not named.**
- `views.test.ts:338-361` compares the whole ViewOut with `toEqual`, so it breaks when `locked` is added.
- `seed-missing.test.ts:269-320` inserts SYSTEM_OWNER views without a `seed_key`; it lies outside the named range :153-265.
- `dashboard.test.ts:423-438` ("an unknown name fails seeding") must stay green. R10a has to drop a tile whose seeded view a person deleted, but still refuse a tile that names a view no seed declares; the plan does not separate the two cases.
- `dashboard.test.ts:228-231`: the `stored()` equality check flips as well.
- Task 3 (R6):
  - `studio.spec.ts:373, 556, 600` (Annuleren in the body);
  - `studio.spec.ts:647-648` and `step-0c.spec.ts:89-91` (Verwijderen, then Zeker?);
  - `studio.spec.ts:836-845` (Annuleren as a quiet button beside Bevestigen, and a site's actions as groups at its head); R6 contradicts both.
- `views.test.ts:169-174` needs no change: its actor is already an editor (`sign-in.ts:59`) and its view has no `seed_key`.

**S13. Row 4's e2e command runs no test.** Playwright builds `new RegExp(pattern, 'gi')` (`node_modules/.bun/@playwright+test@1.63.0/node_modules/playwright/lib/util.js:152-157`), and `\|` is a literal pipe in a JS regex. I checked: `"drawer-actions-in-the-bar\|toolbar-at-1280"` matches neither title.
- Fix: write `"drawer-actions-in-the-bar|toolbar-at-1280"`. `specs/studio-polish/plan.md:68` has the same bug.
- Also prefix each e2e cell with the runner (`flock … bunx playwright test e2e/studio.spec.ts --grep …`).

**S14. Task 5's e2e leaves the shared studio database changed.**
- Deleting Storing and running `--seed-missing` drops the Storing tile from the untouched Overzicht. Restoring the view does not bring the tile back.
- Every later test on `e2e/.tmp/studio.db` then sees Overzicht without it: the run has one `--fresh` and one worker (`playwright.config.ts:5,53`), and `studio.spec.ts:124` checks that dashboard.
- Fix: after the restore, run `--seed-missing` again and assert the tile is back.
- On step 3: today the grid restores only through the delete toast's "Ongedaan maken" (`useSavedViews.ts:206-211`). There is no list of deleted views, so the step is `POST /restore`.
- There is no `--seed-missing` helper: `cli()` is private to `auth.ts:49`. `studio.spec.ts:81-88` already shells out with `execFileSync`.

## Note

- **N1.** `autosaves` adds `!view.for_owners`. Today an administrator's own for-owners view autosaves (`useSavedViews.ts:19`), and no requirement asks to stop that. Drop it or rule it.
- **N2.** The reason Simplest design gives for rejecting a stored touched flag ("every write path would need to set it") does not hold. Every view write goes through `save()`/`create()` (`views.ts:268-293`), and the seed's writes are separate SQL. The revision route is still defensible, but S9 comes from it.
- **N3.** `viewKey` uses a NUL separator (`views.ts:67`). Stored in TEXT, it survives memcmp equality but is fragile in SQLite functions and the shell. `JSON.stringify([name, source ?? null])` costs nothing.
- **N4.** The plan does not say what the seed does with an untouched deleted seed that matches by `seed_key` (removed when undeclared, then declared again): restore it, or add a new one. Rule it.
- **N5.** The RunPanel (bottom of the main area) and the selection panel (bottom of `.nv-frame`) collide on a table. Say how they stack; spec R4 speaks of one panel.
- **N6.** File lists:
  - Task 5 needs `apps/grid/src/engine.ts` (`EngineView`, `toSavedViews`) for `locked` and `gone`.
  - R12 collapses Search, and `Search.tsx` has no icon mode.
  - R13's test sits in `Drawer.test.tsx`, but the refusal comes from the create paths.
- **N7.** No domain word enters the engine (`seed_key`, `locked`, `gone`, and the report lines are generic). The grid copy is generic Dutch. Studio labels appear only in grid test fixtures.

## Premises checked

- humanAdmin → views.ts:76 → holds
- teamDashboard → views.ts:79-80 → holds
- outOf `editable` → views.ts:82-95 (editable at :84, the plan says :83) → holds
- ownedView → views.ts:225 → holds; public and for-owners checks → :235-239 → holds
- viewBody → views.ts:207 → holds
- unknown keys in a view PATCH are ignored → views.ts:295-299; views.test.ts:135-152 → holds (ignored, 200)
- seedOrdered → views.ts:314-322 → holds
- seed writes revisions as -1 → seed-missing.ts:127,154 (also :199-206 and migrate.ts:112) → holds
- leftAlone → seed-missing.ts:134 → holds; addView/updateView/removeUndeclared/seedViews → :117/:140/:185/:160 → holds
- seededIds/refOf/seededLayout → dashboard.ts:214/:191/:230; a missing tile view throws → holds
- revision carries actor_id → revision.ts:14; writes.ts:526-541 → holds
- every view write leaves a revision → PATCH (only if something changes) :268-275, DELETE :357-364, restore :366-371, share/for-owners :443-478; order is prefs → holds
- "only addView and the backfill write seed_key" → migrate.ts:146-158 (seedDomain) → does not hold
- saved_view takes a nullable column by ALTER, no rebuild → schema-diff.ts:77-100 → holds; a backfill hook exists → only adoptUnowned, migrate.ts:107 → none
- studio column made nullable triggers a rebuild and backup → schema-diff.ts:46-47,89-90; migrate.ts:47-57,99 → holds
- `buttons.length > 0` means waiting on the person → datasets.ts:132,136; available.ts:35-43 → does not hold
- useLive constants → useLive.ts:4-7 → holds
- finished/act/actOnSelection → App.tsx:549/592/604 → holds (finished takes (batch, action) today)
- create path at App.tsx:432-440 follows the created row → store.ts:438-447, QuickCreate.tsx:97-100 → does not hold for the table or quick create
- App's onEnded handles (recount, refreshDashboard, drawer re-read) → App.tsx:349-359; Dashboard.tsx:40-47 → do not exist
- App calls currentOf (R11) → layoutOf at ui/views.ts:62; hooks.ts:13 → does not hold
- isSaved/lockOf/currentOf/localOf → ui/views.ts:46/40/121/67 → holds
- autosaves → useSavedViews.ts:19 (the plan says :20) → holds
- SidePanel head, widen, close → SidePanel.tsx:47-57 → holds
- MoreMenu Action → MoreMenu.tsx:8-13 → holds
- DrawerButtons, ActionInputs → DrawerButtons.tsx:8-23; ActionInputs.tsx:44 → holds
- DeleteRow → Grid.tsx:412, 423-441 → holds
- Drawer Head :107, busy :121, body :197-223 → holds
- RailFoot useLook default → RailFoot.tsx:58 → holds, but the stored value overrides it (:21-28)
- CSS → app.css:3455, :3500-3506, :1668-1672; theme.css:26,142 → holds
- the grid offers restore of a deleted view → only the toast's undo, useSavedViews.ts:206-211 → no deleted-views list
- the harness has a service token to play the worker → auth.ts:65-71; studio.spec.ts:34-38 → holds (role editor, needs `expect`)
- `--seed-missing` from an e2e → no helper; execFileSync precedent at studio.spec.ts:81-88 → possible
- e2e names "Gezondheidscheck" → actions.ts:29 "Gezondheid checken" → does not hold
- step-1:194, step-2:208, ui-fit:414, action-inputs:276-277 → holds (the list is incomplete, S12)
- check-vocabulary scans engine and mcp → package.json `check` → holds
- ARCHITECTURE-INVARIANTS.md → absent → invariant-auditor does not apply
