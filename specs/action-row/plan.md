# Action row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A calmer table (quieter lines, one text size, a totals bar that never covers rows), a record's actions as one row in the drawer's body, and an "open" icon for a record's web address in the drawer's head.

**Architecture:** Mostly CSS (Task 1). Then the drawer's record actions move out of `DrawerTools` (head) into a new `ActionRow` in the drawer's body (Task 2). Then a generic column flag `href` that the engine validates and the grid offers as an icon link in the drawer's head (Task 3). Studio declares one such column on `site`. The worker that fills it is netdust-studio's plan `specs/site-address/plan.md`, built after this branch is live.

**First working version:** Task 1. Stefan sees the table in light and dark (screenshots) before Task 2 starts, and that is a stop: the coder waits for the reviewer's go.

**Tech Stack:** Bun, Hono, SQLite (engine); React, react-aria-components, Vitest on jsdom (grid; no stylesheet is loaded in unit tests, so layout and CSS are proven in Playwright); Playwright e2e.

**Spec:** `specs/action-row/spec.md` (R1–R7 here; R8 is netdust-studio's `specs/site-address/plan.md`, R9 its `specs/fresh-counts/plan.md`).

## Global Constraints

- No domain word in `packages/engine` or `apps/grid`; `bun run check` passes (vocabulary and registered-checks checks included). Grid copy stays generic ("Openen in nieuw tabblad", not "Website openen").
- Engine messages stay English; grid copy is Dutch through `i18n.ts`.
- `docs/SPEC.md` is the spec of record: an engine declaration change edits it first.
- No client data, no WordPress code, no real site names or addresses in fixtures.
- Every Playwright and gate run under `flock /home/ntdst/.cache/worktable-e2e.lock`. `--grep` joins alternatives with a bare `|`.
- Never touch the live studio (127.0.0.1:4320/:5180, ~/.local/share/netdust-studio, the user units).
- "we spend enough time finetuning UI": change what the spec names and nothing else.

## Threat model

**Assets:** a viewer's session in the grid (an XSS steals it); a person's trust in an "open" link.

**Attacks:**
1. **A stored value in an `href` column is `javascript:…` or `data:…`, and the head's icon link runs it in the grid's origin** → **the engine refuses any value that is not an absolute `http:` or `https:` URL on write (400 `bad_url`), and the grid renders the link only when the value parses as http(s), else no button.**
2. **A person (editor, administrator, link account) rewrites a site's address to a look-alike domain** → **studio declares the column with the `worker` spread (`written_by: 'service'`): a person's write is 403 `service_only` (`writes.ts:596-601`).**
3. **Reverse tab-nabbing from the opened page** → **the link has `target="_blank" rel="noopener noreferrer"`, asserted in a test.**

**Mitigations:** `checkValues` (`packages/engine/src/writes.ts:132`), which every writer reaches (`answeredOf` `:623`, `:636`; import `import.ts:163`; seeds `seed-missing.ts:60`); the declare-time check in `validate.ts`; `OpenLink` in the grid (parse with `new URL`, protocol http/https only); studio's `adres` declaration.

**Deferrals:** the worker is trusted to write a site's own address from `site.yml`, which is Stefan's file.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Table look (R1–R3) | the rendered table | e2e · `e2e/table-look.spec.ts` (new) · `bunx playwright test e2e/table-look.spec.ts` (the foot below the last row's box and above nothing; with 2 ticked, scrolled to the end, the foot's box clear of `.nv-selection`; every cell's computed font-size equal in a row) | totals-clear-of-the-panel, one-size-in-a-row |
| `href` column (R7 engine) | `POST/PATCH /api/rows/:model`; domain validation | unit · `packages/engine/test/href.test.ts` · `bun test packages/engine/test/href.test.ts` (denials: `javascript:`, `data:`, relative, garbage, `ftp:` → 400 `bad_url`, row unchanged; `href` on a non-text column refused by `validateDomain`) | — |
| Open link (R7 grid) | the drawer head render | unit · `apps/grid/src/grid/Drawer.test.tsx` (button with `target="_blank"` and `rel="noopener noreferrer"` for https; none for `javascript:`; none for null) | open-the-address |
| Action row (R4–R6) | the drawer render | unit · `apps/grid/src/grid/ActionRow.test.tsx`, `Drawer.test.tsx` · `bunx vitest run src`; layout · e2e `e2e/drawer-actions.spec.ts` | confirm-from-the-row, site-actions-in-the-row |
| Studio `adres` (R7 studio) | `GET /api/schema`, person write | unit · `packages/studio/test/` (schema serves `href`; a person's write 403 `service_only`) · `bun test packages/studio` | — |

## Review Focus

1. A `javascript:` or `data:` address never becomes a clickable link: the engine refuses it, and the grid refuses it too (Test map rows 2–3).
2. A person cannot write a site's address (row 5).
3. Bevestigen on a prepared opdracht is visible without opening any menu (row 4, flow confirm-from-the-row).
4. The totals bar never covers a row (row 1).
5. Moving the actions loses none: every action the head menu offered before is offered by the row or the ⋮ (row 4, helper rewrite).
6. The row stays on one line in a 392px drawer and in a widened one, with or without a primary (row 4, e2e).

## Simplest design

For R4, the simplest design is to move `DrawerTools`' output from the head slot to the body slot unchanged. That does not meet R4: there it is one primary plus a ⋮, and Stefan asked for buttons on a line. So `DrawerTools` keeps the record's own tools (link copy, new link, delete) in the head, and a new `ActionRow` shows the actions as buttons and folds whatever does not fit into "Meer" by measuring, as R4 says ("when they do not fit on one line"). For R3, the simplest design is used: the totals row is never sticky. It sits at the table's end, and the existing dock padding lets it scroll clear of the panel. For R7, a studio-only button is simpler, but the grid is domain-free, so the button comes from a generic column flag.

---

### Task 1: The table's look (R1, R2, R3) — first working version

**Files:**
- Modify: `apps/grid/src/ui/theme.css:26, 142, 192` (`--color-border-row`, light and both dark blocks)
- Modify: `apps/grid/src/ui/app.css` (`:1755-1786` cell sizes and their comments at `:1765-1766`, `:1781`; `:2418-2431` `.nv-grid__foot td`)
- Create: `e2e/table-look.spec.ts`

- [ ] **Step 1: R1.** Lower `--color-border-row` contrast in both themes. Starting point: light `#e1e5ea`, dark `#2a2d33`; adjust by eye against the screenshots. Lines stay visible in dark on `--color-bg-surface`. The matrix draws its lines with the same token (`app.css:1681`); it gets the quieter lines too, which is accepted.
- [ ] **Step 2: R2.** One size for every grid cell, 14px. Stefan found the 16px text cells too big beside the 12.5px numbers. 14px sits between them, and 16px everywhere would make the numbers grow. Set `.nv-grid:not(.nv-mx) .nv-td { font-size: 14px }`, and give each of these `.nv-grid:not(.nv-mx) <selector> { font-size: inherit }`: `.nv-cell__tabular` (`:1755`), `.nv-dot` (`:1776`), `.nv-pill` (`:1550`), `.nv-blank` (`:1812`), `.nv-cell__muted` (`:1889`), `.nv-td__error` (`:2271`). The hover button `.nv-open` (`#root .nv-open` 11px, `:2222-2223`) is the open-row affordance, not a cell value: it keeps its size, and the e2e skips it. Update the two "16px" comments. The title keeps weight 500 at the same size. The matrix keeps its own sizes.
- [ ] **Step 3: R3.** Add `.nv-grid:not(.nv-mx) .nv-grid__foot td { position: static }`. The table's totals row sits at the table's end. The matrix renders the same `<tfoot>` (`Matrix.tsx:607`) and keeps its frozen foot (`app.css:2444-2446`), so the shared rule at `:2419-2431` stays as it is.
- [ ] **Step 4: e2e (`table-look.spec.ts`).** totals-clear-of-the-panel: a table with at least 28 invented rows, created and removed again in the test (the studio seed has only 3 sites). First assert that the scroll container overflows (`scrollHeight > clientHeight`). Then scroll to the end with 2 ticked: the foot's box is below the last row's box and does not intersect `.nv-selection`; with nothing ticked the foot is below the last row. one-size-in-a-row: every `.nv-td` and its text children in one row share one computed font-size, `.nv-open` excepted.
- [ ] **Step 5: Screens.** Take Sites at 1440×900 in light and dark: one scrolled to the end with 2 rows ticked, one without the panel. Send the paths to the reviewer and wait for Stefan's go before Task 2.
- [ ] **Step 6:** `bunx playwright test e2e/table-look.spec.ts` under the lock, then commit `feat(grid): quieter lines, one text size in a row, the totals at the table's end`.

### Task 2: The action row (R4, R5, R6)

**Files:**
- Create: `apps/grid/src/grid/ActionRow.tsx`, `apps/grid/src/grid/ActionRow.test.tsx`
- Modify: `apps/grid/src/grid/DrawerTools.tsx` (keeps only copy link, new link, delete and the delete confirmation), `apps/grid/src/grid/Drawer.tsx:199-217` (renders `ActionRow`), `apps/grid/src/ui/app.css` (row styles), `apps/grid/src/i18n.ts` (new key `moreInRow`: "Meer"; `moreActions` at `:217` is `MoreMenu`'s default and stays)
- Modify, the helpers: `apps/grid/src/test-setup.ts:38-46` (`pressAction`, `actionsOffered`: they open the head's Acties today; they learn the row and its Meer), `e2e/drawer.ts` (same: an action through the row, link and delete through the head's ⋮)
- Modify, tests that assert the old placement (rewrite each to the new one): `Drawer.test.tsx:458`; `DrawerButtons.test.tsx:30, 94, 112, 145`; `Selection.test.tsx:191, 351`; `dashboard/Dashboard.test.tsx:180`; `dashboard/more-tiles.test.tsx:77`; e2e `studio.spec.ts:979` (drawer-reads-right), `studio.spec.ts` drawer-actions-in-the-bar (retire, replaced by confirm-from-the-row), `action-inputs.spec.ts:372` (escape-after-the-picker: focus returns to the action's button in the row)
- Modify: `specs/CHECKS.md:218, 227` (the two rows that describe "Bevestigen in de kop … geen actie in de body": rewrite to the row; `bun run check` fails a registered check with no test)
- About 33 unit tests and 22 e2e tests (8 specs) press actions through the helpers; they turn green with the helpers, untouched otherwise. List every test you change in the ledger.

**Interfaces:**
- Produces: `ActionRow({ model, row, onDone, actions, onAction, onSaid }: RowProps)`; null when it has nothing to offer or `row.id <= 0`.

- [ ] **Step 1: Unit tests (RED), `ActionRow.test.tsx`:**
  - the primary button renders first, filled (`nv-button--primary`);
  - without a primary, the actions render in their declared order, all quiet;
  - the ones `ActionRow` folds (a measured overflow, faked in jsdom by a stubbed width) sit in "Meer" in their order; with nothing folded there is no "Meer";
  - an action with inputs opens the inputs panel under the row (close button, Escape, focus on its first input: carry the existing tests over from `Drawer.test.tsx`);
  - no button for an action `row.available.actions` does not list.
- [ ] **Step 2: Implement `ActionRow`.** Move `press`, `run`, the asking state and the inputs panel out of `DrawerTools`. The row is one flex line (`nowrap`, gap 8px, `nv-button--sm`). After layout and on resize (`ResizeObserver`), fold buttons from the end into a `MoreMenu` (label and menu `moreInRow`) until the row fits; the primary never folds. After an inputs panel closes, focus goes back to the action's button, or to Meer when the action was folded. The head's ⋮ keeps its name `recordActions` ("Acties"), so the helpers that find Verwijderen by it keep working. `DrawerButtons` (`DrawerButtons.tsx:8-23`) already renders lifecycle buttons with the primary filled, but it wraps. Reuse its markup if that helps; `press` has one home, in `ActionRow`.
- [ ] **Step 3: Place it (R5), RED first in `Drawer.test.tsx`.** It renders directly after the first `LinkSection` when the record has links (an opdracht's Sites is a `links` declaration, `packages/studio/src/datasets.ts:109-118`, rendered at `Drawer.tsx:215`), else directly after the fields (`Props` and the "+ n andere velden" toggle), before the `LongSection`s. Test both.
- [ ] **Step 4: R6.** `DrawerTools` keeps the ⋮ with Link kopiëren, Nieuwe link and Verwijderen only, plus the delete popover. The head shows no primary button. Test: the head's ⋮ never lists a lifecycle button or a declared action.
- [ ] **Step 5: Helpers and listed tests.** Rewrite the helpers and the listed tests. Add to `e2e/drawer-actions.spec.ts`: confirm-from-the-row (an opdracht in Voorbereid: Bevestigen is a visible button under Sites without opening a menu); site-actions-in-the-row (a site's row is one line with no horizontal overflow at the 392px drawer and when widened; the folded actions are in Meer). Update `specs/CHECKS.md:218, 227`.
- [ ] **Step 6:** `bunx vitest run src`, the touched e2e specs under the lock, `bun run check`, then commit `feat(grid): a record's actions are a row in the drawer's body; the head keeps link and delete`.

### Task 3: Open a record's address (R7)

**Files:**
- Modify: `docs/SPEC.md` (the dataset-columns flags, beside `badge` `:56` and `footer` `:65`) first
- Modify: `packages/engine/src/declare.ts:37-66` (`ColumnDecl.href?: true`), `packages/engine/src/validate.ts` (text only, the `checkLong` pattern at `:92`), `packages/engine/src/writes.ts:132` (`checkValues`: 400 `bad_url`), the schema the grid reads (`apps/grid/src/engine.ts` field mapping, `apps/grid/src/types.ts`)
- Create: `packages/engine/test/href.test.ts`, `apps/grid/src/grid/OpenLink.tsx`
- Modify: `apps/grid/src/grid/Drawer.tsx` (head tools: `OpenLink` before `DrawerTools`), `apps/grid/src/i18n.ts` (`openLink`: "Openen in nieuw tabblad"), `packages/studio/src/datasets.ts` (`site.adres`), `packages/studio/src/seed.ts` (invented addresses for the seeded sites)

**Interfaces:**
- Produces: `ColumnDecl.href?: true`: "a text holding an absolute http(s) address the record's drawer offers to open". The schema serves it as `href: true` on the field. (`opens` is taken by actions, `declare.ts:384`; `bad_link` by record links, `record-link.ts:21`.)
- Produces: studio `site.adres: { type: 'text', label: 'Adres', nullable: true, href: true, ...worker }` (`worker` = `{ written_by: 'service' }`, `datasets.ts:8`; no `readonly`, which would drop the service's own write, `writes.ts:100-106`).

- [ ] **Step 1: SPEC.md.** Add `href` to the column flags.
- [ ] **Step 2: Denial tests (RED), `href.test.ts`:** a write of `javascript:alert(1)`, `data:text/html,x`, `/relative`, `not a url` and `ftp://x` to an `href` column → 400 `bad_url`, row unchanged; `https://example.test` and `http://example.test` are stored; `null` is stored on a nullable one; a domain declaring `href` on an integer column fails `validateDomain`.
- [ ] **Step 3: Implement** the validate check and the `checkValues` check.
- [ ] **Step 4: Grid (RED first).** `OpenLink`: an `<a>` icon button (lucide `ExternalLink`, aria-label from i18n `openLink`, title the address), `target="_blank" rel="noopener noreferrer"`, rendered only when the record has an `href` field whose value parses with `new URL` to http/https. Tests: a button with that target and rel for https; none for `javascript:` (served by a fake schema, since the engine refuses it); none for null.
- [ ] **Step 5: Studio.** Declare `site.adres`. Test: the schema serves `href`, and a person's write of `adres` is 403 `service_only`. Invented fixture addresses only (`https://voorbeeld-site.test`), seeded for the e2e sites. The new column reaches the database by `ALTER TABLE ADD COLUMN` (`schema-diff.ts:95`). It shows in the drawer's fields, and in a Sites table only where a view lists every column. That is accepted.
- [ ] **Step 6:** `bun test packages`, `bunx vitest run src`, `bun run check`, then commit `feat: a column holding a web address opens from the record's drawer; studio's site keeps its address`.

## Close

Gate → push → reviewer's `/feature-review action-row` (security-sentinel on the threat model) → one fix pass → `/shakeout` with these flows: totals-clear-of-the-panel, one-size-in-a-row, confirm-from-the-row, site-actions-in-the-row, open-the-address (the icon opens a new tab at the address). Screenshots in light and dark: the table, an opdracht's drawer with the row, a site's drawer with the row and the open icon.
