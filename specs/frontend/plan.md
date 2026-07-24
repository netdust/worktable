# Plan: worktable UI (phase 2b, v2 — folio-fidelity, HYBRID)

Loop budget: ~26

## Approach

Extend the v1 `ui/` app (keep its api.ts, live.ts, url.ts, auth,
seal — all reviewed clean) to a folio-class view layer by the HYBRID
strategy the folio view review recommended:

- **Port verbatim** (into `ui/src/lib/ported/`, folio attribution
  header, kept framework-free): the view math — calendar-grid,
  timeline-lanes, board-grouping/board-drag/closest-edge, columns,
  field-infer, group-summary types, date-utils. These are elegant,
  test-backed, dependency-free; carry their tests too.
- **Port the clean leaf components** (into `ui/src/components/folio/`,
  restyled to worktable tokens): status pill, badge, group-header-row,
  group-aggregate-header, distribution-bar, list-row, the 4
  skeletons, empty-state, slideover-shell, and the view-router map.
- **Rewire** the calendar + timeline renderers: keep folio's JSX +
  the pure delegates, replace folio's ~4 data hooks with worktable's
  `resolveView`/`getRecord` + an onOpen callback.
- **Rebuild lean**: the kanban shell (board math ported, a clean
  @dnd-kit/core shell — no folio quirk-mass), the table renderer
  (grouped/plain over ported `columns` + list-row, no inline-edit/
  infinite-scroll), and the record detail panel (v1's cover+tabs+seal
  inside the ported slideover-shell chrome, folio-styled).

Tests: Playwright e2e per view against the real server + built UI, the
ported pure modules keep their unit tests, and the review cluster
(I5). The suite command stays `npm run test:ci` (build + e2e).

## Threat model (unchanged from v1 + one addition)

The seal is the only write; the token is the only principal; server
content renders as text, never HTML. NEW: drag interactions must never
silently write a flow-owned field. Kanban/calendar drag on `status`
(or any awaiting-seal field) opens the record's seal actions; there is
no field-write endpoint in v2, so no view interaction bypasses the
seal. This is enforced in the drag handlers and asserted (A03, A04).

## Tasks

- T01 port pure logic: ui/src/lib/ported/* (calendar-grid,
  timeline-lanes, board-*, columns, field-infer, date-utils,
  group-summary types) + their carried unit tests; attribution
  headers. Check: `--only=ported`
- T02 port leaf components: folio/ (pill, badge, group headers,
  distribution-bar, list-row, skeletons, empty-state, slideover-shell,
  view-router) restyled to worktable tokens. Check: `--only=leaves`
- T03 table + grouped (rebuilt lean over ported columns + list-row +
  group headers/aggregates) (R02, A02). Check: `--only=table`
- T04 kanban (rebuilt shell, ported board math, @dnd-kit/core,
  regroup-only, seal-gated flow-field drag) (R03, A03). Check:
  `--only=kanban`
- T05 calendar (ported grid + rewired renderer, read-only flow field)
  (R04, A04). Check: `--only=calendar`
- T06 timeline (ported lanes + rewired renderer, zoom) (R05, A05).
  Check: `--only=timeline`
- T07 record panel (rebuilt in slideover-shell, cover+tabs+seal+badge,
  Escape, no editor/relations) (R06, A06). Check: `--only=panel`
- T08 integration: view-router wires all five; live/URL/auth hold;
  deps audit (only react/react-dom/@dnd-kit/core) (R01, R07, R09, A01,
  A07, A08). Check: `--only=integration`
- T09 independent security review (attested via review-check).
  Check: `python3 bin/review-check.py specs/frontend security`
- T10 independent correctness/UX review vs folio fidelity + spec
  (attested via review-check). Check: `python3 bin/review-check.py
  specs/frontend correctness`
- T11 SUITE: full Playwright e2e green (build + all-view suite).
  Check: the suite command.

## Acceptance matrix

| Acceptance | Verified by |
|---|---|
| A01 | T08 |
| A02 | T03 |
| A03 | T04 |
| A04 | T05 |
| A05 | T06 |
| A06 | T07 |
| A07, A08 | T08 |
