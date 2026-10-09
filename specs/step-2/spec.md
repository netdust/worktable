# Step 2: Toewijzing slot-first, the lifecycle, person pages and agent tokens

Branch `feature/step-2`, cut from main at e080e02 (gate green: 1144 engine, 944 grid, 151 e2e). The design is `specs/step-2/findings.md` (40d91ed). Stefan's brief of 2026-10-09 is the source quoted below as "brief".

**Working assumptions.** Stefan has not yet answered the findings' questions; the plan lists the load-bearing ones (Q1, Q4, Q5, Q11, Q12) and two new ones (Q13, Q14) to answer before Task 0. This spec takes each recommended answer, marked `assumed (Qn)`. An answer that differs changes the requirement first, then the plan. Question 1 is confirmed by Stefan (2026-10-09): Beschikbaarheid.soort, Persoon_rol and plan-side cost move to step 3 with kandidaten.

## Requirements

**R1. The spec of record changes first.**
- `docs/SPEC.md` gets:
  - step 2's new row and gate;
  - the Toewijzing row (states with `voorlopig`, the transitions, `rol_id`, `aantal`);
  - the record token rewritten as two shapes, `record_link` and the action token;
  - Persoon without `token` and `user_id`;
  - the Access table's kinds (`link`, `service`);
  - the matrix's `open` declaration in place of the generic fill rule;
  - the new section "The engine's surface after step 2" (R12).
- Kandidaten and Beschikbaarheid.soort, Persoon_rol and plan-side cost move to step 3.
- It is written before any code, and only those lines are committed; Stefan's own uncommitted edits stay out.
- Source: AGENTS.md "Changing scope means editing it first"; brief "F5 … Add a section to the spec"; confirmed (Q1).

**R2. Lifecycle, an engine shape, opt-in.**
- A dataset declares `lifecycle: { column, transitions: [{ from, to, roles }], hooks?, token_projection? }`.
- A write changing `column` on an existing row is a transition. It is allowed only when a declared transition matches `(current, to)` for the actor's role; otherwise 422.
- A create is not a transition.
- A write may carry `expect: { <column>: <from> }`. A mismatch with the current value is 409 `transition_lost`. The grid sends the value it showed; a write without `expect` is judged on the current value.
- Each transition appends to Revision.
- Hooks are declarative (mint an action token, send a mail). They fire on entering a hooked state, by a transition or by a create through the API or an action, never through import, `--seed-missing` or undo. Their mail goes out after commit.
- Source: brief "A dataset declares transitions on a status column, the roles that may make each, and hooks. Each transition is a conditional update (WHERE status = from), a lost race answers 409, and each appends to Revision. Opt-in."; findings F3; assumed (Q10).

**R3. Undo of a transition.**
- Undo checks in an explicit undo mode: only the exact inverse of its own batch's transition, guarded by `changed_since`.
- An undo revokes the action tokens its batch minted.
- Source: brief F3; findings F3; assumed (Q2).

**R4. The action token, an engine shape.**
- An engine table holds tokens: 32 random bytes, sha256, constant-time compare, expiring, consumed on first use, bound to one record and one `from`.
- The page is `#/act/<token>`.
  - `POST /act/view` answers the declared minimal projection.
  - `POST /act` performs confirm or decline.
  - Reused, expired and other-record tokens all get one identical 401.
- Public, rate-limited, no CORS headers, Host check kept.
- The token stores its record and its owner subject at mint. The transition is made as that subject's link account, on that record only; a token whose record changed owner is refused. Its batch can only be undone by that account, which has no undo route. A refused transition does not use up the token, and minting revokes the record's earlier tokens.
- Source: brief "Single-purpose action tokens for confirm and decline, bound to one Toewijzing: 256-bit, hashed, constant-time compare, expiring, consumed on first use, acted on by POST from a confirm page with the token in the URL fragment (never GET). The confirm page shows only a minimal projection. Public routes are rate-limited, send no CORS headers, and keep the Host check."; assumed (Q11).

**R5. Toewijzing, slot-first (theatre).**
- `persoon_id` nullable, `rol_id` nullable, `aantal` default 1.
- State options: open, voorlopig, uitgenodigd, bevestigd, geweigerd, geannuleerd.
- A row with neither person nor name is valid only as `open` with a role. The duplicate-person rule applies to filled rows only.
- Transitions:
  - editor: open → voorlopig, uitgenodigd, bevestigd;
  - editor: voorlopig → uitgenodigd, bevestigd;
  - editor or the person's token: uitgenodigd → bevestigd, geweigerd;
  - any → geannuleerd;
  - geweigerd → uitgenodigd.
- The writer admits an owner's transition on its own row.
- Source: brief "Toewijzing, slot-first … geweigerd → uitgenodigd."

**R6. Invites.**
- A `Mailer` interface; the development mailer writes the outbox file. Sign-in moves onto it.
- The hook on a move to `uitgenodigd` mints the token and mails the invite.
- A person without an email gets no invite, and the reply says so in Dutch.
- Source: brief "Invites. A mailer interface that writes an outbox file in development … A person without an email gets no invite, and the reply says so in Dutch."

**R7. Templates with slots.**
- Sjabloon items take an optional `slots: [{ rol, aantal }]`, the role by its title (the natural key, so a seeded template works on any database), validated by the writer.
- Applying creates the open Toewijzingen in the same batch, so one undo removes everything.
- `--seed-missing` adds config rows by missing natural key, never updating, so a migrated database gets a slotted "speeldag".
- Source: brief "Templates with slots …".

**R8. The matrix open column and the fill action.**
- `MatrixDecl.open: { match, count, fill }`.
- Per activity row, the open column shows the summed `aantal` and the role labels. Free-text names stay under "extern".
- Choosing a person in an open cell asks the role first when there is more than one, then runs the domain action `vul_slot`:
  - aantal 1 fills the row;
  - aantal > 1 lowers it by one and creates a filled row;
  - it writes `voorlopig`.
- Actions may return updates as well as creates. One undo reverses the fill.
- Source: brief "The matrix. An "open" column per activity row with the summed aantal and role labels, with free-text names under "extern". Choosing a person in an open cell runs a theatre action that splits the slot when aantal > 1 (F4). Undo uses the existing batch undo."; assumed (Q3, Q12).

**R9. Person pages.**
- **The link:** `record_link` in an engine table. It is an HMAC token from a secret file and a version. An administrator re-copies it at any time; rotating or revoking bumps the version.
- **The link actor:** an owner account of kind `link`. It is read-only, and reaches only the views for owners.
- **Views for owners:**
  - Only query views with an owner column qualify.
  - A column is admin-only unless the domain marks it `owner_visible`. Publishing a view with an unmarked column is refused, naming it.
  - Filter, sort and group on a column that isn't owner-visible are refused for a link actor.
- **Headers:** responses send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
- **`POST /record-links/request`:** rate-limited, one identical answer for every address. It sends links only to addresses already on a live record, and never creates or revokes anything.
- **Membership (theatre):** the query `mijn_producties`. A person is in a production while they hold a bevestigd assignment on it, until `toegang_dagen` (parameter, default 30) after its last activity.
- **Admin-only in theatre:** rates and amounts, dietary and health notes, absence reasons, other people's contact data, free-text notes.
- Source: brief "The stable person link and published views (F1) … Theatre marks the member-visible columns."; assumed (Q4, Q5).

**R10. Agent tokens.**
- A service account is an account of kind `service`, created from the CLI, with a name and a role (editor by default, administrator only when given). Its token is hashed and shown once.
- It authenticates by Bearer token. Its writes log it as the actor, and it undoes its own batches.
- It cannot mint or rotate links, publish, or manage accounts. Rate-limited.
- `/schema?format=openapi` serves an OpenAPI 3.1 description.
- Source: brief "Agent tokens (F2) …"; assumed (Q7, Q8).

**R11. Migration on a copy.**
- `rol_id` and `aantal` are added to `toewijzing`; the account columns and the two engine tables are added.
- Imported rows keep a null role. Value parity stays at 0 mismatches. `.pre-migrate` is written first.
- Task 7 on real data is Stefan's: the plan prints its commands and runs none.
- Source: brief "Migration on a copy …" and "Task 7 on real data is mine, so give me the commands and run none"; assumed (Q5: no `link_versie`).

**R12. The engine's surface after step 2.**
- The spec's new section lists every shape, engine table, route and CLI command, as findings F5. Anything else needs a finding.
- Source: brief "F5, the engine's surface."

## Out
- Candidates and conflicts, Beschikbaarheid.soort, Persoon_rol and plan-side cost (step 3; confirmed Q1).
- Uploads and documents.
- The board skin, public create, mail delivery.
- Notes written through the link.
- The assignee tag list and undo of a delete.
- Cutting owner accounts to owner-visible columns: the spec line changes now, the build comes later (assumed Q9).

## Done when (the brief's gate, in a browser, on invented fixtures)
1. A four-day template with slots is applied, and the matrix shows the open counts.
2. Assigning a person with an email puts the invite in the outbox.
3. A person confirms from the link without logging in.
4. A reused or expired link is refused, and a token for slot A can't act on slot B.
5. A decline shows geweigerd for the planner.
6. A disallowed transition is refused, and two simultaneous confirmations give one success and one 409.
7. Filling one of an aantal 3 slot splits it, and one undo reverses it.
8. A person's link returns their project overview and nothing else.
9. A script requests every view for owners with an ordinary person's token and finds no key outside the owner-visible columns.
10. A revoked or rotated link is refused.
11. The link request gives byte-identical answers for known and unknown addresses.
12. A declined or merely invited person can't open the project.
13. An agent token's write is logged as the service account, undone by batch, and refused after revoke.

After the gate:
- A paper declaration of cargovelo-core and of the studio draft against the built engine, read-only, reporting every engine change either would need.
- The same four-item report, plus the matrix findings.
