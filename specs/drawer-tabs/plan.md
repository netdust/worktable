# Drawer tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The drawer opens on its fields and actions; notes, history, attachments and the record's lists move to
icon tabs at the top, at most three icons and the rest under a `…` menu.

**Architecture:** Grid only (`apps/grid`). `Drawer.tsx` sorts what it renders today into panes: the first pane,
"Gegevens", keeps the title, sub line, alerts, `lines`, the fields (with "+N andere velden"), the first link
section with the action row under it (as now), `sections` and `editor`. Every other block becomes its own pane:
one "Notities" pane for all long-text fields, one pane per other link section and per inbound section, one
"Geschiedenis" pane, one "Bijlagen" pane. A new `DrawerTabs` renders the tab bar between the drawer head and the
body: the first three panes as icon buttons with the label as tooltip (RAC `Tooltip`) and as accessible name, the
rest in a `…` menu. The bar is a single-select `ToggleButtonGroup` plus a `MenuTrigger`, not RAC `Tabs`: RAC 1.22's
`Tabs` keeps a selected key that is not in its list, which leaves no tab focusable and points the panel's label at
a missing id (plan review S2). The panes are derived from the schema's generic shapes (column kind `longtext`, links, inbound relations,
history, attachments), never from a dataset name, so every domain's drawer gets the same tabs.

**First working version:** Task 1, a Sites drawer in the studio with the tab bar and its panes, light and dark.

**Tech Stack:** React 19, react-aria-components 1.22 (`Tabs`, `TabList`, `Tab`, `TabPanel`, `MenuTrigger`), Vitest +
Testing Library (jsdom), Playwright e2e.

**Spec:** none written; Stefan's words in the session of 2026-10-26 are the requirements:
- R1 "for the drawer, can we add tab icon menu at the top? we could add notes and history to them to have a bit
  less noice". Source: Stefan, 2026-10-26.
- R2 "the tab menu can hold up to 3 icons than the ... more". Source: Stefan, 2026-10-26.
- R3 "default the drawer must show the fields and the actions, everything else can move if wanted". Source:
  Stefan, 2026-10-26.
- R4 the drawer opens on the first tab every time; the first tab counts as one of the three icons. Source:
  invented — approved 2026-10-26 ("yes, good, continue").
- R5 every drawer (every domain) gets the same tabs, from generic shapes. Source: Stefan, 2026-10-26 ("engine + UI
  is shared over domains").

## Global Constraints

- `apps/grid` holds no domain word: panes come from column kinds, links, inbound relations, history and
  attachments, never from a model key or label. The theatre and fiche domains get the tabs too.
- Strings are Dutch in `apps/grid/src/i18n.ts`, overridable per site through the schema's `strings` as every grid
  string is: `tabFields: 'Gegevens'`, `tabNotes: 'Notities'`, `tabMore: 'Meer tabbladen'`, and the bar's own name
  `tabBar: 'Onderdelen'`. Geschiedenis and Bijlagen reuse the existing `history` and `attachments` strings. `Meer`
  stays the action row's (`moreInRow`); the tab overflow never shares its name.
- Icons from lucide-react: Gegevens `List`, Notities `NotebookPen`, Geschiedenis `History`, Bijlagen `Paperclip`;
  a link or inbound pane uses its target table's declared icon (`iconNamed(table.icon)`), else `Table2`.
- Pane order: Gegevens, Notities, then link panes in column order, inbound panes in schema order, Geschiedenis,
  Bijlagen. A pane with nothing to show is left out: no Notities pane unless some long-text column is writable in
  this drawer or has text (`LongSection` renders nothing for a read-only empty one), no Bijlagen pane without
  `attachments`, no Geschiedenis pane for a query model or a new row (`row.id <= 0`). Pane keys: `fields`, `notes`,
  `link:<column id>`, `inbound:<model>:<field>`, `history`, `files`.
- Every link section other than the first moves to its own pane. The flag band's choose-other first shows that
  link's pane, then chooses in it.
- A drawer with only the Gegevens pane shows no tab bar at all.
- Opening another record returns to Gegevens: the reset key is `${model?.key}:${row.id}`, since the dashboard keeps
  one `<Drawer>` across models. A re-read of the same record keeps the open tab. When the open pane's key is not
  among the record's panes, Gegevens shows.
- Switching tabs never loses a note being typed: a `Note` draft is saved before its pane unmounts.
- Keyboard: the tab bar is a react-aria `TabList` (arrow keys move, Enter/Space select); the `…` menu is a
  react-aria `Menu`, and picking an entry shows that pane, with the `…` button marked as holding the current tab.
  The drawer's existing head keys (`onHeadKey`: up/down between records) keep working.
- Light and dark: tokens only, no new colours; the tab bar takes the drawer head's surface and a 1px line under it.
- Every e2e and gate run under the machine lock: `flock /home/ntdst/.cache/worktable-e2e.lock ...`.
- The gate is `bun run gate`.

## Review Focus

1. A flow that relies on a section being visible breaks once it moves to a tab: the opdracht drawer's Sites list
   with Bevestigen, the related drawer, the dock's open line, the flag band's "Andere kiezen" (row 2, e2e).
2. A domain that is not the studio: a theatre activity drawer gets the same panes from its own shapes (row 1).
3. A count or live re-read inside a hidden pane (history after a press, an inbound list after a run) still shows
   fresh data when its tab opens (row 1).
4. Narrow drawer at 1280×720 with a drawer open: the tab bar fits, never wraps or scrolls (row 2).
5. Keyboard and screen reader: each icon has its accessible name; the `…` menu announces the hidden panes; with a
   pane chosen from `…`, Tab from the head still reaches the bar (row 1).

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Panes and tab bar | `<Drawer>` render; `panesOf(...)` in `grid/drawer/panes.ts` | unit · `apps/grid/src/grid/drawer/panes.test.ts`, `apps/grid/src/grid/Drawer.test.tsx` · `cd apps/grid && bunx vitest run src/grid/drawer/panes.test.ts src/grid/Drawer.test.tsx` | — |
| Flows that cross the drawer | the studio and theatre e2e | e2e · `e2e/studio.spec.ts`, `e2e/*.spec.ts` that touch a drawer section · `flock /home/ntdst/.cache/worktable-e2e.lock bunx playwright test` | drawer-opens-on-fields, notes-in-their-tab, more-menu-holds-the-rest, drawer-tabs-at-1280, and the existing drawer flows, updated to open the tab first |
| Domain-free grid | `scripts/check-vocabulary.ts` over `apps/grid/src` | check · `bun run check` | — |

## Simplest design

The simplest design keeps the drawer as it is and folds each section under a disclosure. That cuts the noise but
keeps a long scroll and does not give the icon menu Stefan asked for. Tabs over panes derived from the shapes the
drawer already reads are the next simplest: no engine change, no schema field, one new component and one pure
function. The plan uses that. Making the pane choice declarable per dataset (R3's "if wanted") is left out until a
domain needs a different split.

---

### Task 1: Panes and the tab bar (first working version)

**Files:**
- Create: `apps/grid/src/grid/drawer/panes.ts`, `apps/grid/src/grid/drawer/Tabs.tsx`
- Modify: `apps/grid/src/grid/Drawer.tsx:179-237` (sort the body into panes), `apps/grid/src/i18n.ts` (the
  strings), `apps/grid/src/ui/app.css` (tab bar, beside `.nv-dw-head`).
- Test: `apps/grid/src/grid/drawer/panes.test.ts`, `apps/grid/src/grid/Drawer.test.tsx`, and the existing tests
  that read a moved section, which open the tab first (never weakened or deleted): `Grid.test.tsx:1017` (Notities),
  `:1036, 1063, 1068, 1349` (Bijlagen), `matrix/Panel.test.tsx:113` (Geschiedenis), `Drawer.test.tsx:75, 198-220,
  598-719`.

**Interfaces:**
- Produces: `type PaneKind = 'fields' | 'notes' | 'link' | 'inbound' | 'history' | 'files'`;
  `interface Pane { key: string; kind: PaneKind; label: string; icon: LucideIcon }`;
  `panesOf(input: { longs: Column[]; links: { key: string; column: Column; link: Link }[]; inbound: Inbound[];
  history: boolean; files: boolean; schema: Schema | null }): Pane[]` — the first link stays in `fields` and gets no
  pane of its own.
- `DrawerTabs({ panes, current, onChange })`: three icon tabs, the rest in a `…` menu.

- [ ] **Step 1: failing tests**
  - `panesOf`: a site-like model with two long-text columns, two inbound relations and history gives
    `['fields', 'notes', 'inbound:onderhoud:site_id', 'inbound:taak:site_id', 'history']` in that order (keys from shapes, labels
    from the schema); the first link of an opdracht-like model is not a pane; no long texts → no notes pane; a
    query model → no history pane; a new row → no history pane.
  - `<Drawer>`: opens on Gegevens with fields and the action row visible and no long-text section, no history;
    the bar shows three buttons with accessible names Gegevens, Notities and the first inbound label, and a
    `Meer tabbladen` button whose menu lists the rest; choosing Geschiedenis from it shows the history and marks
    the `…` button pressed; with that pane shown, Tab from the head reaches the bar; rendering another `row.id`
    returns to Gegevens; the same id under another model returns to Gegevens; re-rendering the same row keeps
    Geschiedenis; re-rendering with changed fields and then opening Geschiedenis reads the history again; a
    drawer with only fields shows no bar; a read-only drawer whose long texts are all empty has no Notities pane;
    a note being typed is saved when another tab is chosen; choose-other on a flagged second link shows that
    link's pane and starts the choice.
  - A theatre activity model (from the existing test data) gets the same pane kinds from its own shapes.
- [ ] **Step 2: run them, see them fail** (`panesOf` missing; no tablist).
- [ ] **Step 3: implement** `panesOf`, `DrawerTabs`, and the pane switch in `Drawer` (state `pane`, reset on
  `row.id` change). Hidden panes are not mounted, so their sections read fresh data when they open.
- [ ] **Step 4: run the unit tests and the whole grid suite green.** `cd apps/grid && bunx vitest run`
- [ ] **Step 5: screenshots** of a studio site drawer, light and dark, the Gegevens tab and the Notities tab, saved
  under `specs/drawer-tabs/shots/`. STOP: send them to the reviewer for Stefan.
- [ ] **Step 6: commit** `feat(grid): drawer tabs — fields and actions first, the rest behind icons`.

### Task 1b: The grid stays domain-free, checked

**Files:** modify `scripts/check-vocabulary.ts` (and `package.json:14`'s `check`) so it also scans `apps/grid/src`;
`apps/grid/src/i18n.ts:90` `loginOtherSite` becomes generic: 'De link hoort niet bij dit adres'.

- [ ] **Step 1:** run the check over `apps/grid/src` and list every hit. A domain word in a string or code is made
  generic; a generic word the list flags (for example "site" meaning the deployment) goes on the check's allow list
  with a one-line reason.
- [ ] **Step 2:** a planted studio word in a scratch file under `apps/grid/src` fails `bun run check` (RED), then
  removed. Commit `build(check): the grid is held to the engine's vocabulary`.

### Task 2: The flows that cross the drawer

**Files:** modify the e2e specs whose steps read a section that moved (find them with
`grep -rn "Geschiedenis\|Notities\|Onderhoudslog\|Taken\|Bijlagen" e2e`), and `e2e/` helpers that open a drawer.

- [ ] **Step 1:** run the full e2e suite under the lock and list every failure caused by a moved section.
- [ ] **Step 2:** each failing step opens the right tab first through one helper `openTab(page, label)` in the e2e
  helpers; no test is weakened or deleted.
- [ ] **Step 3:** add e2e flows `drawer-opens-on-fields`, `notes-in-their-tab` and `more-menu-holds-the-rest`
  (studio site drawer), plus `drawer-tabs-at-1280` (the tab bar fits at 1280×720 with a drawer open, light and
  dark).
- [ ] **Step 4:** `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate` green. Commit
  `test(e2e): drawer flows open their tab first`.

## Close

Gate → `/feature-review drawer-tabs` (code reviewer) → one fix pass → `/shakeout` (the four flows, light and dark,
one screenshot per surface for Stefan) → push → merge into main and `bin/update` for the live studio.
