# Step 3c — feature review

**Range:** f067682..a8b137f, branch `feature/step-3c`.
**Plan:** `specs/step-3c/plan.md`, with its threat model and Review Focus.

**Reviewers** (both on the most capable model):
- superpowers' code reviewer;
- `security-sentinel`, because the plan carries a threat model.

There is no `ARCHITECTURE-INVARIANTS.md`, so no `invariant-auditor` ran.

## Blocking

None.

All six threat-model mitigations hold where the plan places them (security-sentinel), and five of them have a test that asserts the denial. The sixth is the tile `set`. It is validated at save time, and its write goes through the unchanged PATCH path.

## Should fix

- **S1** · `packages/engine/src/views.ts:147-150, 324-329` · security-sentinel.
  - The defect: ruling R-3c-1 says only an administrator's dashboard is shared. That rule is enforced only in the grid (`Composer.tsx:87`).
  - The exploit: an editor can POST or PATCH a dashboard with `shared: true`. It then ranks as "shared by someone else" above the system one, so it becomes the landing page of every editor and administrator who has no dashboard of their own. Its `set` labels are free text, so a button can mislabel the write it makes.
  - The fix: refuse `shared: true` on a dashboard for anyone but an administrator.
- **I-1** · `apps/grid/src/dashboard/QuickCreate.tsx:66-69`, `grid/newRow.ts:33-42` · code reviewer.
  - Quick create hides the required columns that `newRow` pre-fills. A date defaults to today and an option to its first value, and the dialog never shows either. So "Nieuwe activiteit" always lands today, and "Nieuwe tourstop" always runs today to today.
  - With no space chosen, a required relation is asked twice (`asked = ["productie_id","productie_id"]`, two selects with one id).
- **I-2** · `apps/grid/src/gallery/Gallery.tsx:12` · code reviewer. The gallery reads images in one batch of at most 200 ids. Every card past the 200th renders blank on an unfiltered view of up to 5000 rows.
- **I-3** · `apps/grid/src/dashboard/Composer.tsx:17-22` · code reviewer.
  - Plan Task 5b says to add a tile by "kind, then view, then its options". The composer stops at kind and view.
  - An added progress tile reads the same view twice ("n van n"). There is no stat tone, no list rows or `set`, and no quick actions.
- **I-4** · `views.ts:78`, `Composer.tsx:87`, `ui/tables.ts:67`, `Rail.tsx` · code reviewer · **a decision, for Stefan.**
  - A second administrator saving an administrator's shared dashboard makes another shared copy.
  - Editors keep landing on the older copy, because the landing ranks by id.
  - The rail offers no delete for a dashboard, so mistaken copies pile up.

## Note

- **N1** · `packages/engine/src/dashboard.ts:210-224`, `seed-missing.ts:166-175` · security-sentinel. A seeded dashboard tile can resolve to a user's shared view with the same name and source, and that view's owner can then change what the system dashboard shows.
- **N2** · `dashboard.ts:48-52` · security-sentinel. Dashboard labels accept control and format characters, which `nameOf` refuses for view names. This compounds S1. There is no XSS: every label renders as React text.
- **N3** · `seed-missing.ts:159` · security-sentinel. An administrator's shared copy named "Overzicht" counts as present for `source IS ?`. If the system dashboard were removed and declared again, that copy would block it from being re-added. No crash path was found.
- **M1** · `e2e/step-3c.spec.ts:129` · code reviewer. Three gate flows test less than the plan describes:
  - stat-red-then-neutral fixes the conflict through the API, not the grid;
  - owner-no-dashboard does not check the person link page;
  - space-narrows asserts only the Conflicten stat.
- **M2** · `dashboard.ts:111` · code reviewer. The list tile's `columns` cap of 3 from F4 is not enforced; only the 16 KB size cap applies.
- **M3** · `declare.ts:219-222` · code reviewer. `SavedViewSeed` makes the source optional for every skin, so a non-dashboard seed without a source would insert NULL silently.
- **M4** · `WeekTile.tsx:22` · code reviewer. The week tile reads by day, not by overlap, so on a spanning calendar it misses rows that began before the week. `spanRows` has no unit test.
- **M5** · `views.ts:338` · code reviewer. A stale tile (its view deleted or unshared) blocks any other PATCH of the dashboard until the tile is removed.
- **M6** · `QuickCreate.tsx` · code reviewer. Quick create does not record undo history. Impact is low: the dashboard has no undo.
- **M7** · `StatTile.tsx:33` · code reviewer. A failed read resets the value but keeps a stale previous-period value.

Findings: 0 Blocking · 5 Should fix · 10 Note

## Fix pass

Each fix went RED→GREEN through its seam. There was no re-review.

| Finding | Ruling | Commit | Proof |
|---|---|---|---|
| S1 | approved (orchestrator) | f430629 | `packages/engine/test/dashboard.test.ts`, "only an administrator shares a dashboard": an editor's POST and PATCH with `shared: true` get 403 `shared_dashboard`; the table and the landing order are unchanged |
| N2 | approved | f430629 | same file, "a dashboard label": `‮` and `​` are refused |
| I-4 | option (a), Stefan via the orchestrator, 2026-10-13: an administrator updates any shared dashboard in place; a copy is made only from the system one when no shared copy exists; the rail deletes for administrators, never the system one | f430629 (engine), 4df4bfe (grid) | "one team dashboard": a second administrator renames and deletes a shared one; an editor gets 403 `not_owner`; a private one is 404; the system one is 403 `read_only_view`. `Composer.test.tsx`: the system save updates the team copy. `Rail.test.tsx`: delete appears only on an editable dashboard and only with the administrator handler |
| I-3 | approved | 4df4bfe | `Composer.test.tsx`: a stat's label and tone, a list's rows and `set` (only on a column that writes), a progress's total and label; quick actions added and removed |
| I-1 | approved: required writable columns only, pre-filled where `newRow` has a value | 7e4c490 | `more-tiles.test.tsx`: Nieuwe activiteit asks Productie once, shows Plandag and Soort pre-filled and changeable, and sends what was chosen; the chosen space is filled in and stays changeable |
| I-2 | approved | eaa2bb3 | `skins.test.tsx`: 450 rows make three reads (200, 200, 50) and row 450 shows its image; this failed on the old Gallery |

The Notes N1, N3 and M1–M7 stay open for a later branch.
