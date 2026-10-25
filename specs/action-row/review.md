# Feature review: action-row

Reviewed: origin/feature/action-row 6e2df3a..7f150f9 (39 files, +1616/-230), from a detached checkout of the head.
Plan: specs/action-row/plan.md (Threat model, Test map, Review Focus); spec specs/action-row/spec.md, with R1, R2, R2a and R3 as amended by Stefan during the build.
Reviewers: superpowers' whole-branch code reviewer (opus), security-sentinel (opus, on the threat model). There is no ARCHITECTURE-INVARIANTS.md, so no invariant-auditor.
The gate was green at 7f150f9 (252 Playwright). The reviewers re-ran href.test and adres.test (31 pass), OpenLink.test (16 pass), and ActionRow, Drawer, DrawerButtons and Select (118 pass).

Verdicts:
- Code reviewer: "With fixes". R4–R7 are correct and well tested; the CSS is scoped away from the matrix, board and calendar.
- security-sentinel: no Blocking finding. All three threat-model mitigations are present with denial tests at every write path (create, update, import, seed-missing, undo/restore). Bevestigen is still administrator-only on the server; the move was presentational only.

## Blocking

None.

## Should fix

**S1. The 160px end space is fixed, so a tall dock covers the last rows** (code reviewer). `app.css:2450-2459` (`tbody::after { height: 160px }`) with `.nv-dock { bottom: 56px }`. A panel plus three run lines plus "+N eerdere verzoeken" is about 220px, so the last 2–3 rows can never scroll clear (R3). The old assertion `padding ≥ dock + 16` (`e2e/studio.spec.ts:354-362`) was weakened to `dock.bottom ≤ foot.top`. Fix: `height: max(160px, calc(var(--nv-dock-h, 0px) + 40px))` (the variable is measured in `runs.tsx:223` and inherited from `.nv-sheet`), then restore a last-row-clear-of-the-dock assertion with several run lines.

**S2. ActionRow is not keyed by record** (code reviewer). `Drawer.tsx:228`: the old `DrawerTools key={row.id}` is gone. An open inputs panel (`asking`) and `pressing` follow the user from record A to record B on ↑↓ or another Openen. The ResizeObserver effect has `[]` deps (`ActionRow.tsx:91-101`): when the first record shown has no actions, no observer is attached and widening never refolds. Fix: `<ActionRow key={row.id} …>`, and make the effect depend on the row element existing.

**S3. Focus is lost after an action runs** (code reviewer). `ActionRow.tsx:136`: a successful run with inputs unmounts the focused panel, and focus falls to `<body>`. The same happens after a lifecycle press whose button leaves with the new state (Bevestigen). Fix: on success, return focus as `leave()` does; when that button is gone, fall back to the row's first button, else the drawer.

**S4. href on a query column bypasses service_only** (security-sentinel; code reviewer note). `checkHref` (`validate.ts:100-106`, `:446`) accepts href on a QueryDecl, whose values the engine never checks. A query column built from a person-writable column would give an editor an "open" button to a look-alike domain: attack 2 by another route. It is latent, since no query declares href. Fix: refuse href on query columns in `validateDomain`, with a denial test.

## Note

Code reviewer:
- N1. Only the first href column is offered (`OpenLink.tsx:161`), and nothing refuses a second.
- N2. Clearing to '' gives `bad_url` (`writes.ts:491`; the grid's text parse sends '' at `columns.ts:143`). A future person-writable href column could not be emptied. Harmless today (service-only).
- N3. The URL check is written twice (engine and grid). Both reviewers agree to keep it as defence in depth.
- N4. Short-table pinning (`min-height: 100%` on a table) is not verified by any e2e. The shake-out should screenshot the seeded Sites (short table).
- N5. Some test titles now contradict the values: "row-line token stronger than the subtle border" (`e2e/smoke/studio-polish.spec.ts:8`, `e2e/studio.spec.ts:943`), where light `#e9ecf0` is now lighter than `#e7eaee`.
- N6. `.nv-grid:not(.nv-mx) .nv-td .nv-pill` also restyles link-cell pills (`Links.tsx:21-23`). Head `ToneMark` pills keep their dot, so a pill looks different in the head than in a cell.
- N7. Built-in meaning tones (`tones.ts:12-15`) make pills without a declared tone. Consistent with R2a.
- N8. The R5 "no links" test is loose (`DrawerButtons.test.tsx`, "where the action row sits").
- N9. The fold is not re-measured after web fonts load.
- N10. `MORE = 40` is a constant, not measured.
- Carried to site-address: a site.yml URL without a scheme is refused `bad_url`; that plan already says a refusal never stops the sync.

security-sentinel:
- N11. The fresh seed (`migrate.ts:149-158` `insertRows`, `serve --fresh`) skips `checkValues`; only seed-missing goes through it. Low risk: developer code, and `adres.test.ts` pins the seeded values.
- N12. Values stored before a column became href are never re-checked. Nothing is affected now (`adres` is new).
- N13. Userinfo look-alikes (`https://bank.test@evil.test`) pass the check. Acceptable while only the service writes `adres`.
- N14. Bevestigen has no editor-person denial test (the editor-role service test exercises the same code).

## Reviewer's rulings for the fix pass

Fix S1–S4, each RED→GREEN through the seam where it showed (S1: the e2e with several run lines; S2: a Drawer test stepping records with the inputs panel open; S3: a focus assertion after a run; S4: a validateDomain denial test).
Promoted because they are cheap and on this branch's surface:
- N1: refuse a second href column per source in validateDomain, in the same denial test as S4;
- N5: reword the two test titles;
- N4: the shake-out screenshots the short seeded Sites table, light and dark;
- N6: make the head ToneMark pill match the cell pill (no dot), or say why not.
Deferred: N2, N3, N7–N14.

Findings: 0 Blocking · 4 Should fix · 14 Note
