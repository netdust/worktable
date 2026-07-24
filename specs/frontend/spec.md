# Spec: worktable UI (phase 2b, v1 — the human layer)

The browser layer for people not in a terminal: render worktable's
records as views, open a record as one panel, and let the owner seal.
Lean by contract — this is not a heavy application. It speaks ONLY to
the phase-2a server API (docs/SERVER.md); it never touches the folder.

## Problem

worktable's records, views, and flow state are files served by a JSON
API. A human away from the terminal needs to see them and to perform
exactly one write — the seal. Existing options force a choice between
local-only (Obsidian) and a heavyweight app (folio's DB stack). We
want the lean middle: a small SPA over the server, carrying folio's
view DESIGN (docs/folio-view-harvest.md) and none of its DB-era
machinery.

## Requirements

- R01 App shell: a nav rail listing the server's view documents
  (`GET /views`); selecting one renders it. The owner's bearer token
  is entered once and kept in the browser (localStorage); every
  request carries it; a 401 sends the user back to token entry.
- R02 Table view: render a resolved view (`GET /views/<name>`) as a
  table — one row per record, columns from the view definition
  (record title/link, status, plus declared columns), sorted and
  grouped as the definition says. Status shows as a colored chip.
- R03 Grouped table (`list`): the same table, sectioned by the
  view's `group_by`, each group a header with its record count. One
  renderer, grouping as a mode (the harvested rule).
- R04 Record panel: clicking a row opens a slideover showing the
  record as ONE thing (`GET /records/<domain>/<slug>`): header from
  the frontmatter core, a Cover tab (item.md body), and one read-only
  tab per artifact, lazy-loaded (`…/artifacts/<file>`). Tab order
  follows the record's flow definition (`GET /flows/<name>` node
  `out:` sequence) when resolvable, else artifact name order.
- R05 The seal: when a record is at a human node (its status implies
  a pending decision), the panel shows Approve and Reject actions
  that POST to `/seal` with `{record, node, decision, note?}`. This
  is the ONLY write the UI performs. Success reflects via the live
  refresh (R06); failure shows the server's reason.
- R06 Live updates: subscribe to `/events` (via fetch-stream, since
  native EventSource cannot send the auth header) and refetch the
  active view/record on a change tick, debounced. No client state
  owns record data — the server is the source, the UI re-reads.
- R07 URL as state: the active view and open record live in the URL
  (query params), so a view/record is shareable and reload-stable;
  one place hydrates the URL, the URL drives the queries.
- R08 Lean build: Vite + React + TypeScript, plain CSS, a hand-rolled
  data layer (fetch + SSE) and URL-state — no meta-framework, no
  data-fetching library, no CSS framework. The framework-free layout
  helpers may be lifted from the harvest. Dependency list stays short
  and is justified in the plan.

## Acceptance

- A01 With a valid token, the shell lists the dossiers view and
  renders it; a wrong token shows token entry, not a broken view (R01).
- A02 The dossiers view renders gezondleven-be with its status chip,
  under the `final` group; column order and sort match the definition
  (R02, R03).
- A03 Opening gezondleven-be shows the Cover plus a tab per artifact
  (dossier.md, research.md); each tab lazy-loads its content; tab
  order matches the dossier flow's node sequence (R04).
- A04 A record at a human node shows Approve/Reject; approving POSTs a
  well-formed seal and the panel reflects the new status after the
  change tick; a server rejection surfaces its reason (R05, R06).
- A05 Editing a record file on disk produces a view refresh in the
  open browser within the debounce window (R06).
- A06 Deep-linking a URL with a selected view + open record restores
  that state on load (R07).

## Non-goals (v1 — deferred to a later run, not dropped)

Kanban, calendar, timeline views (the harvest's other three — carried
when built, with their pure layout modules). Editing record bodies in
the browser (a second guarded write, later). Multi-user anything. The
UI stays read + seal.
