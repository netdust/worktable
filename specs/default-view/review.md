# Feature review — default-view

Reviewed: origin/feature/default-view, b776f40..93a55d2 (34 files, +976 −53), against specs/default-view/plan.md (with its Threat model and Review Focus), specs/work-model/spec.md R4 and docs/SPEC.md. Reviewers: superpowers' code reviewer (general-purpose, opus) and security-sentinel (opus), each on a detached checkout of the head. No ARCHITECTURE-INVARIANTS.md, so no invariant-auditor. Neither reviewer ran tests (the checkout had no node_modules; the coder's gate is the evidence).

Both: all five threat-model mitigations hold; one default per node is held by one immediate transaction; delete, unshare and seed removal clear the mark; POST/PATCH cannot set the mark (viewBody builds fields by name); every new query binds its values; the engine stays domain-free; every Review Focus bullet is pinned by a test; the rollout path (--seed-missing on an older database) is tested.

## Blocking
None.

## Should fix

**S1. `--seed-missing` brings back a seeded default an administrator took off** — `packages/engine/src/seed-missing.ts:237-250` (`seedDefaults`). Raised by both reviewers (code reviewer Important #1, security M/L-1).
An administrator chooses "Geen standaardweergave meer"; the node has no default; the next `--seed-missing` marks the seed's view again, because `seedDefaults` only asks whether the node has a live default, and `touched()` now ignores `is_default` revisions. This contradicts the spec ("so an administrator's choice stands") and threat 5.
**Ruling (reviewer t2h):** a person's `is_default` revision on any view of the node means a person chose for that node; `seedDefaults` leaves such a node alone and reports "default left as chosen". This includes an editor's unshare (which writes a person's `is_default` revision), replacing the earlier ruling that `--seed-missing` re-marks after an unshare: one rule — the seed marks a node only until a person has chosen. Fix RED first: "an administrator unmarks the seeded default; --seed-missing leaves the node without a default"; update the unshare test (default-view.test.ts ~:326) to the new rule. Cost if wrong: after an editor unshares the default, the node has none until an administrator marks one.

## Note (fix in the same pass where marked "fix"; the rest are recorded, not fixed)

- **N1 (fix). Orphan view can be marked** — `packages/engine/src/views.ts:530-543` (`checkMarkable`/`nodeDefaults`). Both reviewers. A view whose source the domain no longer declares is marked against `source IN ()` and never listed. Refuse it in `checkMarkable`: 400 `unknown_source`, with a test.
- **N2 (fix). No regression test that POST/PATCH ignore `default`/`is_default`** — security Low-3. Safe today; add one test: an editor sends `{default: true, is_default: 1}` on POST and PATCH, no view is marked.
- **N3 (fix). The Taken board's column is implicit** — `packages/studio/src/seed.ts:385-392`; code reviewer Minor 1. "Per status" has no `group_by` and taak no `board:`; the grid falls back to the first options column. Pin it (`board: { column: 'status' }` on taak, the way werkpakket declares `fase`) and assert it in the Studio seed test.
- **N4 (fix). The grid has no test of a query view as a node's default** — `apps/grid/src/ui/views.test.ts:226-240`; code reviewer Minor 2. Add one `lastIn` case where the marked view is a query view (`of` the dataset) in the node.
- **N5 (fix). Stale comment** — `apps/grid/src/api.ts:421` says every table opens on its first view; now "its default, else its first view".
- **N6 (fix). DomainError arguments** — `packages/engine/src/validate.ts:933` passes the seed name as the source for a dashboard seed; pass the source (or the dataset) as the other checks do.
- **N7 (recorded, not fixed). An editor who owns a marked shared view can change it, and so what everyone opens** — security Low-2; the code reviewer declined it as the spec's ordinary shared-view rule. Ruling (t2h): accepted as is, because it is the existing rule for shared views and the administrator chose to mark an editor's view; recorded in the plan's Deferrals by the coder. Cost if wrong: a marked view changes under the administrator's feet.
- **N8 (recorded). The fresh-database seed writes `is_default` without a revision** — security Info-5; consistent with every other seeded column.
- **N9 (recorded). The coder's deferred minors** (close.md): DELETE /default answers 200 on an unshared view or a dashboard; a seed with no source keyed "undefined"; "default left as chosen" prints each run; curly apostrophe in a test name; duplicated i18n value. The code reviewer agrees with deferring them.

## Declined to judge (code reviewer)
Landing page ignores defaults (rail-only ruling); no source link or per-person default (out of scope); the Taken board shows done and cancelled tasks (spec: the board keeps Done; archive trims it); a dropped seed removes an untouched marked view ("a mark is not a touch"); refresh after a mark racing an autosave (existing pattern); two defaults after an `of` change (deferred, deterministic); no toolbar mark (not asked); the gate's five ERR_NETWORK_CHANGED e2e failures (rerun green, coder's evidence).

Findings: 0 Blocking · 1 Should fix · 9 Note
