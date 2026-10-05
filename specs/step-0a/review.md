# Review: step-0a

Branch `feature/step-0a`, range 01bae31..f192bd2. Two reviewers on the most capable model, run 2026-10-05 after all four tasks passed their task reviews: the whole-branch review (superpowers code-reviewer) and `security-sentinel` (the plan carries a threat model). Both are read-only, and neither wrote the code.

## Whole-branch review: "Ready to promote: With fixes"

**Strengths:** the engine/domain boundary holds. All six threat-model attacks are closed where the plan placed them, and each has a denial test that asserts the status, the code and unchanged tables. `/schema` leaks no `share_token`/`owner_id`. The migrator matches R2/R3. `plandag` is pure and tested across the day line, the year boundary and DST. A sweep of reachable grid code finds no live WordPress API, and the ledger's row counts were re-verified.

**Important**
- **I1:** `bun run gate` fails from a clean checkout. `e2e/.tmp/` is never created, so the engine dies with `unable to open database file` (`serve.ts`, `playwright.config.ts:10`). **Fixed** in the fix wave: `mkdirSync` before opening any `--db`.
- **I2:** R10's time log existed only in the git-ignored SDD ledger, and the plan's Time log table was empty. **Fixed:** the table is filled.
- **I3:** ledger arithmetic was off. N1 cited `grid/filter.ts:217-224` (a 57-line file), and the app.css root-id rename was 114 lines, not 116, so production was 459 and the total 1 060. **Fixed.**

**Minor**
- **M1:** Dutch labels in the engine's `saved-view.ts`. **Fixed:** they are now English.
- **M2:** a typo in a declaration's `date` or `title` fails silently, or gives a 500. Deferred to the first task of step 0.
- **M3:** a saved view's non-`$eq` filters are dropped by `chipsOf`. Unreachable in 0a; deferred to step 0.
- **M4:** a null title becomes the string `"null"` in lookups. **Fixed.**
- **M5:** datetimes display as raw ISO. Deferred to step 0's parity work.
- **M6:** `from=2026-13-45` passes the shape check and returns an empty result. Deferred.

**Deferred-minor triage:** the reviewer marked every per-task minor as stays-deferred, except the ledger citations, which were folded into I3. `tableOf`/filter-compile coverage was closed by Task 2, and the `bad_window` label was closed as a non-issue. **Rulings challenged:** none.

## Security audit: no Critical, no High

- **M1 (DNS rebinding):** there was no Host check, so a page that rebinds its name to 127.0.0.1 could read every row. This also falsified the deferral's premise. **Fixed:** a Host allowlist with a 403 otherwise, and the Vite proxy uses `changeOrigin`. Added to the threat model as attack 7.
- **M2:** `$contains` cost grew with rows × values. 100 values on 20k rows took 4.36 s, and because bun:sqlite is synchronous, the whole server froze for that time. **Fixed:** one subquery per key, with a timing test.
- **M3:** no row cap or pagination. Deferred to step 0, before the Laika import, and recorded in the threat model's deferrals.
- **L4:** lookups return titles of soft-deleted rows. Deferred; this is the owner's call.
- **L5:** declarations are not validated (index columns, title/date, reserved names, an unchecked `as Domain`). Deferred to the first task of step 0, together with M2 above.
- **L6:** `vite --host` would expose the proxy on the network. **Fixed:** server and preview are pinned to 127.0.0.1.
- **L7:** no `nosniff` header. **Fixed.**
- **L8:** boolean filters coerce by truthiness. Deferred until the first boolean column.
- **Test-oracle gaps:** `counts()` would not catch an UPDATE, and value injection is tested only with `$eq`. Deferred.

**Mitigations 1–6:** verified in the files the plan names, each with its denial test. **Deferral "auth/rate limit":** its premise was corrected (see M1). **Deferral "trusted domain SQL":** extended to CLI arguments and the environment.

## Fix wave and re-review
Commits 8631692..52b7e76 address items I1–I3, M1, M4 and security M1, M2, L6, L7, with RED→GREEN through the route, the CLI and the browser. A scoped re-review on the most capable model found every item addressed and no new breakage. `rm -rf e2e/.tmp && bun run gate` exits 0: 70 engine tests, 482 grid tests, 3 e2e flows. A 100-value `$contains` over 20k rows dropped from 6.5 s to 0.64 s.

**Carried into step 0 (load-bearing):** to get `$contains` under a second, the fix wave also replaced the separate `count(*)` with `total: raws.length` (`rows.ts`). That is correct only while `/rows` has no limit. When step 0 adds the row cap or `limit` (see the threat model's deferrals), `total` must become a separate count again. Plan Task 2's line about running "one `count(*)`" describes the code as it was before this fix.

**Residual minors:** the `filter-compile.ts` comment still mentions the "EXISTS fan-out". Ledger row 31 counts `vite.config.ts` at 6 lines as of f192bd2, leaving out the fix wave's 4 security lines on purpose. The `$contains` timing test has a 1 s bound and runs at about 640 ms. The Host match is case-sensitive.

The full ruling list for each deferral is in the controller's report to Stefan.
