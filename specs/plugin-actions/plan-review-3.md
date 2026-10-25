# Plan review, round 3: studio-plugin (set of three)

Reviewed-plan: fa3dcf786f73c6af1bef25c727c9522acc31459c /home/ntdst/Sites/netdust-studio/specs/site-plugin/plan.md
Reviewed-plan: d48ac60a0f1cc3f8c4bc381abdd37fd25e6bc900 /home/ntdst/Sites/netdust-studio/specs/plugin-actions/plan.md
Reviewed-plan: 20acdd0cd6e47b123b5f1473db0e9005591ae982 /home/ntdst/Sites/netdust-studio/specs/plugin-worker/plan.md
Verdict: ready with fixes. N-B1 is closed and nothing new is Blocking. Two round-2 fixes are wrong (N-S1, N-S5) and
one is half done (N-S9). Each needs a one-line plan edit.

## Round-2 status (summary)

- **Fixed:**
  - N-B1: no role-changing command; `studioRoles` and `studioSessions` added. `wp user session destroy --all`
    exits 0 even with no sessions (`entity-command/src/User_Session_Command.php:72-85`);
  - N-S2, N-S3, N-S4, N-S7, N-S8;
  - N-N1 to N-N9.
- **Fixed wrong:**
  - N-S1: the GET bullet still said "deletes the row";
  - N-S5: a top-of-file `return` guard does not stop a redeclare, because PHP binds top-level functions at compile
    time. This was shown with a two-include run.
- **Partly fixed:**
  - N-S6: the all-without-plugin refusal had no test;
  - N-S9: the grid runs vitest, not bun test.

## Blocking

None.

## Should fix

- **R3-S1:** plugin-actions GET bullet. Clear `value` and set `taken_at` in one conditional UPDATE, and reword
  "delete" to "clear" everywhere.
- **R3-S2:** site-plugin. Drop the `defined(...)` return guard and rely on the `bin/test-package` refusal.
- **R3-S3:** plugin-actions Task 3. Test that a cache, cron or maintenance selection where no site has the plugin is
  refused (as `ALL_GONE`, `packages/studio/src/actions.ts:29`), and that the install is not.
- **R3-S4:** plugin-actions Test map row 2. Use `cd apps/grid && bunx vitest run src/grid/HeadActions.test.tsx`.
- **R3-S5:** plugin-worker INV-6. The literal `netdust-studio/sites` cannot match `join(...)` segments
  (`src/config.ts:42`). Fix the one form `secrets.ts` uses, or forbid the imports instead.

## Note

- **R3-N1:** `--field=roles` prints `a, b` (`User_Command.php:234`). State the split rule, and test a multi-role
  value.
- **R3-N2:** site-plugin attack 12. Point at plugin-worker attack 12 (no promotion, sessions destroyed).
- **R3-N3:** name the secret seam: a `$secret` parameter, not a WordPress filter.
- **R3-N4:** the testbed change "two parts" is three.
- **Line drift:** the baseline purge door is at `CacheHeadersService.php:779`.

## Fixed after this review (Should fix and notes, no further round)

R3-S1 to R3-S5 and R3-N1 to R3-N4, all applied. The plan blobs after the fixes:
- site-plugin plan.md 4481bbf1b43d541b8b88b8c4b3f616cc2f914aad
- plugin-actions plan.md ed04563cfcdd957d9eecbb3bdc6c8dfd30e012c4
- plugin-worker plan.md a23eacb1dae9d6d19910c07bfd5ac958757b48e0
