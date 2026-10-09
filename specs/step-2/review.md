# Step 2 feature review

Range e080e02..55f9aee (feature/step-2, local), against specs/step-2/plan.md, level full. Reviewers on the most capable model: superpowers' code reviewer, security-sentinel.

Findings: 1 Blocking · 7 Should fix · 13 Note (summary in the controller's report; the two reviews follow verbatim).

## Whole-branch review: feature/step-2 (e080e02..55f9aee)

I read the branch in passes and did not re-run any suites. First pass: the engine's security code (auth.ts, record-link.ts, action-token.ts, owner-views.ts, rate-limit.ts, the views.ts diff, openapi.ts, serve.ts, the tables). Second: the write path (writes.ts, actions.ts, declare.ts, validate.ts, seed-missing.ts). Third: the theatre package (datasets, writers, actions, queries, seed). Fourth: the grid (api.ts, App.tsx, the grid and matrix stores, Matrix.tsx, Act, LinkPage, Share, Drawer). Last: SPEC.md, the playwright/e2e config, real-data.md and the fixture. I spot-checked the test files rather than reading all of them.

### Strengths
- **The engine stays domain-free.** The lifecycle, action tokens, record links, views for owners and account kinds are all generic. Theatre declares every name (`vul_slot`, the invite hook, `mijn_producties`, the `owner_visible` marks).
- **One write path.** `applyWrite` is shared by PATCH, `/act` and action updates, so `expect`, `checkTransition`, the scope read and hooks behave the same on every route. Hooks return data and mail is sent only after commit. Import, seed-missing and undo never reach `enterState`.
- **Every threat-model mitigation holds across the whole branch, not only per task** (one partial: 18, see below):
  - 1–2: hashed lookup; one identical 401; consume and transition in one transaction, so a 409 or 422 rolls the consume back.
  - 3–5: `expect`, the role table, undo only by exact inverse.
  - 6: the link-account batch actor, which no one else can undo.
  - 7–8: mail queued until after commit; minting revokes earlier tokens; undo revokes what its batch minted.
  - 9–10: the MAC is computed even for a missing record; the version is read on every request.
  - 11: `confineLinkActor` runs right after authentication.
  - 12: `holdKeys` covers `$or`, sort, group and the date window, and only listed keys are projected.
  - 13: `forOwnersProblem` re-runs on PATCH and again on every read in `servable()`, so a later declaration change is caught too.
  - 14: the request route answers identically and writes nothing.
  - 15: the three no-store headers on every public route and every 401.
  - 16: handler refusals for service accounts on publishing, for-owners and record links.
  - 17: rotate, disable and the per-account limit take effect on the next request.
  - 18: session lookup requires `kind='user'`, Bearer requires `kind='service'` (partial: an unrecognised scheme falls through to the cookie, see Minor 1).
  - 19: OpenAPI is built from the caller's own `/schema`, and a link actor is refused.
- **Migration is characterised on a real step-1-shaped file:** ALTER versus rebuild, `.pre-migrate`, every id, revision and FK intact.
- **The matrix keeps one op stack.** Lifecycle ops undo by batch; re-creates into a hooked state are skipped with a notice; a landed write survives a failed re-read.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)

**1. Redo after undoing an invite leaves a dead invite.**
- Where: `packages/engine/src/writes.ts:693` (`revokeMintedBy`), together with undo of an undo batch (`UNDOABLE` includes `'undo'`); `apps/grid/src/matrix/store.ts` `replay`/`skipped`; the grid store's redo.
- What happens: an editor moves v→u (token minted, mail sent after commit), then Ctrl+Z (the token is revoked, correctly by R3), then Ctrl+Shift+Z. The redo is an undo of the undo batch: the inverse is allowed, no hook fires, nothing is re-minted. The row reads "Uitgenodigd", but the mailed link answers "Deze link werkt niet meer" and nothing new was sent.
- Why it matters: the planner believes the person is invited, and the person cannot answer. No test covers undo→redo of a minting batch; matrix redo is skipped only for `created` ops.
- Fix (keeps "hooks never fire in undo"): `undoBatch` refuses to undo an undo batch whose original batch minted tokens (`not_undoable`). The grid and matrix map that refusal to the existing "Opnieuw doen kan hier niet" notice. Add a lifecycle test and a matrix store test.

**2. The table grid can neither fill nor cancel an open slot.**
- Where: `packages/theatre/src/writers.ts:132-141` (`checkAssignee`) together with R8 (`apps/grid/src/engine.ts` filters `vul_slot` out of the row actions).
- Filling: the table edits one cell at a time.
  - Setting `persoon_id` on an open row is refused: "Een open plaats heeft nog geen persoon of naam."
  - Setting state to voorlopig is refused: "Kies een persoon of een naam."
  - Only a single PATCH carrying both works, and the grid never sends one.
- Cancelling: `* → geannuleerd` is a declared transition, but the writer refuses it on an empty slot. The theatre test passes only because it also sets `persoon_id`.
- Spec conflict: docs/SPEC.md's walkthrough says "In the Toewijzingen view (table or matrix) the planner fills each open slot".
- Fix: when a person or name lands on an `open` row and no state is given, the writer returns `state: 'voorlopig'`. That makes it a writer-made transition, which also exercises the untested second `checkTransition` (writes.ts:455). Then either allow `geannuleerd` on an empty slot or refuse it with a message that points to Delete.

**3. Swapping the person on an `uitgenodigd` row invites no one, and the row still says Uitgenodigd.**
- Where: `writes.ts:310` — `enterState` fires only when the state changes.
- What happens: an editor changes `persoon_id` A→B on an uitgenodigd row in the grid. A's token now dies, which is correct (threat 2: the scope read gives 401). B gets no mail and no token, yet the row still reads Uitgenodigd.
- The spec is silent on reassignment; a planner would reasonably expect B to be invited, or at least not to see "Uitgenodigd".
- Fix (a theatre decision): the writer resets state to `voorlopig` when the person changes on a row in a hooked state. The planner then re-invites with `u`, which mints and mails.

**4. R7 is not met on the real database (plan defect).**
- R7 says "`--seed-missing` … so a migrated database gets a slotted speeldag". The plan (Task 6) chose "never update" and pinned "a db already holding an unslotted speeldag op locatie keeps it".
- The step-1 fixture holds exactly that row (`step-1.sql:629`), and `real-data.md` step 3 admits it. So Stefan's migrated copy almost certainly gets no slotted template, and gate item 1 cannot be shown on real data.
- Needs Stefan's ruling before he runs real-data.md: seed the slotted template under a distinct title, or allow a one-shot update of that one config row.

**5. Every per-address limiter is a global limiter in this hosting design.**
- Where: `app.ts:156` (`peerAddress`), with the loopback-only Host allowlist.
- Every request arrives from the proxy at 127.0.0.1. So:
  - `act:ip:` (20 failures per 15 min) and `record-link:ip:` (20 per 15 min) are shared by everyone: 20 garbage POSTs to `/act`, or a handful of people clicking stale invites, lock every person out for 15 minutes;
  - `owner:ip:` (60 reads per minute, failing closed) is shared by every link page, each of which costs 1 + N requests;
  - `bearer:ip:` is shared by every service account.
- The threat model defers this only for Bearer ("shared-IP lever").
- Not a merge blocker while mail stays outbox-only and no real person reaches `/act`. Record it as a cutover precondition in the threat-model deferrals: key the failure limiters by token hash or link prefix as well as address, or read a trusted proxy header.

#### Minor (Nice to Have)
1. **Unrecognised auth scheme uses the cookie** (`auth.ts:275-281`). `Authorization: Basic x` together with a cookie authenticates by cookie, against threat 18 ("header present → cookie ignored"). It is not exploitable, but the fix is three lines: any `Authorization` header that is neither RecordLink nor Bearer → 401.
2. **`/act/view` offers buttons that cannot work** (`action-token.ts:121`). When the row is no longer in `from_state` (cancelled, or the planner already confirmed), the page still shows the answers, and pressing one says "Al beantwoord", which is wrong for a cancelled slot. Return a terminal flag when `state ≠ from_state`.
3. **`aantal` is not validated on a Toewijzing row** (writers.ts). A planner can store 0 or a negative number. The open column clamps it to 0, and `vul_slot` treats ≤1 as "fill in place". Refuse anything below 1 in Dutch.
4. **`expect` is silently unwritable as a column name** (`app.ts:57`). PATCH strips `expect` from every body, so a dataset column named `expect` cannot be written by PATCH. `validateDomain` should refuse that column name.
5. **"Nieuwe link" rotates with no confirmation** (`Drawer.tsx`). One misclick silently kills the person's working link.
6. **Every shakeout session kills all copied links** (`scripts/shakeout/edit-session.ts:135`). The link secret is regenerated on each start.
7. **The constant-time compare is theatre** (`action-token.ts:102`, `auth.ts:250`). The row is found by SQL equality on the hash, then the hash is compared with itself. It is harmless (hashes of 256-bit random tokens) but does not match the spec's "constant-time compare". Reword the spec line or leave it.
8. **The OpenAPI document omits `expect` (PATCH) and `notices` (write replies).** An agent cannot discover race-safe transitions.
9. **docs/SPEC.md walkthrough step 2** says "Assigning sets state to uitgenodigd and sends the invite". The fill writes `voorlopig` (Q12); reword it.
10. **`mijn_producties.sql`:** `replace(group_concat(...), ',', ', ')` mangles a role name that contains a comma. Use `group_concat(x, ', ')`.

### Deferred-minor triage

**Fix before merge:**
- Task 2: the second `checkTransition` has no test. It comes for free with Important 2.
- Task 2: `expect` as a reserved name. One validate line (Minor 4).
- Task 4: `aantal` positive integer. I upgrade this one (Minor 3): it is a data-quality issue planners will hit.
- Task 10: `mijn_producties` lists soft-deleted persons. A one-line EXISTS on a live persoon. Low effect (admin grid only; a link for a deleted person already gives 401), but trivial.
- Task 11: unrecognised Authorization scheme falls through to the cookie (Minor 1). It pins a threat-model rule.
- Task 12: provenance note on the step-1.sql fixture. One comment line; needed so a later audit can trust "invented". I scanned it: only `@example.test` addresses.
- Task 3 spec note: "an undo back into the hooked state restores the old token". Write it into the spec together with the Important 1 fix, which settles the redo case.

**Can wait:**
- Task 11: signout with a Bearer answers 200 plus an expiring Set-Cookie. Cosmetic, no security effect. I disagree with the controller's "fix before merge".
- Task 1: `Bun.sleep(20)` waits in tests; no test of `send()` rejecting; the Store factory.
- Task 2: `roles: []` accepted; `sendAfterCommit` turning a synchronous `send()` throw into a 500 (every Mailer is async today; wrap it when a real mailer lands); `expect` on POST silently dropped; hook test sleeps.
- Task 3: 422 before 401 for a reassigned token with a bad `to` (needs a real token, leaks nothing useful); the write guard's and Host check's 403 lack no-store (they echo no token); owner sees `hidden` for a link batch.
- Task 4: an owner's same-value PATCH is a no-op; `expectOf` with an empty state (unreachable); the unreproduced vitest failure.
- Task 5: creates run before updates; no delete step in `ActionResult`.
- Task 6: `slotsOf` without a guard (validated first in the same transaction).
- Task 7:
  - the open column is not on the arrow-key grid;
  - there is no optimistic paint for a fill;
  - `openSlots` treats any empty row as open (the writer forbids empty non-open rows, so only legacy data);
  - the fill picker ignores away data;
  - the size of Matrix.tsx;
  - refresh() not awaited: verified, it catches its own rejection (store.ts:390). Close it.
- Task 8: the empty name in the no-email notice; missing tests of token days; `Act.answer` has no live guard.
- Task 9a: no negative test for `RecordLinkX`; the import cycle; `deliverLinks` sync reads; id reuse (writes only soft-delete; ids are AUTOINCREMENT).
- Task 9b: the projector duplication; the `holdKeys` re-parse; the id tiebreak. "No generic write path reaches `for_owners`" is verified: `viewBody` builds an explicit field set and DELETE clears the flag.
- Task 10: `Promise.all` in `LinkPage`; the global `unauthenticated()` callback (harmless for the `record` session status); the `dagen` CTE counting cancelled activities (worth checking when step 3 touches the query).
- Task 11: the theatre `timingSafeEqual`; service-name trim and uniqueness; the shared-IP lever (subsumed by Important 5); the remaining CLI and OpenAPI niceties.
- Task 12: parity asserted by hand; the weak `count(*)` assertion.

### Test timeouts
I see no cause in the code. `refresh()` handles its own rejection. The module-level `noticed`/`onNotices` singleton is re-registered per Workspace and is harmless. `testTimeout` is already 15 s. Failures land in different files each run and every file passes alone, which matches CPU starvation of jsdom and Testing Library waits. Capping vitest workers (R15) is the right remedy.

### Declined to judge
- Owner sessions (kind `user`) reading whole rows on `/rows`: the plan defers this to the Q9 cut.
- Mail delivery, forwarded-mail exposure, notes through the link: listed as out of scope or deferred in the plan.
- The kandidaten list and absence data in the fill picker: step 3.
- Laika's `maybe` mapping (`uitgenodigd` versus `voorlopig`): explicitly Stefan's ruling in real-data.md.
- The outbox mailer logging links to stdout: sanctioned by the Global Constraints ("only the development mailer logs").
- `vocabulary-allow.txt` admitting `mijn`, `ref`, `items`: test fixture and OpenAPI words, outside the engine's runtime vocabulary.
- E2E flows for the gate: per the plan these are written by `/shakeout` after this review.
- Lifecycle columns written through query `writes:` columns send no `expect`: no theatre query writes a lifecycle column today, so nothing is affected.
- Open-slot rows in history and revision display: no requirement covers them.

### Recommendations
- One fix wave:
  - Important 1, 2 and 3: all small, in the engine undo guard and theatre writer rules, each RED→GREEN;
  - the seven fix-before-merge minors;
  - Minors 1, 2 and 3;
  - the vitest worker cap;
  - then a full `bun run gate` in one run before `/shakeout`.
- Ask Stefan for Important 4's ruling before he runs real-data.md. Log Important 5 as a cutover precondition in the threat model.

### Assessment
**Ready to merge?** With fixes.
**Reasoning:** The security design holds across all of the branch's seams and there is nothing critical. But a planner would hit three things in normal use: a redo that silently breaks an invite, open slots the table cannot fill, and a person swap that looks invited but is not. R7 also needs Stefan's ruling before the real-data run.

Relevant files:
- /home/ntdst/Sites/worktable/packages/engine/src/writes.ts
- /home/ntdst/Sites/worktable/packages/engine/src/auth.ts
- /home/ntdst/Sites/worktable/packages/engine/src/action-token.ts
- /home/ntdst/Sites/worktable/packages/engine/src/app.ts
- /home/ntdst/Sites/worktable/packages/theatre/src/writers.ts
- /home/ntdst/Sites/worktable/packages/theatre/src/queries/mijn_producties.sql
- /home/ntdst/Sites/worktable/apps/grid/src/matrix/store.ts
- /home/ntdst/Sites/worktable/specs/step-2/real-data.md
- /home/ntdst/Sites/worktable/docs/SPEC.md

---

## Security audit: worktable feature/step-2 (e080e02..55f9aee)

I reviewed the diff, read every security-relevant file at HEAD, and ran one probe against the HEAD sources. The probe lives in the scratchpad (`.../scratchpad/probe/probe.ts`), uses an in-memory DB and a recording mailer, and changed nothing in the checkout. The WordPress checklists don't apply: this is TypeScript/Bun/Hono.

**Verdict:** 18 of the 19 threat-model mitigations hold across the whole branch. **Attack 16 can be bypassed in two requests, and so can the "who confirmed" audit asset.** I confirmed this at runtime. That is the one Blocking finding below.

---

### Blocking

**B1. Any editor, including an editor-role service account, can send a person's record link and invite tokens to their own address, then act as that person.**
- **Where:**
  - `packages/engine/src/record-link.ts:107-121`: `deliverLinks` mails to whatever is in `persoon.email` right now.
  - `packages/theatre/src/datasets.ts:155-166`: the `invite` hook mails the action token to the person's current email.
  - `packages/theatre/src/writers.ts:117`: `persoonWriter` lets any planner write `email`.
- **Attack (reproduced with a Bearer service token, role editor):**
  1. `PATCH /api/rows/persoon/2 {"email":"attacker@evil.test"}` returns 200.
  2. `POST /api/record-links/request {"email":"attacker@evil.test"}` is public. The outbox received `#/link/persoon.2.<mac>`, and that link authenticated as the link account of persoon 2.
  3. `POST /api/rows/toewijzing {persoon_id:2, state:"uitgenodigd"}` sends the invite to the attacker. `POST /api/act {token, to:"bevestigd"}` returns 200.
  4. Revisions record the confirmation under the link account. History shows `["link","Bram De Wilde"]`: the person appears to have confirmed.
- **What this breaks:**
  - Attack 16 ("a service account … mints links") and the "action tokens", "record links" and "audit trail (who confirmed)" assets.
  - A stolen editor service token (attack 17's scenario) becomes impersonation of any person.
  - The only trace is the `persoon.email` revision, and the attacker can revert the email afterwards.
- **Fix (engine-level, no domain words):**
  - Treat the column a dataset names in `record_link.email` as a credential-delivery address. In `valuesOf`, refuse writes to it unless `actor.role === 'administrator' && (actor.kind ?? 'user') === 'user'`, the same gate as `linkedRecord` and `showingToOwners`.
  - Optionally, when that column changes, rotate the record's link (`record_link.version + 1`) and revoke outstanding action tokens whose subject is that record.
  - Add a test that replays the four steps above.

---

### Should fix

**S1. Lifecycle writes without `expect` have no race protection; it is optional on the wire.**
- **Where:** `writes.ts:258` only compares when `mode.expect !== undefined`.
- **Attack:** the grid always sends `expect`, but service accounts and other API clients need not. A planner's PATCH to `geannuleerd` (allowed from `*`) silently overwrites a confirmation the person made a moment earlier. Attack 3 holds only for clients that choose to send `expect`.
- **Fix:** require `expect` on any PATCH that names the lifecycle column (400 if it is missing), at least for `kind: 'service'`, or document that agents must send it.

---

### Notes (accepted, deferred, or low impact; flagged so they aren't lost)

- **N1. Per-address limits will turn global behind a proxy.**
  - **Where:** `app.ts:156` (`peerAddress`) and every `failureLimiter` / `checkLimits` key. Trusted proxies are a cutover item per SPEC:83.
  - **Why it matters:** the Host allowlist is loopback-only, so any network deployment sits behind a proxy and every client shares one peer address. Then 20 bad tokens from anyone lock out `/act`, record links and all Bearer accounts for 15 minutes, and `/owner/*` gets 60 reads per minute shared by everyone.
  - **Fix at cutover:** a trusted-proxy `clientIp`. Consider keying the Bearer failure limit separately from the person-facing routes.
- **N2. Token logging in the dev mailer.** `mailer.ts:22` prints every action token and record link to stdout. This is allowed by the Global Constraints, but in step 2 the outbox is the only real mailer, so running it anywhere but a dev box puts live credentials in journald or pm2 logs. Drop the `console.log` or print only `to`.
- **N3. Service administrator and published views.**
  - **Where:** `views.ts:178/180` (`ownedView` gates public and for-owners edits on `role` only); `views.ts:303` (`shareable` accepts any `shared` view).
  - **Attack:** if a human admin publishes or sets for-owners on a shared view owned by a service administrator, the service can then PATCH it. A public view's PATCH doesn't re-run `checkPublishable`, so the service can add the owner column to what the share token serves. For-owners views stay safe because `forOwnersProblem` re-runs.
  - **Fix:** add the `kind === 'user'` check from `sharing()` to those two branches.
- **N4. Migration backup is world-readable.** `migrate.ts:51`: the account rebuild triggers `VACUUM INTO <db>.pre-migrate` under the process umask (usually 0644). The copy holds PII and session, magic-link and token hashes, and Stefan's real-data migration will create it. Fix: chmod it to 600 after the copy.
- **N5. R11 fail-open (`record-link.ts:146`).** Acceptable. An attacker can't trigger the limiter error, since bun:sqlite is single-connection; only a concurrent CLI holding the write lock can.
- **N6. Shared mailboxes.** `deliverLinks` mails every `persoon` row matching an address (NOCASE). Two people sharing one email receive each other's links. This is inherent to mailing by address; mention it in the spec.
- **N7. Already deferred, re-confirmed as low impact:** `actOn` answers 422 before the scope read (only a valid token holder sees it); the write guard and Host 403 come before no-store on `/act`; `sendAfterCommit` turns a synchronous throw into a 500.

---

### The 19 attacks

1. **Holds.** `liveToken` (action-token.ts:97): 128-char cap, sha256 lookup, `timingSafeEqual`, one `badToken()`. `failureLimiter('act:ip:…',20,15)` in `actionTokenRoutes` counts only 401s, after rollback, and fails closed.
2. **Holds.** The token stores record and subject. `actOn` (157-184) acts as `linkAccount(subject)`. `applyWrite` → `currentOf` gives 404 on owner change, mapped to 401. Consume and transition share one `.immediate()` transaction, so a 422 or 409 rolls the consume back. Bypass: none.
3. **Holds when `expect` is sent.** `checkTransition` (writes.ts:258) runs inside the immediate transaction; `/act` passes `expect: from_state`; `vul_slot` passes `STILL_OPEN`. See S1.
4. **Holds.** `allowed()` checks the role table and runs twice, before and after the writer, in `valuesOf`. Owners reach it only through `answersInvite` (state-only) or `/act`.
5. **Holds.** `undoModeOf` + `checkTransition` undo branch accept only the exact inverse, behind `planUndo`'s changed_since.
6. **Holds.** The `/act` batch actor is the link account (probe: actor_id 3). `undoableBatch` (599-608) refuses others, and link actors can't reach `/batches`.
7. **Holds.** `enterState` runs only from `applyWrite`, which only `runWrite`, `runAction` and `actOn` call. Mail is queued in `Hooked` and sent after commit. `restore`, import and seed-missing never call it. `revokeMintedBy` runs on undo.
8. **Holds.** `mintActionToken` (64-90) revokes the record's unused tokens.
9. **Holds.** `verifyRecordLink` (record-link.ts:48) computes the MAC for missing records too and has one `badLink`. The failure limiter lives in `linkedAccount`. The only timing difference reveals whether a dataset name is declared, and that name is in the token anyway.
10. **Holds.** The version is read per request from `record_link`, an engine table that is not a domain dataset, so undo and `/rows` can't touch it.
11. **Holds.** `confineLinkActor` sits right after `authenticate`. Hono routes and the regex see the same decoded path. Probe: `/rows`, `/schema`, `/history`, `..` and `%2F` variants, HEAD and case variants all return 403.
12. **Holds.** `holdKeys` covers filter keys (including `$or`), sort, group and the date window. `servable` re-runs `forOwnersProblem` on the stored keys. Output is projected to `shown`, and `custom.*` and `id` are refused.
13. **Holds.** `setForOwners`, the PATCH re-check (views.ts), `servable` at read time (fails closed if a domain drops `owner_visible`), seed-missing's `leftAlone`, and DELETE clears `for_owners`.
14. **Holds, with R11.** One answer, `setTimeout` delivery, 20 per address and 5 per email. Where the link goes is undermined by B1.
15. **Holds.** Fragment URLs plus `forgetToken()`, the `RecordLink` header, POST bodies, `noStoreHeaders` on `/act`, `/record-links/*`, `/owner/*`, RecordLink auth and every 401 (probe: present on a thrown 422), the meta tags in `index.html`, no logging middleware. See N2.
16. **Bypassed by B1.** The direct handler refusals hold: `sharing`, `showingToOwners`, `linkedRecord`; no route writes `account`; engine tables aren't `/rows` sources. See N3.
17. **Holds.** `serviceByToken` re-reads `token_hash` and `disabled_at` every request; `serviceLimit` is 600/min and fails closed; the Bearer failure limiter is 20 per 15 minutes. See N1.
18. **Holds.** In `credentialOf` (auth.ts:275), a RecordLink or Bearer header wins. `sessionAccount` requires `kind='user'`. The hash sets are separate tables. Probe: a junk Bearer with a valid cookie returns 401.
19. **Holds.** `openApiOf` is built from `/schema`'s readable-filtered sources, and link actors get 403.

### Beyond the list
- **Auth confusion:** none found. Magic links are issued only to accounts with an email, and the CHECK constraint ties email to `kind='user'`.
- **Cross-actor visibility:** `whose()` hides other actors from owners. The link-subject title is shown only to editors and administrators. Owner sessions still read whole rows, which is the existing deferral.
- **Mass assignment:** no route takes role, kind or owner columns from a body. The account CLI validates role, and `SERVICE_ROLES` restricts service accounts to editor or administrator.
- **SQL injection:** none. In `findBy` and `matchOf`, column names are checked against declared columns and values are bound. Seed-missing's `carries` uses declared names and bound values. `mijn_producties` is static, and its date modifier comes from `CAST AS INTEGER`.
- **Migration:** the account rebuild runs with foreign keys off and preserves ids and roles. Existing rows get `kind='user'`, so there is no privilege drift; the step-1 fixture test checks every row. Only the backup's file mode is an issue (N4).
- **Accepted rulings:** none of R2, R3, R4/R5, R7, R10, R11 or R12 is unsafe as implemented. R7's `findBy` is used only for role-name lookups and leaks nothing an editor can't already read.

**Files:**
- `/home/ntdst/Sites/worktable/packages/engine/src/record-link.ts`
- `/home/ntdst/Sites/worktable/packages/engine/src/writes.ts`
- `/home/ntdst/Sites/worktable/packages/engine/src/views.ts`
- `/home/ntdst/Sites/worktable/packages/engine/src/mailer.ts`
- `/home/ntdst/Sites/worktable/packages/engine/src/migrate.ts`
- `/home/ntdst/Sites/worktable/packages/engine/src/app.ts`
- `/home/ntdst/Sites/worktable/packages/theatre/src/datasets.ts`
- `/home/ntdst/Sites/worktable/packages/theatre/src/writers.ts`
