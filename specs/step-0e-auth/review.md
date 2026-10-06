# Review: step-0e U2, accounts, roles, scoping and the public route

Branch `feature/step-0e-auth`, 5af9635..ca6afd4, run subagent-driven on 2026-10-06. Each of the six tasks got a fresh implementer and a fresh task reviewer; fix rounds went back to the implementer and were checked by a scoped re-review. At the end, two reviewers read the whole branch on the most capable model: a code reviewer and `security-sentinel`.

## Final whole-branch review: ready with fixes
- Review Focus 1–6 all hold: the denied actor through lookups, `?cells=1`, `/revisions` and queries; byte-identical link answers; double consume; a 401 mid-flow; the public route never widening; an empty subject.
- **Important I1: engine table names were not reserved.** A domain dataset named `account` would put the real account table behind `/rows/account`. Fixed in 50e21f3.
- **Minor M1:** the root Bun pin was missing. Fixed in ca6afd4.
- **Minor M2:** two rulings were absent from the spec diff. Added in ca6afd4.
- **Can wait:**
  - **M3:** there is no CHECK on the account subject pair.
  - **M4:** there is no way to change a role or re-enable an account; `--create-admin` does not promote.
  - **M5:** the CLI has no busy timeout against a live database.

## Security audit: no Critical, High or Medium
- **Attacks 1–12:** every mitigation is where the plan named it, and every denial is tested. Two were incomplete: 10, through L1, and 11, through L2.
- **L1.** Deleting a public view left its token unrevocable, and restoring the view revived it. **Fixed** in e078c81: delete now unpublishes. This overturns the Task 3 ruling.
- **L2.** Rate-limit rows grew after the address limit refused, and the sweep was unindexed. **Fixed** in a9706fd: the address is checked first, checking stops at the first limit over, and `window_start` is indexed.
- **L3.** The outbox was readable by others. **Fixed** in a46a8c2: the directory is 0700 and its files 0600. A directory that already exists keeps its mode.
- **I2.** An owner's subject is now required to be a live row. **Fixed** in 04f4133.
- **I3.** Signing in again now ends the session the request carried. **Fixed** in 9de129b.
- **Info, recorded and not fixed:**
  - **I4:** lookups show an owner related titles. This is a ruling, and it is now in the spec diff.
  - **I5:** an owner can read the earlier history of rows moved into its scope.
  - **I6:** login CSRF by social engineering, which is inherent to magic links.
  - **I7:** the shared-loopback consequences are already deferred to the cutover: cookies ignore ports, and per-address limits act globally behind the proxy.
  - **I8:** fixed-window edges.

## Fix wave
- **Commits:** 50e21f3, e078c81, a9706fd, a46a8c2, 04f4133, 9de129b, ca6afd4.
- **Tests:** each code fix went RED→GREEN through its route or CLI.
- **Scoped re-review:** all 8 findings were addressed, with no new breakage. Its one residual note: an engine *index* name is not reserved.
- **Gate on Bun 1.4.2:** 662 package tests, 564 grid tests and 38 e2e flows.

## The Bun pin
The process tests' flake was Bun 1.3.8, which loops forever in a module-loader thread while loading zod's locale files. This happened in about 1–3% of process starts, so about half of full runs failed. Commit d85c171 requires Bun 1.3.9 or later and adds a runtime test that enforces it. Stefan approved `bun upgrade`, and the machine is now on Bun 1.4.2.

## Rulings (in the order made)
- Ruling: branch cut from feature/step-0e (5af9635, U1+U3 merged) — the approved order; cost if wrong: none.
- Ruling: Task 5 stays one dispatch but the implementer may commit in three commits (theatre, grid, e2e); it is the plan's unit — cost if wrong: a longer review.
- Ruling: the vocabulary check (U3) is now in `check`; any new engine word that a domain declares (email, …) is allowlisted with a reason in the same task — cost if wrong: none.
- Ruling: Time log entries are filled by the controller at the end from commit stamps — implementers are not given the whole plan; cost if wrong: none.
- Ruling: lookups and titles through a relation are not scoped — an owner's own row must show its related activity's title; attack 6's "lookups" path is answered by scoping the rows, not their related titles — cost if wrong: an owner reads titles of rows its own rows point at.
- Ruling: the route×role matrix test landed in Task 2; Task 4 extends that file (unlisted-route test, share-token rows) instead of writing a second one — cost if wrong: none.
- Ruling: the /views rows of the permissions table landed in Task 2; Task 3 adds only the system owner, public_view and share-token rules — cost if wrong: none.
- Ruling: an administrator may publish any live view it can see (own, shared, system); another account's unshared view is 404 — publishing is an administrator act on visible content; cost if wrong: an admin publishes a shared view its owner did not mean to publish.
- Ruling: a later PATCH adding an owner column to a public view's fields is not refused; the public projection leaves that column out — the constraint is "never served", which holds; cost if wrong: a confusing silent omission.
- Ruling: a deleted public view keeps its token (404 while deleted, live again on restore) — restore returns the view as it was; cost if wrong: a link comes back to life on restore.
- Task 4: Ruling: the matrix moves from access.test.ts into route-matrix.test.ts (the brief's file); Task 4 adds the unlisted-route test and fixes the process-test flake (shared per-role engine, explicit timeouts) — cost if wrong: none. Dispatched implementer (sonnet) at base dd6a659.
- Ruling: the fix round's re-review was done by the controller from the diff (one unused type import removed) and `bunx biome check .` (2 pre-existing warnings left) instead of a re-review seat — the change carries no behaviour; cost if wrong: none.
- Ruling: the grid keeps its existing "Save as new view" label (the brief's "Opslaan als nieuw" names the action, not a rename) — cost if wrong: one label.
- Ruling: owner-sees-own checks 404 on another person's revisions and an empty Planning view instead of a row link in the hash (the grid has none) — cost if wrong: none.
- Ruling: Task 6 (spec-diff text only, no docs/SPEC.md change) reviewed by the controller and carried into the final review instead of a task reviewer — cost if wrong: wording fixed at the final review.
- Ruling: my Task 3 ruling "a deleted public view keeps its token" is overturned by L1 — deleting a public view clears public and share_token; cost if wrong: an admin republishes after a restore.

## Deferred minors
- Task 1: minor (deferred): clientIp defaulted in engine not passed from serve.ts; an engine without clientIp 429s every consume
- Task 1: minor (deferred): no outbox → no magic_link insert (safer; owner to confirm in final report)
- Task 1: minor (deferred): disabled-account consume rolls back the used_at claim (no re-enable path in 0e)
- Task 1: minor (deferred): every signIn console.logs the link → noisy test output
- Task 1: minor (deferred): concurrent-consume test cannot truly interleave (atomic UPDATE is the guarantee)
- Task 1: minor (deferred): timing-based waits in auth tests (Bun.sleep 20, 200 ms poll)
- Task 1: minor (deferred): no reserved-name check for engine tables (account, magic_link, auth_session, rate_limit, saved_view, revision)
- Task 2: minor (deferred): may() is consulted only for views.write; other surfaces are data guarded only by the matrix test
- Task 2: minor (deferred): /schema names unreadable datasets via columns[*].relation and matrix.away.dataset
- Task 2: minor (deferred): ?cells=1 on an unreadable join answers 200 with empty cells while /schema omits matrix_join
- Task 2: minor (deferred): an owner's GET /views also returns its own unshared views (only after a demotion)
- Task 2: minor (deferred): validateDomain accepts owners {owner: 'id'} on a query, which can never match
- Task 2: minor (deferred): the 64-engine matrix test loads the suite; one 5 s CLI timeout seen — Task 4 settles it
- Task 3: minor (deferred): shareRoutes duplicates the immediate-transaction helper
- Task 3: minor (deferred): empty visible_fields can be published (serves {} rows and a total)
- Task 3: minor (deferred): broken-limiter test prints a stack trace (rate-limit.ts console.error)
- Task 3: minor (deferred): rate-limit test sleeps up to 5 s; checkLimits takes now — inject it
- Task 3: minor (deferred): migrate imports views.ts/writes.ts for SYSTEM_OWNER and revise; move the constant to a leaf
- Task 4: minor (deferred): role none's account 0 in the matrix deserves a comment
- Task 4: minor (deferred): a future matrix row with a known email would let setTimeout delivery commit outside the cell savepoint
- Task 5: minor (deferred): an owner sees an enabled "New" on Toewijzingen (/schema writable); saving gets the writer's Dutch 403
- Task 5: minor (deferred): a lapsed session recovers on window focus only; sign-out hidden on narrow screens with the rail foot
- Task 5: minor (deferred): disabled Save on a system view keeps the 'Save as new view' tooltip
- Task 5: minor (deferred): after sign-out the tab stays on #/signin across reloads even when signed in elsewhere (no me() recheck)
- Task 5: minor (deferred): Confirm removes the token before a non-bad_token refusal (429); a reload loses the link
- Task 5: minor (deferred): lapsed-session dialog has no focus trap/inert grid
- Task 5: minor (deferred): sign-out unreachable at narrow widths (rail foot hidden)
- Task 5: minor (deferred): pre-existing biome warnings in packages/theatre/test/matrix.test.ts
- Task 5: minor (deferred): step-0e public flow leaves Voorstellingen public in the run database
- Final M3–M5 and audit I5–I8 (above).
