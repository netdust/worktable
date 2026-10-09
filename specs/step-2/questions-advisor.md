# The seven questions before Task 0: an independent view

Advisor, 2026-10-09, read-only, on `feature/step-2` at f8621fc. For each: my recommendation and what decides it, where I differ from the plan's recommendation, whether it is Stefan's call or an engineering default, and what overturning it later costs.

**Summary.** I agree with all seven recommendations. I disagree on how many need Stefan: by a strict reading only Q14 needs his hand (it is his staged work) and Q1 his nod (it is a scope line in the spec of record). Q4, Q5, Q11 and Q13 are engineering defaults that follow from the code and AGENTS.md; report them in one line each. Q12 is a product call, but flipping it later costs one constant, so take the default and say so. Task 0 should not wait on anything but Q14.

---

## Q1. Beschikbaarheid.soort and Persoon_rol: step 2 or step 3?

**Recommendation: step 3, with kandidaten.** The brief's "In scope" list is exhaustive and names neither; its "Out" names kandidaten for step 3, and `kandidaten` is the only consumer of Persoon_rol (`docs/SPEC.md:204`: "Toewijzing ⋈ Persoon_rol on rol ⋈ Beschikbaarheid"). The person page's role label comes from `toewijzing.rol_id`, not Persoon_rol. Nothing in step 2's gate reads `soort`.

**Agree with the plan.**

**Stefan's call?** Formally yes: `docs/SPEC.md:262` puts them in step 2, and AGENTS.md says scope changes are an edit to the spec first, by the owner. But the brief already made the call by omission. Ask for a nod in one line, do not block on it.

**Cost if overturned later:** additive. Persoon_rol is a new dataset (a `create` migration step, `migrate.ts:94`), `soort` a nullable or defaulted column (ALTER, `schema-diff.ts:78`). No engine change, no rework of step 2's code.

## Q4. `for_owners` and `owner_visible`, or `published` and `member_visible`?

**Recommendation: `for_owners` and `owner_visible`.** Two reasons. The engine's actor is `owner` and its scope is the owner column (`access.ts:45-69`); a flag that means "visible to the row's owner" should say so, and "member" is a domain idea (membership is theatre's `mijn_producties` query). And "publish" already has two meanings in the spec: the share token (`docs/SPEC.md:55`, `PUT /views/:id/share-token`) and the Publication snapshot (`:68`, `:234`); a third would collide exactly where the two kinds of view must never be confused.

**Agree with the plan.**

**Stefan's call?** No. AGENTS.md fixes the rule (engine names are English and generic; domain names are Dutch), and these are engine names. Stefan wrote `member_visible` in the brief as a description, not a specification of an identifier. The words he will see are the grid's Dutch labels. Take the default and report it in one sentence.

**Cost if overturned later:** before Task 9, a find-and-replace in `specs/step-2/*` and the F5 section. After Task 9, a mechanical rename: the `saved_view` column (a dropped-and-added column rebuilds the table, `schema-diff.ts:88-90`), `ColumnDecl`, routes, `/schema`, the grid, tests, spec. Half a day, no design change.

## Q5. The link version in the `record_link` engine table, or `link_versie` on Persoon?

**Recommendation: the engine table.** One reason decides it: undo restores any domain column (`writes.ts:511-529`), so an administrator could undo the batch of a rotation and un-revoke a link; engine tables are never undone, because `touchedBy` refuses an entity that is not a domain dataset (`writes.ts:475-476`). The spec already keeps per-record engine state in tables keyed on `(entity, record_id)` (`docs/SPEC.md:48`). Two smaller reasons: the vocabulary check would ban `link` across the engine (`scripts/check-vocabulary.ts:42-52`), and the migration loses an `ALTER` on `persoon`.

**Agree with the plan.**

**Stefan's call?** No. The brief specifies the behaviour (stable link, admin re-copies, rotate or revoke bumps a version, secret in config), and the table meets every line of it; where the version is stored is implementation. The brief's "rol_id and link_versie are added by ALTER" is a consequence of its own placement, not a requirement. Report it with the un-revoke sentence; that is the sentence that would make him agree.

**Cost if overturned later:** before Task 9, the spec section. After Task 9: a nullable integer on `persoon` by ALTER, `recordLinkFor` and `verifyRecordLink` read the column instead of the table, the rotate must be recorded under a batch kind undo refuses (a new kind, the growth rule allows it), an allowlist line for `link`. A day, and the un-revoke hazard needs its own test.

## Q11. A person's confirmation logged as their link account?

**Recommendation: yes.** Every actor the engine audits is an `account.id`: `revision.actor_id` (`revision.ts:14`), `batch.actor_id` (`engine-tables.ts:86`), `undoableBatch` (`writes.ts:463-464`), `history.whose()` (`history.ts:119-125`). The only alternative actor is the system owner `-1`, which runs as `administrator` (`seed-missing.ts:38`) and so bypasses the role table, and whose batches any account may undo if the kind allows (`writes.ts:463-464`). As the link account, the role check runs as `owner` (the role the brief gives those two transitions), and the owner scope in `runWrite` (`writes.ts:357-362`, `access.ts:63-69`) binds the token to its own slot a second time. And F1 needs the same account row for the person page anyway; refusing it here only moves the row's first appearance.

**Agree with the plan.**

**Stefan's call?** Engineering default, with one sentence he must see: `docs/SPEC.md:306` says "Invites and actions go by email carrying a signed link; no app, no account". The link account is not an account in that sense: no email, no magic link, no cookie (`sessionMiddleware` admits `kind = 'user'` only). The spec line should say "an internal actor row, never a sign-in". That is the only way he could object, and it is a wording fix.

**Cost if overturned later:** after Task 3, the `/act` actor is rebuilt: a new batch kind `token` that undo refuses, the transition run as `-1` with the role check special-cased, history showing "systeem" instead of the person's name (a worse product), and the slot binding carried by the token alone. A day, and the F1 link account still exists.

## Q12. The matrix fill writes `voorlopig`?

**Recommendation: `voorlopig`.** The brief defines it: "pencilled in, not asked yet", from the Koksijde sheet's yellow "?". Filling an open slot from a template is that act. If the fill wrote `uitgenodigd`, every exploratory fill would mail a real person, and the mail cannot be recalled by undo (the plan's threat 7; an undo only revokes the token). The planner moves the row to `uitgenodigd` when the plan is firm, and that move mails.

**Agree with the plan.**

**Stefan's call?** This is a product behaviour (does picking someone in the open column email them?), so it is his in principle. But the brief's own definition of `voorlopig` answers it, and flipping it is one literal in `vul_slot` (`state: 'voorlopig'`), its tests and one e2e flow. Take the default and report it; do not spend his time on it before Task 0.

**Cost if overturned later:** near zero at any point.

## Q13. Assigning in the grid invites at once?

**Recommendation: yes, a create into a hooked state fires the hook** (through `POST /rows` or an action; never import, seed-missing or undo). Two facts decide it. The spec already says so: "Assigning sets state to `uitgenodigd` and sends the invite; the person confirms or declines from their signed link" (`docs/SPEC.md:232`), and gate line 2 ("assign a person with an email, with the invite in the outbox") is one step. And the grid already sends the state on create: the matrix sends the typed key's value (`store.ts:142-149`, keys `u/b/g/x` at `datasets.ts:167`), and the people picker sends the column default, `uitgenodigd` (`Links.tsx:144`, `datasets.ts:179`). Typing `b` or picking `voorlopig` mails nothing, which is the brief's "(no invite)" on a direct `bevestigd`.

The alternative (the writer creates `voorlopig` when no state is given) does not reach the picker or the matrix, since both give a state; it would need the column default changed (a table rebuild, `schema-diff.ts:46-47`) or the grid changed. More churn for the same outcome.

**Agree with the plan.** One reading of the brief to settle in passing: "editor: open → voorlopig, uitgenodigd or bevestigd (no invite)". I read "(no invite)" as qualifying `bevestigd` (confirming directly needs no invite), not the whole line; the other reading would mean an editor's `open → uitgenodigd` never mails, which contradicts `docs/SPEC.md:232` and gate line 2. Say which reading the plan took; that is the one sentence worth Stefan's eye here.

**Stefan's call?** No. The spec of record already decides it. Report it.

**Cost if overturned later:** one branch in the lifecycle runner (fire on create or not) and the writer's create default. Small.

## Q14. Stefan's staged `docs/SPEC.md` edits

**Recommendation: he commits them now, on this branch, before Task 0.** They are 18 lines documenting behaviour main already ships (`links`, `of`/`creates`, `source_display`, the sidebar, `$like`/`$period`, `/history`; all present in the code, e.g. `engine-tables.ts:95`, `queries.ts:46-55`), and they touch the same table rows Task 0 rewrites (`docs/SPEC.md:43, 44, 46`). Committed first, Task 0 edits on top of them and the spec of record is whole. Folded into Task 0, one commit mixes his documentation of steps already done with step 2's scope change, which a reviewer or a later `git blame` cannot separate.

**Agree with the plan.**

**Stefan's call?** Yes, but as an action, not a decision: nobody else commits his staged work (and `~/.claude/CLAUDE.md` §4 forbids parking it in a stash). It is one command. If he is away, the plan's Task 0 fallback stands (build the blob from `HEAD:docs/SPEC.md`, commit by index, keep his edits in the working file), so this does not block the branch either.

**Cost if overturned later:** none technical. If he folds them in, the step-2 commit carries unrelated doc lines; recoverable with a split, never worth the time.

---

## What I would actually send Stefan

Two lines and a request, not seven questions:

1. "Please commit your staged `docs/SPEC.md` edits on `feature/step-2` (or say 'fold them in'). Task 0 edits the same rows." (Q14)
2. "Confirming the brief: Beschikbaarheid.soort, Persoon_rol and plan-side cost move to step 3 with kandidaten, and the spec's step 2 row says so." (Q1)
3. Reported as taken, with the one sentence each that would make him overturn it: the engine names `for_owners`/`owner_visible` because "publish" already means the share token (Q4); the link version in an engine table because undo could otherwise un-revoke a link (Q5); the confirmation logged as the person's internal actor row, never a sign-in, with `docs/SPEC.md:306` reworded to say so (Q11); the fill pencils in as `voorlopig` and mails nothing, the move to `uitgenodigd` mails (Q12); assigning as `uitgenodigd` in the grid mails at once, as `docs/SPEC.md:232` says, and "(no invite)" read as "a direct `bevestigd` needs none" (Q13).
