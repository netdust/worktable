# Grid UX implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grid looks and works like `design/grid-prototype.html`: a production switcher, a tree of models and views, a one-line title, a calmer grid with collapsible day bands that carry declared facts, and inherited values shown grey.

**Architecture:**
- The engine gains optional, generic declarations, served by `/schema`:
  - a domain `space` and `sections`;
  - per source, `scoped` and `group_facts`;
  - per query column, `inherited`.
- The grid's `toSchema` maps them onto the types it already has. `Schema.space` and `TableDef.space` exist today, unused.
- The rail becomes a tree.
- Group bands and their facts are computed in the grid from a group's rows.
- The look comes from `theme.css` tokens and self-hosted IBM Plex.

**Tech Stack:** Bun 1.4, Hono 4, TypeScript, React 19 + Vite, `@sakaniui/react` (Popover, Menu), Vitest, Playwright, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`.

**Spec:** `specs/grid-ux/spec.md` (R1–R8). Design: `design/grid-prototype.html`.

## Global Constraints
- `packages/engine` never names a domain word. The new engine words are `space`, `scoped`, `sections`, `group_facts`, `first`, `count`, `empty`, `inherited`, `flag` and `own`. `bun run check` stays green. Engine test fixtures use no theatre words.
- Domain words (`voorstelling`, `zonder tijd`, `Planning` …) appear only in `packages/theatre` declarations.
- A space is a view filter, never access control. The rows route is not changed. The owner scope (`scopeOf`) is a separate concept and stays as it is.
- New UI text is Dutch. Existing English strings stay; Dutch chrome is on the step 0 parity checklist (ruling: new strings are Dutch even beside English ones).
- Fixtures are invented. No font or asset is loaded from a third-party host. The prototype's Google `<link>` is never copied.
- Before each commit, run `bun scripts/check-export-terms.ts` on the staged diff and commit only when it reports no export term (Stefan, 2026-10-07). The section names and order are a draft pending Stefan's approval.
- The gate stays green at the end of every task. A step is done when its gate passes in a real browser. Nothing is merged or pushed without Stefan.

## Architecture notes
- **First working version:** Task 1, the look. It changes every screen Stefan already uses, with no engine change.
- **Simplest design:** the simplest route hardcodes the theatre in the grid: a productie dropdown, "voorstelling" facts and a `locatie_bron` check. That breaks the one rule. The grid would learn domain words, and fiche could never use any of it. So the plan adds small optional declarations instead. A domain that declares none of them renders as before, and none adds a route. Space filtering reuses the rows `filter`, and facts are computed from rows the grid already holds. That is sound below the 5,000-row read limit, which counts and totals already share.

## Test map
| Unit | Seam | Tests: tier · file · command | E2E flows |
| --- | --- | --- | --- |
| The look | render | unit · `apps/grid/src/ui/App.test.tsx`, `grid/cells/Select.test.tsx` · `cd apps/grid && bunx vitest run` | dark-and-density |
| Engine declarations | `GET /api/schema`, `validateDomain` | integration · `packages/engine/test/declarations.test.ts` · `bun test packages/engine` | none, proven by the grid flows |
| Theatre declarations | `GET /api/schema` | integration · `packages/theatre/test/grid-ux.test.ts` · `bun test packages/theatre` | none |
| Schema mapping and production switcher | `toSchema`, `useSpace`, `rows()` | unit · `apps/grid/src/engine.test.ts`, `apps/grid/src/space.test.ts` (new), `apps/grid/src/api.test.ts`, `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | switch-production |
| Sidebar tree, menus and dialog | rail | unit · `ui/Rail.test.tsx`, `ui/ViewList.test.tsx`, `ui/NewViewDialog.test.tsx` (new), `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | tree-fold-and-hover, create-team-and-personal-view, copy-rename-delete-view |
| Title line | `Toolbar` | unit · `ui/Toolbar.test.tsx`, `ui/App.test.tsx` · `cd apps/grid && bunx vitest run` | (covered by the flows above) |
| Group bands | `GridBody`, `groupRows` | unit · `grid/group.test.ts`, `grid/Grid.test.tsx` · `cd apps/grid && bunx vitest run` | fold-day-band, band-facts |
| Inherited cell | `Display` | unit · `grid/cells/index.test.tsx` (or `Relation.test.tsx`) · `cd apps/grid && bunx vitest run` | inherited-venue |

## Review Focus
1. The grid stays domain-free. No theatre word appears in `apps/grid/src` outside test fixtures, and facts, sections and inherited labels come only from `/schema`. Test map row 4.
2. The space is a filter added to the rows request, served only to a caller who can read the space dataset. An owner gets no `space` and sees no switcher. Test map rows 2 and 4.
3. A domain without the new shapes (fiche) renders as before: no switcher, one unlabelled section, plain bands. Test map rows 2 and 4, and the fiche e2e.
4. Folded rows leave `ordered`, so keyboard movement and focus skip them. Totals and counts still include them. A group holding the draft row never folds. Test map row 7.
5. Kept contracts:
   - `navigation "Views"`;
   - `More actions: <name>`;
   - opening a view by its name in the rail. The landing view stays `tables[0].views[0]` in today's `byFirstView` order; sections order only the tree. Opening a model by its name also unfolds it. A model node is a `treeitem` (with `aria-expanded` and `aria-labelledby` pointing at its label, so its name is the label alone). Inside it sit its row (icon/chevron, label, `+` and `Meer voor …`, carrying the open and fold handlers) and, nested, its views as buttons in a `role=group "View type"`. A click on a view never reaches the row's handler. The sections sit in one `role="tree"` named "Views" inside the `<nav>`. The e2e helpers never use `getByText`: `const node = nav.getByRole('treeitem', { name: model, exact: true })`, click its row, then `node.getByRole('group', { name: 'View type' }).getByRole('button', { name: view, exact: true })`. So a section label is never a click target, and a view named like its model (10 of 14 seeded views) is never ambiguous.
   - the `…` on a model is named `Meer voor <model>`, so `More actions: <view>` stays unique;
   - the add button's name.

   Changed deliberately:
   - `+ View` → `Weergave toevoegen aan <model>`;
   - the `h1` (now the view name);
   - the group foot (now a badge in the band);
   - `tr.nv-group` text (the label sits in its own `.nv-group__label`).

   Test map rows 5–7.

---

### Task 1: The look
**Files:**
- Modify `apps/grid/src/ui/theme.css`:
  - the prototype's tokens (light, and a layered dark);
  - `--color-bg-selected`, `--color-bg-hover`, `--color-bg-card` and `--color-band`;
  - the font stacks starting with "IBM Plex Sans" and "IBM Plex Mono".
- Modify `apps/grid/src/ui/app.css`:
  - `.nv-td` height `var(--row-h, 40px)`, plus the `[data-density]` values 32, 40 and 46;
  - no vertical body lines (the header divider at app.css:737 included);
  - a light header.

  Grid-only rules are scoped under `.nv-grid`, so the matrix keeps its own look.
- Modify `apps/grid/src/main.tsx`: one import per weight, for `@fontsource/ibm-plex-sans/400.css`, `500.css` and `600.css`, and `@fontsource/ibm-plex-mono/400.css` and `500.css`.
- Modify `apps/grid/package.json` and `bun.lock` (one online `bun add`).
- Modify `apps/grid/src/ui/RailFoot.tsx`: a Dichtheid control (Compact, Normaal, Ruim). It is a SegmentedControl like `Theme.tsx`, sets `#root[data-density]` and is stored per browser.
- Modify `apps/grid/src/grid/GridHeader.tsx`: an icon by field kind.
- Modify `apps/grid/src/grid/cells/Select.tsx`: a pill only for a column keyed `status`; any other select shows a dot in its tone. This is domain-free, and `status` is already allowlisted.
- Tests:
  - `App.test.tsx`: the density choice sets `data-density` and survives a re-render;
  - `Select.test.tsx`: updated for the status-pill and dot rule.

- [ ] Implement. Run `cd apps/grid && bunx vitest run`, then `rm -rf e2e/.tmp && bun run gate`. Commit `feat(grid): the prototype's look — Plex, layered theme, taller rows, calmer lines, density`.

### Task 2: Engine and theatre declarations, and the SPEC.md diff
**Files:**
- Modify:
  - `packages/engine/src/declare.ts`;
  - `packages/engine/src/validate.ts`;
  - `packages/engine/src/app.ts` (`/schema`);
  - `packages/theatre/src/datasets.ts`, `queries.ts` and `index.ts`;
  - `docs/SPEC.md` (a diff only, uncommitted, for Stefan).
- Create:
  - `packages/engine/test/declarations.test.ts`;
  - `packages/engine/test/fixtures/` (a space-and-sections test domain without theatre words);
  - `packages/theatre/test/grid-ux.test.ts`.

**Interfaces:**
- On the domain:
  - `Domain.space?: { dataset: string }`;
  - `Domain.sections?: { label: string; sources: string[] }[]`.
- On a dataset or query: `scoped?: string` and `group_facts?: GroupFact[]`, where `GroupFact = { kind: 'first'; column: string; where: Record<string, unknown>; label: string } | { kind: 'count'; where?: Record<string, unknown>; label: string } | { kind: 'empty'; column: string; label: string }`.
- On a query column: `ColumnDecl.inherited?: { flag: string; own: string }`. Validation refuses it on a dataset column, and refuses a flag that is not a column of the same query.
- What `/schema` serves:
  - `space: { model, field }`, only when the domain declares a space and the caller can read it (`readable`). Every `scoped` column must have the same name, which is `field`.
  - `sections`, each listing only the sources the caller can read; an empty section is dropped;
  - per source, `space: 'scoped' | 'global'` (only when a space is served) and `group_facts`;
  - columns carry `inherited`.

- [ ] Tests:
  - Validation refuses:
    - a space naming an unknown dataset;
    - a `scoped` column that is not a relation to it;
    - scoped columns with different names;
    - a section naming an unknown source, or a source listed twice;
    - a fact naming an unknown column;
    - `inherited` on a dataset column, or with an unknown flag.
  - `/schema` serves each declaration. An owner's `/schema` has no `space` when the owner cannot read the space dataset, and its sections list only readable sources, with empty sections dropped.
  - The engine test fixture domain uses neither theatre nor fiche words (`titel`, `gemeente`, `postcode` …), because the vocabulary check scans the engine's tests too. A domain without the declarations serves none of them, and fiche is unchanged.
  - Theatre declares:
    - `space: productie`;
    - `scoped: productie_id` on activiteit, speelreeks, dagplanning and productie_dag;
    - the sections of spec R2, with names and order invented and approval pending. The source keys are `dagplanning`, `activiteit`, `speelreeks`, `toewijzing` and `beschikbaarheid` (its node reads "Beschikbaarheden"), then `productie`, `persoon` and `organisatie`, then `rol` and `sjabloon`.
    - the two facts on dagplanning and activiteit;
    - `inherited` on `dagplanning.locatie_id`.
- [ ] Write the proposed `docs/SPEC.md` lines (Skin needs row, the sidebar paragraph) as an uncommitted diff, for Stefan to see.
- [ ] Implement. Run `bun test packages`, then the gate. The grid ignores the new keys until Task 3, so the gate stays green. Commit `feat(engine): a domain may declare its space, sections, group facts and inherited columns`.

### Task 3: The schema mapping and the production switcher
**Files:**
- Modify:
  - `apps/grid/src/engine.ts`: types; `toSchema` maps `space` to `Schema.space` and, per table, `space`, `section` and `facts`; `fieldOf` copies `inherited`.
  - `apps/grid/src/types.ts`: `Schema.sections?`, `TableDef.facts?`, `Field.inherited?`.
  - `apps/grid/src/space.ts`: the selection is `number | 'all'`; nothing stored means `'all'`; `'all'` is stored as a sentinel; the first-record fallback goes.
  - `apps/grid/src/api.ts`: `rows()` merges `{ [field]: id }` into the view's fixed filter the way `mergeFilters` does, replacing the ignored `_scope`.
  - `apps/grid/src/ui/App.tsx`: no `'unscoped'` state when "all" is selected; the space chip is stripped only under a real scope.
  - `apps/grid/src/ui/Rail.tsx` and `SpaceSelect.tsx`: the switcher as in the prototype, with mark, name, meta, a searchable list and "Alle producties".
- Create: `apps/grid/src/space.test.ts`.
- Tests:
  - `engine.test.ts`: the mapping, and none for a domain without it;
  - `space.test.ts`: the default is `'all'`, the choice is remembered and the sentinel round-trips;
  - `api.test.ts`: the scope merges into fixed filters;
  - `App.test.tsx`:
    - switching narrows the rows request and pre-fills new rows;
    - "Alle" sends no scope and never shows "choose";
    - rewrite the tests titled "heads the rail with the first production" (about `:255`) and "asks for a production when there is none" (about `:314`) for the new default.

  Because the default is "Alle producties", the existing e2e stays green.
- [ ] Implement. Run the grid tests and the gate. Commit `feat(grid): the production switcher, scoped through the rows filter`.

### Task 4: The sidebar tree, the `+` menu, the dialog and the `…` menu
**Files:**
- Modify:
  - `apps/grid/src/ui/Rail.tsx` and `ViewList.tsx`;
  - `ui/tables.ts`: group by the served `sections` in their order, unlisted sources in a final unlabelled section; no table is dropped for having no views;
  - `useSavedViews.ts`: `create(tableKey, name, skin, shared)` builds from the table's model and needs no existing view;
  - `MoreMenu.tsx`: an icon prop, reused for `+` and `…`;
  - `App.tsx`: the `+ View` panel is replaced by the dialog;
  - `i18n.ts` and `app.css`;
  - the e2e helpers and direct opens (a decided step): the `open`/`pick` helpers in step-0a, 0b, 0c (its own `open`, :19–21), 0d, 0e and step-1, plus the direct `getByText` opens at step-0a.spec.ts:117 and step-0e.spec.ts:170. They take `(view, model = view)`: click the model's `treeitem` by exact name, then the view's button inside that node's group. A view under another model passes its model, e.g. `open(page, 'Optie of bevestigd', 'Activiteiten')` and the matrix `open(page, 'Toewijzingen per activiteit', 'Activiteiten')`. `e2e/step-0e.spec.ts:101` counts tree items and buttons, not text; `e2e/step-0d.spec.ts:324` asserts a button named "Planning" inside `navigation "Views"`.
- Create: `apps/grid/src/ui/NewViewDialog.tsx` and its test.

**Behaviour:**
- Clicking a model's name opens it, unfolds it, and shows its first or last-used view (`openTable` and `Prefs.last` stay). Clicking the chevron that replaces the icon on hover or focus folds or unfolds it without changing the view. On a first visit the active view's model is open. The landing view is unchanged: `tables[0].views[0]` in `byFirstView` order.
- Open state is stored per browser.
- Each open model's views sit in that node's own `role=group` named `View type`. Tests that expect a single such group keep one model open; the e2e helpers scope to the node.
- [ ] Tests:
  - the landing view is the same as before the tree when sections reorder it;
  - a model opened by name is unfolded;
  - a view named like its model opens twice in a row (the treeitem and the view button never collide);
  - a click on a view button inside an expanded node opens that view, not the model's last view;
  - the model `treeitem`'s accessible name is its label alone (no fold state, no icon label);
  - hover and focus show the chevron and the tools;
  - name and chevron behave as above, and the open state persists;
  - the active view is highlighted;
  - the lock and person marks show;
  - a source without views is a node, and `+` on it creates its first view;
  - `+` lists Grid, and Matrix only where a matrix exists, with Kalender and Bord disabled ("later");
  - the dialog:
    - pre-fills the name;
    - shows the "Wie mag ze aanpassen" hint per choice;
    - shows the source, and the scope when one is set;
    - creates a team view (`shared: true`) or a personal one, which opens;
    - Cancel and Escape close it;
  - `…` offers today's actions by editability, and delete keeps its Undo.

  Update the App, Rail and ViewList tests, among them:
  - `App.test.tsx`: the `tableEntry` helper (`:47–50`, used at `:77`, `:150`, `:1346`, `:1400`, `:1402`), `:129`, `:283`, the `entry` at `:657`, and every `types()` that uses `getByRole` on the group (`:48`, `:614`, `:712`, `:995`): scope to the node;
  - `Rail.test.tsx:20` and `:22`;
  - `aria-current` moves from the model entry to the active view's button (`App.test.tsx:77`);
  - today's "General" group goes; its tests (`Rail.test.tsx:34–37`, `App.test.tsx:280–283`) are rewritten for sections, with undeclared sources in the final unlabelled section.
- [ ] Implement. Run the grid tests and the gate. Commit `feat(grid): the sidebar as a tree of models and views, with + and … menus`.

### Task 5: The title line
**Files:**
- Modify `apps/grid/src/ui/Toolbar.tsx` and `App.tsx`. The `h1` becomes the view name. The line holds the view kind's icon, the name, a lock with its tooltip on a read-only view, and the summary "N rijen · M groepen". The export title stays the source label (`App.tsx:252`).
- Tests:
  - `Toolbar.test.tsx`;
  - update every `heading level 1` assertion in `App.test.tsx` (among them `:85`, `:93`, `:116`, `:148`, `:629`, `:633`, `:744`), rewrite the test titled "titles the toolbar … with the table's label" for the view name, and update `e2e/step-0e.spec.ts:87`.

- [ ] Implement. Run the grid tests and the gate. Commit `feat(grid): the title line names the view`.

### Task 6: Group bands
**Files:**
- Modify:
  - `apps/grid/src/grid/group.ts`:
    - `Group.facts`, computed from the table's `facts` over the group's rows;
    - per-group totals from `sums`;
    - a `first` fact formatted from its field type (a datetime in a day group shows its time, `20:00`; otherwise the column's text).
  - `GridBody.tsx`: the band holds a chevron, the label in `.nv-group__label`, a count badge, the facts and the totals. The group foot row goes.
  - `Grid.tsx`:
    - folded groups per view, stored per browser;
    - `ordered` excludes folded rows;
    - a group holding the draft row never folds.
  - `app.css`, scoped under `.nv-grid`. The matrix is out of this task.
  - e2e that read `tr.nv-group` text: read `.nv-group__label`.
- Tests:
  - `group.test.ts`:
    - a group the read limit may have cut short (the rows' `total` exceeds the rows loaded, and the group holds the last loaded row) shows "…" for each fact, not a number;
    - `first` with `where`, including a case giving "20:00", and none matching;
    - `count`;
    - `empty`, skipped when zero.
  - `Grid.test.tsx`:
    - the band's label, badge and facts;
    - clicking or Enter folds, and `aria-expanded` follows;
    - totals and counts are unchanged while folded;
    - keyboard movement skips folded rows;
    - the draft's group stays open;
    - the folded state persists.

    Replace the group-foot test.
- [ ] Implement. Run the grid tests and the gate. Commit `feat(grid): slim, foldable group bands with a count, declared facts and totals`.

### Task 7: The inherited cell
**Files:**
- Modify `apps/grid/src/grid/cells/index.tsx` (`Display`: a column with `inherited` whose row flag is neither `own` nor empty renders muted, with "via <the flag column's option label>"), `apps/grid/src/grid/columns.ts` and `app.css`.
- Tests:
  - the muted cell with its tag;
  - an `own` or empty flag renders plainly;
  - the tag is not part of the value when editing or copying.

- [ ] Implement. Run the grid tests and the gate. Commit `feat(grid): an inherited value reads grey, with where it comes from`.

### Task 8: The gate in the browser
**Files:** create `e2e/grid-ux.spec.ts`.

- [ ] Write the flows of spec R8 on invented fixtures: the theatre seed plus a speeldag applied through the API, for the band facts and the inherited venue.
- [ ] Run `bunx playwright test e2e/grid-ux.spec.ts`, then `rm -rf e2e/.tmp && bun run gate` three times. Commit `test(e2e): the grid UX gate`.

### Task 9 (follow-up, Stefan 2026-10-07): status colours
**Files:**
- Modify:
  - `packages/engine/src/declare.ts`: `ColumnDecl.tones?: Record<string, 'ok' | 'warn' | 'bad'>`, keyed by option key;
  - `validate.ts`: refuses a tone on a column without options, or keyed by an unknown option;
  - `app.ts`: columns pass `tones` through;
  - `apps/grid/src/engine.ts` and `types.ts`: `Field.tones`;
  - `apps/grid/src/grid/cells/tones.ts`: a declared tone wins over the built-in English defaults;
  - `packages/theatre/src/datasets.ts`: `activiteit.status` (optie warn, bevestigd ok, geannuleerd bad) and `toewijzing.state` (uitgenodigd warn, bevestigd ok, geweigerd bad, geannuleerd bad; open neutral).
- Tests:
  - engine validation;
  - `/schema` serves `tones`;
  - `Select.test.tsx`:
    - a declared tone colours the pill;
    - an undeclared option stays neutral;
    - English defaults still apply where nothing is declared.

- [ ] Implement. Run the tests and the gate. Commit `feat: a column may declare a tone per option; theatre's statuses are coloured`.

### Task 10 (Stefan 2026-10-07): the model menu — name, icon, export
**Threat model (an authorization surface):** only an administrator may change a source's display name or icon. The refused actor is an editor or owner (403), and a session-less caller (401). The write goes through the write guard (JSON, same-origin). An owner never learns about sources it cannot read. A display name is plain text: the grid renders it as text, never HTML.

**Files:**
- Modify:
  - `packages/engine/src/engine-tables.ts`: `source_display` (`source` text, unique; `label` text, nullable; `icon` text, nullable);
  - `packages/engine/src/app.ts`: `PUT /sources/:name/display` with `{ label?, icon? }`, administrator only; it validates `icon` against the fixed set and `label` length (1–60); it is revised. `/schema` overlays the label and icon on the readable sources and serves `icon`;
  - `packages/engine/src/declare.ts` (the icon set as a constant);
  - `apps/grid/src/engine.ts`, `types.ts` (`TableDef.icon`), `api.ts` (`setDisplay`), `ui/Rail.tsx` (the model `…`: Naam wijzigen inline, Icoon wijzigen as a small icon grid, Exporteren, In-/Uitklappen; the first two disabled with a reason for non-administrators), `i18n.ts`;
  - the route-matrix test.
- Tests:
  - engine: an administrator's PUT changes `/schema`'s label and icon; an editor and an owner get 403 with nothing changed; session-less gets 401; an unknown icon or an empty or over-long label gets 400; an unknown or unreadable source gets 404; the write is revised;
  - grid:
    - the menu items, by role;
    - a rename and an icon change update the tree;
    - Exporteren calls the existing export for the open view.
- [ ] Implement, RED first for the denials. Run the tests and the gate. Commit `feat: an administrator renames a model or changes its icon; the model menu exports`.
