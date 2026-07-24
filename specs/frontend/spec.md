# Spec: worktable UI (phase 2b, v2 — folio-fidelity, all views)

Supersedes the v1 spec after the shake-out rejection: v1 shipped one
thin table and a UX far from folio. v2 targets a real folio-class UI —
all five views and folio's actual feel — by a HYBRID strategy grounded
in a review of folio's view layer (docs/folio-view-review carried into
this run): port folio's pure view *math* and clean leaf components,
rewire the calendar/timeline renderers, rebuild the folio-shaped
mini-apps (kanban shell, table, detail panel) lean.

It speaks ONLY to the phase-2a server API (docs/SERVER.md) and keeps
worktable's own data layer, auth, and seal from v1.

## Problem

The human layer must look and work like folio — table, grouped table,
kanban, calendar, timeline, and a record detail panel with folio's
polish — over worktable's records, with the owner's seal as the one
write. v1 under-scoped both the view set and the fidelity. Rebuilding
all of folio is wrong (46% of its view tree is agents/wiki/comments/
settings/editors, none of it view rendering); re-deriving folio's
proven view math is also wrong. The right path carries the elegant,
dependency-free logic and rebuilds only the folio-shaped shells.

## Requirements

- R01 All five views render via a single exhaustive ViewType→renderer
  map (carried from folio's view-router): `table`, `list` (grouped
  table), `kanban`, `calendar`, `timeline`. The view definition
  (frontmatter of a `views/*.md`) selects type, source, group_by,
  sort, columns, and per-type settings (date field, lane fields).
- R02 Table + grouped table: columns from the definition (over the
  ported `columns` machinery), sort + group per definition, group
  headers with counts and the ported aggregate/distribution-bar
  components, status as the ported pill. Grouping is a mode of one
  renderer.
- R03 Kanban: columns by the group_by field, cards draggable BETWEEN
  columns to change that field's value (a seal-gated status change is
  still a flow decision, so kanban drag that would move `status`
  routes through the seal, never a silent write — see R08). Uses the
  ported board-grouping math and `@dnd-kit/core`; a lean shell, not
  folio's 518-line quirk-mass. Within-column manual ordering is out of
  v2 (no board-rank/sortable dep).
- R04 Calendar: month grid over the ported `calendar-grid` math, a
  configurable date field, drag-to-reschedule where the dragged field
  is not flow-owned; a flow-owned field (status) is read-only in the
  view.
- R05 Timeline: lanes over the ported `timeline-lanes` math, a start/
  end field pair from the view settings, day/week/month zoom.
- R06 Record panel (rebuilt, folio-fidelity shell): the ported
  slideover-shell chrome; folder-as-one — header from frontmatter,
  cover + flow-ordered artifact tabs, the reviews badge, the seal
  actions. NO milkdown/relations/wikilinks/comments (folio's detail
  bloat stays excluded).
- R07 Fidelity + polish carried from v1 and folio's leaves: the token
  gate, nav rail, live SSE refresh, URL-as-state (view + record +
  active view), skeleton loading states per view, empty states,
  keyboard (Escape closes the panel), light/dark.
- R08 The seal stays the ONLY write. Any view interaction that would
  change a flow-owned field (`status`, decision records) does not
  write it directly — it opens the record to its seal actions. Other
  frontmatter fields a view can reschedule/regroup (a non-flow date,
  a free tag) MAY write via a second guarded endpoint IF the server
  offers one; absent that, such drags are visual-only-until-sealed and
  the UI says so. v2 assumes no field-write endpoint yet, so kanban/
  calendar drag on flow-owned fields routes to the seal, and on
  non-flow fields is disabled with a note (documented honestly, not
  faked).
- R09 Lean deps: Vite + React + TS + plain CSS + `@dnd-kit/core` only.
  No milkdown, codemirror, cmdk, router, or data-fetching library.
  Ported pure modules carry their own (zero) deps. Attribution to
  folio preserved in carried files (same owner; a header note).

## Acceptance

- A01 The nav lists views; a `type: table` and a `type: kanban` and a
  `type: calendar` and a `type: timeline` view each render their
  distinct renderer from the one map (R01).
- A02 Table/grouped: gezondleven-be (or fixtures) render with ported
  status pills, correct column + sort + group ORDER, group counts,
  and an aggregate/distribution header where configured (R02).
- A03 Kanban: records appear as cards in the column of their group_by
  value; dragging a card to another column whose field is flow-owned
  opens the seal instead of writing (R03, R08).
- A04 Calendar: records with the configured date field land on the
  right day; a flow-owned date is read-only (R04).
- A05 Timeline: records with start/end render as bars in the right
  lane at the right span; zoom switches day/week/month (R05).
- A06 Record panel: folder-as-one (cover + artifact tabs, flow-
  ordered), reviews badge, seal actions when awaiting_seal; Escape
  closes; no editor/relations/comments present (R06).
- A07 Live + URL + auth from v1 still hold: SSE refresh, deep-link
  restores view+record, 401 → gate (R07).
- A08 Deps audit: package.json's runtime deps are exactly react,
  react-dom, @dnd-kit/core — nothing from the excluded bucket (R09).

## Increment 2 — folio IA (after shakeout feedback)

Comparing worktable against a live, seeded folio instance surfaced two
missing folio patterns, both buildable as PURE FRONTEND (no new writes):

- R10 **Rail project→view tree.** The sidebar groups views by their
  `source` folder (the "project"), nested and collapsible with view-type
  icons and an active-view highlight — folio's rail shape, derived
  entirely from `GET /views`. (folio's rail lists a project's views, not
  its individual records; worktable matches that.)
- R11 **Shared filter/group/sort control bar.** A folio-style FilterBar
  above every view: filter clauses (field · op · value, ops
  is/isnot/has/before/after), a `+ Filter` field picker, and Group / Sort
  dropdowns. Controls are EPHEMERAL — held in the URL, applied client-
  side to the already-loaded records; no file is written (the seal stays
  the only write). Switching views resets them.
- A09 The rail shows each source as a project with its views nested;
  collapsing a project hides its views; the project holding the active
  view stays open (R10).
- A10 On a view, adding a `status is <v>` filter narrows the rows (and
  persists in the URL); the Group control regroups live; the Sort
  control reorders live; switching views clears the controls (R11).

Deferred (need writes; parked in docs/DEFERRED-UI.md): saving filters
into view files, create-from-UI (projects/views/records), per-project
field/status registries, inline field edit.

## Non-goals (v2)

Within-column manual kanban ordering (board-rank). A general field-
write API (only the seal writes; other field edits wait for a sealed
server change). folio's editor/relations/wikilinks/comments/agents/
settings — permanently out of the view layer.
