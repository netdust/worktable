# Plan: worktable UI (phase 2b, v1)

Loop budget: ~16

## Approach

A small SPA under `ui/`, built with Vite + React + TypeScript. The
dependency list is deliberately short: `react`, `react-dom`, `vite`,
`@vitejs/plugin-react`, `typescript`, and `@playwright/test` (dev, for
the e2e suite — the browser itself is pre-installed in this
environment). No router, no TanStack Query, no Tailwind — those are
the folio-era weight this rebuild exists to shed.

Structure:
- `ui/src/api.ts` — the whole server contract in one thin module:
  typed fetch wrappers for the six reads + POST /seal, token from
  localStorage, 401 → a callback. ~1 fetch helper, no library.
- `ui/src/live.ts` — the SSE subscription via `fetch` + a streaming
  reader (native EventSource can't send the auth header); emits
  debounced change ticks.
- `ui/src/url.ts` — URL query-param state (view, record) over the
  History API; one hydration owner.
- `ui/src/lib/` — framework-free helpers carried from the harvest:
  field-type inference, status-chip color, group/sort of a record
  list. Plain functions, unit-tested.
- `ui/src/components/` — Shell (nav rail + token gate), TableView
  (with grouping mode), RecordPanel (tabs + seal actions), StatusChip.
- `ui/src/main.tsx` — mounts it; plain CSS in `ui/src/styles.css`.

The server stays untouched; the UI is a pure client of docs/SERVER.md.

## Threat model (floor-class: the seal is authority; auth crosses the wire)

The bearer token lives in localStorage and is sent on every request;
it is never logged or put in a URL. The seal is the only write —
Approve/Reject map to the exact `{record, node, decision}` contract,
and the UI never infers a decision (it surfaces the buttons; the human
clicks). A 401 always returns to token entry rather than showing stale
data. Artifact/body content from the server is rendered as text/markdown
and never as raw HTML (no dangerouslySetInnerHTML on server content) —
records may contain hostile strings.

## Tasks

- T01 scaffold: ui/ Vite+React+TS project, minimal deps, `npm run
  build` produces a static bundle; api.ts typed against SERVER.md.
  Check: `--only=build` (the suite's build+typecheck gate)
- T02 shell + auth: nav rail from /views, token gate (entry, store,
  401 handling) (R01, A01). Check: `--only=shell`
- T03 table + grouped table: one renderer, columns/sort/group from
  the definition, status chips (R02, R03, A02). Check: `--only=table`
- T04 record panel: slideover, cover + artifact tabs lazy-loaded,
  flow-ordered tabs (R04, A03). Check: `--only=panel`
- T05 seal actions: Approve/Reject → POST /seal, reason on failure
  (R05, A04). Check: `--only=seal`
- T06 live + url: SSE fetch-stream refresh + URL state hydration
  (R06, R07, A05, A06). Check: `--only=live`
- T07 lib unit tests: the framework-free helpers (group/sort, chip
  color, field infer) (R08). Check: `--only=unit`
- T08 independent security review (attested via review-check).
  Check: `python3 bin/review-check.py specs/frontend security`
- T09 independent correctness/UX review vs spec (attested).
  Check: `python3 bin/review-check.py specs/frontend correctness`
- T10 SUITE: full Playwright e2e green against the real server + built
  UI. Check: the suite command.

## Acceptance matrix

| Acceptance | Verified by |
|---|---|
| A01 | T02 |
| A02 | T03 |
| A03 | T04 |
| A04 | T05 |
| A05, A06 | T06 |
