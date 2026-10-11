# Engine additions from the paper declarations: findings, before any code

Stefan, 2026-10-11, after reading `specs/step-2/paper-declarations.md`: "Write one finding that groups the accepted engine changes: C6 + C8 … S4 … C4 + C5 … C9. Mark C1, C3 and C10 as deferred until cargo is real. Drop S3, S5, S6 and S7. For each accepted change give the smallest design, the threats and the tests, as in the step 2 findings. Stop for my approval before building any engine change."

Read against `docs/SPEC.md` and `packages/engine/src` at main `67f9962`. Nothing here is built. Each change needs Stefan's approval and its spec line in `docs/SPEC.md` (the freeze list) before code.

## Decisions recorded

| # | Change | Decision |
|---|---|---|
| C6 + C8 | A link account writes a declared column; Attachment read and written by owners and link accounts | accepted |
| S4 | Non-relation action inputs | accepted |
| C4 + C5 | A hook mail carries the record link; several mails per hook | accepted |
| C9 | `$period: today` | accepted |
| C1, C3, C10 | Several owner columns; dry-run quote; administrator account routes | deferred until cargo is real |
| S3, S5, S6, S7 | Record-link counter; `ctx.count`; per-record renderers; visitor filters on public views | dropped |
| C2, C7 | Public create; board skin | not in this finding: already specified, built when a domain needs them |
| A1 | `exists`/`findBy` matching null | not now (Stefan left it to me, 2026-10-11): no domain in the repo needs it; built with the agency |

## F1. Owners and link accounts write declared columns, and attach files (C6 + C8)

**The need.**
- The agency's client says what to change when moving a deliverable to `aanpassen`.
- People on their own rows (technicians in the brief; in theatre, a person on their own Toewijzing) add notes, documents and photos.

**What exists.**
- A link account is read-only: `confineLinkActor` (`record-link.ts`) forbids every route outside `OPEN_TO_LINKS` with "A link opens only its own pages".
- `POST /act` writes exactly `{ [column]: to }` and nothing else (`action-token.ts`, the act route).
- An owner session writes its own rows through the writer, which decides per column. There is no declared limit on which columns an owner may write.
- Attachment is in the spec (`docs/SPEC.md:58`: entity, record_id, file, name, kind, show_on_publication; "inherits down a declared parent relation") and in the build order at step 4. None of it is built.

**Smallest design: columns.**
- A column may declare `owner_writable: true`. Validation refuses it unless the column is also `owner_visible`, and refuses it on the owner column, the lifecycle column, a `record_link.email` column, a json column, and a readonly column.
- An actor with role `owner` (a session or a link account) writes **only** `owner_writable` columns, on rows in its scope. Any other key in its body is 403 `column_not_owner_writable`, naming it. The check runs in `valuesOf` before the writer, so the writer still judges the value; for example, it refuses feedback once the deliverable has left `klant_review`.
- `confineLinkActor` opens `PATCH /rows/:dataset/:id` to link accounts. The scope and the column rule decide the rest. No create and no delete for links.
- `POST /act` takes optional `values` beside the choice: only `owner_writable` columns of the token's record, written in the same transaction and batch as the transition. A refused transition writes neither.

**Smallest design: Attachment.** The step-4 table, pulled forward without publication or inheritance.
- **Engine table** `attachment`:
  - fields: id, entity, record_id, kind, name, mime, size, sha256, uploaded_by, created_at, deleted_at;
  - index on (entity, record_id).
- **Declared per dataset:** `attachments: { kinds: { <kind>: <label> }, max_mb?, owner_visible?, owner_writable? }`.
- **Files** live in a directory given at start (`--files-dir`), named by their sha256, never by the uploaded name. The engine refuses to start when a dataset declares attachments and no directory is given.
- **Routes:**
  - `GET /attachments/:dataset/:id`: the list of a record's files.
  - `POST /attachments/:dataset/:id`: one file per request, with its kind.
  - `GET /attachments/file/:attachment_id`: the bytes.
  - `DELETE /attachments/file/:attachment_id`: a soft delete.
- **Reading** a file needs reading its record, in the actor's scope, plus `owner_visible` for an owner or a link. **Writing** needs the record writable plus `owner_writable` for an owner or a link. A link account may upload and delete its own uploads only.
- **Types:** an allowlist checked by magic bytes, not by the extension or the browser's claim: pdf, jpeg, png, webp. Default limit 10 MB.
- **Serving:** `Content-Disposition: attachment` (inline only for the image types), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, and `Cache-Control: no-store` for owners and links.
- Each upload and delete is a Revision entry under one batch, so undo removes an upload.
- **Out:** `show_on_publication` and inheritance down a parent relation (step 4, with Publication), image re-encoding and thumbnails.

**Threats.**

| # | Threat | Mitigation |
|---|---|---|
| 1 | A link or an owner writes a column it may not (mass assignment), or a row outside its scope | the `owner_writable` rule in `valuesOf` (403 naming the key); scope read 404 as today |
| 2 | A forwarded link writes in the subject's name | it can only write the declared columns and upload files, never transition outside a token or delete others' files; every write is logged as the link account; rotating the link stops it (as today) |
| 3 | Stored script in a text column or an uploaded file (HTML, SVG, a polyglot) | the grid renders text as text; uploads limited to a magic-byte allowlist without SVG or HTML; served as attachment with `nosniff` and a sandbox CSP |
| 4 | Path traversal or overwriting through the file name | files named by sha256 in the configured directory; the uploaded name is metadata only |
| 5 | Reading someone else's file by guessing ids | every read checks the record's scope and the owner-visible flag; unknown and forbidden answer the same 404 |
| 6 | Filling the disk, or exhausting memory with a huge upload | per-dataset `max_mb` checked while streaming (413 past it), a per-actor upload rate limit, the body limit on the route |
| 7 | A photo's location data reaching the client | open question 2 |
| 8 | A link writing during a race (two tabs, the planner editing the same row) | the writer's rules plus `expect` on lifecycle columns as today; a plain column is last-write-wins and revised |

**Tests (summary).**
- Validation:
  - `owner_writable` on a column that is not owner-visible, the owner column, the lifecycle column, json or readonly is refused;
  - `attachments` without a files directory refuses the start.
- Columns:
  - a link PATCH of an `owner_writable` column is 200 and revised as the link account;
  - another column is 403 naming it; another subject's row is 404;
  - a link POST or DELETE on `/rows` is 403;
  - `/act` with `values` writes the transition and the feedback in one batch; a refused transition writes neither.
- Files:
  - upload and read back by an editor, an owner and a link;
  - a disallowed type (svg, html, an exe renamed to .pdf) is 415;
  - over the limit is 413;
  - another record's file is 404, identical to an unknown id;
  - the response headers are as above;
  - undo removes the upload;
  - a link cannot delete an editor's file.
- Browser: the person-page or review flow attaches a photo and the planner sees it on the row.

## F2. Action inputs that are not relations (S4)

**The need.**
- "Shift a tour by N days" (an integer).
- The agency's monthly rollover gets its month passed in (a date), so the cron job runs one action in one batch and no domain code reads the clock.
- A short reason (text).

**What exists.** `ActionDecl.input` is `Record<string, { relation, label }>`. `idsOf` (`actions.ts`) refuses any input that is not a record id, and `run` receives each input as the related record.

**Smallest design.**
- An input is either `{ relation, label }` (as today) or `{ type: 'integer' | 'date' | 'text' | 'boolean', label, min?, max?, required? }`.
- The engine checks the type with the same `fits` the writes use, `min` and `max` for integers, a date in `YYYY-MM-DD`, and at most 500 characters for text.
- `run(record, input, ctx)` receives a scalar input as its value and a relation input as its record, as now.
- `/schema` serves the input types.
- The grid's action dialog renders a number, date, text or switch field beside the relation picker.
- The matrix `open.fill` keeps requiring exactly one relation input.

**Threats.**

| # | Threat | Mitigation |
|---|---|---|
| 1 | Out-of-range values: a shift of a million days, a huge text | declared `min`/`max`, the text cap, the type check before `run`; everything `run` returns still goes through the writers |
| 2 | A scalar used to build SQL in domain code | domain code writes through `ActionResult` and the writers only, never SQL; unchanged |

**Tests.**
- An integer outside `min`/`max`, a malformed date, an over-long text, a missing required input, and an unknown input key are each 400, naming the input.
- A valid input reaches `run` typed.
- "Shift a tour by N days" moves every activity in one batch, and one undo restores them.
- `/schema` and OpenAPI list the input types.
- The grid dialog sends a number.

## F3. A hook mail that carries the record link, and several mails per hook (C4 + C5)

**The need.**
- Cargo mails the tracking link with every status mail.
- The agency's review mail goes to the contact with a copy to the project's PM.
- A delivered shipment mails both the booker and the recipient.

**What exists.** `HookResult.mail(link)` receives only a freshly minted action-token link (`writes.ts` `enterState`), and returns one `Mail` with one `to`. `recordLinkFor` (`record-link.ts`) builds a record's current link.

**Smallest design.**
- `HookResult` gains `record_link?: true`.
- The `mail` callback becomes `mail?: (links: { token: string | null; record: string | null }) => Mail | Mail[] | null`. The single-argument form stays valid, so existing hooks are untouched.
- `record` is the current record link of the hooked record. It is given only when the dataset declares `record_link` and the engine has a link secret; otherwise null.
- At most 10 mails per hook. They are sent after commit, as today.

**Threats.**

| # | Threat | Mitigation |
|---|---|---|
| 1 | A long-lived record link or an action-token link mailed to someone other than its subject (several recipients, a CC to staff) | a mail whose text contains the token or record link must be addressed to one recipient, and only one mail per hook may contain each link. The engine checks this after the hook runs and fails the write with a domain error naming the hook, so a domain bug cannot spray a link. When `record_link.email` is declared, the record-link mail must go to that address |
| 2 | Links in logs | only the development mailer writes the outbox, as today; no other log line carries a link |
| 3 | A mail storm from one transition | the 10-mail cap |

**Tests.**
- A hook returning two mails sends both after commit and none on rollback.
- A hook returning 11 mails fails the write.
- The record link is passed only with `record_link: true` on a dataset that declares it.
- A link in two mails, or in a mail with two recipients, fails the write naming the hook.
- A record-link mail to an address other than the record's own `record_link.email` fails.
- The old one-argument hooks (theatre's invite) still send unchanged.

## F4. `$period: 'today'` (C9)

**The need.** A courier's or a technician's saved "Vandaag" view.

**What exists.** `PERIODS = ['week', 'next_week', 'month']` (`filter-compile.ts`), resolved in the server's local date (`filter.ts` `periodDays`).

**Smallest design.**
- Add `'today'` and resolve it to [today, today], in the same server-local date.
- The grid's date filter offers "vandaag".
- A saved view storing it reads the current day on every load.

**Threats.** None beyond today's `$period`: the value is checked against the list, and days are bound values.

**Tests.**
- `$period: 'today'` returns only today's rows and is applied on each read.
- An unknown period is still 400.
- The filter builder writes it, and a reload keeps it.

## Scope against the spec of record
- The `docs/SPEC.md` freeze list gains:
  - `owner_writable` on columns;
  - `attachments` on datasets with the `attachment` engine table and its routes;
  - typed action inputs;
  - `HookResult.record_link` and a list of mails;
  - `today` in the filter language.
- The Access table: a link account writes `owner_writable` columns and its own attachments, through `PATCH /rows` and `/act`.
- Attachment moves from step 4 to this addition, without publication and inheritance, which stay in step 4.
- The "out" column loses "notes written through the link" (`specs/step-2/spec.md` Out), which F1 now covers.

## Questions for Stefan
1. **Attachment now.** Pulling the table forward from step 4 changes the build order. Agree, with publication and inheritance staying in step 4?
2. **Photo location data.** Strip a photo's location and camera data on upload (a small image pass, more code), or keep files byte-for-byte and accept that a person's photo may carry where it was taken? Recommended: strip for owner and link uploads.
3. **Where files live.** A directory next to each client's database file (`--files-dir`, backed up with it). Agree?
4. **A1.** The agency's "one row per person, task and day" cannot be checked for a row without a task, because `exists`/`findBy` refuse a null in the match. Add "null means IS NULL" (small) with these changes, or leave it?
5. **Order.** Recommended: F4 (an hour), then F2, then F3, then F1 (the largest, with a threat model on the diff). Each its own branch and gate. Or F1 first, because step 6 (registration) and the agency both need it?

## Answers (Stefan, 2026-10-11)
1. Attachment now: **yes**, without publication and inheritance (step 4).
2. Strip a photo's location and camera data on owner and link uploads: **yes**.
3. Files in a directory next to each client's database (`--files-dir`): **yes**.
4. A1: "you choose". Ruling: not now — no domain in this repo matches a null today; AGENTS.md builds nothing before a domain needs it — cost if wrong: one small engine change when the agency lands.
5. Order: **F4, F2, F3, F1**, each its own branch and gate.
6. `ctx.findAll` (added by ruling in F2, outside this finding): **kept** — Stefan, 2026-10-11 ("go ahead", on the question).
7. F1 plan (`specs/attachments/plan.md` on `feature/attachments`): **approved**, subagent-driven — Stefan, 2026-10-11.
