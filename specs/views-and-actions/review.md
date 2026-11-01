# Feature review: views-and-actions

Reviewed: origin/feature/views-and-actions 4cb4a7a..4bc1d48 (15 commits, 87 files, +3731/-483), from a detached checkout of the head.
Plan: specs/views-and-actions/plan.md (Threat model, Test map, Review Focus); spec specs/views-and-actions/spec.md.
Reviewers: superpowers' whole-branch code reviewer (general-purpose, opus) and security-sentinel (opus) on the threat model. There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor; the repo is not WordPress, so no drift reviewer.
Both reviewers read the code without running it: the checkout had no node_modules. The gate was green on 4bc1d48: 2347 bun tests, 1512 vitest, 233 Playwright.

Verdicts:
- Code reviewer: "With fixes". The engine, the migration and the access rule hold up, and so do their tests.
- security-sentinel: no access hole. A seeded view changes only for a human administrator, and only when it is unlocked and still declared. Every threat-model mitigation is present and has a denial test, apart from the gaps in N5.

## Blocking

None.

## Should fix

**S1. The dock's "— openen" link does nothing on a board, calendar, timeline or gallery, and leaves a pending open that pops a drawer later.** (code reviewer)
- Where: `apps/grid/src/ui/App.tsx:402-405` with `:479`; `apps/grid/src/ui/runs.tsx:186`; the only consumers of `runs.opening` are `apps/grid/src/grid/Grid.tsx:349-354` and `apps/grid/src/dashboard/Dashboard.tsx:77-84`.
- Why: `grid = store && model && view && layout` is truthy on every non-matrix skin, so `show()` never navigates there. Calendar, Timeline, Board and Gallery render in place of `<Grid>` (`App.tsx:709-728`), so nothing on screen consumes `opening`. Meanwhile `RunLines` has already dismissed the waiting line.
- Effect: on studio's own "Opdrachten per status" (a board) or "Sites in beeld" (a gallery), the waiting line's link vanishes and nothing opens. That breaks R5a and R5b. The stale `opening` then opens a drawer on the next table or dashboard.

**S2. The R11 fit drops a stored filter, sort or group on a column the schema marks `hidden`, and Save or autosave sends the view without it.** (security-sentinel)
- Where: `knownOf` (`apps/grid/src/ui/views.ts:57-60`) is built from `columnsFor` over `model.fields`, which `shownColumns` (`apps/grid/src/engine.ts:195-196, 205`) builds without hidden columns. The engine accepts a filter on a hidden column, and `plainConditions` (`apps/grid/src/grid/conditions.ts:129-156`) makes it a chip. `fit` (`ui/views.ts:71-80`) drops the chip; `arrangementOf` (:83) and `currentOf` (:160) return the fitted copy; `toStoredView` (`engine.ts:390-398`) stores it.
- Effect: latent, since no seed declares such a filter today. Theatre declares hidden columns (`packages/theatre/src/datasets.ts:142-143`). On an unlocked seeded view, which now autosaves for an administrator, the first sort click stores the view without the filter and touches it, so the seed never puts the filter back. On a public view, the share serves more rows.
- I checked this myself against the source: the coder's "every model field" is every SHOWN field.

## Note

Code reviewer:
- **N1.** The seed's "present" rule counts system views; the dashboard fallback does not. `packages/engine/src/seed-missing.ts:199-200` matches any shared view, system rows included; `packages/engine/src/dashboard.ts:94-96` (`SEEDED_ID`) and `:229-230, 249` exclude them. An administrator renames seeded view B to a missing seed A's name on the same source. A is then never added, and a dashboard tile naming A makes `refOf` throw, so `--seed-missing` exits 1 and every other seed change is blocked. `storedView` runs before the touched check (`:189`). The fix is `AND owner_id != -1`. security-sentinel raised the same finding as its N3.
- **N2.** A "done" toast for something that has not run (spec anti-goal 1). `App.tsx:583-587`: when the follow-up `rowOf` fails, the toast says "… uitgevoerd". The loop also reads every created record of a dataset with a lifecycle in series, even where no `live` is declared.
- **N3.** Delete then Undo detaches a seeded view for good. The restore adds person revisions, so `touched()` is true afterwards. The same happens to a sort clicked and clicked back.
- **N4.** The dock covers the last rows. Bottom padding is added only while rows are ticked (`app.css:3633-3635`), so a waiting or bad run line or a toast covers the last row and the totals footer. A running line cannot be dismissed. Run lines have no live region.
- **N5.** The running indicator hangs on `.nv-num > span::after` (`app.css:3612`). A table with no selection actions has no span there (`GridBody.tsx:154`), so it shows no indicator. Studio is unaffected.
- **N6.** The Composer labels a tile on a live view that this administrator cannot see "Weergave verwijderd", and its save drops the tile (`Composer.tsx:65, 78, 194-195`). It should say no access (`noAccess`) when the view is not in `gone_views`.
- **N7.** "Link gekopieerd" is now a toast in the dock (z-index 5), and a widened drawer (`app.css:3283-3290`, z-index 20) covers it. The status used to be inline in the drawer.
- **N8.** A required boolean with a default reads blank on the new-row draft and saves as "Nee" (`Bool.tsx:10-13`, `newRow.ts:38`). The blank should be limited to a stored null.
- **N9.** The inputs panel does not take focus (`DrawerTools.tsx:62-73`).
- **N10.** Unledgered drift: `useSavedViews.ts:19` drops the plan's `view.type !== 'dashboard'` clause. It is harmless today.
- **N11.** Small issues in the follower: `runs.tsx:90-103` reads `phase` and `tone` set inside a lazy state updater; the 6-second timer is not cleared on unmount; `Dashboard.tsx:71-76` re-reads the tiles on every mount once any run has ended.
- On the coder's five deviations: `known` from model fields, agree (subject to S2); R12 keeps the pill, accept; inputs in a panel, accept (N9); null boolean blank, as ruled (N8); no lock mark for an administrator, as ruled (Stefan confirms at the shake-out).
- Recommendations: confirm the touched rule's consequence with Stefan (sort clicks autosave on a seeded view for the team, touched never resets, and a delete is one-way); consider a team mark on an editable seeded view; the shake-out drives the dock link from the Opdrachten board, and a waiting line plus the selection panel over the last rows.

security-sentinel:
- **N12.** The public half of threat-model attack 4 has no guard and no test. `packages/engine/src/views.ts:402` (`forOwnersProblem`) covers for-owners only. A human administrator may PATCH an unlocked public seeded view, which matches the spec's general rule for public views. Correct the threat-model wording, or refuse widening a public view and test the denial.
- **N13.** `gone_views` (`views.ts:318-323`) filters by owner or shared, but not by `readable(actor, source)` (`views.ts:350-354`). It leaks one bit: a shared view on a source the role cannot read reads "Weergave verwijderd" instead of "Geen toegang". The denial test (`seeded-views.test.ts:389-410`) covers another owner's private view only.
- **N14.** A view a person touched whose declaration is later removed can never be deleted (`seed-missing.ts:245-248`, `views.ts:84-88`). This was ruled as the deferred N3, (a).
- **N15.** Gaps in the denial tests: nothing asserts a human administrator's `POST /restore` denial for a deleted locked, keyless or undeclared system view; this matters because `keySeeded` keys live rows only, so every system row deleted before the migration is keyless. `editable: false` is not asserted for a service account with role administrator.
- **N16.** Two system rows can share one key, via `adoptUnowned` (`migrate.ts:137-144`) or duplicate `(name, source)` seeds that `validateDomain` does not refuse. Benign: no actor gains more than the rule gives.
- Verified present with a denial test: attacks 1, 2, 3, 5, 6, 7, 8, R10a and the follower's denial (table in the sentinel's report). Undo and redo cannot reach `saved_view`. Forged `seed_key`, `owner_id`, `locked` and `public` are ignored. No `dangerouslySetInnerHTML` in apps/grid. No domain word in the engine or grid.

## Reviewer's rulings for the fix pass

Fix, each RED→GREEN through the seam where it showed:
- S1 and S2.
- Promoted from the Notes because they are cheap and sit on a surface this branch built: N1 (the seed exits 1), N2 (a false "uitgevoerd"), N4 (dock padding and a live region), N7 (a toast under a widened drawer), N8 (a draft boolean), N9 (panel focus), N13 (`gone_views` readability), N15 plus the earlier N6 tests (denial tests only).
- N10: ledger it as a deviation, no code.

Deferred (in the hand-over): N3, N5, N6, N11, N12 (wording), N14 (ruled), N16, the running line that cannot be dismissed.
For Stefan: the touched rule's consequence and the team mark (code reviewer's recommendations).

Findings: 0 Blocking · 2 Should fix · 16 Note
