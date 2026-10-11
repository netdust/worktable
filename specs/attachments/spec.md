# F1: owner-writable columns and Attachment

Branch `feature/attachments`, cut from main `67f9962`. Design: `specs/engine-additions/findings.md` F1 (on `feature/engine-additions`, approved by Stefan 2026-10-11 with answers 1–3 and 5). Spec of record: `docs/SPEC.md` (the lines below are added there first).

## Requirements

**R1. Attachment, an engine table and shape.**
- A dataset declares `attachments: { kinds: { <kind>: <label> }, max_mb?, owner_visible?, owner_writable? }`. The engine table is `attachment (id, entity, record_id, kind, name, mime, size, sha256, uploaded_by, created_at, deleted_at)`, indexed on (entity, record_id).
- Files live in a directory given at start (`--files-dir`), named by their sha256; the engine refuses to start when a dataset declares attachments and no directory is given.
- Routes: list a record's files; upload one file (raw bytes, kind and name as parameters); read its bytes; soft-delete it. Reading needs reading the record; writing needs the record writable.
- Allowed types by magic bytes: pdf, jpeg, png, webp. Default limit 10 MB per file, `max_mb` per dataset.
- Served as attachment (inline only for the image types), `nosniff`, a sandbox CSP.
- An upload and a delete are revised under one batch; undo removes an upload and restores a deleted file, redo repeats it. `docs/SPEC.md:56` ("a batch holding a delete … is never undone") gains this one exception.
- Out: `show_on_publication` and inheritance down a parent relation (step 4).
- Source: Stefan, "Attachment now: yes" (findings answer 1); findings F1; `docs/SPEC.md:58` (Attachment row).

**R2. Photo location and camera data stripped.**
- A jpeg, png or webp upload is stored through a keep-list, so its location and camera metadata never reach the disk: a jpeg keeps only its decode segments (SOFn, DHT, DAC, DQT, DRI) and its JFIF, ICC and Adobe colour segments; a png only its image, colour (`gAMA`, `cHRM`, `sRGB`, `iCCP`, `cICP`, `mDCv`, `cLLi`, `sBIT`, `bKGD`, `pHYs`, `tRNS`, `PLTE`) and animation chunks; a webp only its image, alpha, animation and ICC chunks. Every other segment or chunk is dropped, and nothing after a jpeg's end-of-image marker, a png's IEND or the RIFF end is kept (motion photos and secondary images carry their own GPS). A jpeg keeps its Orientation tag, in a minimal Exif block, so a portrait photo is not shown sideways. An image the stripper cannot walk is refused (415), never stored unstripped. A pdf is stored byte for byte.
- Source: Stefan, "Strip a photo's location … yes" (findings answer 2).

**R3. Files beside the database.**
- `--files-dir` names the directory; it is backed up with the database. The engine creates it with mode 0700.
- Source: Stefan, "Files in a directory next to each client's database: yes" (findings answer 3).

**R4. Owners and link accounts write declared columns and attach files.**
- A column may declare `owner_writable: true` (only with `owner_visible`; never on the owner column, the lifecycle column, a `record_link.email` column, a relation column, json or readonly).
- A **link account** writes only `owner_writable` columns: on `PATCH /rows/:dataset/:id` (rows in its scope; no create, no delete) and in `values` beside its choice on `POST /act`, written in the transition's batch. Any other key is 403 `column_not_owner_writable`, naming it. A signed-in owner (an account of kind `user`) keeps today's rule: it writes rows in its scope and its writer decides which columns (`docs/SPEC.md:45`). Ruling (plan review B3): the declared limit binds the link only, because applying it to every owner would refuse owner transitions, the token's own transition and theatre's owner writes.
- With `attachments.owner_visible` an owner or link reads a record's files; with `owner_writable` it uploads, and deletes only its own uploads.
- Source: Stefan, "C6 + C8: a link account writes a declared column, and Attachment reads and writes for owners and link accounts (technicians adding notes, documents and photos)"; findings F1.

**R5. Theatre: planners attach files from the drawer.**
- `activiteit`, `toewijzing` and `speelreeks` declare attachments (kinds: rider, zaalblad, bonnetje, foto, document). The row drawer lists a record's files, uploads one, opens one, and deletes one (undo restores it).
- No theatre column or attachment is owner-writable yet; owner and link writing is proven on the engine's fixture and gets its first theatre screen with step 6 (registration).
- Source: Stefan, "Drawer files, planners" (answer to the F1 consumer question, 2026-10-11).

## Out
Publication of attachments and inheritance (step 4); image re-encoding and thumbnails; virus scanning; a person-page screen for owner writes (step 6); the agency's files.

## Done when
1. A planner uploads a pdf and a photo to an activity from its drawer, opens both, deletes one and undoes the delete, in a real browser.
2. A photo's location data is gone from the stored file.
3. An svg, an html file and an executable renamed to .pdf are refused; a file over the limit is refused.
4. On the fixture: a link account writes an owner-writable column and uploads a file; another column, another record and another person's file are refused.
