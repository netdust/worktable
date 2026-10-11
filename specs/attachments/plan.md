# F1: Owner-writable Columns and Attachment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Files attached to any record, read and written by planners from the drawer and, where a dataset allows, by owners and link accounts; owners and links write only columns a dataset declares `owner_writable`.

**Architecture:** An engine table `attachment` and a dataset key `attachments`; files on disk under `--files-dir`, named by sha256; four routes with their own guard (the JSON write guard does not fit raw bytes); a byte-level metadata stripper for jpeg, png and webp; `owner_writable` checked in `valuesOf` before the writer; `confineLinkActor` opens `PATCH /rows` and the attachment routes to link accounts. Theatre declares attachments on three datasets; the grid's drawer lists and uploads them.

**Tech Stack:** Bun, Hono, SQLite, TypeScript; Bun tests (engine, theatre), Vitest (grid), Playwright (e2e).

**Spec:** `specs/attachments/spec.md`. Design: `specs/engine-additions/findings.md` F1.

**First working version:** Task 3 — a planner attaches a file to an activity in the running grid. Tasks 1–2 are the engine it stands on.

**Simplest design:** Store files as BLOBs in SQLite and serve them from a single route, editors only. Not used: Stefan chose files beside the database (answer 3), a BLOB column makes every backup and migration copy carry the files, and owners and links are in scope (R4). The plan keeps every other part minimal: raw-bytes upload (no multipart parser), content-addressed files (no names on disk), byte-level stripping (no image library), soft delete through the existing revision and undo.

## Global Constraints
- `packages/engine` knows no domain word; engine names English and generic; Dutch user strings (`apps/grid/src/i18n.ts`).
- `docs/SPEC.md` gets its lines first (Task 1): the Attachment row as built (without publication and inheritance), `attachments` on Dataset, `owner_writable` on columns, the four routes on the freeze list, `--files-dir` in the CLI row, the Access table's link writes.
- No client data; invented fixtures; `bun scripts/check-export-terms.ts` before every commit; commit by path.
- The gate is `bun run gate`; never touch ports 4330/5180/4341/5181 or `~/laika-export`.
- Every refusal of an actor is asserted, not only the allowed path.

## Threat model

**Assets:** the files (contracts, receipts, photos of people and places); write access to records; the long-lived person link; the server's disk.

**Attacks → mitigations (where):**
1. **An editor-, owner- or link-uploaded HTML, SVG or polyglot file runs script in the grid's origin when opened** → magic-byte allowlist (pdf `%PDF-`, jpeg `FF D8 FF`, png `89 50 4E 47 0D 0A 1A 0A`, webp `RIFF....WEBP`) in `attachments.ts` `sniff`; the declared mime is the sniffed one, never the client's; served with `Content-Disposition: attachment` (inline only for jpeg/png/webp), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` in the download route.
2. **Path traversal or overwrite through the uploaded name** → files stored as `<files-dir>/<sha256>`; the name is metadata only, at most 200 characters, control characters refused; the download sets `filename*` with RFC 5987 encoding (`attachments.ts` `dispositionOf`).
3. **Reading another record's file by guessing ids** (any actor) → the download reads the attachment row, then its record through `visibleSource` + `scopeOf` + `inScope`, then `owner_visible` for an owner or link; every failure answers the same 404 `unknown_attachment` (`attachments.ts` `readable`).
4. **An owner or link uploads to, lists or deletes on a record it cannot write or read** → the same scope read; upload needs `attachments.owner_writable` for owner/link; delete by owner/link only of its own upload (`uploaded_by`), editors any.
5. **Disk fill or memory exhaustion by a huge upload** → `bodyLimit` at `max_mb` (default 10) on the upload route before reading (413 `body_too_large`); a per-actor upload rate limit (30 a minute, `checkLimits`); the body read once into memory only after the limit.
6. **A cross-site page posts a file with the user's cookie** → the upload route runs its own guard: the same `sec-fetch-site`/`Origin` refusal as `writeGuard`, and `Content-Type: application/octet-stream` required (not CORS-simple, so a cross-site form cannot send it without preflight).
7. **A photo carries where it was taken** → `strip.ts` removes jpeg APP1 (Exif, XMP) and APP13, png `eXIf`/`tEXt`/`iTXt`/`zTXt`, webp `EXIF`/`XMP ` chunks (clearing the VP8X flags), before hashing and storing; a file the stripper cannot parse is refused (415), never stored unstripped.
8. **An owner or link writes a column it may not (mass assignment)** → `valuesOf` refuses any key not `owner_writable` for role owner, 403 `column_not_owner_writable` naming it, before the writer.
9. **A forwarded person link writes in the subject's name** → limited to `owner_writable` columns and own uploads; logged as the link account in Revision; rotating the link stops it (existing).
10. **A link uses `PATCH` to reach a column through a lookup rename (`ownBody`)** → owners never have lookups (validation refuses lookups on owned datasets), and the `owner_writable` check runs on the renamed body.

**Deferrals:**
- Malware in a pdf: not scanned; files are served as downloads with `nosniff`, never rendered by the grid.
- PDF metadata (author, software) is kept: stripping a pdf needs a parser; the location risk is in photos.
- Orphaned files on disk after a soft delete are kept (undo needs them); no garbage collection in this step.
- Image re-encoding (which would also kill steganographic payloads) is out.

## Test map

| Unit | Seam | Tier | File | Command | e2e flows (shake-out) |
|---|---|---|---|---|---|
| T1 engine table, routes, guard, headers | `/api/attachments/*` | engine integration | `packages/engine/test/attachments.test.ts` | `bun test packages/engine/test/attachments.test.ts` | — |
| T2 stripper | `strip(bytes, mime)` and the upload route | engine unit + integration | `packages/engine/test/strip.test.ts` | `bun test packages/engine/test/strip.test.ts` | photo location gone |
| T3 theatre + drawer | `/schema` attachments; Drawer render, upload, open, delete, undo | theatre integration, vitest | `packages/theatre/test/attachments.test.ts`, `apps/grid/src/grid/Drawer.test.tsx` | `bun test packages/theatre`, grid vitest | upload pdf and photo, open, delete, undo |
| T4 owner_writable + link writes | `PATCH /rows`, `POST /act`, attachment routes as owner/link | engine integration | `packages/engine/test/owner-writes.test.ts` | `bun test packages/engine/test/owner-writes.test.ts` | — |

## Review Focus
- Attack 1 (script in an upload) → T1 `an svg, an html file and an exe renamed .pdf are 415` and the header assertions.
- Attack 3 (guessing ids) → T1 `another record's file and an unknown id answer the same 404` (and T4 for owner/link).
- Attack 7 (location) → T2 `a jpeg's GPS is gone; an unparseable image is refused, not stored`.
- Attack 8 (mass assignment) → T4 `an owner PATCH naming another column is 403 naming it`.
- Attack 6 (cross-site) → T1 `a cross-site upload and a form-encoded upload are refused`.

---

### Task 1: Engine — the attachment table, routes and guard

**Files:** Create `packages/engine/src/attachments.ts`, `packages/engine/test/attachments.test.ts`, `packages/engine/test/fixtures/attachment-domain.ts`. Modify `packages/engine/src/declare.ts` (`AttachmentsDecl`, `DatasetDecl.attachments`), `engine-tables.ts` (the `attachment` table; `attachment` joins the reserved names), `validate.ts` (`checkAttachments`: kinds non-empty, `max_mb` 1–50, `owner_writable` needs `owner_visible`), `app.ts` (`EngineOptions.filesDir`; refuse to start without it when any dataset declares attachments; mount the routes before `writeGuard` with their own guard), `serve.ts` (`--files-dir`, created 0700), `history`/undo (an attachment revision: `deleted_at` on delete, a create undone by setting `deleted_at`), `docs/SPEC.md`.

**Interfaces — produces:**
- `GET /api/attachments/:dataset/:id` → `{ attachments: [{ id, kind, name, mime, size, uploaded_by_self: boolean, created_at }] }`
- `POST /api/attachments/:dataset/:id?kind=<kind>&name=<name>` with `Content-Type: application/octet-stream`, body the bytes → 201 `{ id, kind, name, mime, size, revision: { batch_id } }`
- `GET /api/attachments/file/:id` → the bytes with the headers of attacks 1 and 2
- `DELETE /api/attachments/file/:id` → `{ id, revision: { batch_id } }`
- `/schema` serves `attachments: { kinds, max_mb, owner_visible?, owner_writable? }` per dataset.
- Errors: 404 `unknown_attachment`, 413 `body_too_large`, 415 `bad_file_type`, 400 `bad_kind` / `bad_name`, 403 `forbidden_site` / `bad_content_type`.

- [ ] **Step 1: Failing tests** (fixture: `box { name }` with `attachments: { kinds: { doc: 'Doc', photo: 'Photo' }, max_mb: 1 }`):
  - upload a pdf as an editor → 201; list shows it; download returns the same bytes, `Content-Disposition: attachment; filename*=UTF-8''…`, `nosniff`, `Content-Security-Policy: sandbox`;
  - a png downloads inline;
  - an svg, an html file, and an exe (`MZ…`) named `x.pdf` → 415; the client's `Content-Type` is ignored for the stored mime;
  - 1 MB + 1 byte → 413; an unknown kind → 400 `bad_kind`; a name with a newline or over 200 characters → 400 `bad_name`;
  - a cross-site upload (`sec-fetch-site: cross-site`) and a `multipart/form-data` upload → 403;
  - another record's attachment id on the download and an unknown id → the same 404 body;
  - delete → gone from the list, the download 404s; undo of the delete's batch → back; undo of the upload's batch → gone;
  - the file on disk is `<filesDir>/<sha256>` and two uploads of the same bytes store one file;
  - `createEngine` without `filesDir` on a domain with attachments throws; validation refuses empty kinds, `max_mb` 0 or 51, `owner_writable` without `owner_visible`.
- [ ] **Step 2: Run** `bun test packages/engine/test/attachments.test.ts` — FAIL.
- [ ] **Step 3: Implement** as in Interfaces; the spec lines in `docs/SPEC.md` first.
- [ ] **Step 4: Run** `bun test packages/engine` and `bun run check` — PASS.
- [ ] **Step 5: Commit** `feat(engine): attachments — files on disk by sha256, four routes with their own guard, magic-byte allowlist, revised and undoable`.

### Task 2: Engine — strip location and camera data

**Files:** Create `packages/engine/src/strip.ts`, `packages/engine/test/strip.test.ts`, `packages/engine/test/fixtures/images/` (tiny invented images with GPS tags, built in the test from bytes). Modify `attachments.ts` (strip before hashing).

**Interfaces — produces:** `strip(bytes: Uint8Array, mime: 'image/jpeg' | 'image/png' | 'image/webp'): Uint8Array`, throwing `StripError` on a file it cannot walk.

- [ ] **Step 1: Failing tests:** a jpeg with an Exif APP1 holding GPS and an XMP APP1 → both gone, every other segment and the scan data byte-identical; a png with `eXIf` and `tEXt` → both chunks gone, IHDR/IDAT/IEND identical, CRCs valid; a webp with `EXIF` and `XMP ` chunks and a VP8X header → chunks gone, VP8X flags cleared, RIFF size correct; a truncated jpeg → `StripError`, and through the upload route 415 with nothing on disk; a pdf through the route → stored byte for byte.
- [ ] **Step 2–4:** red, implement (walk segments/chunks; no image library), green; `bun test packages/engine`.
- [ ] **Step 5: Commit** `feat(engine): uploaded photos are stored without location and camera data`.

### Task 3: Theatre and the drawer — planners attach files

**Files:** Modify `packages/theatre/src/datasets.ts` (`attachments` on `activiteit`, `toewijzing`, `speelreeks`: kinds `rider: 'Rider'`, `zaalblad: 'Zaalblad'`, `bonnetje: 'Bonnetje'`, `foto: 'Foto'`, `document: 'Document'`), `apps/grid/src/engine.ts` (serve `attachments` on the model), `apps/grid/src/api.ts` (`attachmentsOf`, `upload`, `removeAttachment`; upload sends `application/octet-stream`), `apps/grid/src/grid/Drawer.tsx` (an "Bijlagen" section: the list with kind, name and size, a link to open each, a kind select and a file input to upload, a delete button; a delete or upload is undoable through the grid's undo history), `apps/grid/src/i18n.ts`, `playwright.config.ts` and `e2e/global-setup.ts` (the e2e engine gets `--files-dir e2e/.tmp/files`), `scripts/shakeout/edit-session.ts` if it starts an engine.
Create `packages/theatre/test/attachments.test.ts`.

- [ ] **Step 1: Failing tests:** theatre `/schema` serves the attachments of the three datasets; an upload to an activity is listed. Vitest: the drawer of a model with attachments lists them, uploads a chosen file as octet-stream with the kind, opens a file at `/api/attachments/file/:id`, deletes one and offers undo; a model without attachments shows no section; a refused upload says why in Dutch ("Dit bestandstype kan niet", "Dit bestand is te groot").
- [ ] **Step 2–4:** red, implement, green; `bun run gate`.
- [ ] **Step 5: Look at it:** a scratch engine with `--files-dir`, upload a pdf and a photo to an activity, one screenshot into `specs/attachments/`.
- [ ] **Step 6: Commit** `feat(theatre,grid): planners attach riders, zaalbladen, receipts and photos to activities, assignments and tourstops from the drawer`.

### Task 4: Engine — owners and link accounts write declared columns and attach files

**Files:** Modify `declare.ts` (`ColumnDecl.owner_writable`), `validate.ts` (the refusals of R4), `writes.ts` (`valuesOf`: role owner writes only `owner_writable`, 403 `column_not_owner_writable`), `record-link.ts` (`OPEN_TO_LINKS` adds `PATCH /api/rows/:dataset/:id` and the attachment routes; link POST/DELETE on `/rows` stay 403), `action-token.ts` (`POST /act` takes `values` of `owner_writable` columns, written in the transition's `applyWrite` call), `attachments.ts` (owner/link rules of attack 4), `docs/SPEC.md` (Access table). Create `packages/engine/test/owner-writes.test.ts` with a fixture whose owned dataset has one `owner_writable` text column and `attachments.owner_visible`/`owner_writable`.

- [ ] **Step 1: Failing tests:**
  - validation refuses `owner_writable` without `owner_visible`, on the owner column, the lifecycle column, a `record_link.email` column, json, readonly;
  - an owner session and a link PATCH of the `owner_writable` column → 200, revised as that account; another column → 403 naming it; another subject's row → 404;
  - a link POST and DELETE on `/rows` → 403;
  - `/act` with `values: { note: 'x' }` writes the transition and the note in one batch; a refused transition writes neither; `values` naming another column → 400 naming it;
  - an owner and a link list and download files of their own record with `owner_visible`; without it → 404; upload with `owner_writable` → 201; delete of an editor's upload → 403; of its own → 200; another record's file → the same 404 as an unknown id;
  - an editor's writes are unchanged (no `owner_writable` limit).
- [ ] **Step 2–4:** red, implement, green; `bun test packages/engine`, `bun run check`.
- [ ] **Step 5: Commit** `feat(engine): owners and person links write only owner-writable columns, and attach files where a dataset allows it`.
