# Review of `specs/step-2/findings.md` (uncommitted, 227 lines)

Advisor, 2026-10-09, read-only. Every file:line below was re-read on `feature/step-2` at e080e02. Findings line numbers refer to `specs/step-2/findings.md`.

## Blocking

**B1. F3's race guard cannot produce the 409 the gate needs (findings.md:160-161, 167).**
`runWrite` reads the current row and updates it inside one synchronous `sqlite.transaction(...).immediate()` (writes.ts:376-395), and `undoBatch` likewise (writes.ts:538-551). Bun runs requests on one thread and nothing awaits inside those transactions, so two confirmations never interleave: the second one reads the row *after* the first committed. If "from" is the row's current value, `UPDATE … WHERE <column> = <from>` always matches, and "zero rows changed" never happens. Worse, a second `PATCH { state: 'bevestigd' }` on a row already `bevestigd` is today a no-change 200 with `batch_id: null` (writes.ts:388-389, test/batches.test.ts:301), not a 409. The 409 only exists when the caller states the `from` it expects and the engine compares that with the current value inside the transaction. The finding must say where that expected `from` comes from: the action token carries it by declaration (confirm is `uitgenodigd → bevestigd`); a grid cell edit or an agent PATCH must send it (a transition body or route; the plan's choice), or keep today's idempotent no-op. Without this the test on line 167 is unachievable and the gate line "two simultaneous confirmations give one success and one 409" has no mechanism. The same applies to line 161: the "conditional update" on undo is redundant with `changed_since` inside the immediate transaction; say so rather than build dead code.

**B2. Nothing designs the action token or the lifecycle shape itself (scope table findings.md:14; F3 assumes both).**
The brief's in-scope list specifies the token (256-bit, hashed, constant-time, expiring, consumed on first use, bound to one Toewijzing, POST from a page with the token in the fragment, minimal projection, rate-limited, no CORS, Host check) and the lifecycle declaration (transitions, roles, hooks). F3 refers to "the person's action token", "the table", "hooks" and "the invite written to the outbox" (findings.md:160-163) but no finding says: the token's table and columns, who mints it (a hook? the engine?), what a hook may do, the projection route, its actor, or what `DatasetDecl.lifecycle` looks like. The scope table says the spec paragraph "becomes two shapes" and names only one. Per AGENTS.md the spec is edited first, and this shape is the one the gate drives most. Add a short lifecycle section (shape, hook contract, action token) or widen F3; the spec edit cannot be written from what is here.

## Should fix

**S1. Log a token confirmation as the person's `kind: link` account, not under a new batch kind `token` (findings.md:163, 170).**
With F1's account kinds this is strictly better: (a) the audit names the person, not "a token"; (b) `undoableBatch` already refuses every other account (writes.ts:463-464) and link actors have no undo route (F1 item 7), so nobody can undo it without a new kind; (c) the lifecycle's role check runs as `owner`, which is the role the brief gives those two transitions, whereas a transition logged under the system owner `-1` would run as `administrator` (seed-missing.ts:38) and bypass the role table; (d) `scopeOf` on Toewijzing (`owners.owner = persoon_id`, datasets.ts:160; access.ts:63-69) enforces a second time that a token for slot A cannot act on slot B, because the actor's subject must equal the row's `persoon_id`. Two consequences to name: the link account row is created on the token's first use as well as on the link's (F1 item 6), and `whose()` must show something for an account with `email NULL` and `name NULL` (see S5). Also, the Toewijzing writer refuses every owner write today (`forPlanners`, writers.ts:62-80, 147-157); the writer must admit an owner's transition on its own row, as SPEC.md:178 already promises. Name that as theatre work.

**S2. Creates and imports meet the transition check too; the finding does not say what a create may start as (findings.md:160).**
A check "beside `valuesOf`" runs for creates (writes.ts:330-338), for `--seed-missing` as the system administrator (seed-missing.ts:53-56) and for import (import.ts:162, administrator). The import sets `state` on every Toewijzing row ("the exporter always emits status", SPEC.md:145) and seeds insert `bevestigd` rows. The lifecycle declaration needs a create rule: a create is not a transition (any state the role may reach, or any state at all for an administrator). Say which, and that the parity run on the real export must stay at 0 mismatches under it.

**S3. Hook side effects must wait for commit (findings.md:162; F1 item 9).**
A hook that "runs in the same write" and sends mail through the Mailer would send from inside a transaction a later writer refusal rolls back (actions roll back all creates on one refusal, actions.ts:75-96). Sign-in already solves this with a timer after the response (auth.ts:124-125). Make the hook contract declarative: a hook returns what to mint (the action token row, inside the transaction) and what to mail (sent after commit). This is also the answer to Question 2's mechanism: an undo of `open → uitgenodigd` can revoke the action tokens the batch minted (an engine table, never undone) instead of relying on a later 409.

**S4. F4 does not say which state a fill writes, and the action input cannot carry it (findings.md:183, 187).**
`ActionDecl.input` takes relations only (declare.ts:163; `idsOf` demands record ids, actions.ts:41-53). The brief lets an editor move `open → voorlopig | uitgenodigd | bevestigd`, and the matrix's `keys` are typed per state (datasets.ts:167). Either the fill always writes one state (then say which, and that the invite follows from the lifecycle hook), or inputs gain an options kind. Related: Question 3's option (a) is not a second input; it is choosing *which open row* the action runs on (the action's `id`), so "exactly one relation input, to the across dataset" (line 183) still holds. Say so, or the plan will add an input.

**S5. The account migration and history need three lines the condensation lost (findings.md:50, 97, 106).**
- `UNIQUE (email COLLATE NOCASE)` (auth-tables.ts:22) admits several NULLs on SQLite, fine; but a `CHECK ((kind = 'user') = (email IS NOT NULL))` keeps a user without an email and a service with one out, and `createAccount` goes through `emailOf` (auth.ts:80), so service and link creation need their own path.
- `whose()` (history.ts:119-125) resolves an actor by `account.email`; `COALESCE(email, name)` (F2 item 5) still yields `null` for a link account. Define it: `by: 'account'` with the subject's title, or a new `by: 'link'`. Planners will read "bevestigd door …" in history; this is the line that decides what they see.
- The condensed F1 item 6 says "a nullable name"; F2 says "a unique name". Both are right (unique among services); say it once.

**S6. `aantal` will fail `bun run check` the moment theatre declares it (brief; findings.md silent).**
The vocabulary list is every domain column name split on `_` (scripts/check-vocabulary.ts:42-52), scanned over all of `packages/engine` including tests. The engine fixture already has a column `aantal` (test/fixture.ts:111) and tests name it. Add `aantal` to `scripts/vocabulary-allow.txt` with a reason, or rename the fixture column, in the plan's first task. (`rol` is safe: the engine says `role`, and words split on non-letters.)

**S7. F5 contradicts F1's names (findings.md:209, 211).**
Line 209 lists "published views with member-visible columns" and line 211 "person links"; F1 settled on `for_owners`, `owner_visible` and record links, and "person" is a domain word. The freeze list is the section a later session reads first; it must carry the decided names (or both until Question 4 is answered, marked as such).

**S8. Question 6 is engine-internal; make it the default (findings.md:224).** Creating the link account on the first verified request (and on the token's first use, S1) needs no decision from Stefan; the email route stays write-free either way.

**S9. Questions missing (findings.md:216-227).**
- Which state a fill writes (S4), unless it becomes a default.
- Whether the grid's cell edit sends an expected `from` (B1): this changes the grid and the API, so it is Stefan's.
- Whether a token transition is logged as the person's link account (S1): it changes what history shows, so it is Stefan's.
- Question 5 should name the migration consequence: with `record_link` in an engine table, Task 7's "rol_id and link_versie are added by ALTER" becomes `rol_id` and `aantal` only.

## Notes

**N1. Line claims to correct.**
- findings.md:150 "writes.ts:453-467": 453 is blank; 454-467.
- findings.md:151 "`changed_since` (writes.ts:495-499)": the column check is 500-502 and the created-record check 504-507; 495-499 are the target, scope and deleted checks.
- findings.md:152 "writes.ts:330, 519": the undo's `valuesOf` call is 523; 519 is `inUse`.
- findings.md:154 "writes.ts:461-462": the check is 463-464. The sentence overstates: a system batch falls through to the kind check, and every system batch today is `seed` (not undoable, test/batches.test.ts:140) or has no batch row (migrate.ts:106-109, not undoable). "Could be undone by any account *if it were of an undoable kind*" is the true claim, and it is still the right argument against logging a token transition under `-1`.
- findings.md:178 "datasets.ts:161-172": 161-171.
- findings.md:204 "engine-tables.ts:41" is right; `_migrations` (engine-tables.ts:6) is a ninth engine table the freeze list should name, since `reservedNames` includes it (engine-tables.ts:43).
- All other file:line claims in F1-F5 and the scope table check out (re-read: auth.ts:39-40,111,117-127,140-144,156-187; auth-tables.ts:11,22; access.ts:21-37,63-69; rows.ts:24-41,81,88; params.ts:114-156; views.ts:298-304,331-342,355,475; writes.ts:243-246,384-393,463-464,475-476; actions.ts:72-74; declare.ts:51-61,76-99,131-142,160-165; history.ts:119-125; serve.ts:211-232,285-297; app.ts:62,169-208; store.ts:219,229; writers.ts:222-233; datasets.ts:126-151; SPEC.md:43,46,48,55,60,66,70,81,160,170,262,292).

**N2. F3 item 2 is otherwise sound.** Undo restoring the lifecycle column through the writer (`restore` → `valuesOf` → `writer.update`, writes.ts:521-524) with the check in "inverse" mode is right, provided the check is told it is an undo and verifies the inverse against the batch's own revision (first `old`, last `new`, writes.ts:478-482), not the table. The finding should say the check takes that mode explicitly; "without consulting the table" alone leaves the implementer to guess how `valuesOf` knows.

**N3. F4: validate `match` as a relation column and `count` as an integer column** next to the existing matrix checks (validate.ts:160-190); the open column's labels are the match target's titles through `lookups` (rows.ts:71-90), which is why `match` must relate. Also note that the Toewijzing writer refuses a row with neither person nor name today (writers.ts:130-138), so the undo of an `aantal 1` fill (line 193) only works once the writer accepts `open` rows with a role, which the brief changes anyway.

**N4. F4's `updates` must be read in scope** as `readRecord` does for the action's record (actions.ts:56-63): an update naming a row outside an owner's scope is 404, and the update's `ctx.current` must be the live row, as `runWrite` builds it (writes.ts:378-379). Say so, since the existing action tests cover creates only (test/actions.test.ts:115-131).

**N5. Freeze list completeness (findings.md:207-212).** Name the CLI as surface too (`--fresh`, `--import`, `--seed-missing`, account and service commands, `--link-secret-file`), the Mailer interface, and the new engine tables by name (`record_link`, the action token table). The `/public/views`, `/owner/*`, `/record-links/*`, `/sources/:name/display` and `/auth/*` routes are implied by "grouped"; listing them costs five words each and is what the rule "anything else needs a finding" bites on.

**N6. Condensation of F1 and F2: nothing material lost.** Dropped and fine to drop: `limit`/`offset` on the owner rows route (defaults apply), `/auth/me` for a link actor, the secret's permission check wording, OpenAPI `info` fields, the 5000 limit test, the note that a link actor's OpenAPI is 403. One small distortion: F1 item 8 says publishing for owners is refused "for a public view" but the reverse (`PUT share-token` on a for-owners view, `already_for_owners`) is only in item 1; fine as long as item 1 stays. F2 item 3 "it never gets a cookie" and item 4 match the draft.

**N7. Questions 2, 8 and 9 are well posed.** Question 2 gets a better default from S3 (revoke the minted tokens on undo; the mail stays sent). Question 9's recommendation (change the spec line now, build later) is the honest one; add that until then an owner account and a link for the same person see different columns.
