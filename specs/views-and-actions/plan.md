# Views and actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid's actions sit where Stefan looks for them, say truthfully what they did, and show their results by themselves. The views a domain seeds become Stefan's to keep, change or delete.

**Architecture:**
- **Grid only** (Tasks 1–3, 5):
  - a bottom dock in the work column that holds the floating selection panel and the lines of running requests;
  - an app-level run follower that polls the records this browser created in a live state, and bumps one `ended` counter that the view, the rail counts, the dashboard and the open drawer re-read on;
  - an action bar in the drawer's head;
  - tick boxes on hover;
  - visible column lines;
  - a stored layout fitted to the columns the view has.
- **Engine** (Task 4): one engine table gains a column, `saved_view.seed_key`, which no request can write. From it:
  - an unlocked seeded view is a team view that a human administrator may change, delete and restore;
  - `--seed-missing` matches seeds by `seed_key` and never overwrites, restores or re-adds an unlocked view a person touched;
  - a seeded dashboard drops a tile whose view a person deleted.
- **Studio** (Task 6): declarations, plus the grid's blank null boolean.

No new route.

**Tech Stack:** Bun, Hono, SQLite, TypeScript, React (apps/grid), Vitest, Playwright, bun:test.

**Spec:** `specs/views-and-actions/spec.md` (R1–R16, with R5a, R5b and R10a; parent `specs/studio/spec.md`). Approved by Stefan, 2026-10-24: "Yes, start". Its reviews sit beside it:
- `plan-review.md`, round 1 (blob b0e298f): 2 Blocking, 14 Should fix;
- `plan-review-2.md`, round 2 (blob 23762d9): 1 Blocking, 9 Should fix;
- `plan-review-3.md`, round 3 (blob 296e145): 1 Blocking, 4 Should fix.

All findings from the three rounds are folded in below.

**Branch:** `feature/views-and-actions`, cut from `main` (4cb4a7a).

## Global Constraints

- `packages/engine` and `apps/grid` know no domain word. `check-vocabulary` scans `packages/engine` and `packages/mcp`; the grid's words are checked by review. Studio labels appear only in the grid's test fixtures and in the e2e.
- `docs/SPEC.md` changes first (Task 4's first commit):
  - the SavedView row's rule ("A seeded view is owned by the system owner `-1` … read-only to everyone");
  - the `locked` seed field and `seed_key`;
  - the seed's touched rule;
  - the dashboard's dropped tile;
  - the step-3f board sentence ("on a locked or standard view that switch stays in the planner's own layout"), restated so that "standard" means a view the viewer may not change.
- The engine's own words stay English: the seed report's lines and every error message, as today (`seed-missing.ts:144-220`). `bun run check`'s vocabulary list includes `persoon` (`scripts/check-vocabulary.ts:10-21`).
- "A person" is any actor whose kind is not `service`. "A human administrator" is `humanAdmin` (`views.ts:76`): role administrator and kind `user`.
- Dutch UI copy, as named in each task. No English string reaches the screen. Studio's selection action is labelled "Gezondheid checken" (`packages/studio/src/actions.ts:43`).
- Every Playwright run and every gate run go under `flock /home/ntdst/.cache/worktable-e2e.lock`. Read the gate's result before any push. Delete scratch specs under `e2e/.tmp` before a gate. Playwright's `--grep` is a JS regex, so alternatives are joined with a bare `|`, never `\|`.
- Theatre and fiche declare no `locked` view, so their seeded views unlock too (spec Constraints). Every existing test this turns red is named in its task and changed to the new rule. None is deleted.

## Rulings (plan-level)

- `Ruling: "a person touched a seeded view" means saved_view has a revision row for it whose actor is not the system owner (-1). The seed and the migrator write as -1 (seed-missing.ts:127,154,199-206; migrate.ts:112) — why: every view write already leaves a revision with its actor (views.ts:268-275, 357-371, 443-478) — cost if wrong: a view touched by a since-removed account counts as touched, which is the safe side.`
- `Ruling: touched applies to unlocked seeds only. A locked seed always follows its declaration, except a public or for-owners one, which the seed leaves alone as today — why: the share and for-owners routes write revisions as the administrator (views.ts:443-478), and a locked seed is read-only to people (review S9) — cost if wrong: none.`
- `Ruling: seed_key is JSON.stringify([name, source ?? null]) of the seed at the moment it was written. There are exactly three writers: seedDomain on a fresh database (migrate.ts:146-158), addView (seed-missing.ts:117), and keySeeded(sqlite, domain), an idempotent backfill that sets it on system-owned views where it is NULL and their (name, source) matches a declared seed. keySeeded keys live rows only, runs after adoptUnowned on every migrate (migrate.ts:107) and at seedMissing's start, and writes no revision: it backfills an invisible key, as a migration does. viewBody never reads seed_key from a request, and a forged seed_key is ignored like any forged key (views.ts:295-299) — why: a rename must not detach a view from its seed, and a fresh database must carry keys (round 1 B1, N3; round 2 S6, N6) — cost if wrong: none; the column is invisible to the API.`
- `Ruling: the seed still counts another owner's live shared view with a seed's (name, source) as present, as today (seed-missing.ts:168-177). It is never keyed and never adopted, and the seed adds no second view beside it — why: seed-missing.test.ts:154-167 and :183-189 pin that rule, and a second "Open" beside a person's would be noise (round 2 S5) — cost if wrong: none.`
- `Ruling: a seeded dashboard's tile still resolves to another owner's shared view with the seed's (name, source) when no seed_key matches, as seededIds does today (dashboard.ts:211-212) — why: the present-rule above keeps such a view in place of the seed's, and a tile must not fail on it (round 3 N8) — cost if wrong: none.`
- `Ruling: R10a on a person-changed dashboard is the grid's. The Composer labels a tile whose view is in gone_views "Weergave verwijderd", and leaves those tiles out of the layout it saves. The engine's layout check (dashboard.ts:55-64) is unchanged, and still refuses a tile on a deleted view — why: no access rule changes, and the Composer never sends back a tile the engine refuses (round 3 B1) — cost if wrong: a gone tile disappears at the first Composer save, which is what Stefan's delete asked for.`
- `Ruling: a seed that declares locked never spreads locked into the stored row: seedDomain and storedView pick the stored columns explicitly — why: insertRows takes Object.keys(row) as its columns (migrate.ts:134-142) (review B1c) — cost if wrong: none.`
- `Ruling: a system view the seed itself removed as undeclared (untouched), that a later declaration names again, is restored by the seed and not added anew — why: one row per seed (review N4) — cost if wrong: none.`
- `Ruling: R5a's "a button to press" means the viewer holds a primary button (row.available.buttons.some(b => b.primary)). An Annuleren-only state is still running. The drawer's indicator uses the same rule — why: studio's Annuleren is a button from aangevraagd, voorbereiden and voorbereid (datasets.ts:132,136), and only Bevestigen is primary (datasets.ts:129) (review B2, S1) — cost if wrong: a domain whose waiting state has no primary button keeps spinning; studio's has one.`
- `Ruling (Stefan to confirm at the shake-out): for an administrator, only a locked view shows the lock mark. An editor still sees the copy-only mark on every seeded view, because to them it is copy-only — why: spec R9 speaks of the person who may change the others; studio's only person is its administrator — cost if wrong: an editor sees one mark less (grid-ux.spec.ts:644-646 would flip).`
- `Ruling: a system-owned view's shared flag cannot be changed. Inside the PATCH's write, after ownedView (views.ts:347), a system-owned current with Object.hasOwn(patch, 'shared') is refused 400 bad_view, "a seeded view stays shared". An editor still gets 403 read_only_view first. The grid sends shared only from one's own views (ViewList.tsx:48,53), so the English message never reaches its screen — why: unsharing it would hide it from every list, including its own administrator's (views.ts:302), with no way back (round 1 S10, round 2 S2) — cost if wrong: none.`
- `Ruling: the record-link buttons ("Link kopiëren" and the new-link one, i18n.ts:85; Drawer.tsx:238-241) move into the drawer's ⋮ menu with the record's other actions. Their "Link gekopieerd" status becomes a toast. Buttons on a linked item's line stay on that line — why: spec R6, "nothing of the record's actions stays in the drawer's body"; the item buttons act on another record — cost if wrong: two menu items Stefan wanted visible.`
- `Ruling: the run follower polls every 3 s, backs off to 15 s after 3 errors, and stops on 401/403/404, reusing useLive's constants (useLive.ts:4-7). It follows at most 20 records, and the oldest drops first. A final state shows for 6 s; a final state with tone bad stays until dismissed — why: the drawer's rule is proven, and a failure must not vanish unread — cost if wrong: a 21st simultaneous run is not followed.`
- `Ruling: one bottom dock in the work column holds both the selection panel (table only, on top) and the run lines (every page, below it). The dock is a portal slot, as DrawerSlot is (SidePanel.tsx:24; App.tsx:220,738): Grid portals its SelectionBar into it, and the run lines render there directly. Spec R4's "the floating panel" is this dock — why: two floating panels at one bottom edge collide (round 1 N5, round 2 N5) — cost if wrong: none.`
- `Ruling: a null boolean cell shows blank, not an off switch and not "Nee", in every domain. Bool.tsx:12 renders no switch, and columns.ts:204 gives '' for null. A press on a blank cell sets true. This also changes a nullable boolean such as studio's SLA when empty — why: R16's updates_core would otherwise read "no core update" (round 1 S8, round 2 S4) — cost if wrong: a few empty switches look empty instead of off.`

**Round 4** (`plan-review-4.md`; rulings from the reviewer):

- `Ruling: Task 5's known is the ids of columnsFor(model, view), plus id, position and model.title_field; matrix keys still pass through. The R11 test also covers "a board's position sort, a -id sort and a title filter survive the fit"; e2e/step-3f.spec.ts:301-312 stays green. At App.tsx:266 useLayout comes before models (:389): read served?.models[view.model] there, or move the memo above it — why: a board's manual order stores sort position (useBoardDrag.ts:244), studio's Opdrachten sort -id (seed.ts:283,291), a title filter stores the title column (filter.ts:41) (B-1) — cost if wrong: none.`
- `Ruling: the composer-team-dashboard rewrite (step-3c.spec.ts:346-388) does not restore through --seed-missing: its in-place save makes the dashboard touched. Its finally PATCHes back the layout read before the test, and POSTs /api/views/:id/restore if it deleted the Overzicht — why: S-A — cost if wrong: a changed shared theatre database.`
- `Ruling: the Composer's save leaves out every tile whose view is not in the views it holds; gone_views is only the "Weergave verwijderd" label. The gone-tile test adds: delete a view, open the Composer in the same session, save: accepted — why: a delete in the same session never reloads gone_views (useSavedViews.ts:89, 203-206), and the engine refuses such a tile (dashboard.ts:55-56) (S-B) — cost if wrong: a refused Composer save.`
- `Ruling: Task 6's move of request-health-check-for-selected-sites to testmans-bestel (site 2) also changes studio.spec.ts:212-215: the expected links follow (note).`
- `Ruling: a seed_key on a deleted row counts as a match for a seeded dashboard's tile, so a tile whose seeded view a person deleted drops and never falls back to a colleague's same-named view; the name fallback applies only when no row, live or deleted, carries the key (N8 wording).`
- Notes: no locked field; gone_views on dashboards only; the DrawerSlot is at App.tsx:219, 628, 717; the worker helper is at studio.spec.ts:33-37.

## Threat model

**Assets:**
- the shared views every person in a domain opens: seeded tables, boards and dashboards;
- the published ones, public or for owners;
- the seed's ability to bring an untouched view to its declaration.

**Attacks**
1. **An editor or a service account changes, deletes or restores an unlocked seeded view** (`PATCH`, `DELETE`, `POST /restore` on `/api/views/:id`) → `ownedView` (`views.ts:225`) admits a system-owned view only for `humanAdmin(actor)`, and only when its `seed_key` names a declared seed that is not locked. Every other actor gets 403 `read_only_view`, as today. A link account (role `owner`) is refused earlier, 403 `forbidden`, at `changing` (`views.ts:324-327`).
2. **Anyone changes a locked seeded view** → 403 `read_only_view`, the human administrator included.
3. **A system-owned view with no `seed_key`, or whose `seed_key` no seed declares any more, is opened for change** → treated as locked: 403 `read_only_view`.
4. **An administrator widens a public or for-owners seeded view** → for a human administrator, the guard is `forOwnersProblem` in the PATCH (`views.ts:350`). `ownedView:235-239` stops only non-humans. The seed still leaves those views alone (`leftAlone`, `seed-missing.ts:134`).
5. **A request writes `seed_key`**, to adopt a person's view into a seed or detach a seeded one → ignored like every forged key (`views.ts:295-299`). The request answers 200 and the stored key is unchanged.
6. **An administrator unshares a seeded view**, so it leaves every list → refused 400 `bad_view` (Ruling).
7. **The seed resurrects or overwrites what a person deleted or changed** → `seedViews` matches by `seed_key` over live and deleted system-owned views, skips any unlocked one with a person's revision, and names it.
8. **The seed adopts a person's view that has a seed's name** → seeds match by `seed_key` only, and a person's view has none.

**Mitigations:**
- `views.ts`: `ownedView`, `outOf`'s `editable`, the PATCH's write (`:345-350`: the `shared` refusal after `ownedView`, and `forOwnersProblem`) (attacks 1–6);
- `migrate.ts` and `seed-missing.ts`: `seedDomain`, `keySeeded`, `seedViews`, `updateView`, `removeUndeclared` (5, 7, 8);
- `dashboard.ts`: `seededIds`/`refOf` (R10a).

**Deferrals:**
- An administrator may delete a view that a dashboard tile names (spec R10a). Curating a domain's views is theirs.
- Any human administrator may change a team view. There is one administrator today.
- A copy from the view list of a view that is not on screen reads a stored layout that was never fitted (`useSavedViews.ts:182-184`). It may carry a stale key, which the engine refuses 400 (`views.ts:181`), and nothing is lost (round 3 N9).

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Seeded views (engine) | `PATCH`/`DELETE`/`POST restore` `/api/views/:id`, `GET /api/views`, `seedDomain`, `seedMissing`, a seeded dashboard's tiles | integration · `packages/engine/test/seeded-views.test.ts` (new), plus the existing cases named in Task 4 · `bun test packages/engine/test/seeded-views.test.ts packages/engine/test/views.test.ts packages/engine/test/seed-missing.test.ts packages/engine/test/dashboard.test.ts packages/theatre/test/seed-missing.test.ts packages/theatre/test/migrate.test.ts` | delete-a-seeded-view |
| Selection and the table's look (R1, R2, R7) | the table DOM; the dock | component · `apps/grid/src/grid/Selection.test.tsx`, `Grid.test.tsx`, `ui/RailFoot.test.tsx` · `bun run --filter @worktable/grid test` | tick-and-run-from-the-panel |
| Run follower (R3–R5b) | `act`, `actOnSelection`, `store.create`, the draft commit, `QuickCreate`; the dock; the drawer's head | component · `apps/grid/src/ui/runs.test.tsx` (new, fake api and timers), `Drawer.test.tsx` · `bun run --filter @worktable/grid test` | request-shows-running-then-result |
| Drawer action bar (R6), toolbar (R12), refused create (R13) | the drawer's head DOM; the toolbar at 1280 px; the create paths | component · `apps/grid/src/grid/Drawer.test.tsx`, `ui/App.test.tsx` (R13) · `bun run --filter @worktable/grid test` | drawer-actions-in-the-bar, toolbar-at-1280 |
| Grid views (R8/R9 marks and saving, R10a tile, R11) | `lockOf`, `autosaves`, ViewList's menu, a dashboard tile, `layoutOf`, `useLayout` | component · `apps/grid/src/ui/views.test.ts`, `useSavedViews.test.ts`, `ViewList.test.tsx`, `dashboard/Dashboard.test.tsx`, `dashboard/tiles.test.ts` · `bun run --filter @worktable/grid test` | delete-a-seeded-view |
| Studio (R14–R16) and the null boolean | `/schema`, the seeded views and dashboard; the Bool cell | integration · `packages/studio/test/seed.test.ts` · `bun test packages/studio`; component · `apps/grid/src/grid/cells/Bool.test.tsx` | — |

E2E command for every flow: `flock /home/ntdst/.cache/worktable-e2e.lock bunx playwright test e2e/studio.spec.ts --grep "<flow>"`. Several flows: `--grep "a|b"`.

Denial tests, RED first:
- "an editor's and a service's PATCH, DELETE and restore of an unlocked seeded view are 403 read_only_view; a link account's are 403 forbidden";
- "a human administrator's PATCH of a locked seed is 403 read_only_view";
- "a system view with no seed_key, and one whose seed is no longer declared, are 403 to a human administrator";
- "a PATCH or POST carrying seed_key leaves it unchanged", with `seed_key` added to the `forged` object of `views.test.ts:135-152`. The POST read at `:142` also selects `seed_key`;
- "a PATCH of shared on a seeded view is 400";
- "an administrator's PATCH that adds a column not owner-visible to a for-owners seeded view is 400, and the row is unchanged";
- "seedMissing never re-adds a seed a person deleted, never overwrites one a person changed, and never adopts a person's view with a seed's name";
- "a follow never starts for a record created outside a live state".

## Review Focus

1. **Only a human administrator changes an unlocked seeded view; a locked or undeclared one stays read-only to everyone** → row 1, attacks 1–3.
2. **A view Stefan deleted or changed survives the next `--seed-missing` and `bin/update`, and the seed names it. An untouched one still follows its declaration. A fresh database seeds each view once** → row 1.
3. **A run's final state appears without a reload, also after Stefan moved to another view or the dashboard. An update waiting for Bevestigen stops spinning. A request that only offers Annuleren keeps spinning** → row 3 and its flow.
4. **No record action is left in the drawer's body, and none is lost.** Every lifecycle button, declared action (inputs included), Verwijderen and the record link is reachable from the head → row 4.
5. **Theatre's and fiche's grids and views keep working under the new defaults, every changed test named** → rows 1, 2, 4, 5.

---

## Architecture

**First working version:** Task 1. On studio's harness instance:
- Sites shows tick boxes only on hover, beside the row numbers;
- ticking rows raises the floating panel at the bottom, and nothing shifts;
- the columns have visible lines in both themes.

**Simplest design.** The simplest R8 drops the system owner's read-only rule. But then `--seed-missing` brings back every view Stefan deletes and overwrites every change, which is anti-goal 2. A stored "touched" flag would also work, since every view write passes `save()`/`create()` (`views.ts:268-293`). The revision table already records the actor, though, so the plan reads it and stores nothing. `seed_key` is the one stored fact, and only because a rename must not detach a view from its seed. On the grid, the follower reuses the drawer's polling contract, and re-reads through one counter, not through handles into each component. It does not add server push, which the spec rules out.

**Files:**

| File | Responsibility |
|---|---|
| `apps/grid/src/grid/Selection.tsx`, `Grid.tsx:384-390`, `GridBody.tsx:147-152`, `GridHeader.tsx:63-67`, `ui/app.css` (`.nv-selection` :3455, `.nv-num` checkbox :3500-3506, lines :1668-1672), `ui/theme.css` | R1, R2, R7 |
| `apps/grid/src/ui/RailFoot.tsx:21-28,58` | R7: a new key `ntdst-views/lines/v2`, default `on` |
| `apps/grid/src/ui/runs.tsx` (new: `useRunFollower`, `Runs` context, `useRuns`, the dock slot), `ui/App.tsx` (`finished` :549, `act` :592, `actOnSelection` :604, create :432-443, counts :349-360, QuickCreate :719-725), `grid/hooks.ts:31-35`, `dashboard/QuickCreate.tsx:84,97-99`, `dashboard/Dashboard.tsx:40-64,119-125`, `grid/useLive.ts`, `grid/Drawer.tsx:121`, `i18n.ts` | R3–R5b |
| `apps/grid/src/grid/Drawer.tsx` (Head :107, body :197-223), `DrawerButtons.tsx`, `ActionInputs.tsx`, `Grid.tsx:412-441` (DeleteRow), `ui/SidePanel.tsx`, `ui/MoreMenu.tsx` | R6 |
| `apps/grid/src/ui/Toolbar.tsx`, `ui/Search.tsx` (a compact icon mode), `ui/app.css` | R12 |
| `apps/grid/src/i18n.ts`, `ui/App.tsx`'s create refusals | R13 |
| `packages/engine/src/saved-view.ts`, `views.ts`, `migrate.ts`, `seed-missing.ts`, `dashboard.ts`, `declare.ts`, `docs/SPEC.md` | R8–R10a |
| `apps/grid/src/ui/views.ts` (`layoutOf` :62-64, `lockOf` :40), `useSavedViews.ts:19`, `ViewList.tsx`, `engine.ts` (`EngineView`, `toSavedViews`), `types.ts`, `grid/hooks.ts:13`, `dashboard/Dashboard.tsx`, `dashboard/ListTile.tsx:58`, `WeekTile.tsx:31`, `tiles.ts:31` | R8/R9 marks and saving, R10a's tile, R11 |
| `packages/studio/src/seed.ts` (:186-243, :396), `datasets.ts:61-63`, `apps/grid/src/grid/cells/Bool.tsx:12` | R14–R16 |

---

### Task 1: Selection and the table's look (R1, R2, R7) — first working version

**Files:** `Selection.tsx`, `Grid.tsx`, `GridBody.tsx`, `GridHeader.tsx`, `RailFoot.tsx`, `app.css`, `theme.css`; tests `Selection.test.tsx`, `Grid.test.tsx`, `RailFoot.test.tsx`; e2e `e2e/studio.spec.ts`.

**Interfaces:**
- Produces: `SelectionBar` renders nothing while `count === 0`, and otherwise a `role="region"` panel with class `nv-selection nv-selection--floating`. Same props as today. Task 2 moves it into the dock. Until then it is positioned absolutely at the bottom of `.nv-frame`, centred, over the rows.

- [ ] **Step 1: Failing tests.**
  - `Selection.test.tsx`: "the panel is absent with nothing ticked and floats with one tick". This replaces the always-mounted-strip case at `Selection.test.tsx:134-143`.
  - `Grid.test.tsx`:
    - "a row's tick box sits beside its number in the number cell";
    - "a ticked row carries data-ticked";
    - "with any row ticked the table carries data-ticking".
    Visibility on hover is CSS, proven in e2e.
  - `RailFoot.test.tsx`: "lines default to on under the v2 key, whatever the old key holds". `RailFoot.test.tsx:23-30` (the default is off) changes to this. `e2e/step-3d.spec.ts:87-94` follows.
- [ ] **Step 2:** `bun run --filter @worktable/grid test`. The new tests fail.
- [ ] **Step 3: Implement.**
  - The number cell lays out `[box][number]` inline (no absolute box).
  - `.nv-num input` has `opacity: 0`, and `opacity: 1` under `tr:hover`, `:focus-within`, `[data-ticked]` or `table[data-ticking]`. Never `visibility`: the active row's box stays the Tab stop (`GridBody.tsx:149`; `e2e/selection.spec.ts:173-189` stays green).
  - The panel: `position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%)`, a raised surface, and a `z-index` above the sticky cells. The scroll area gets bottom padding equal to the panel's height while it shows, so the last row stays reachable.
  - R7: `useLook('ntdst-views/lines/v2', …, 'on')`. The line colour becomes `--color-border-row` (light `#c4cbd3`, dark `#3a3d44`) in place of `--color-border-subtle`.
- [ ] **Step 4:** The tests pass. Add the e2e `tick-and-run-from-the-panel`:
  1. Hover row 1: its box shows (opacity 1). Row 2's shows none.
  2. Tick 2 sites: the panel appears at the bottom, and row 1's `boundingBox().y` is unchanged.
  3. Run "Gezondheid checken" from the panel: the request is created with those 2 sites. Undo it afterwards, as `studio.spec.ts:221-227` does, so the shared harness database ends as it began.
  4. Take two screenshots with the default lines, light theme and dark theme. Stefan works in dark, where today's `#24262b` vanishes. Every header and row cell shows its vertical line in both.
- [ ] **Step 5:** Gate, commit, then send the reviewer the first-working-version screenshots.

### Task 2: The run follower (R3, R4, R5, R5a, R5b)

**Files:** create `apps/grid/src/ui/runs.tsx` and `runs.test.tsx`. Modify:
- `App.tsx` (Workspace), `grid/hooks.ts` (the create wrap), `QuickCreate.tsx`, `Dashboard.tsx`;
- `Grid.tsx` (portal into the dock), `GridBody.tsx` (`data-running`), `Drawer.tsx`;
- `useLive.ts` (export its constants and `waiting(row)`), `i18n.ts`, `app.css`.

**Interfaces:**
- `useRunFollower(models): Runs` is called in `Workspace` (`App.tsx`), where `models` (`:389`), `reloadView` (`:218`) and the counts effect (`:349-359`) live. Workspace provides it through `<Runs.Provider value={runs}>` around the work column. Children read it with `useRuns()`. Workspace itself uses the `runs` it holds, never `useRuns()` above its own provider.
- `interface Runs { follow(run: Run): void; ended: number; running: ReadonlySet<string> }`, where:
  - `interface Run { label: string; dataset: string; id: number; acted: { model: string; ids: number[] } | null }`;
  - `running` holds `"<model>:<id>"` of acted rows.
- `follow` starts only when `models[dataset].lifecycle` is set and the created row's lifecycle value is in `models[dataset].live`.
- A follow ends when the value leaves `live`, or `waiting(row)` (= `row.available?.buttons.some(b => b.primary) === true`) holds. Its end increments `ended`.
- `ended` drives three re-reads:
  - **Workspace:** one effect, placed after `useRunFollower` (the counts effect at `App.tsx:351-360` and the rows effect at `:364-387` come before `models` at `:389`), calls `reloadView` and re-reads the counts.
  - **Dashboard:** an `ended` effect runs `refresh` (`Dashboard.tsx:40-43`) and re-reads its open drawer's `opened` row with `rowOf`, as `Grid.tsx:333-341` does. Today that row is re-read only after a press inside it (`:48, 58-64, 119`).
  - Grid's related drawer already re-reads on `reloads` (`Grid.tsx:333-341`), and its own drawer and `useOpenRow`'s read from the reloaded rows (`grid/useOpenRow.tsx:45`).
- The dock is the portal slot ruled above. GridBody marks `data-running` on rows in `running`.
- The created row reaches Workspace by one callback, `onCreatedRow(dataset, row)`:
  - the table: one wrap of `create` in `useGridStore`'s api (`grid/hooks.ts:31-35`) covers both `store.create` and a draft's commit (`store.ts:224-230, 438-441`);
  - `createThrough` (`App.tsx:436-443`) calls it with the row it already gets;
  - both QuickCreates, App's (`:719-724`) and the dashboard's (`Dashboard.tsx:123`), call it. Their existing `onCreated(batch)` (`QuickCreate.tsx:84`) keeps its name.
- `runAction` and `runSelection` return refs only (`api.ts:342-353`). So `finished` reads each created record with `rowOf` before it chooses "aangevraagd" (live) or "uitgevoerd", and follows the live ones.
- Copy (i18n):
  - `actionRequested: '{action} aangevraagd.'`
  - `createdRequested: '{title} aangevraagd.'`
  - `runBusy: '{action} · {state}'`
  - `runWaiting: '{action} · {state} — openen'`
  - `runDone: '{action} · {state}'`

- [ ] **Step 1: Failing tests (`runs.test.tsx`, fake timers, a fake `rowOf`).**
  - "an action whose created record is live says aangevraagd, not uitgevoerd" → `'Gezondheid checken aangevraagd.'`.
  - "while followed, the dock shows the action and the state with a busy indicator" → a region with `aria-busy="true"`, containing `'Gezondheid checken · Bezig'`.
  - "a state offering only a non-primary button keeps running" (Annuleren in aangevraagd).
  - "a state offering a primary button ends as waiting" → `ended` rises once; the line reads `'… — openen'`, with a link that opens the record.
  - "leaving the live states bumps ended once and shows the final state for 6 s; a bad final state stays until dismissed".
  - "the rows it acted on carry data-running while it runs".
  - "the follow survives a view change".
  - "a run's end re-reads a drawer opened from a dashboard tile".
  - "a plain create is followed through store.create, a draft's commit, createThrough, and App's and the dashboard's QuickCreate, each with createdRequested"; "a create outside a live state is not followed" (denial).
  - "three errors back off to 15 s; a 404 stops the follow".
  - `Drawer.test.tsx`: "a followed record's head shows a spinner beside its text while running, and none while it waits on a primary button".
  - These existing tests turn red and change to the new copy: `e2e/studio.spec.ts:222, 259, 303` ("… uitgevoerd.") and `e2e/studio.spec.ts:828-850` (drawer-reads-right, "Volgt live").
- [ ] **Step 2:** `bun run --filter @worktable/grid test`. The new tests fail.
- [ ] **Step 3: Implement.**
  - `finished(batch, action, created)` follows each live created record, with `acted` = the row (`act`) or the ticked ids (`actOnSelection`).
  - `actionDone` stays for actions that create nothing live.
  - The spinner is lucide's `LoaderCircle` with a CSS spin. Under `prefers-reduced-motion` it is a static dot.
- [ ] **Step 4:** The tests pass. Add the e2e `request-shows-running-then-result`. The harness has no worker, so the test plays it with the service token (`studio.spec.ts:34-38`), PATCHing `actie` and `actie_site` with `expect`, as `studio.spec.ts:58` does:
  1. Run "Gezondheid checken" on one site: the dock says busy, and that row's number cell shows the indicator.
  2. Open the Overzicht. The test sets the site's `gezondheid` to `storing`, then the actie through `bezig` to `klaar`. The dock shows `Klaar`, and the Storing stat rises by one without a reload.
  3. A bijwerken set to `voorbereid` ends as waiting, with the link. The same request in `aangevraagd` stays busy.

  The harness database is shared (one worker, one `--fresh`). In a `finally`, the test sets the site's `gezondheid` back, because `studio.spec.ts:171` asserts "0" Storing. It also undoes the actie it made, as `:221-227` does.
- [ ] **Step 5:** Gate, commit.

### Task 3: The drawer's action bar (R6), the toolbar at 1280 (R12), the refused create (R13)

**Files:** `Drawer.tsx`, `DrawerButtons.tsx`, `ActionInputs.tsx`, `Grid.tsx` (DeleteRow), `SidePanel.tsx`, `MoreMenu.tsx`, `Toolbar.tsx`, `Search.tsx`, `i18n.ts`, `App.tsx`, `app.css`; tests `Drawer.test.tsx`, `App.test.tsx`.

**Interfaces:**
- `SidePanel` gains `tools?: ReactNode`, rendered in the head between `head` and the widen button.
- The drawer passes `<DrawerTools …/>`:
  - the primary lifecycle button as a visible `nv-button--primary nv-button--sm`;
  - one `MoreMenu` (icon `EllipsisVertical`, label `t('recordActions')` = `'Acties'`) holding:
    - the other buttons, then the declared actions;
    - the record-link pair, whose "Link gekopieerd" status shows as a toast;
    - Verwijderen last, with today's two-press confirmation, shown in a popover from the item.
- An action with inputs opens `ActionInputs` in a popover anchored to the menu button.
- `MoreMenu`'s `Action` gains `tone?: 'danger'`.
- `Search` gains `compact?: boolean`: an icon button that expands to the field on press or `⌘K`.

- [ ] **Step 1: Failing tests.**
  - `Drawer.test.tsx`:
    - "the drawer body holds no record action";
    - "the primary button is in the head, the rest behind Acties": the menu lists the non-primary buttons, each declared action, "Link kopiëren", the new-link item and Verwijderen. A domain with no primary button (the selection-domain fixture, `packages/engine/test/fixtures/selection-domain.ts:62-77`) shows every button in the menu;
    - "an action with inputs opens its inputs from the menu and runs with them";
    - "Verwijderen asks once more before it deletes";
    - "a linked item's own buttons stay on its line".
  - `App.test.tsx`, R13: "a create refused service_only says it cannot be added". The text is `'Dit wordt automatisch aangemaakt; je kan het niet zelf toevoegen.'`, and no message contains `wijzigen`. Cover the table's create and QuickCreate.
  - These existing tests turn red and move to the head and the menu:
    - `e2e/studio.spec.ts:373, 556, 600` (Annuleren in the body);
    - `e2e/studio.spec.ts:647-648` and `e2e/step-0c.spec.ts:89-91` (Verwijderen, then Zeker?);
    - `e2e/studio.spec.ts:836-845` (Annuleren beside Bevestigen, a site's actions as groups) and `:288-293` (the site drawer's action groups);
    - `e2e/drawer-actions.spec.ts:28-43, 88-96, 118-128` and its press-then-close tests (Start, Finish, Back and Park move into ⋮);
    - every test in `e2e/action-inputs.spec.ts`, through `actionOf` (`:146`);
    - `e2e/step-1.spec.ts:194, 341`, `e2e/step-2.spec.ts:208, 718-720` (the record link's group and its status), `e2e/ui-fit.spec.ts:414`;
    - the grid's `Drawer`/`DrawerButtons` cases.
    Name each one in the task report.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3: Implement.** R12: with a drawer open and the work column narrower than the toolbar needs, the search takes its compact mode, and the view's summary drops before anything wraps.
- [ ] **Step 4:** The tests pass. Add the e2e:
  - `drawer-actions-in-the-bar`: an opdracht in voorbereid shows Bevestigen in the head and Annuleren in Acties.
  - `toolbar-at-1280`: with a drawer open at 1280×800, the toolbar's `boundingBox().height` equals its height without a drawer.
- [ ] **Step 5:** Gate, commit.

### Task 4: Seeded views are team views (R8, R9, R10, R10a) — engine

**Files:** `docs/SPEC.md` (first commit), `saved-view.ts`, `views.ts`, `migrate.ts`, `seed-missing.ts`, `dashboard.ts`, `declare.ts`; test `packages/engine/test/seeded-views.test.ts` (new); change the existing cases named in Step 4.

**Interfaces:**
- `SavedViewSeed.locked?: boolean`.
- `saved_view.seed_key TEXT NULL`, added by `ALTER` (`schema-diff.ts:77-100`, no rebuild).
- `keySeeded(sqlite, domain): number`, idempotent, as ruled.
- `touched(sqlite, id): boolean`: a `revision` row for entity `saved_view`, that id, and an actor other than `-1`.
- `lockedSeed(raw, domain): boolean` (internal to `views.ts`): true for a system-owned view that is locked, has no `seed_key`, or has an undeclared one. `ViewOut` gains no field. `editable` (`views.ts:84`) is true for a system-owned view when `humanAdmin(actor) && !lockedSeed(raw, domain)`. The grid's `lockOf` and ViewList already work from `editable` (`ui/views.ts:40-44`; `ViewList.tsx:52,56`).
- `GET /api/views` serves a dashboard with `gone_views: number[]`, the soft-deleted view ids its tiles name, beside its `layout`. It is never inside the tiles, because the Composer sends the layout back (`Composer.tsx:188,197`) and the engine refuses unknown tile keys (`dashboard.ts:35-36`).

- [ ] **Step 1: Failing tests (`seeded-views.test.ts`)** on a domain fixture with one unlocked and one locked view seed, and one dashboard seed whose tiles name both:
  - "a --fresh database's seeded views carry seed_key, a locked seed stores no locked column, and a following seedMissing adds nothing".
  - "a human administrator renames, re-sorts, deletes and restores an unlocked seeded view" → 200, 200, 204, 200. `GET /api/views` serves it `editable: true` to the administrator, and `editable: false` to an editor.
  - The denial list from the Test map.
  - "seedMissing leaves a person-changed unlocked view as the person left it and names it `view "<name>" (<source>) changed by a person, left alone`". This is English, like the seed's other lines.
  - "seedMissing does not re-add a person-deleted seed and names it `view "<name>" (<source>) deleted by a person, left alone`".
  - "a renamed seeded view is still its seed's: seedMissing adds no second one".
  - "an untouched seeded view is still brought to its declaration; so is a locked one that an administrator once shared by token".
  - "a removed declaration removes an untouched view and leaves a touched one, named"; "declared again, the removed one is restored, not added".
  - "a person's shared view with a seed's name is never keyed or adopted, and still counts as present".
  - "keySeeded writes no revision, keys live rows only, and a second run changes nothing".
  - R10a:
    - "an untouched seeded dashboard loses the tile whose seeded view a person deleted, seedMissing names it and exits 0";
    - "a tile naming a view no seed declares still fails seeding" (`dashboard.test.ts:422-439` stays green);
    - "a person-changed dashboard keeps the tile, and `GET /api/views` lists its view in `gone_views`, on that dashboard only";
    - "a PATCH of that dashboard whose layout no longer holds the gone tile is accepted";
    - "a PATCH that adds a tile on a deleted view is still 400".
  - The dropped tile's report line: `dashboard "<name>": tile on deleted view "<view>" dropped`.
- [ ] **Step 2:** `bun test packages/engine/test/seeded-views.test.ts`. The tests fail.
- [ ] **Step 3: Implement**, `docs/SPEC.md` first. `views.ts:314-322`'s seeded ordering and `dashboard.ts`'s `seededIds` read views by `seed_key`, not by name.
- [ ] **Step 4:** Run the Test map row 1 command. These existing cases change:
  - `views.test.ts:135-152`: the `forged` object gains `seed_key`, and the POST read at `:142` selects it.
  - `views.test.ts:305-336`: it inserts a raw system view after `seeded()`, and `testEngine` runs no migrate (`sign-in.ts:16-28`). Call `keySeeded` there, so the seeded ordering by `seed_key` holds.
  - `dashboard.test.ts:227-231`: the system dashboard is admin-editable when unlocked; `stored()` follows.
  - `seed-missing.test.ts:270-280, 282-291, 302-310`: their whole-row `toEqual(before)` compares without `seed_key`, which `keySeeded` sets.
  - `packages/theatre/test/migrate.test.ts:79`: `added.saved_view` gains `'seed_key'`.

  These stay green unchanged:
  - `views.test.ts:169-174` (its actor is an editor and its view has no `seed_key`) and `:338-361` (`ViewOut` gains no field);
  - `seed-missing.test.ts:154-167, 183-189` (another owner's shared view still counts as present);
  - `seed-missing.test.ts:216, 279, 290` and `views.test.ts:498-503` (`keySeeded` writes no revision);
  - `dashboard.test.ts:448-454` (two seedMissing runs leave one dashboard);
  - `packages/theatre/test/seed-missing.test.ts:116-122`.
- [ ] **Step 5:** Gate, commit.

### Task 5: The grid's side of views (R8, R9, R10a, R11)

**Files:** `ui/views.ts`, `useSavedViews.ts`, `ViewList.tsx`, `engine.ts`, `types.ts`, `grid/hooks.ts`, `ui/App.tsx:266` (`useLayout`'s caller), `dashboard/Dashboard.tsx`, `dashboard/Composer.tsx`, `ListTile.tsx`, `WeekTile.tsx`, `tiles.ts`, `i18n.ts`; tests in the matching `.test` files; e2e `e2e/studio.spec.ts`, `e2e/step-3c.spec.ts`.

**Interfaces:**
- A dashboard's `gone_views`, through `EngineView`/`toSavedViews`. No `locked` field: `lockOf(view)` (`ui/views.ts:40-44`) already returns `'standard'` for a seeded view the viewer may not change, and null for an editable one.
- `autosaves(view) = isSaved(view) && view.editable && !view.public && view.type !== 'dashboard'`. That is today's rule with `view.mine` dropped (`useSavedViews.ts:19`). For-owners views still autosave for their administrator, as today.
- `layoutOf(view: View, known: ReadonlySet<string>): Layout` (`ui/views.ts:62`). `known` is required, so the compiler finds every reader: `grid/hooks.ts:13`, `ListTile.tsx:58`, `WeekTile.tsx:31`, `tiles.ts:31`.
  - `known` is the ids of `columnsFor(model, view)`, which covers `title`, `lookups.<field>.<name>` and `rollups.<key>` (`columns.ts:230, 247, 257-259`).
  - Every `isMatrixKey` id (`record:`, `name:`, `ui/views.ts:50`) passes through untouched.
  - It drops each other stored sort key, filter, group, hidden id and order id not in `known`. Widths stay.
- `useLayout` (`grid/hooks.ts:13`) writes the fitted layout back with `storeLayout` when it differs from the stored one. Then `localOf`, `currentOf` and `changed` (`ui/views.ts:67-69, 86-88, 121-122`) read the fitted copy too, and the changed mark, revert, Save, copy and autosave never send a stale key (`App.tsx:536-539`; `useSavedViews.ts:111, 149, 164, 183`).
- A tile whose view is in `gone_views` reads `t('viewDeleted')` = `'Weergave verwijderd'`.

- [ ] **Step 1: Failing tests.**
  - "an administrator's sort click on an unlocked seeded view saves for everyone": `autosaves` is true and the PATCH is sent.
  - "an editor's change to it stays local with the changed mark".
  - These two are regression guards that pass before any grid change, because the grid already works from `editable`:
    - "a locked view keeps the lock mark; an unlocked one shows none to its administrator";
    - "ViewList offers Naam wijzigen and Verwijderen on an editable seeded view".
  - R11, with the case from Stefan's screen: "a stored sort on a column the view lacks is dropped and the rest applies". `sort: [{ id: 'start_at', desc: false }]` on a view without `start_at` yields `sort: []`, widths kept. Add the same case for a list tile.
  - "a stale stored sort shows no changed mark, and Save and a copy send no stale key".
  - "a matrix view's hidden record: column and a title sort survive the fit".
  - "a tile whose view is in gone_views reads Weergave verwijderd, in the dashboard and in the Composer; the Composer's save leaves it out of the layout".
  - `e2e/step-3c.spec.ts:346-388` (composer-team-dashboard) turns red. Theatre's seeded Overzicht is now `editable` for its administrator: the Rail offers "Dashboard verwijderen" (`Rail.tsx:72`), and the Composer saves in place (`Composer.tsx:194-197`). Rewrite it to that rule: in-place save, deletable. Its `finally` restores the seeded layout (`--seed-missing` brings an untouched one back, or a PATCH of the saved layout), so the shared theatre database ends as it began.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** The tests pass. Add the e2e `delete-a-seeded-view`, as administrator on the studio harness:
  1. Delete "Storing": it leaves the rail.
  2. Run `--seed-missing` on the harness database with `execFileSync`, as `studio.spec.ts:81-88` does: "Storing" stays gone, and the Overzicht's Storing tile is gone.
  3. Restore it with `POST /api/views/:id/restore`. The grid offers restore only through the delete toast's undo (`useSavedViews.ts:206-211`).
  4. Run `--seed-missing` again: the tile is back.

  The shared harness database (`e2e/.tmp/studio.db`, one worker) ends as it began, and `studio.spec.ts:124` stays green.
- [ ] **Step 5:** Gate, commit.

### Task 6: Studio (R14, R15, R16) and the null boolean

**Files:** `packages/studio/src/seed.ts`, `datasets.ts`, `apps/grid/src/grid/cells/Bool.tsx`, `apps/grid/src/grid/columns.ts:204`; tests `packages/studio/test/seed.test.ts`, `apps/grid/src/grid/cells/Bool.test.tsx`; e2e `e2e/studio.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - `seed.test.ts`:
    - "studio seeds no view named Alle sites";
    - "Sites filters in_registry true";
    - "the Sites in orde tile's total is Sites";
    - "no studio view seed is locked";
    - "updates_plugins, updates_themas and updates_core are nullable, and the worker service may write null": through `/schema`, and a `PATCH` as the worker service.
  - `Bool.test.tsx`: "a null boolean shows blank, with no switch and no 'Nee'; a press sets true". Name each existing test that asserted an off switch, or "Nee", for null.
  - R14 turns two studio e2e red, because "Sites" now leaves out the retired `oud-archief` (`seed.ts:72`). Move both to "Sites met aandacht", which lists it (`studio.spec.ts:145-148`):
    - `e2e/studio.spec.ts:190-192, 206-207` (request-health-check-for-selected-sites). It ticks testmans-bestel in place of testmans-winkel, which that view does not list, and its drawer site line follows;
    - `e2e/studio.spec.ts:269-271` (request-only-retired-sites-refused).
- [ ] **Step 2:** `bun test packages/studio` and `bun run --filter @worktable/grid test`. The tests fail.
- [ ] **Step 3: Implement.** Keep `default: 0` / `false` beside `nullable: true`. The table is rebuilt by the engine's migrator, which copies the database first (`migrate.ts:47-57,99`). Integer cells are already blank for null (`columns.ts:64-69`), and totals already add 0 (`group.ts:160-164`).
- [ ] **Step 4:** The tests pass. Gate, commit.

## Close

Gate green, then the head sha to the reviewer. The reviewer runs `/feature-review views-and-actions` with security-sentinel on the threat model. There is no `ARCHITECTURE-INVARIANTS.md`, so no invariant-auditor. Then one fix pass, with `specs/views-and-actions/review.md`. Then `/shakeout`, which drives:
- tick-and-run-from-the-panel;
- request-shows-running-then-result;
- drawer-actions-in-the-bar;
- toolbar-at-1280;
- delete-a-seeded-view.

After the merge, outside this branch: netdust-studio's worker writes `null`, not "keep", on a failed count read (the studio-worker review's S13 ruling).
