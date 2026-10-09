# Plan review: step-2, second review
Reviewed-plan: d7077e41d050c270868bdb828132eadbabe74992 specs/step-2/plan.md
Verdict: ready with fixes. B1 is a one-line edit and should land before Stefan reads the plan.

Every Blocking finding from both earlier reviews is resolved in the plan text, and the fixes hold against the source. Of the earlier Should-fix items, only the matrix undo (formal S4 / advisor B3) is still not fully designed. The rewrite added one ordering bug between Task 9b and Task 10.

## Blocking

**B1. After Task 9b, `bun test packages` fails because theatre's `token_projection` columns are not yet owner-visible.**
- **Plan:**
  - Task 4 sets `token_projection: ['activiteit_id', 'rol_id', 'state']` on Toewijzing.
  - Task 9b adds the validation rule "`token_projection` columns must be owner-visible".
  - Only Task 10 adds "`owner_visible` on the member-facing columns".
  - Task 9b Step 4 expects `bun test packages` to pass.
- **Source:** `migrate()` runs `validateDomain(domain)` (`packages/engine/src/migrate.ts:92`), and every theatre test migrates the theatre domain. Between Task 9b and Task 10 the theatre domain is refused, so every theatre test fails.
- **Smallest change:** Task 9b also marks `owner_visible` on `toewijzing.activiteit_id`, `rol_id` and `state` in `packages/theatre/src/datasets.ts`. The other way is to move the rule into Task 10. Either way, Task 10's "member-facing columns" should name these three.

## Should fix

**S1. The matrix undo design in Task 4 (and Task 7) is half a design.**
- **Plan, Task 4:** "the matrix's undo of a state edit goes through `undoBatch` and the tab history (`App.tsx:176`), not the op stack, which keeps note edits only".
- **Source:**
  - The matrix's Ctrl+Z goes to `cells.undo` (`App.tsx:297`, `Matrix.tsx:275`), never to the tab history.
  - `matrix/hooks.ts:6` says outright "The matrix keeps its own undo: it needs the rows a write returns, not its batch".
  - The op stack also carries creates, deletes, `fillDown` and paste as single undo steps, plus redo (`matrix/store.ts:328-389`, `step()` at about line 376).
  - `store.test.ts` pins "undoes a Delete by creating the record again" (`:234`, `:274`, `:316`). A batch holding a delete cannot be undone (`writes.ts:474`).
- **What the plan leaves open:**
  - With two stacks behind one key, which undo goes first when a state edit and a note edit are interleaved?
  - What happens to delete, fill, paste and redo?
  - Under Q13, re-creating a deleted `uitgenodigd` cell through `POST /rows` fires the invite hook again. To the engine that undo is a create, which threat 7 says must not happen.
- **Smallest change:** keep one op stack.
  - An op that changed the lifecycle column keeps its write's batch (`api.update` already returns `Saved.batch`, `api.ts:143-145`). Its undo and redo go through `undoBatch(batch)` instead of re-sending a PATCH.
  - Task 7's fill pushes a batch op onto the same stack.
  - Decide the delete case in a sentence, with a test: either the re-create re-invites (accepted), or a cleared lifecycle cell is not undoable (the spec's Out list has "undo of a delete").

**S2. No task tells the grid which column is the lifecycle column.**
- **Plan:** Task 4 says "a lifecycle cell edit sends `expect`" and "the matrix store's `changed()` sends `expect` too". Task 2's Interfaces never serve the lifecycle.
- **Source:** `/schema` serves columns, matrix, links and so on, and no lifecycle (`app.ts:178-205`). Hooks are functions, so the declaration cannot be served whole.
- **Smallest change:**
  - Task 2 serves `lifecycle: { column }` on `/schema`, and Task 4 reads it in `EngineSource`.
  - State that the matrix sends `expect` only when the cell field changes. `e2e/react-aria.spec.ts:640` asserts the note PATCH body is exactly `{ notitie: note }`.

**S3. Test map row 9a claims denial 15, but no test asserts the three headers on link-authenticated routes.**
- Task 3 tests the headers on `/act`, and Task 10 tests the `index.html` meta tags.
- Neither Task 9a nor Task 9b checks `Cache-Control`, `Referrer-Policy` or `X-Robots-Tag` on `/owner/views*`, `/record-links/*` or their 401s. R9 asks for exactly those headers.
- **Change:** add one test line to 9a (record-links, the request route, 401) and one to 9b (owner views).

**S4. The matrix half of Review Focus 2 is not tested.**
- Review Focus 2 says a stale lifecycle write answers 409 "in the grid and in the matrix".
- Task 4 has a grid 409 test only. Its matrix tests cover undo.
- **Change:** add "matrix: a state key on a cell whose state moved on the server is 409, the cell refreshes, and the Dutch message shows".

## Note

- **The failure counter must be written outside `/act`'s transaction.** `/act` runs the consume and `runWrite` in one transaction, and a 401 rolls it back, so a counter written inside it is lost. Task 3's "21st failure is 429" test will catch this. It is library mechanics.
- **The e2e secret file will be refused for its mode.** `head -c 32 /dev/urandom > e2e/.tmp/link-secret` creates 0644 under umask 022, and Task 9a refuses group- or world-readable files. The web-server command needs `umask 077` or a `chmod 600`.
- **One more spawn site.** `scripts/shakeout/edit-session.ts:111-125` starts the theatre engine with no `--link-secret-file`. It is not in the gate, but it breaks after Task 10. Add it to Task 10's files or name it in `real-data.md`.
- **A record with an empty owner column.** A name-only row moved to `uitgenodigd` has no `persoon_id`. Say the engine mints nothing in that case, and that the theatre hook asks for no token when there is no email (the notice alone).
- **`/act/view` after a reassignment.** Say it reads as the link account too, so a reassigned token gets the same 401 on view as on act.
- **Revoke.** Gate 10 and R9 say "revoked or rotated", but Task 9a has only rotate. One line: revoke is the version bump, i.e. rotate without handing out the new link.
- **The link page cannot read `/schema`.** A link actor gets 403 there, so `/owner/views` must answer the column labels itself. Name it in 9b's Interfaces.
- **Space-cycle on the state column.** It now walks `open → voorlopig → … → geannuleerd → open`, so several steps are 422. This fits "grids refuse, not hide", but someone may want the cycle order trimmed.
- **Stale references.**
  - Task 5 cites `actions.ts:56-96`; the file has 84 lines and `runAction` is at 57-78.
  - Task 0 cites "record token paragraph (HEAD:43, 66)". The record token paragraph is HEAD:62; HEAD:66 is the Access paragraph, which is also relevant. Persoon is HEAD:156, not "160 area".
- **Task 11's `/schema` snapshot** will churn with every later schema change. Asserting that plain `/schema` carries no OpenAPI keys would last longer.
- **Task 12 has no RED step.** It is a characterisation test of code that already exists, so it passes on its first run. That is acceptable; say so instead of "red until".
- **Hooks on action updates.** Task 5 has no test of a hook firing on an action update. Threat 7 names `runAction`, and `vul_slot` writes an unhooked state, so the gap is latent.

## Earlier findings: resolved?

- **Formal review:**
  - B1 confinement middleware: resolved (see premises).
  - B2 token subject: resolved, with a test for the reassigned token.
  - S1, S2, S3 (with Q13), S5 (Q14 plus HEAD line numbers, minor slips noted above), S6, S7, S8, S9, S10, S11, S12: resolved.
  - S4: the `voorlopig` mark is resolved; the undo is not (S1 above).
- **Advisor review:**
  - B1 secret file before global setup: resolved, with the mode caveat in the Notes.
  - B2 one token cannot race itself: resolved.
  - B3 matrix undo: only partly resolved (S1 above).
  - S1–S12, N2, N3, N4, N5, N8: resolved.

## Premises checked

- `may()` guards only three handlers → `views.ts:241,287`, `display.ts:83` → holds
- `confineLinkActor` right after authentication → `authRoutes` installs `sessionMiddleware` on `/*` at `auth.ts:193`, called at `app.ts:167`; later routes run after it, and `/auth/me` and `/auth/signout` are registered before it (`auth.ts:195-200`) → holds
- Out-of-scope `currentOf` refuses a moved owner → `writes.ts:357-362` throws 404 `unknown_record`; `/act` must map it to 401 → holds (the mapping is the plan's)
- Consume plus `runWrite` in one transaction rolls back together → `runWrite` is `transaction().immediate()` (`writes.ts:376-395`) and nests as a savepoint inside the outer one → holds
- `checkLimits` counts every request; a failure limiter is new code → `rate-limit.ts:13-44` → holds
- Hooks can tell `POST /rows` and action creates from import, seed-missing and undo:
  - creates go through `runWrite` (`app.ts:41-45`) and `createAs` (`actions.ts:46-54`);
  - import goes through `importRow` (`import.ts:162`), seed-missing through `writeRow` (`seed-missing.ts:51-57`), undo through `restore` (`writes.ts:511-529`), and `seedDomain` uses raw inserts (`migrate.ts:141-150`)
  - → holds, provided hooks fire in `runWrite` and `runAction`, not in `valuesOf`
- `linkSecret` needed only when serving → one-shot commands exit at `serve.ts:181-185`, before `createEngine` at `:192` → holds
- Other `createEngine` callers → `scripts/parity.ts:260`, `test/sign-in.ts:15`, and two fixture-domain tests (`auth.test.ts:372`, `writes.test.ts:157`) → holds
- Playwright starts web servers before global setup → `playwright.config.ts:7` → holds
- Matrix undo through `undoBatch` and the tab history → Ctrl+Z goes to the store's op stack (`App.tsx:297`, `matrix/hooks.ts:6`) → partly holds (S1)
- `expect` sent around `toEngineData` → `api.ts:154-159`, `engine.ts:361-369` → holds
- `/schema` carries the lifecycle column for the grid → `app.ts:178-205` → does not hold today, and no task adds it (S2)
- `token_projection` owner-visible rule vs theatre marks → `migrate.ts:92` validates; marks arrive in Task 10 → does not hold in task order (B1)
- `Store` at `writes.ts:30-34`, built at `app.ts:163` → holds
- `WriteContext` carries no mode → `declare.ts:150-155` → holds
- `undoableBatch` refuses other accounts → `writes.ts:463-464` → holds
- First old, last new per field → `writes.ts:478-482` → holds
- `createAccount` needs an email → `auth.ts:80` → holds
- `whose()` reads the email → `history.ts:119-125` → holds
- Public-view guard, delete clears the token, `checkPublishable` → `views.ts:174-176`, `:273`, `:298-304` → holds
- Token cap 128 → `views.ts:33` → holds
- `seedDataset` "has rows" → `seed-missing.ts:48-49, 73-79` → holds
- Changing a default rebuilds the table → `schema-diff.ts:44-47` → holds
- `forPlanners`, `checkAssignee`, `checkItem` → `writers.ts:62-80, 130-139, 250-263` → holds
- `sjabloon_toepassen` → `packages/theatre/src/actions.ts:323-339` → holds
- Matrix validation → `validate.ts:160-190` → holds
- `pointsAt` → `access.ts:58-61` → holds
- Engine fixture `aantal` → `test/fixture.ts:111` → holds
- `state` already allowlisted, so `from_state` and `to_states` pass the vocabulary check → `scripts/vocabulary-allow.txt` → holds
- Toewijzing owner `persoon_id`, Persoon owner `id` → `packages/theatre/src/datasets.ts:133,160` → holds
- `actions.ts:56-96` → file has 84 lines → stale reference (Note)
- Task 0 line refs → record token is HEAD:62, Persoon HEAD:156 → minor slips (Note)

The first review (of blob 670d905) is in git at fbc0af1; the advisor's fidelity review at `specs/step-2/plan-review-advisor.md`.
