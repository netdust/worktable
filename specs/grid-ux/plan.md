# Grid UX implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid looks and works like `design/grid-prototype.html`: a production switcher, a tree of models and views, a one-line title, a calmer grid with collapsible day bands carrying declared facts, and inherited values shown grey.

**Architecture:**
- The engine gains four generic, optional declarations: a domain `space`, and on each source `scoped`, `section`, `group_facts` and, on a column, `inherited`. `/schema` serves them. The grid's `toSchema` maps them onto the types it already has. `Schema.space` and `TableDef.space` exist today, unused.
- The rail is rebuilt as a tree from `useSavedViews` and `ui/tables.ts`.
- Group bands and facts are computed in the grid from a group's rows.
- The look comes from `theme.css` tokens and self-hosted IBM Plex.

**Tech Stack:** Bun 1.4, Hono 4, TypeScript, React 19 + Vite, `@sakaniui/react` (Popover, Menu), Vitest, Playwright, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` (self-hosted fonts).

**Spec:** `specs/grid-ux/spec.md` (R1–R8). Design: `design/grid-prototype.html`.

## Global Constraints
- `packages/engine` never names a domain word. The new engine words are `space`, `scoped`, `section`, `group_facts`, `first`, `count`, `empty`, `inherited`, `flag` and `own`. `bun run check` (boundary, vocabulary, staged-export and export-terms checks, Biome, typecheck) stays green.
- Domain words such as `voorstelling` and `zonder tijd` appear only in `packages/theatre` declarations.
- A space is a view filter, never access control. The rows route is not changed, and owner scope (`scopeOf`) stays a separate concept.
- Dutch UI text for everything new. The grid's existing English base strings stay, as today (Dutch chrome is on the step 0 parity checklist, not this branch).
- Fixtures are invented. No client data, and no font or asset loaded from a third-party host at runtime.
- A step is done when its gate passes in a real browser. Nothing is merged or pushed without Stefan.

## Architecture notes
- **First working version:** Task 1, the look (fonts, tokens, row height, lines, header). It changes every screen Stefan already uses, with no engine change.
- **Simplest design:** the simplest route hardcodes the theatre in the grid: a productie dropdown, "voorstelling" facts and a `locatie_bron` check. That breaks the one rule: the grid would learn domain words, and the fiche domain could never use any of it. So the plan adds four small declarations instead. Each is optional, each is ignored by a domain that doesn't declare it, and none adds a route. Space filtering reuses the rows `filter` parameter, and facts are computed client-side from rows the grid already holds.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| Look: tokens, fonts, row height, lines, header icons, density setting | render | unit · `apps/grid/src/ui/App.test.tsx` (density setting persists, `data-density`) · `cd apps/grid && bunx vitest run` | dark-and-density |
| Engine declarations: space, scoped, section, group_facts, inherited (validation + /schema) | `GET /api/schema`, `validateDomain` | integration · `packages/engine/test/declarations.test.ts` · `bun test packages/engine` | none, proven by the grid flows |
| Theatre declarations | `GET /api/schema` | integration · `packages/theatre/test/grid-ux.test.ts` · `bun test packages/theatre` | none |
| Grid schema mapping (`toSchema`) | `toSchema` | unit · `apps/grid/src/engine.test.ts` | none |
| Production switcher and scoped filtering | rail, `rows()` | unit · `apps/grid/src/ui/App.test.tsx`, `apps/grid/src/space.test.ts` | switch-production |
| Sidebar tree, `+` menu, dialog, `…` menu | rail | unit · `apps/grid/src/ui/Rail.test.tsx`, `ViewList.test.tsx` (rewritten), `NewViewDialog.test.tsx` | tree-fold-and-hover, create-team-and-personal-view, copy-rename-delete-view |
| Group band: collapse, badge, facts, totals | `GridBody` | unit · `apps/grid/src/grid/group.test.ts`, `Grid.test.tsx` | fold-day-band, band-facts |
| Inherited cell | `Display` | unit · `apps/grid/src/grid/cells/Relation.test.tsx` | inherited-venue |

## Review Focus
1. The grid stays domain-free: no theatre word in `apps/grid/src` outside test fixtures. Facts and inherited labels come only from `/schema`. Test map row 4 (`toSchema`) plus a grep in review.
2. Space scope is a filter added to the rows request, never trusted for access. An owner account's rows are still scoped by `scopeOf`. Test map row 5.
3. A domain that declares none of the new shapes (fiche) renders exactly as before: no switcher, one unlabelled section, plain group bands. Test map rows 2 and 4; e2e on the fiche grid stays green.
4. Folding a group hides rows but never drops them from totals, counts, keyboard navigation bounds or the undo history. Test map row 7.
5. The selector contracts the e2e and unit suites rely on are kept or changed deliberately: `navigation "Views"`, `More actions: <name>`, `tr.nv-group`, `rowheader` text, and the add button's name. Test map rows 6 and 7.

---

### Task 1: The look
**Files:**
- Modify:
  - `apps/grid/src/ui/theme.css`: the prototype's tokens; layered dark; `--color-bg-selected`, `--color-bg-hover`, `--color-bg-card`, `--color-band`; the `--font-sans` and `--font-mono` stacks.
  - `apps/grid/src/ui/app.css`: `.nv-td` height `var(--row-h, 40px)`; no vertical body lines; a light header with field-type icons; a select without tones shows a dot, not a pill.
  - `apps/grid/src/main.tsx`: imports `@fontsource/ibm-plex-sans/{400,500,600}.css` and `@fontsource/ibm-plex-mono/{400,500}.css`.
  - `apps/grid/package.json`.
  - `apps/grid/src/ui/RailFoot.tsx`: a density control, a SegmentedControl like `Theme.tsx`, that sets `#root[data-density]` and is stored per browser.
  - `apps/grid/src/grid/GridHead` (or wherever the `th` renders): icons by field kind.
- Tests: `App.test.tsx` checks that the density choice sets `data-density` and survives a re-render. Existing tests stay green.

- [ ] Implement, run `cd apps/grid && bunx vitest run` and `rm -rf e2e/.tmp && bun run gate`. Commit: `feat(grid): the prototype's look — Plex, layered theme, taller rows, calmer lines, density`.

### Task 2: Engine and theatre declarations
**Files:**
- Modify: `packages/engine/src/declare.ts` (`Domain.space?`, source `scoped?`, `section?`, `group_facts?`, `ColumnDecl.inherited?`), `packages/engine/src/validate.ts`, `packages/engine/src/app.ts` (`/schema` serves `space`, and per source `space`, `section` and `group_facts`; columns pass `inherited` through), `packages/theatre/src/datasets.ts`, `packages/theatre/src/queries.ts`, `packages/theatre/src/index.ts`
- Create: `packages/engine/test/declarations.test.ts`, `packages/theatre/test/grid-ux.test.ts`

**Interfaces:**
- `Domain.space?: { dataset: string }`
- `DatasetDecl.scoped?: string` and `QueryDecl.scoped?: string`
- `section?: string` on both
- `group_facts?: GroupFact[]`, where `GroupFact = { kind: 'first', column: string, where: Record<string, unknown>, label: string } | { kind: 'count', where?: Record<string, unknown>, label: string } | { kind: 'empty', column: string, label: string }`
- `ColumnDecl.inherited?: { flag: string; own: string }`
- `/schema`: `{ sources, space?: { model, field? } }`, with each source gaining `space?: 'scoped' | 'global'`, `scoped_field?`, `section?` and `group_facts?`

- [ ] Write tests:
  - validation refuses:
    - a `space` naming an unknown dataset;
    - a `scoped` column that is not a relation to the space dataset;
    - a fact naming an unknown column;
    - `inherited` on a column whose flag is not a column of the same source.
  - `/schema` serves each declaration.
  - a domain without them serves none, and fiche's `/schema` is unchanged.
  - theatre declares:
    - `space: productie`;
    - `scoped: productie_id` on activiteit, speelreeks, dagplanning and productie_dag;
    - the sections and their order from spec R2;
    - the two facts on dagplanning and activiteit;
    - `inherited` on `dagplanning.locatie_id`.
- [ ] Implement. Run `bun test packages`, then the gate. Commit: `feat(engine): a domain may declare its space, sections, group facts and inherited columns`.

### Task 3: The grid's schema mapping and the production switcher
**Files:**
- Modify:
  - `apps/grid/src/engine.ts` (`EngineSource`/`EngineColumn` types; `toSchema` maps `space` to `Schema.space`; per table `space`, `section`, `facts`; `fieldOf` copies `inherited`);
  - `apps/grid/src/types.ts` (`TableDef.section?`, `TableDef.facts?`, `Field.inherited?`);
  - `apps/grid/src/api.ts` (`rows()` adds `{ [scope.field]: scope.id }` to the filter when a scope is given, replacing the ignored `_scope` parameter);
  - `apps/grid/src/ui/Rail.tsx` and `SpaceSelect.tsx` (the switcher as in the prototype: mark, name and meta, a searchable list, an "Alle producties" entry that clears the scope).
- Tests:
  - `engine.test.ts`: the mapping, and a domain without the declarations maps to none of them;
  - `api.test.ts`: the filter carries the scope;
  - `App.test.tsx`: switching narrows the rows request and new rows get the production; "Alle" sends no scope and never shows "choose a space".

- [ ] Implement, run the grid tests and the gate. Commit: `feat(grid): the production switcher, scoped through the rows filter`.

### Task 4: The sidebar tree, the `+` menu, the dialog and the `…` menu
**Files:**
- Modify: `apps/grid/src/ui/Rail.tsx`, `ViewList.tsx`, `ui/tables.ts` (group by `section` in declaration order), `useSavedViews.ts` (`create` takes `shared`), `MoreMenu.tsx` (reused for `+` and `…`), `App.tsx` (`+ View` panel replaced by the dialog), `i18n.ts`, `app.css`
- Create: `apps/grid/src/ui/NewViewDialog.tsx` and its test

**Contracts kept:**
- `navigation "Views"`;
- `More actions: <name>`;
- the views of the open model sit in `role=group` named `View type`, so the existing counts hold per model;
- drag ordering.

**Contract changed:** `+ View` becomes `+` with the accessible name "Weergave toevoegen aan <model>".

- [ ] Tests:
  - hovering or focusing a model shows the chevron and the tools;
  - clicking folds a node open or shut, and the state persists;
  - the active view is highlighted;
  - a read-only view shows the lock and a personal view the person mark;
  - `+` lists Grid, and Matrix only where the source has a matrix, with Kalender and Bord disabled;
  - the dialog creates a team view (`shared: true`) or a personal one, which opens;
  - Cancel and Escape close the dialog;
  - `…` offers the same actions as today, by editability;
  - delete keeps its Undo.

  Update the App, Rail and ViewList tests and the e2e selectors that used `+ View`.
- [ ] Implement. Run the grid tests and the gate. Commit: `feat(grid): the sidebar as a tree of models and views, with + and … menus`.

### Task 5: Group bands
**Files:**
- Modify: `apps/grid/src/grid/group.ts` (`Group.facts` computed from `TableDef.facts` over the group's rows; per-group `sums`), `GridBody.tsx` (the band holds a chevron, label, count badge, facts and totals; folding; the group foot row is removed), `Grid.tsx` (folded set per view, stored per browser), `app.css`
- Tests: `group.test.ts` and `Grid.test.tsx`.

- [ ] Tests:
  - fact kinds:
    - `first` with `where` (none matching shows nothing);
    - `count`;
    - `empty`, skipped when zero.
  - folding:
    - clicking a band or pressing Enter on it hides its rows;
    - `aria-expanded` follows;
    - totals and counts are unchanged while folded;
    - keyboard row movement skips folded rows;
    - the folded state persists per view.
  - Grid.test's band expectations: the count moves into the band, the group-foot test is replaced, and rowheader text keeps the label in its own element so selectors stay exact.
- [ ] Implement. Run the grid tests and the gate, updating e2e that read `tr.nv-group` text to read the label element. Commit: `feat(grid): slim, foldable group bands with a count, declared facts and totals`.

### Task 6: The inherited cell
**Files:**
- Modify: `apps/grid/src/grid/cells/Relation.tsx` (and `Select` if the flag column is a select), `apps/grid/src/grid/columns.ts`, `app.css`
- Tests: `Relation.test.tsx`.

- [ ] Tests:
  - a relation cell whose `inherited.flag` column holds a value other than `own` renders muted, with "via <the flag option's label>";
  - an `own` or empty flag renders as today;
  - the tag is not part of the value when editing or copying.
- [ ] Implement. Run the grid tests and the gate. Commit: `feat(grid): an inherited value reads grey, with where it comes from`.

### Task 7: The gate in the browser
**Files:**
- Create: `e2e/grid-ux.spec.ts`
- Modify: e2e specs whose selectors Tasks 4 and 5 changed, if any remain.

- [ ] Write the flows of spec R8 on invented fixtures (the theatre seed, plus an applied speeldag through the API for the band facts and the inherited venue).
- [ ] Run `bunx playwright test e2e/grid-ux.spec.ts`, then `rm -rf e2e/.tmp && bun run gate` three times. Commit: `test(e2e): the grid UX gate`.
