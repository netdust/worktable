# default-view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every rail node opens its default view: an administrator marks one shared view in the node as "Standaardweergave", a domain's seed marks one, and without a mark the first view opens as now. Studio's Taken open on a board on status, Features on the board on `fase`, Agenda on its calendar.

**Architecture:** The engine stores one boolean per saved view (`is_default`), serves it in `/views`, and changes it only through an administrator route that unmarks the other default of the same rail node in the same transaction. A rail node is a dataset plus the queries whose `of` names it, so the node key is `source.of ?? source.name`. Seeds declare `default: true`; seeding marks a node's default only while the node has none, so an administrator's choice is never overwritten. The grid opens a node on the view last used in the visit, else the node's default, else the first view, and its view menu offers the mark to administrators.

**Tech Stack:** Bun, Hono, Drizzle, SQLite, Zod, Biome, TypeScript; React + vitest in `apps/grid`; Playwright e2e.

**Spec:** `specs/work-model/spec.md` (R4, with the 2026-11-06 rulings: per rail node, administrator only, rail only with source links noted, the lock renamed "Systeemweergave"); the spec of record `docs/SPEC.md` (SavedView, Work model *Default view*, Administrator, Routes) carries the same rulings since this plan's first commit.

**First working version:** Task 3 — Studio's Taken open on a board on status, Features on "Per fase", Agenda on its calendar. Tasks 1 and 2 are what it stands on.

## Global Constraints

- The engine stays domain-free: no Dutch domain word in `packages/engine`, `packages/mcp` or `apps/grid/src`; `bun run check` enforces it.
- Only a human administrator marks or unmarks a default (a service account is refused whatever its role, as `sharing()` does, views.ts:449). An editor's own unshared view is never a default; a dashboard is never a default.
- At most one default per rail node, held by the database write, not by the grid.
- Error codes: 403 `forbidden` for a non-administrator or a service account (as `forbid`); 404 `unknown_view` for a view the administrator cannot see (as `shareable`); 400 `not_shared` for an unshared view; 400 `dashboard_not_default` for a dashboard.
- UI copy verbatim: menu item "Standaardweergave" (mark) and "Geen standaardweergave meer" (unmark); the seeded-view lock reads "Systeemweergave, alleen te kopiëren" and "Systeemweergave: maak een kopie om aan te passen".
- A node without a default behaves exactly as today. One migration: a nullable-free boolean `is_default` with default false, added by `ALTER TABLE` as `for_owners` was (3d4fb96).
- Engine names are English and generic; Studio names are Dutch. No client data; fixtures are invented. Gate: `bun run gate`. Comments only for a non-obvious why, one line (house rule).
- No source link, no `#source=` route, no per-person default: none is built, stubbed or prepared for.

## Threat model

**Assets.** What every user of an instance opens first (one administrator's choice applies to all); the integrity of "one default per node"; a view's visibility (a default must not reveal a view the viewer cannot read).

**Attacks and mitigations**
1. An editor, an owner or a service token marks a default, changing what everyone opens → the route is administrator-only and refuses a service account (`marking()`, modelled on `sharing()`); the route-matrix test lists it.
2. An administrator marks a colleague's private (unshared) view, publishing it to everyone as their landing view → the route takes only a shared or system view (`shareable()` returns 404 for another's unshared view; an own unshared view is 400 `not_shared`).
3. A default on a source the viewer may not read lands an owner on a view they cannot open → the mark is data only; `/views` keeps filtering by `readable` (views.ts:370-380), so an unreadable default is simply not listed and the grid falls back to the first listed view.
4. Two administrators mark two views of one node at once, leaving two defaults → the unmark of the node's other views and the mark run in one `immediate` transaction, and a test asserts one default after two marks.
5. Reseed overwrites an administrator's choice → seeding marks a node's default only when the node has none; a person's mark is never undone by `--seed-missing`. Changing the mark through the route does not count as "touched" for the reseed of the view's declared fields (the route writes no field `DECLARED` lists).

**Deferrals.** A public or for-owners view can be a default if it is shared; its publication rules are unchanged. Deleting the default view clears its mark (as a delete clears the share token, views.ts:424), so the node has no default until someone marks one and a restored view comes back unmarked. If a query's `of` changes, two nodes can merge holding two defaults; the grid takes the first `default` it lists (deterministic), and the next mark repairs it.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Column, serving, mark route | `GET /views`, `PUT`/`DELETE /views/:id/default` (denials: editor, owner, service token; colleague's unshared view; own unshared view; dashboard) | integration · `packages/engine/test/default-view.test.ts`, `packages/engine/test/route-matrix.test.ts` · `bun test packages/engine/test/default-view.test.ts packages/engine/test/route-matrix.test.ts` | none — proven by tests |
| Seeded defaults | `seedDomain`, `--seed-missing` | integration · `packages/engine/test/default-view.test.ts` · same | none — proven by tests |
| Studio seeds | Studio `/views` after migrate and after seed-missing on an old database | integration · `packages/studio/test/seed.test.ts` · `bun test packages/studio` | none — proven by tests |
| Grid opens the default | `lastIn`, the rail | unit (vitest) · `apps/grid/src/ui/views.test.ts`, `apps/grid/src/ui/App.test.tsx` · `bun run --filter @worktable/grid test` | taken-opens-on-board (written and registered by `/shakeout`) |
| Grid menu, mark, lock wording | `ViewList` menu and marks, `Toolbar` lock | unit (vitest) · `apps/grid/src/ui/ViewList.test.tsx`, `apps/grid/src/ui/Toolbar.test.tsx`; e2e wording · `e2e/grid-ux.spec.ts:642-645` · same + `bun run gate` | mark-a-default (written and registered by `/shakeout`) |

## Review Focus

- A non-administrator or a service token cannot mark or unmark a default, and a colleague's unshared view cannot be marked (Test map row 1, threat 1-2).
- After two marks in one node there is exactly one default, marking in one node leaves the other nodes' defaults alone, and a delete then restore never brings a second default back (row 1, threat 4).
- `--seed-missing` on a database whose administrator chose another default leaves that choice; on a database with no default in the node it marks the seed's (row 2, threat 5).
- A node whose default is not readable to the viewer opens its first listed view (row 4, threat 3).
- A query view (Agenda) is the default of its `of` dataset's node, and the node key is the same in the engine and the grid (rows 1 and 4).

## Simplest design

The simplest design is a client-only choice per browser, which fails the ask: the default must be the same for every user and set by the seed. The next simplest is a column on `saved_view` plus a route, which this plan uses. A per-node table was rejected: the node is derived from the domain (`of`), so a boolean on the view needs no new table and no key that can go stale when a query's `of` changes.

---

### Task 1: Engine column, serving and the mark route

**Files:**
- Modify: `packages/engine/src/saved-view.ts` (add `is_default`), `packages/engine/src/views.ts` (`SavedViewRow` :19 omits `'default'` as it omits `'locked'`; `outOf` :93-108 serves `default`; the DELETE route's `gone` :424-427 adds `is_default: 0`; `shareRoutes` :520-555 gains the two routes), `packages/engine/src/registry.ts` (`nodeOf`, here so `validate.ts` needs no import of `views.ts`), `packages/engine/src/seed-missing.ts` (`touched()` :119-122), `packages/engine/test/route-matrix.test.ts` (two rows, on `/api/views/1`, the fixture's seeded shared view; views 2-5 are unshared, :309-314)
- Test: `packages/engine/test/default-view.test.ts`

**Interfaces:**
- Produces: `saved_view.is_default` (boolean, default false); `ViewOut.default: boolean`; `export function nodeOf(domain: Domain, source: string): string` (`sourceOf(domain, source)?.of ?? source`); `PUT /views/:id/default` → `{ id, default: true }`; `DELETE /views/:id/default` → `{ id, default: false }`.

- [ ] **Step 1: Write the failing tests:** `/views` serves `default: false` on every view of a fresh fixture; an administrator marks a shared view and `/views` serves `default: true` on it only; marking a second view of the same node unmarks the first; a query view whose `of` names a dataset unmarks that dataset's default (one node); marking in one node leaves another node's default; `DELETE` unmarks; an editor, an owner and a service token with the administrator role get 403; a colleague's unshared view is 404 `unknown_view`; an own unshared view is 400 `not_shared`; a dashboard is 400 `dashboard_not_default`; a deleted view is 404; mark A, delete A, mark B, restore A leaves exactly one default (B) and A unmarked; the mark writes a revision with the administrator as actor and does not make `touched()`-gated reseed skip the view's declared fields (assert by a reseed that updates `filters`).
- [ ] **Step 2: Run** `bun test packages/engine/test/default-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the column; `outOf` serves `default: raw.is_default === 1`; `marking(actor)` = `sharing()`'s check; `PUT` in one `write()`: `shareable()`, refuse unshared and dashboard, unmark every other row of the node whose `is_default = 1` (live or deleted) through `save()` so both sides of the move carry a revision, then set the mark through `save()`; the DELETE route clears `is_default` with the delete; `touched()` gains `AND field != 'is_default'` (revisions are one row per field, writes.ts:564-570); add both routes to the route matrix.
- [ ] **Step 4: Run** the same command plus `bun test packages/engine` and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): a rail node's default view, marked by an administrator`.

### Task 2: Seeds declare a default

**Files:**
- Modify: `packages/engine/src/declare.ts` (`SavedViewSeed` :275-287 gains `default?: boolean`), `packages/engine/src/migrate.ts` (`seedDomain`/`systemRow` :162-193), `packages/engine/src/seed-missing.ts` (`seedViews` :223-232)
- Test: `packages/engine/test/default-view.test.ts`

- [ ] **Step 1: Write the failing tests:** a fresh database seeds the declared default; two seeds marked default in one node, or `default: true` on a dashboard seed, are refused at startup (a new seeded-view check in `validate.ts`, the first that reads `domain.views`; its `DomainError` names the view's source and the seed's name); `--seed-missing` on a database whose node has no default marks the seed's; on a database where an administrator marked another view it changes nothing and names the view in its lines ("default left as chosen"); a node whose default was deleted gets the seed's default back only if the seed's view is live.
- [ ] **Step 2: Run** `bun test packages/engine/test/default-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:** `systemRow` writes `is_default` from `seed.default`; after `seedViews`, a `seedDefaults(run)` pass marks each declared default whose node has no live default, with a system revision; the startup check in `validate.ts` beside the other domain checks.
- [ ] **Step 4: Run** the command plus `bun test packages/engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): a domain's seed marks a node's default`.

### Task 3: Studio seeds its defaults, and the grid opens them

**Files:**
- Modify: `packages/studio/src/seed.ts` (taak :375-391 gains a board "Per status" on `status` marked default; werkpakket "Per fase" :367-374 marked default; "Agenda" calendar :392-399 marked default), `apps/grid/src/engine.ts` (`EngineView` :111-126, `toSavedViews` :440-465), `apps/grid/src/types.ts` (`SavedView.default`), `apps/grid/src/ui/views.ts` (`lastIn` :201-204, a `defaultIn(table)` helper; `openTable` calls `lastIn`, so `Rail.tsx:50` and the no-hash landing `App.tsx:250` stay as they are: the rail is the ruling's only surface)
- Test: `packages/studio/test/seed.test.ts`, `apps/grid/src/ui/views.test.ts`, `apps/grid/src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing tests:** Studio's `/views` serves exactly one default per node for taak (the new board on `status`), werkpakket ("Per fase") and the agenda node ("Agenda", source `agenda`), and none for site, actie, project or organisatie; `--seed-missing` on a database made before this plan marks those three (build it by migrating a fresh Studio database, then `ALTER TABLE saved_view DROP COLUMN is_default`, deleting the new board on taak, and deleting the `saved_view` row of the migrations hash table so the next migrate adds the column back; the categories-parent migration test in `packages/studio/test/adoption.test.ts` is the pattern); `lastIn` returns the last view used in the visit, else the node's default, else the first view; a node whose default is not in its listed views (unreadable) opens the first; a rail click on Taken opens the board.
- [ ] **Step 2: Run** `bun test packages/studio` and `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** as above; the grid's node key is the existing `view.of ?? view.table` (useSavedViews.ts:78-81), the same rule as the engine's `nodeOf`.
- [ ] **Step 4: Run** both commands plus `bun run check`; then load a throwaway Studio and click Taken, Features and Agenda.
- [ ] **Step 5: Commit** `feat(studio): Taken, Features and Agenda open on their default views`.

### Task 4: The view menu marks a default; the lock says Systeemweergave

**Files:**
- Modify: `apps/grid/src/ui/ViewList.tsx` (the `ViewActions` type :14-21 gains an optional `onDefault`; `choices()` :46-58 offers it only when present; `Mark` :33-44 renders the default mark beside the lock, a seeded default carrying both), `apps/grid/src/ui/useSavedViews.ts` (builds the actions :222-226), `apps/grid/src/api.ts` (two calls), `apps/grid/src/ui/App.tsx` (:680 adds `onDefault` to `actions` only when `role === 'administrator'`, so `Rail.tsx` stays untouched), `apps/grid/src/i18n.ts` (:218-219 and new keys), `e2e/grid-ux.spec.ts` (:642-645 wording)
- Test: `apps/grid/src/ui/ViewList.test.tsx`, `apps/grid/src/ui/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing tests:** an administrator sees "Standaardweergave" on a shared or system view that is not the default and "Geen standaardweergave meer" on the default; an editor sees neither; an own unshared view and a dashboard never offer it; choosing it calls the route and the list reloads with the mark moved; the default view carries a mark with the label "Standaardweergave"; the seeded-view lock reads "Systeemweergave, alleen te kopiëren" in the rail and "Systeemweergave: maak een kopie om aan te passen" in the toolbar.
- [ ] **Step 2: Run** `bun run --filter @worktable/grid test`. Expected: FAIL.
- [ ] **Step 3: Implement** the menu items, present only when App passes `onDefault` for an administrator (as App.tsx:681 gates dashboards), the two api calls, the mark, the copy; update the two e2e assertions to the new lock wording.
- [ ] **Step 4: Run** the command plus `bun run check` and `bun run gate`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(grid): an administrator marks a view as the node's default`.

## Rollout note

The live Studio picks up the new seeds only through `--seed-missing` once (serve.ts:195): stop `studio-engine`, run the engine once with `--seed-missing` on the live database (after a copy), then start the service. That is an operator step for the reviewer and Stefan after the merge, not a task.

## Not in this plan

A source link (`#source=` or similar) and the drawer's "alle n" link (Sections.tsx:121-124, which never renders today); a per-person default; opening Opdrachten, Sites or the others on anything but their first view.
