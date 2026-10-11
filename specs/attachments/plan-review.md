# Plan review: attachments (F1)

Reviewed-plan: b5b6d581352fb3cd4b502e9462fa909f54450ce6
Verdict: not ready. Filed by the controller from the plan-reviewer's report (the reviewer is read-only).

## Blocking
- **B1.** "Mount the routes before `writeGuard`" also mounts them before `authenticate` and `confineLinkActor` (`app.ts:201`, `auth.ts:299`); after them, `writeGuard` answers an octet-stream POST 415 (`write-guard.ts:25-26`). Fix: mount after `authRoutes`; `writeGuard` skips only its JSON and size checks for the upload path.
- **B2.** The existing undo refuses a batch holding a delete and any engine-table entity (`writes.ts` `touchedBy`; `planUndo` via `writableOf`); `SPEC.md:56` says deletes are never undone. Fix: a named attachment branch in `undoBatch`; amend SPEC:56; a redo test.
- **B3.** An "owner writes only owner_writable" rule in `valuesOf` refuses owner transitions (`lifecycle.test.ts:36,254,313`), the `/act` transition (`actOn` → `applyWrite` as a role-owner link), theatre's owner writes (`datasets.ts:238-239`, `toewijzing.test.ts:198`, `access.test.ts:76-81`) and owner undo; it conflicts with `SPEC.md:45`. Fix needs a ruling.

## Should fix
1. Data after a jpeg's EOI (motion photos, MPF) keeps its GPS; drop it, with a test.
2. `testEngine`, `scripts/parity.ts`, `playwright.config.ts:18-21` (not global-setup) and `scripts/shakeout/edit-session.ts` start engines that will need `filesDir`.
3. `route-matrix.test.ts` (`:309` every route has a row; `:105` the link cell) is not listed.
4. `confineLinkActor` matches paths only (`record-link.ts:63`); opening `/rows/:d/:id` opens DELETE too. Make it method-aware.
5. The Drawer has no api or history wiring; three render sites (`Grid.tsx:336-337`, `Matrix.tsx:558`); the list goes stale after undo.
6. No tests for the rate limit and the 0700 directory.
7. T3's command "grid vitest" is not runnable; say `/shakeout` owns the e2e.
8. Tasks 3 and 4 lack Interfaces; show the guard exemption, the undo branch and the link check (before `ownBody`/`cutBody`, which hide refusals).
9. 403 vs 415 `bad_content_type`; 400 vs 403 for `/act` values.

## Notes
Exif Orientation lost with APP1; a link cannot open a file by `<a href>` (step 6); `bodyLimit` is fixed-size (one per dataset); `request()` always JSON-encodes; `no-store` dropped from the findings.

## Controller's rulings (plan rewritten)
- **B1:** routes after `authRoutes`; `writeGuard` exempts the upload path from JSON and 64 KB only — one guard, not two.
- **B2:** attachment undo branch; SPEC:56 exception; redo test.
- **B3:** the declared limit binds **person links only** (PATCH and `/act` values, checked before `ownBody`/`cutBody`); signed-in owners keep SPEC:45 — matches what Stefan approved ("a link account writes a declared column") and breaks no existing owner write. Regression tests listed. Cost if wrong: extend the check to owner sessions later.
- **SF1:** drop bytes after the first EOI. **Note on Orientation:** keep it in a minimal Exif APP1.
- **SF2–SF9:** folded into the plan; `no-store` restored for owner and link downloads.
