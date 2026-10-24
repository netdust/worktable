# Plan review — views-and-actions (round 2)
Reviewed-plan: 23762d9d3a09e03ded54aef11f2d51b754fb6746 specs/views-and-actions/plan.md
Verdict: not ready

There is one Blocking finding, and it is a one-line fix. Most of the Should-fix items are tests that will turn red without being named, plus three seams the plan names but does not show how to build. The rewrite fixes most of round 1. One round-1 note got worse: N7 ("no domain word enters the engine") no longer holds.

## Round 1, finding by finding
- **B1 resolved.** The Ruling names all three writers. `migrate.ts` is in Task 4. `seedDomain` picks its columns explicitly (needed: `migrate.ts:134-157` uses `Object.keys`). `keySeeded` sits beside `adoptUnowned` (`migrate.ts:107`) and runs at `seedMissing`'s start. The fresh-database test is added. What is left over is in S6 and N6.
- **B2 resolved.** Primary only (`types.ts:75`, `available.ts:41`). Bevestigen is the only primary button (`datasets.ts:129`). There is an Annuleren-only test.
- **S1 resolved.** The drawer uses the same rule. `studio.spec.ts:828-850` is named.
- **S2 resolved.** v2 key. `RailFoot.test.tsx:23-30` and `step-3d.spec.ts:87-94` are named. `step-3d.spec.ts:122` still clears the old key, which is harmless.
- **S3 resolved.** It uses opacity, cites the right test, and keeps `selection.spec.ts:173-189` green.
- **S4 partly.** See N3: `createThrough` and the dashboard's QuickCreate are not wired, and the names collide.
- **S5 partly.** The `ended` counter and the files are named, but App cannot read its own provider (S1).
- **S6 resolved.** Label, `expect` and the Storing stat are right. `:222, :259, :303` are named.
- **S7 partly.** All four `layoutOf` callers are named (complete per grep). `localOf`/`currentOf`/`changed` still read the unfitted copy (S3).
- **S8 partly.** `columns.ts:204` still prints "Nee" for null (S4).
- **S9 resolved.**
- **S10 partly.** `patchOf` cannot see the view (S2).
- **S11 resolved.** The leftover is in N9.
- **S12 partly.** New unnamed reds are in S5–S8.
- **S13 resolved.**
- **S14 resolved.**
- **N1–N6 resolved.** The leftovers of N4 are in N6.
- **N7 regressed.** See the Blocking finding.

## Blocking

**B1. The seed report line puts a domain word in the engine, and `bun run check` fails on it.**
- **Plan:** Task 4 Step 1 has the report line `'door een persoon gewijzigd, ongemoeid gelaten'` and claims "the domain-free check sees no domain word".
- **Source:**
  - `persoon` is on the check's fixed list (`scripts/check-vocabulary.ts:10-21`).
  - The check reads every line of every file under `packages/engine`, src and test alike (`:66-74`).
  - I ran it with `--root` on a scratch file holding that line: it exits 1 on `persoon`. The English form passes.
  - The engine's seed report is English today (`seed-missing.ts:144, 156, 193, 209, 220`), and the tests assert English (`seed-missing.test.ts:228, 242, 278, 289, 316`).
  - The Ruling's 400 message, "Een standaardweergave blijft gedeeld", passes the check but is Dutch in the engine. AGENTS.md says engine names are English. The grid shows the raw `bad_view` message (`i18n.ts:444-446`).
- **Fix:** write both in English, like the existing lines:
  - `view "<name>" (<source>) changed by a person, left alone`;
  - `… deleted by a person, left alone`;
  - `a seeded view stays shared`.

## Should fix

**S1. App cannot read a provider it renders itself.**
- **Plan:** Task 2 Interfaces says "RunsProvider sits in App around the work column". `ended` must be a dependency of App's `reloadView` and the counts effect, and App wires `onCreated` to `follow`.
- **Source:** all of that state lives in `Workspace` (`App.tsx:216-218, 349-359, 549`). Workspace renders the work column (`:673`), so a `useRuns()` call there sits above its own provider. The follower also needs `models`, which is computed inside Workspace (`:389`), so the provider cannot move above it.
- **Fix:** `const runs = useRunFollower(models)` in Workspace, provided through `<Runs.Provider value={runs}>`. Children use `useRuns()`.

**S2. Attack 6's check cannot live in `patchOf`.**
- **Plan:** the Mitigations line puts `patchOf` on attacks 1–6.
- **Source:** `patchOf(body)` (`views.ts:295-299`) sees only the body, and runs at `:345`, before `ownedView` at `:347`. `shared` reaches `viewBody` through `{...outOf(current), ...patch}` (`:348`, `:211`).
- **Fix:** the refusal goes inside the PATCH's `write`, after `ownedView`: a system-owned `current` with `Object.hasOwn(patch, 'shared')` gives 400. An editor then still gets 403 `read_only_view` first.
- Refusing any `shared` key is safe for the grid: it sends `shared` only from `own` views (`ViewList.tsx:48,53`; `api.ts:383-386`).

**S3. R11 is fitted for reading rows, but the save path still sends the stale keys.**
- **Plan:** Task 5 fits only `layoutOf`.
- **Source:** `localOf` and `currentOf` read `storedLayout` raw (`ui/views.ts:67-69, 121-122`), and so does `changed` (`:86-88`). Their readers are App's changed mark and revert (`App.tsx:536-539`) and Save, copy and autosave (`useSavedViews.ts:111, 149, 164, 183`).
- **Result:** Stefan's stale `start_at` layout still shows "gewijzigd". Saving a copy then sends `sort: ['start_at']`, and the engine refuses it (`views.ts:181`).
- **Fix:** `useLayout` writes the fitted layout back (`storeLayout`) when it differs. Add the test "a stale stored sort shows no changed mark and saves without it".

**S4. R16: an empty boolean still reads "Nee".**
- **Plan:** Task 6 changes only `Bool.tsx:12`.
- **Source:** `BoolCell` prints `column.text(row)` beside the switch (`Bool.tsx:16`), and that text is `row.fields[key] ? t('yes') : t('no')` (`columns.ts:204`). So a null `updates_core` reads "Nee", the false zero R16 forbids.
- **Fix:** add `columns.ts:204` (null gives `''`) to Task 6. `Bool.test.tsx` asserts that no "Nee" shows for null.

**S5. A person's shared view with a seed's name: rule whether it still counts as present.**
- **Plan:** "seeds match by seed_key only". Task 4 Step 4 files `seed-missing.test.ts:153-320` under "keys from keySeeded".
- **Source:** these tests insert owner-7 shared views (never keyed) and expect the seed not to add its own:
  - `:154-167` (`added: 1, present: 1`);
  - `:183-189` ("another user's shared view … counts as present").
- **Today:** `seedViews` counts such a view as present (`seed-missing.ts:168-177`). With key-only matching the seed adds a second "Open" beside it.
- **Fix:** rule it either way. Keep the shared-name check (both tests stay green), or name both tests as changing.

**S6. Rule whether `keySeeded` writes a revision, and name the tests it turns red.**
- **Plan:** the plan says nothing about whether `keySeeded` writes a revision.
- **Source:**
  - These tests compare a declared-name system view's whole row before and after `seedMissing`. Setting `seed_key` changes the row whatever the ruling: `seed-missing.test.ts:270-280` and `:282-291` (`toEqual(before)`), and `:302-310`.
  - If `keySeeded` revises, these turn red too:
    - `:216` (exactly four revised fields);
    - `:279` and `:290` (no revision);
    - `views.test.ts:498-503` (the owner-0 audit list).
  - Separately, `views.test.ts:305-336` inserts a raw system view `later` after `seeded()` and expects it first. `testEngine` runs no migrate (`sign-in.ts:16-28`), so with `seedOrdered` by `seed_key` (Task 4 Step 3) it is not ordered first, and the test turns red.
- **Fix:**
  - Rule that `keySeeded` writes no revision, since it backfills an invisible key the way a migration does.
  - Name the tests above: compare without `seed_key`, or key the views first.
  - Name `views.test.ts:305-336`: call `keySeeded(fresh, declared)` there.

**S7. R6 turns more e2e red than Task 3 names, and the record-link label is wrong.**
- **Source:**
  - `e2e/drawer-actions.spec.ts:28-43, 88-96, 118-128` and the press-then-close tests. The selection-domain fixture declares no primary button (`packages/engine/test/fixtures/selection-domain.ts:62-77`), so Start, Finish, Back and Park all move into ⋮.
  - `e2e/action-inputs.spec.ts`: every test goes through `actionOf` (`:146`), not only `:276-277`.
  - `e2e/step-1.spec.ts:341`.
  - `e2e/step-2.spec.ts:718-720`: the record link's group and its "Link gekopieerd" status.
  - `e2e/studio.spec.ts:288-293`: the site drawer's action groups.
  - The Ruling and the Drawer test say "Kopieer link". The label is "Link kopiëren" (`i18n.ts:85`; `Drawer.tsx:238-241`).
- **Fix:**
  - Name these tests.
  - Use the real label.
  - Say where "Link gekopieerd" and "Nieuwe link gekopieerd…" show once the buttons sit in a menu (a toast).

**S8. R14 turns two studio e2e red, and Task 6 does not list them.**
- **Source:** "Sites" gains `in_registry: true`, so `oud-archief` (`seed.ts:72`) leaves it. These tests tick it on Sites:
  - `e2e/studio.spec.ts:190-192, 206-207` (request-health-check-for-selected-sites);
  - `:269-271` (request-only-retired-sites-refused).
- **Fix:** add `e2e/studio.spec.ts` to Task 6, and move both to "Sites met aandacht", which lists the site (`:148`).

**S9. Attack 4's mitigation points at checks that never stop a human administrator, and it has no test.**
- **Source:** `ownedView:235-239` refuses only non-humans. For an administrator, the guard on a seeded for-owners view is `forOwnersProblem` in the PATCH (`views.ts:350`).
- **Fix:** cite `:350`. Add a denial test: "an administrator's PATCH adding a non-owner-visible column to a for-owners seeded view is 400, the row unchanged".

## Note

- **N1. `locked` on `ViewOut`/`SavedView` is unneeded.**
  - `lockOf` already gives exactly the ruled marks from `editable` (`ui/views.ts:40-44`).
  - ViewList already offers rename and delete on `editable` (`ViewList.tsx:52,56`). So two of Task 5's "failing" tests pass before any grid change.
  - Dropping `locked` also spares the `views.test.ts:338-361` change.
- **N2. Extra `ended` dependencies are unneeded.** Grid already re-reads its related drawer on `reloads` (`Grid.tsx:333-341`). Its own drawer and `useOpenRow`'s read from the reloaded rows (`useOpenRow.tsx:45`). So `ended` → `reloadView`, the counts and `Dashboard.refresh` is enough.
- **N3. The create paths.**
  - One seam is simpler: wrap `create` in `useGridStore`'s api (`hooks.ts:31-35`). That covers both `store.create` and the draft commit (`store.ts:224-230, 438-441`).
  - QuickCreate already has `onCreated(batch)` (`QuickCreate.tsx:84`), used at `App.tsx:722` and `Dashboard.tsx:123`. Rename one of them.
  - `createThrough` (`App.tsx:436-443`) and the dashboard's QuickCreate are not wired.
  - `runAction` returns refs only (`api.ts:342-353`). So `finished` must read the created rows before it can choose "aangevraagd" or "uitgevoerd". Say so.
- **N4. `gone` on a tile travels back.** The Composer sends `dashboard.layout` back as it got it (`Composer.tsx:188,197`), and the engine refuses unknown tile keys (`dashboard.ts:35-36`). Serve `gone` beside the layout (e.g. `gone_views: number[]`) or strip it in `updateView`.
- **N5. The Dock.** The selection state lives in Grid (`Grid.tsx:384-390`). Name how the panel reaches the dock: a portal slot like `DrawerSlot` (`SidePanel.tsx:24`, `App.tsx:220,738`).
- **N6. keySeeded and duplicate rows.**
  - Today a seed removed as undeclared and then declared again is added anew, because `seed-missing.ts:162` filters deleted rows. So a database can hold a deleted row and a live row with one `(name, source)`.
  - Rule one of two: `keySeeded` keys live rows only, or the seed's match prefers the live row.
  - Run `keySeeded` after `adoptUnowned`.
- **N7. The lock-mark Ruling departs from R9's letter.** R9 says "Only a locked view shows the lock". Have Stefan confirm. The alternative within the letter is the colleague-style copy-only mark for an editor, which would flip `grid-ux.spec.ts:644-646`.
- **N8. Shared-database hygiene.**
  - Task 2's e2e sets a site to `storing`, while `studio.spec.ts:171` asserts "0" Storing for Bakkerij Testmans. Restore it in a `finally`.
  - Task 1's e2e creates an actie. Undo it, as `:221-227` does.
- **N9. Citations and names.**
  - "`dashboard.test.ts:440-446`" is "a layout naming a view two seeds share". The two-runs test is `:448-454`.
  - The forged POST test selects no `seed_key` (`views.test.ts:142`).
  - Test map row 5's "a tile test" should be `tiles.test.ts` or `more-tiles.test.tsx`.
  - The test says "onEnded once" while the interface says `ended`.

## Premises checked
- `keySeeded` beside `adoptUnowned` → `migrate.ts:107,116` → holds
- `keySeeded` at `seedMissing`'s start → `seed-missing.ts:225` → holds
- `seedDomain` must pick columns (it spreads `{...v}` through `Object.keys`) → `migrate.ts:134-157` → holds as a needed change
- `storedView` already explicit → `seed-missing.ts:91-105` → holds
- seed_key column added by ALTER, no rebuild → `schema-diff.ts:78,90-95` → holds
- `touched()` over revision (entity, record_id, actor_id, index) → `revision.ts:9-18` → holds
- the share and for-owners routes write as the administrator (so touched applies to unlocked seeds only) → `views.ts:443,456,464,478` → holds
- 400 on `shared` in `patchOf` → `views.ts:295-299,345-348` → does not hold (S2)
- `shared` reaches `viewBody` → `views.ts:211,348` → holds
- engine can tell a soft-deleted tile view → `views.ts:220-223`; `listViews` `:301-312` → holds; round trip → `dashboard.ts:35-36` → N4
- created row from `store.create` / draft / QuickCreate → `store.ts:438-441, 224-230`; `QuickCreate.tsx:97-99` → holds (name clash, N3)
- `ended` → `reloadView`, counts, Dashboard refresh → `App.tsx:216-218,349-359`; `Dashboard.tsx:40-47` → holds; App consuming its own provider → does not hold (S1)
- Grid's drawer already follows `reloads` → `Grid.tsx:333-341` → holds (N2)
- `waiting(row)` via the primary button → `types.ts:75`; `available.ts:41`; `datasets.ts:129-138` → holds
- `layoutOf` callers → `hooks.ts:13`, `ListTile.tsx:58`, `WeekTile.tsx:31`, `tiles.ts:31` (complete per grep) → holds; the other readers of the stored copy → `ui/views.ts:67,86,121` → S3
- `autosaves` without `mine` → `useSavedViews.ts:19`; editable branches `views.ts:84-85` → holds (the dashboard clause keeps team dashboards out)
- RailFoot v2 key → `RailFoot.tsx:12-29,58` → holds
- Search has ⌘K and no compact mode → `Search.tsx:30-36` → holds
- `Bool.tsx:12` null → holds; `columns.ts:204` "Nee" → S4
- engine seed report language → English, `seed-missing.ts:144-220` → the Dutch line does not hold (B1)
- check-vocabulary scans engine src and test, `persoon` is on its list → `scripts/check-vocabulary.ts:10-21,66-74` → confirmed by running it
- link account role owner, 403 `forbidden` → `action-token.ts:32`; `views.ts:324-327`; `access.ts:30,41` → holds
- red or green test cites:
  - `Selection.test.tsx:134-143` → holds
  - `RailFoot.test.tsx:23-30` → holds
  - `step-3d.spec.ts:87-94` → holds
  - `selection.spec.ts:173-189` (green) → holds
  - `studio.spec.ts:222/259/303/373/556/600/647-648/828-850` → holds
  - `step-0c.spec.ts:89-91` → holds
  - `step-1.spec.ts:194`, `step-2.spec.ts:208`, `ui-fit.spec.ts:414`, `action-inputs.spec.ts:276-277` → holds
  - `views.test.ts:135-152`, `:169-174` (green), `:338-361` → holds
  - `dashboard.test.ts:227-229`, `:422-439` → holds
  - `dashboard.test.ts:440-446` → wrong lines (N9)
  - theatre `seed-missing.test.ts:116-122` (green) → holds
  - the list is incomplete → S5–S8
- `studio.spec.ts` helpers: `execFileSync` `:83`, worker `:33-37`, `expect` form `:58` → holds
- ARCHITECTURE-INVARIANTS.md → absent → no invariant check applies

Coverage: every R1–R16 has a task. The threat model covers attacks 1–3 and 5–8 with tests. Attack 4 has no test (S9).

Invented scope: only `locked` on `ViewOut` (N1).

Simplest design: the rejected stored flag is now stated honestly against `views.ts:268-293`.

Domain words: the grid copy is generic Dutch, and studio labels appear only in fixtures and e2e. The only domain word headed for the engine is B1.
