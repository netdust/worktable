# Folio View-Layer Knowledge Harvest

*Study performed 2026-07-21 against netdust/folio @ 6c31753 (apps/web).
Founding research for the new file-native system: what the view layer
knows, what carries forward, what stays behind.*

## 0. Stack, size, maturity

- React 18 + Vite + TanStack Router (typed search params, zod) +
  TanStack Query 5. Tailwind + shadcn-style components (Radix, cva,
  cmdk, sonner, lucide). dnd-kit. Milkdown (WYSIWYG MD) + CodeMirror 6
  (raw toggle). No global state lib; tiny event buses.
- apps/web/src = 403 files; ~27.8k LOC non-test + ~27.7k LOC tests
  (near 1:1). packages/shared: filter compiler, group-summary,
  field inference, board rank, document schema. Playwright e2e.
- Shipped views are genuinely polished: optimistic UI, skeletons,
  empty states, dated bug archaeology in comments, numbered-invariant
  discipline (ARCHITECTURE-INVARIANTS.md).

## 1. View inventory

Convergence point: `components/views/view-router.tsx` — one exhaustive
ViewType→renderer map (a second switch anywhere is declared a bug).

| View | Status | Key files |
|---|---|---|
| table | Shipped, most mature | components/table/table-view.tsx (703) + table-row/cell/header/columns/column-picker/menu/type-change/add-column/add-row |
| list (grouped table) | Shipped | same TableView with grouping; group-header-row, group-aggregate-header, distribution-bar, grouped-list-config, list-controls, aggregate-builder |
| kanban | Shipped, heavy polish | views/kanban-view.tsx (518) + kanban/ (board-grouping, board-drag, board-reorder, closest-edge, card/column, controls/toolbar) |
| calendar (month grid, drag-reschedule) | Shipped | views/calendar-view.tsx (355) + calendar-grid.ts (pure) |
| timeline (lanes, day/week/month zoom, drag bars) | Shipped | views/timeline-view.tsx (426) + timeline-lanes.ts (pure) |
| gallery | Stub ("coming soon") | view-router UnsupportedView |
| wiki tree (dnd reparent, excerpt cards) | Shipped; route, not saved-view type | views/wiki-tree.tsx, wiki-card.tsx, lib/wiki-tree.ts |
| detail slideover (no modals) | Shipped, elaborate | slideover/document-slideover.tsx + frontmatter-form, body-editor, raw-md-editor, mode-toggle, external-update-banner, comments/activity |

Each shipped view has a matching skeleton. View creation: views/new-view-sheet.tsx.

## 2. The data contract

Record shape (lib/api/documents.ts):

    DocumentSummary { id, slug, type, title, status: string|null,
      boardPosition: string|null, parentId,
      frontmatter: Record<string,unknown>,
      createdAt, updatedAt, lastTouchedAt, body?: string }

- Tiny fixed core (server-promoted mirror columns) + OPEN frontmatter
  bag — exactly YAML frontmatter of an .md file. Lists are body-less
  by default (only wiki opts in via include:'body').
- type enum: work_item | page | agent | trigger | agent_run — agents
  and triggers are documents.
- Fetch: REST, {data, nextCursor} keyset pagination; table uses
  infinite query, kanban/calendar/timeline take one limit:200 page.
- Filters: three parallel channels for one model — dedicated params,
  ?filter=<JSON> Mongo-lite (closed ops $eq $ne $in $nin $gt $gte $lt
  $lte $exists $contains; DoS caps; AST {kind:'and', clauses}), and
  f_<key>=op:typeTag:value URL encoding (type-preserving reloads).
- Live updates: SSE as INVALIDATION-ONLY signal (owns no state); one
  muxed EventSource per workspace (kind-union + demux; dodges 6/origin
  cap); 250ms trailing debounce collapses agent write-bursts.
  Slideover shows "updated externally" banner instead of clobbering.
- ~90% generic "records with typed fields." Folio-specific: the
  wslug/pslug/tslug scoping triple, status as first-class entity with
  colors, boardPosition fractional-rank strings, [[slug]] relations,
  {data} envelope/cookie client (63 LOC, trivially replaceable).

## 3. View configuration

- Views are USER-SAVED records, per table: { id, name, type, filters,
  sort, groupBy, visibleFields, columnOrder, settings, isDefault,
  order } — created in UI, listed in nav rail, default seeded.
- Active view: ?view=<id> → isDefault → first (use-active-view.ts).
- URL is the live filter state (zod validateSearch); saved view
  hydrates the URL on switch via ONE hydration owner (ViewControls +
  use-view-filter-hydration) — single owner prevents races. Changes
  autosave back to the view (invariant 16: settings changes write the
  VIEW, never a document).
- Per-type settings in untyped settings JSON, narrowed on read:
  list → {groupBy, aggregates, rowLayout}; kanban → groupBy/sort;
  calendar → dateField; timeline → zoom/startField/endField.
- Fields: {key,type,label,options,required,order}, 14 types. Columns =
  3 builtins + pinned Fields + SYNTHESIZED columns for frontmatter
  keys present in data (field-infer.ts heuristics: date/datetime/
  email→user_ref/image/url/[[ref]]/text) with "pin this field" flow.
- Aggregates: closed set count | pct_matching | avg | sum |
  distribution; computed server-side against the SAME filter as rows —
  group headers correct across unloaded pages.

## 4. Coupling assessment

- Entanglement real but shallow and layered. Views self-fetch via
  react-query hooks + read URL params — not liftable as-is. BUT all
  network flows through lib/api/*, all URL through router hooks.
- THE SEAM: useDocuments/useInfiniteDocuments ({data, nextCursor}) +
  useFields/useStatuses/useActiveView. Replace those five hooks and
  every renderer works. DocumentSummary is already "parsed
  frontmatter + title + body".
- GENUINELY PORTABLE (pure, framework-free, unit-tested): kanban/
  board-grouping.ts, board-drag.ts, closest-edge.ts, shared/
  board-rank.ts, views/calendar-grid.ts, views/timeline-lanes.ts,
  lib/wiki-tree.ts, table/columns.ts, shared/filter-compile.ts,
  shared/field-infer.ts, filter parse/serialize.
- Heaviest coupling is WRITE-path: optimistic mutation machinery
  mirroring server merge semantics (null-deletes-key, U+FFFF board
  sentinel, dual cache-shape patching). File-backed system: re-read
  the file instead.

## 5. Harvest list

CARRY FORWARD:
1. One exhaustive ViewType→renderer map (compile-checked convergence
   point); view type lives on the saved view, never in the route.
2. The record shape: tiny fixed core + open frontmatter bag +
   optional body; body-less lists. Maps 1:1 to markdown files.
3. Views are user data, not code — and (ADR-001) each view stored as
   a file itself.
4. URL-as-live-filter-state with ONE hydration owner; saved view
   hydrates URL, URL drives queries, edits autosave to the view.
5. Mongo-lite filter AST, closed operator set, typed URL value
   encoding. Small, safe, sufficient.
6. Pinned fields + inferred columns + suggest-from-data pin flow —
   schema emerges from data. field-infer heuristics reusable.
7. File-watch/SSE as invalidation-only signal; one muxed connection;
   trailing debounce. State never lives in the socket.
8. Group aggregates computed against the full filtered set (page-2
   correct counts); closed aggregation vocabulary.
9. list = grouped table (grouping is a mode, not a component);
   ?doc= slideover (detail as URL state, no modals); raw-MD toggle
   and copy-as-MD everywhere.
10. Pure layout modules separated from the framework — cheap tests,
    portable.

DO NOT CARRY (DB/API servitude):
1. Optimistic-mutation mirror machinery (documented regressions).
2. React-query key taxonomy + invalidation choreography (three
   silent-drop regressions documented).
3. The 3-level wslug/pslug/tslug scoping threaded everywhere (real
   semantic holes; see SCOPE CAVEAT table-view.tsx:139).
4. Three parallel filter representations — pick one canonical model.
5. View-autosave consent gating and its admitted inconsistencies;
   views-in-a-DB-table plumbing generally.
