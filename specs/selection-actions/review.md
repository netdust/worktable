# Feature review: selection-actions

Reviewed: origin/feature/selection-actions at 31be86457c42b59440c66541300bf56557b7376e, base 7a1679d (origin/main, studio-mcp merged).
Plan: specs/selection-actions/plan.md (Threat model, Test map, Review Focus). Spec: specs/selection-actions/spec.md R1–R7.
Level: full. Reviewers:
- the superpowers code reviewer (general-purpose, opus)
- security-sentinel (opus)

There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor. The project is not WordPress.

Both reviewers ran targeted tests and probes in copies outside the executor's tree:
- engine selection-actions 18/18; engine actions + openapi + mcp 114/114; grid 98/98 + 184/184 + App 8/8;
- 9 extra security probes, all passing;
- mutations of each guard, each turning a test red.

Neither changed any tree.

## Blocking

None.

## Should fix

S1. The bar pushes every row down under the pointer. Raised by the code reviewer.
- Where: `apps/grid/src/grid/Grid.tsx:348-351`, `.nv-selection` in `apps/grid/src/ui/app.css`.
- The bar (~44px) mounts in the normal flow on the first tick and unmounts on the last. Every row moves by about one row, so ticking rows one after another clicks where the next row *was*.
- Fix: reserve the bar's strip whenever the table is selectable, or overlay it. An e2e check asserts that a row's bounding box does not move on the first tick.

S2. A run refused with 404 is a dead end. Raised by the code reviewer.
- Where: `apps/grid/src/ui/App.tsx:552-554`, `ActionInputs.tsx` `run`, `i18n.ts:428-437`.
- A stale id (deleted, or moved out of scope) refuses the whole run, by R3. The grid then shows English text ("unknown record 17") naming an id the sheet never shows, nothing re-reads the view, and every retry fails the same way.
- Fix: on 404 from `runSelection`, `reloadView()` (the prune drops the gone row) and show a Dutch notice. Add an App test.

S3. A selection action is recognised by `'many' in action`, not `many === true`. Raised by security-sentinel.
- Where: `packages/engine/src/actions.ts:42`, `validate.ts:555-568`.
- A domain author's computed declaration such as `{ ...decl, many: undefined }` turns a single action into a selection action. Its `run(record)` then receives an array, and a guard like `record.risk === 'high'` passes. It fails open on threat-model attack 3's shape split.
- Fix: `isSelection = (a) => a.many === true`, and `checkActions` refuses a `many` that is present and not `true`. Add a validation test.

## Note

From the code reviewer:
- N1 (`GridBody.tsx:149`, `GridHeader.tsx:61`): every row's checkbox is a tab stop, against the grid's roving focus. Make it `tabIndex={-1}` except on the active row or the header box, and Space on the `#` cell through the key model.
- N2 (`app.css:1666-1676`, `:3484`): row numbers from 100 up are clipped once the checkbox shares the 44px `#` cell. Widen `NUMBER_WIDTH` when the table is selectable. Not verified visually.
- N3 (`drawer/PlaceRow.tsx:43`, `place.css:20-32`): the link item's button:
  - its accessible name is the bare title; use `aria-label={t('openRecord', { title })}`;
  - it has no `:focus-visible` style;
  - an empty title makes an unnamed, zero-width button; fall back to plain text.
- N4 (`App.tsx:583`, `Search.tsx:19-27`): ⌘K search still lists `listed: false` datasets' views. Filter them in `jumps()`.
- N5 (`Grid.tsx:368`): the drawer shows a button that silently does nothing when only one of `onAction`/`onSelection` is passed. It is latent today. Filter the drawer's actions by the handlers that exist.
- N6 (`i18n.ts:275`): "Maximaal 500 tegelijk" is hardcoded beside `MAX_SELECTION`. Interpolate `{max}`.
- N7, two tests the plan named are missing:
  - a filter, space or period change pruning through a re-read (a new store, the Grid still mounted);
  - "missing stays blocked" in `createBlocked`. Removing that branch fails no test.
- N8 (nits):
  - The fixture's query is named `agenda`/"Agenda", a studio word, against the Global Constraint.
  - `e2e/auth.ts` adds no administrator.
  - `Grid.tsx:366` recomputes the ids.
  - While one bar action runs, the others stay enabled.

From security-sentinel:
- N9: the plan's threat model names `recordsOf` and `inputsOf`, which are inline in `runSelection` and split into `idOf`/`inputOf` (`actions.ts:70-99, 160`). Attack 5's record-link half is stopped by the link fence (`record-link.ts:63-81`), not by `visibleSource`/`inScope`.
- N10: no selection-specific test covers an owner on a hidden source, or an out-of-scope relation input. Both hold today through shared code (`actions.ts:117-123, 168`).
- N11 (`writes.ts:346, 366, 419`): one selection run can queue up to 10×N hook mails and N notices, with N up to 500 and chosen by the caller. Relevant only if a consumer's created datasets have hooks.
- N12 (`Grid.tsx:363-364`): the related drawer, the link record included, still gets `attachments`/`onBatch`. This predates the branch, and the server enforces it.
- N13: the 500 cap is written in three places (engine, grid, mcp). The server is the control.
- N14: removing one link from the links cell makes the whole selection run un-undoable (409 `changed_since`), and the delete itself cannot be undone. In studio, dropping a site before confirming removes that request's Undo.
- N15 (for studio, not this branch): links naming production sites are now made by the caller. Studio's writers must:
  - pin the request's initial state;
  - refuse `actie_site` creates and moves out of `overgeslagen` past voorbereid, on every path;
  - enforce "risk: high never in bulk" inside `run`.

  `options_from` was never a server control.

Findings: 0 Blocking · 3 Should fix · 15 Note
