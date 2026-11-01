# Feature review: drawer-actions

Reviewed: origin/feature/drawer-actions at 2f62f11c3fdcf207575bcf7f5c9c1738a420ee45, base f2be0bd (origin/main, selection-actions merged).
Plan: specs/drawer-actions/plan.md (Threat model, Test map, Review Focus). Spec: specs/drawer-actions/spec.md R1–R7.
Level: full. Reviewers:
- the superpowers code reviewer (general-purpose, opus)
- security-sentinel (opus)

There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor. The project is not WordPress.

Both reviewers ran tests and probes in copies outside the executor's tree:
- engine drawer-actions 36/36;
- matrix, selection-actions, lookups and record-link 148/148;
- mutation runs: every engine and useLive denial test bites.

Both reproduced the two grid defects below with probes. Neither changed any tree.

## Blocking

None.

## Should fix

S1. An open live drawer on the dashboard re-reads every tile every 3 s. Raised by both reviewers.
- Where: `apps/grid/src/dashboard/Dashboard.tsx:107-111` (the re-read calls `refresh()`), `grid/drawerWrite.ts:17-21`, `Drawer.tsx:174`, `useLive.ts:28`.
- Probe: 3 tiles, 10 polls → 30 tile reads. Each tick costs 1 + T requests.
- This breaks the spec's non-goal (no live dashboard tiles), R4's "No list view polls", and threat 5's bound. Studio's Te bevestigen drawer stays open for minutes.
- Fix: a poll re-reads only the record. `refresh()` runs after a press, or when the re-read lifecycle value differs from the one shown. Test: "a live dashboard drawer re-reads only its record".

S2. A re-read lands on the drawer as it was when the callback was made, so a closed drawer reopens and polls again. Raised by both reviewers.
- Where:
  - `Grid.tsx:383` `setRelated({ ...related, row })` and `Dashboard.tsx:109` `setOpened({ ...opened, row })` run unconditionally from a closure;
  - the press's Undo stores that closure as `refresh` (`App.tsx:556, 562`, `store.ts:316`);
  - a poll answer after close does the same (`drawerWrite.ts:19-20`).
- Probes: press, close, Undo → the drawer reopens and polls. A late poll answer after close does too.
- `fresh` (`App.tsx:552-553`) closes over the press-time view and store, so after a view switch Undo repaints a dead store.
- Fix:
  - guarded functional updates (`setRelated((was) => was && was.model.key === model && was.row.id === row.id ? { ...was, row } : was)`, and the same for `setOpened`);
  - `fresh` reads the current view and store through refs.
  - Tests from the probes: a reply resolving after close leaves the drawer closed; Undo after close keeps it closed.

## Note

From the code reviewer:
- M1 (`DrawerButtons.tsx:14`): no guard on a press in flight. A double click gives a 409 whose notice replaces the success notice, and on the dashboard that notice holds the only Undo. Disable the buttons while a press is in flight.
- M2 (`i18n.ts:432`): `condition_not_met` has no Dutch text, so the engine's English message names the internal action key. `actOnSelection` re-reads only on `unknown_record`. Add the code and reload on it. Security-sentinel raised the same as its N6.
- M3 (`App.tsx:566`): a refused Undo on the dashboard is swallowed. In studio the worker moves bevestigd → bezig within seconds, so Undo after Bevestigen is refused. Show a notice with `undoText(error)`.
- M4 (`store.ts:304-307`): `replace` ignores pending writes. A poll answer can repaint over a pending inline edit, or, out of order, overwrite the newer row and stale the store's `confirmed` value. Skip `fresh` while that id has a write pending.
- M5 (`useLive.ts:15, 29, 34`): "Bezig…" stays after polling stops on null or 401/403/404. Drop the busy mark on stop.
- M6 (`validate.ts:459`): `when` values are not checked against options, so a typo never matches while `from`, `to` and `live` are checked. Require each value (or `$in` member) to be an option or null when the column or lookup target has options.
- M7 (`rows.ts:297`): `linksOf` reads every in-scope lookup of every link dataset in every domain (theatre's toewijzing has 4, with no marks). Add `lookupSelect` only when the link dataset declares marks.

From security-sentinel:
- N1, for studio's plan:
  - (a) actieSiteWriter must refuse te_bevestigen ↔ overgeslagen unless the actie is voorbereid, with a denial test. Without it, an editor could re-add a skipped site to a confirmed update by direct PATCH, the MCP or a stale drawer.
  - (b) Bevestigen's `expect` pins only the actie's state, not which sites it covers. An editor's Niet nu or Toch wel between the administrator's last read and the press changes what gets confirmed. Options: administrator-only buttons; a snapshot of the te_bevestigen set at bevestigd; or voorbereid as a live state, which narrows the window.
- N2: validation accepts conditions that can never match: values that are not options (= M6), and a `when` on a non-owner_visible lookup in a transition for owners. Both fail closed.
- N3 (`available.ts:17`): any object is treated as `$in`, so an unvalidated `{ $gt: 1 }` throws and 500s the reads. It is only reachable if `validateDomain` is skipped (`createEngine` does not validate; `serve` does). Hardening: no-match for any object that is not `$in`.
- N4: an owner's `detail` gating works, but an owner already reads every stored column of its in-scope rows through GET /rows. The marks reveal nothing beyond that read model.
- N5: polling does not pause in a hidden tab, and network errors back off to 15 s without stopping. Acceptable.

Findings: 0 Blocking · 2 Should fix · 12 Note
