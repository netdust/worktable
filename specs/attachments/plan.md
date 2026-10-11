# F1: Owner-writable Columns and Attachment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Files attached to any record, read and written by planners from the drawer and, where a dataset allows, by owners and person links; a person link writes only columns a dataset declares `owner_writable`.

**Architecture:**
- An engine table `attachment` and a dataset key `attachments`. Files sit on disk under `--files-dir`, named by sha256.
- Four routes, mounted after sign-in like every other route. `writeGuard` keeps its site check for all of them and skips only its JSON and 64 KB checks for the upload path, which then requires `application/octet-stream` and the dataset's `max_mb`.
- A dedicated undo branch for attachment batches.
- A byte-level metadata stripper for jpeg, png and webp.
- `owner_writable` checked for link accounts at the link's PATCH and at `/act` `values`, before `ownBody`/`cutBody`.
- `confineLinkActor` made method-aware.
- Theatre declares attachments on three datasets; the grid's row drawer lists and uploads them.

**Tech Stack:** Bun, Hono, SQLite, TypeScript; Bun tests (engine, theatre), Vitest (grid), Playwright (e2e via `/shakeout`).

**Spec:** `specs/attachments/spec.md`. Design: `specs/engine-additions/findings.md` F1. Review: `specs/attachments/plan-review.md`.

**First working version:** Task 3, where a planner attaches a file to an activity in the running grid. Tasks 1 and 2 are the engine it stands on.

**Simplest design.** Store files as BLOBs in SQLite and serve them from a single route, editors only. The plan does not use it:
- Stefan chose files beside the database (answer 3);
- a BLOB makes every backup and migration copy carry the files;
- owners and links are in scope (R4).

Everything else stays minimal: one guard extended rather than a second one, raw-bytes upload (no multipart parser), content-addressed files, byte-level stripping (no image library), and a named undo branch rather than a general engine-table undo.

## Global Constraints
- `packages/engine` knows no domain word. Engine names are English and generic; user strings are Dutch (`apps/grid/src/i18n.ts`).
- `docs/SPEC.md` lines come first in the task that needs them:
  - Task 1: the Attachment row as built (without publication and inheritance); `attachments` on Dataset; the four routes on the freeze list; `--files-dir` in the CLI row; `SPEC.md:56`, where an attachment delete is undoable.
  - Task 4: `owner_writable` on columns; the Access table, where a link account writes `owner_writable` columns and its own attachments.
- No client data; fixtures are invented. Run `bun scripts/check-export-terms.ts` before every commit and commit by path.
- The gate is `bun run gate`. Never touch ports 4330/5180/4341/5181 or `~/laika-export`.
- Every refusal of an actor is asserted, not only the allowed path.
- One code per refusal:
  - 403 `forbidden_site`;
  - 415 `bad_content_type`, 415 `bad_file_type`;
  - 413 `body_too_large`;
  - 404 `unknown_attachment`;
  - 403 `column_not_owner_writable`;
  - 400 `bad_kind`, 400 `bad_name`;
  - 429 `rate_limited`.

## Threat model

**Assets:** the files (contracts, receipts, photos of people and places); write access to records; the long-lived person link; the server's disk.

**Attacks and their mitigations (where each lives):**
1. **Script in a file opened from the grid's origin.** An editor-, owner- or link-uploaded HTML, SVG or polyglot file runs script when opened.
   - A magic-byte allowlist in `attachments.ts` `sniff`: pdf `%PDF-`, jpeg `FF D8 FF`, png `89 50 4E 47 0D 0A 1A 0A`, webp `RIFF....WEBP`.
   - The stored mime is the sniffed one, never the client's.
   - Downloads are served with `Content-Disposition: attachment` (inline only for jpeg/png/webp), `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, plus `Cache-Control: no-store` for owners and links.
2. **Path traversal or overwrite through the uploaded name.**
   - Files are stored as `<files-dir>/<sha256>`.
   - The name is metadata only: at most 200 characters, control characters refused.
   - `filename*` is RFC 5987-encoded (`attachments.ts` `dispositionOf`).
3. **Reading another record's file by guessing ids (any actor).**
   - `attachments.ts` `readable` loads the attachment, then its record through `visibleSource`, `scopeOf` and `inScope`, then checks `owner_visible` for an owner or link.
   - Every failure answers the same 404 `unknown_attachment`.
4. **An owner or link lists, uploads or deletes on a record it may not read or write.**
   - The same scope read as attack 3.
   - Upload needs `attachments.owner_writable` for an owner or link.
   - An owner or link deletes only its own uploads (`uploaded_by`); editors may delete any.
5. **Exhausting memory with a huge upload, or making the engine read bodies it will refuse.**
   - A `Content-Length` is required and `Transfer-Encoding` refused (411); a declared length over `max_mb` is 413. Bun's server holds the body to that length.
   - The record, content type, kind, name, writer and rate-limit checks all run before a byte is read (`checkUpload`).
   - A per-actor upload limit of 30 a minute (`checkLimits`, 429).
   - Filling the disk is not mitigated in this step: see Deferrals.
6. **A cross-site page posts a file with the user's cookie.**
   - `writeGuard`'s site check stays on the upload path.
   - `application/octet-stream` is required, which is not CORS-simple, so a form cannot send it (415 otherwise).
7. **A photo carries where it was taken.** `strip.ts` runs before hashing and storing:
   - A keep-list: a jpeg keeps its decode segments and its JFIF, ICC and Adobe APPn; a png its image, colour and animation chunks; a webp its image, alpha, animation and ICC chunks (VP8X flags cleared, RIFF size fixed). Everything else goes.
   - Nothing after a jpeg's first EOI, a png's IEND or the RIFF end is kept.
   - It writes back a minimal Exif APP1 with only Orientation when the original had one.
   - A file it cannot walk is refused (415), never stored unstripped.
8. **A person link writes a column it may not (mass assignment).**
   - The link checks on `PATCH /rows` (in the route, before `runWrite`) and on `/act` `values` refuse any key not `owner_writable`: 403 `column_not_owner_writable`, naming it.
   - The check runs on the raw body, before `ownBody`/`cutBody`, which would silently drop a key and hide the refusal.
9. **A forwarded person link writes in the subject's name, or reads the whole row back through the write's reply.**
   - Limited to `owner_writable` columns and its own uploads.
   - Logged as the link account in Revision.
   - Rotating the link stops it (existing).
   - A link's `PATCH` replies `{ id, revision }` only, never the row (`app.ts`, the reply for `actor.kind === 'link'`).
10. **A link reaches DELETE on rows through the widened path fence.** `confineLinkActor` matches method and path:
    - `GET /api/auth/me`, `GET /api/owner/views…`;
    - `PATCH /api/rows/:dataset/:id`;
    - `GET`/`POST /api/attachments/:dataset/:id`, `GET`/`DELETE /api/attachments/file/:id`.

    Nothing else: no `POST` or `DELETE` on rows, no `/actions`, no `/batches`.

**Deferrals:**
- **Malware in a pdf:** not scanned. Files are served as downloads with `nosniff` and never rendered by the grid.
- **PDF metadata** (author, software): kept. Stripping needs a pdf parser, and the location risk is in photos.
- **Files on disk after a soft delete:** kept, because undo needs them. No garbage collection in this step.
- **Image re-encoding:** out.
- **A link account opening a file:** a plain `<a href>` cannot send the link's header. Step 6 owns that screen (fetch to blob).
- **Total disk use:** no per-account byte quota. The rate limit bounds how fast one account writes (30 × `max_mb` a minute), not how much. Deferred until owners or links upload (step 6); in theatre only editors upload today. A failed insert removes the file it wrote, and a failed rename its `.tmp`.
- **What the kept colour segments still say:** an ICC profile is kept whole, and its header can name the device's make and model; a jpeg's JFXX APP0 can hold a thumbnail of the photo (its pixels only, no location); Adobe's APP14 is kept for its colour transform; a webp `ANMF` frame is copied whole, its sub-chunks not walked.

## Test map

| Unit | Seam | Tier | File | Command | e2e flows (`/shakeout`) |
|---|---|---|---|---|---|
| T1 table, routes, guard, headers, undo | `/api/attachments/*`, `writeGuard`, `undoBatch` | engine integration | `packages/engine/test/attachments.test.ts`, `packages/engine/test/route-matrix.test.ts` | `bun test packages/engine/test/attachments.test.ts packages/engine/test/route-matrix.test.ts` | — |
| T2 stripper | `strip(bytes, mime)` and the upload route | engine unit + integration | `packages/engine/test/strip.test.ts` | `bun test packages/engine/test/strip.test.ts` | photo location gone |
| T3 theatre + drawer | `/schema` attachments; Drawer render, upload, open, delete, undo | theatre integration, vitest | `packages/theatre/test/attachments.test.ts`, `apps/grid/src/grid/Drawer.test.tsx` | `bun test packages/theatre/test/attachments.test.ts`; `bun run --filter @worktable/grid test` | upload a pdf and a photo, open, delete, undo |
| T4 link writes | link `PATCH /rows`, `POST /act` values, attachment routes as owner/link, `confineLinkActor` | engine integration | `packages/engine/test/owner-writes.test.ts`, `route-matrix.test.ts` | `bun test packages/engine/test/owner-writes.test.ts packages/engine/test/route-matrix.test.ts` | — |

The `@e2e` flows of Done-when 1 and 2 are written by `/shakeout` after the review, per the house process.

## Review Focus
- Attack 1 (script in an upload): T1 `an svg, an html file and an exe renamed .pdf are 415`, and the header assertions.
- Attack 3 (guessing ids): T1 `another record's file and an unknown id answer the same 404`, and T4 for owners and links.
- Attack 7 (location): T2 `a jpeg's GPS and its trailing motion video are gone, Orientation kept; an unparseable image is refused, not stored`.
- Attack 8 (mass assignment): T4 `a link PATCH naming another column is 403 naming it`.
- Attack 10 (the fence): T4 `a link DELETE on rows and a link POST on /actions are 403`.

---

### Task 1: Engine — the attachment table, routes, guard and undo

**Files:**
- Create: `packages/engine/src/attachments.ts`, `packages/engine/test/attachments.test.ts`, `packages/engine/test/fixtures/attachment-domain.ts`.
- Modify:
  - `declare.ts`: `AttachmentsDecl { kinds: Record<string, string>; max_mb?: number; owner_visible?: true; owner_writable?: true }`; `DatasetDecl.attachments`.
  - `engine-tables.ts`: the `attachment` table; its name joins the reserved names.
  - `validate.ts` `checkAttachments`: kinds non-empty with identifier keys; `max_mb` an integer from 1 to 50; `owner_writable` needs `owner_visible`; attachments only on a dataset.
  - `write-guard.ts`: the exemption below.
  - `app.ts`: `EngineOptions.filesDir`; `createEngine` throws when any dataset declares attachments and none is given; the routes are registered after `authRoutes`, `file/:id` before `:dataset/:id`; an upload to an unknown or undeclared dataset answers 404 before the body is read; the Store carries `filesDir`. `validate.ts` also refuses a dataset named `file`.
  - `writes.ts` `undoBatch`: the attachment branch below.
  - `serve.ts`: `--files-dir`, read on the serve path only, beside `--outbox`, after the one-shot commands exit; created with mode 0700; in the usage line.
  - `test/sign-in.ts` `testEngine`: a temporary `filesDir` by default.
  - `scripts/parity.ts`: a temporary `filesDir`.
  - `playwright.config.ts`: the theatre engine gets `--files-dir e2e/.tmp/files`.
  - `scripts/shakeout/edit-session.ts`: `--files-dir` beside `--outbox`.
  - `test/fixture.ts`: the `project` dataset declares `attachments: { kinds: { doc: 'Doc' }, owner_visible: true, owner_writable: true }`, for the route matrix.
  - `route-matrix.test.ts`: the four routes, with the expected status per role written by hand; `EXPECTED` gains a body-type field for the octet-stream upload; the per-cell SAVEPOINT seeds one attachment.
  - `docs/SPEC.md`: the Task 1 lines.

**The guard exemption** (`write-guard.ts`; the one non-obvious piece):

```ts
// An upload is raw bytes; its route checks the type and its own size limit.
const UPLOAD = /^\/api\/attachments\/[a-z][a-z0-9_]*\/\d+$/
// inside writeGuard, after the site check:
if (c.req.method === 'POST' && UPLOAD.test(c.req.path)) return next()
```

**The undo branch** (`writes.ts` `undoBatch`, after `undoableBatch`, before `touchedBy`):
- An upload is a `write` batch holding the attachment's `id` marker row (as `create()` revises it); a delete is a `write` batch holding one `deleted_at` row.
- It applies when the batch has at least one revision row and every row has entity `attachment`, and works per attachment record: a marker means set `deleted_at = now`; a `deleted_at` row means restore its first `old`.
- It checks the actor may write the attachment's record (the same check as an upload or a delete).
- It refuses with `changed_since` when the current `deleted_at` differs from that batch's last `new` (null for an upload).
- It revises each change under a new `undo` batch and records that batch.
- Redo needs nothing more: the engine redoes a batch by undoing its undo batch (kind `undo` is undoable), whose `deleted_at` rows the same branch handles.

A batch mixing attachment and dataset rows does not occur: uploads and deletes are their own batches.

**Interfaces it produces:**
- `GET /api/attachments/:dataset/:id` → `{ attachments: [{ id, kind, name, mime, size, own: boolean, created_at }] }` (`own`: uploaded by the caller).
- `POST /api/attachments/:dataset/:id?kind=<kind>&name=<name>`, with `Content-Type: application/octet-stream` and the bytes as body → 201 `{ id, kind, name, mime, size, revision: { batch_id } }`.
- `GET /api/attachments/file/:id` → the bytes, with the headers of attacks 1 and 2.
- `DELETE /api/attachments/file/:id` → `{ id, revision: { batch_id } }`.
- `/schema` serves `attachments: { kinds, max_mb, owner_visible?, owner_writable? }` per dataset that declares them.

- [ ] **Step 1: Failing tests.** The fixture is `box { name }` with `attachments: { kinds: { doc: 'Doc', photo: 'Photo' }, max_mb: 1 }`.
  - **Upload and download:**
    - An editor uploads a pdf → 201, and the list shows it.
    - The download returns the same bytes, with `Content-Disposition: attachment; filename*=UTF-8''…`, `nosniff` and `Content-Security-Policy: sandbox`.
    - A png downloads inline.
  - **Refusals:**
    - An svg, an html file, and an exe (`MZ…`) named `x.pdf` → 415 `bad_file_type`; the client's `Content-Type` is never the stored mime.
    - 1 MB + 1 byte → 413.
    - An unknown kind → 400 `bad_kind`.
    - A name with a newline, or over 200 characters → 400 `bad_name`.
    - `multipart/form-data` → 415 `bad_content_type`; a cross-site upload → 403 `forbidden_site`.
    - The 31st upload in a minute by one account → 429.
    - Another record's attachment id and an unknown id on the download → the same 404 body.
  - **Delete and undo:**
    - Delete → gone from the list, and the download answers 404.
    - Undo the delete's batch → back. Redo → gone again.
    - Undo the upload's batch → gone.
    - Undo after the file's `deleted_at` changed since → 409 `changed_since`.
  - **Storage:**
    - The file sits at `<filesDir>/<sha256>`, and two uploads of the same bytes store one file.
    - `serve.ts --files-dir` creates the directory with mode 0700.
  - **Start and validation:**
    - `createEngine` on a domain with attachments and no `filesDir` throws.
    - Validation refuses empty kinds, `max_mb` 0 or 51, and `owner_writable` without `owner_visible`.
  - **Route matrix:** the four routes, with their status per role.
- [ ] **Step 2: Run** `bun test packages/engine/test/attachments.test.ts packages/engine/test/route-matrix.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The SPEC lines first.
- [ ] **Step 4: Run** `bun test packages scripts` and `bun run check`. Expected: PASS; tests that read the fixture's `/schema` change only where the new `attachments` key legitimately appears.
- [ ] **Step 5: Commit** `feat(engine): attachments — files on disk by sha256, routes behind the write guard, magic-byte allowlist, undo and redo`.

### Task 2: Engine — strip location and camera data

**Files:**
- Create: `packages/engine/src/strip.ts`, `packages/engine/test/strip.test.ts`. Tiny invented images are built in the test from bytes.
- Modify: `attachments.ts`, which strips before hashing.

**Interfaces it produces:** `strip(bytes: Uint8Array, mime: 'image/jpeg' | 'image/png' | 'image/webp'): Uint8Array`. It throws `StripError` on a file it cannot walk.

- [ ] **Step 1: Failing tests.**
  - **jpeg:** a jpeg with an Exif APP1 holding GPS and Orientation 6, an XMP APP1, an APP13, a COM segment, and an appended MP4 after its EOI:
    - The GPS, XMP, APP13, COM and trailing bytes are gone.
    - A minimal Exif APP1 holds Orientation 6.
    - Every other segment and the scan data are byte-identical.
  - **jpeg without Orientation:** no APP1 is written back.
  - **png:** `eXIf`, `tEXt` and bytes after `IEND` are gone; IHDR, IDAT and IEND are identical and their CRCs still valid.
  - **webp:** `EXIF` and `XMP ` chunks with a VP8X header are gone; the VP8X EXIF and XMP flags are cleared, and the RIFF size is correct.
  - **Through the upload route:**
    - A truncated jpeg → `StripError`, then 415, with nothing on disk.
    - A pdf → stored byte for byte.
- [ ] **Steps 2–4:** red, implement (walk segments and chunks; no image library), green with `bun test packages/engine`.
- [ ] **Step 5: Commit** `feat(engine): uploaded photos are stored without location and camera data, Orientation kept`.

### Task 3: Theatre and the drawer — planners attach files

**Files:**
- Modify:
  - `packages/theatre/src/datasets.ts`: `attachments` on `activiteit`, `toewijzing` and `speelreeks`, with kinds `rider: 'Rider'`, `zaalblad: 'Zaalblad'`, `bonnetje: 'Bonnetje'`, `foto: 'Foto'`, `document: 'Document'`.
  - `apps/grid/src/engine.ts`: serve `attachments` on the model.
  - `apps/grid/src/types.ts`: `Model.attachments?: { kinds: Record<string, string>; max_mb: number }`.
  - `apps/grid/src/api.ts`: the interfaces below. The upload uses its own `fetch`, because `request()` always JSON-encodes.
  - `apps/grid/src/grid/Drawer.tsx`: an `Attachments` section.
  - `apps/grid/src/grid/Grid.tsx`: passes the model's attachments and an `onBatch` to the drawer at both drawer render sites. The draft row shows no files section.
  - The matrix drawer (`Matrix.tsx:558`) does **not** show the section: the matrix keeps its own undo stack (`matrix/store.ts:108`), and R5 asks only for the row drawer.
  - `apps/grid/src/ui/history.ts`: `Entry.refresh?: () => void`; `apps/grid/src/grid/store.ts` `repaint` calls it on undo and on redo.
  - `apps/grid/src/i18n.ts`.
- Create: `packages/theatre/test/attachments.test.ts`.

**Interfaces** (`apps/grid/src/api.ts`):
- `attachmentsOf(model: string, id: number): Promise<Attachment[]>`
- `uploadAttachment(model: string, id: number, kind: string, file: File): Promise<{ attachment: Attachment; batch: string }>`
- `removeAttachment(id: number): Promise<string>`, which returns the batch id.
- `fileUrl(id: number): string`, which returns `/api/attachments/file/${id}`.
- `type Attachment = { id; kind; name; mime; size; own; created_at }`

**Drawer section `Attachments`:** "Bijlagen" lists each file with its kind label, name and size. It has:
- an open link (`fileUrl`, new tab);
- a delete button;
- a kind select and a file input, which upload on choose.

Each upload or delete pushes `{ batch, refresh }` onto the shared undo history. Ctrl+Z and the undo button undo it and call `refresh`, which re-reads `attachmentsOf`. A refusal shows in Dutch:
- 415: "Dit bestandstype kan niet. Gebruik pdf, jpg, png of webp."
- 413: "Dit bestand is te groot (max. {n} MB)."

- [ ] **Step 1: Failing tests.**
  - **Theatre:** `/schema` serves the attachments of the three datasets, and an upload to an activity is listed.
  - **Vitest:**
    - The drawer of a model with attachments lists them, uploads a chosen file as octet-stream with the kind, and opens a file at `fileUrl`.
    - It deletes one, and Ctrl+Z restores it and re-reads the list.
    - A model without attachments, and the draft row, show no section.
    - A refused upload shows the Dutch message.
- [ ] **Steps 2–4:** red, implement, green with `bun test packages/theatre/test/attachments.test.ts`, `bun run --filter @worktable/grid test`, then `bun run gate`.
- [ ] **Step 5: Look at it.** Start a scratch engine with `--files-dir` and `--link-secret-file` on ports 4351/5191, upload a pdf and a photo to an activity, and save one screenshot into `specs/attachments/`.
- [ ] **Step 6: Commit** `feat(theatre,grid): planners attach riders, zaalbladen, receipts and photos to activities, assignments and tourstops from the drawer`.

### Task 4: Engine — person links write declared columns and attach files

**Files:**
- Modify:
  - `declare.ts`: `ColumnDecl.owner_writable?: true`.
  - `validate.ts`: the refusals of R4.
  - `app.ts`: in the `PATCH /rows/:dataset/:id` handler, for `actor.kind === 'link'`, call `linkWritable(dataset, body)` on the body after `expect` is taken out, before `runWrite`; the reply to a link is `{ id, revision }` only.
  - `action-token.ts`: the `/act` body takes `values?: Record<string, unknown>` (not a plain object → 400 `bad_body`). They are checked with `linkWritable`, then written in the same `applyWrite` call as the transition, `{ ...values, [column]: to }`.
  - `record-link.ts`: `confineLinkActor` matches method and path, per attack 10.
  - `attachments.ts`: the owner and link rules of attack 4, and `no-store` for owners and links.
  - `route-matrix.test.ts`: the link cells.
  - `record-link.test.ts:286`: a link `PATCH /api/rows/note/1 {tekst}` now passes the fence and answers 403 `column_not_owner_writable`; update its expectation.
  - `docs/SPEC.md`: the Task 4 lines.
- Create: `packages/engine/test/owner-writes.test.ts`. Its fixture has an owned dataset with one `owner_writable` text column, a lifecycle and its token, and `attachments.owner_visible`/`owner_writable`.

**Interfaces it produces:**
- `linkWritable(dataset: DatasetDecl, body: Record<string, unknown>): void` throws 403 `column_not_owner_writable`, naming the first key whose column is not `owner_writable`.
- `POST /act` body: `{ token, to, values? }`.

- [ ] **Step 1: Failing tests.**
  - **Validation** refuses `owner_writable` without `owner_visible`, on the owner column, the lifecycle column, a `record_link.email` column, json and readonly.
  - **Link PATCH:**
    - A link PATCH of the `owner_writable` column → 200 with only `{ id, revision }` (no other column in the reply), revised as the link account; a link sending `expect` is not refused for it.
    - Another column, including the lifecycle column → 403, naming it.
    - Another subject's row → 404.
  - **Link fence:** a link POST and DELETE on `/rows`, and a link POST on `/actions` and `/batches/:id/undo` → 403.
  - **`/act`:**
    - `values: { note: 'x' }` writes the transition and the note in one batch.
    - A refused transition writes neither.
    - `values` naming another column → 403 `column_not_owner_writable`, naming it.
  - **Owner and link files:**
    - An owner session and a link list and download the files of their own record when `owner_visible` is set; without it → 404.
    - Upload with `owner_writable` → 201.
    - Deleting an editor's upload → 403; deleting their own → 200.
    - Another record's file → the same 404 as an unknown id.
    - Downloads carry `Cache-Control: no-store`.
  - **Regressions:**
    - A signed-in owner's PATCH of the lifecycle column (`lifecycle.test.ts`) still works.
    - Theatre's owner Beschikbaarheid and Toewijzing writes still work (`theatre/test/access.test.ts`, `toewijzing.test.ts`).
    - An owner's undo of its own transition still works.
    - An editor's writes are unchanged.
- [ ] **Steps 2–4:** red, implement, green with `bun test packages scripts` and `bun run check`.
- [ ] **Step 5: Commit** `feat(engine): person links write only owner-writable columns, and attach files where a dataset allows it`.
