# Shake-out: attachments (F1, owner-writable columns and Attachment)

Driven 2026-10-11 on `feature/attachments` at b2598ed (the reviewed and fixed code), in the worktree
`worktable-f1`, through the repo's own Playwright harness (`playwright.config.ts`). The harness starts a fresh
invented theatre engine at 127.0.0.1:4311 with `--files-dir e2e/.tmp/files` and its grid at 127.0.0.1:5174
(plus the fiche pair at 4312/5175). It signs in its invented accounts through the magic-link form: editor
`planner@e2e.test` drives every flow, owner `lotte@e2e.test` is the denied actor. Every flow ran in a real
Chromium at 1600×900. Each flow makes its own records on the API (an activity of Nachtwacht in an empty week of
March 2029, one week per flow; a tourstop at Theater Het Anker; a Toewijzing for Noor Claes) and deletes them
again, whatever happens. The files are invented: a 125-byte pdf, a 473-byte 48×32 jpeg, and an Exif block built
in the test. Each screenshot is the viewport, written by `e2e/shots.ts`.

Sweep, at b2598ed with the new specs: one full `bun run gate`, exit 0. `check` green (one pre-existing Biome
warning in `packages/theatre/test/matrix.test.ts`, not this diff), `bun test packages scripts` 1768 pass, grid
vitest 1031 pass, Playwright 189/189 (the 183 before plus the 4 flows and 2 smoke checks below). Every registered
test passed in that run, so every CHECKS row's `verified` is bumped to b2598ed.

Flows: the plan's Test map, E2E flows column ("upload a pdf and a photo, open, delete, undo"; "photo location
gone"), with the spec's Done-when 1–3 and R5 as the caller listed them:
1. upload a pdf and a photo, open, delete, undo (Done when 1, review I2 and m5)
2. photo location gone (Done when 2)
3. refusals in Dutch (Done when 3)
4. Bijlagen on a tourstop and an assignment, none on a dataset without attachments (R5)

Done when 4 (a link account writing an owner-writable column and a file) is engine-fixture only; no theatre
screen reaches it until step 6. It stays covered by `packages/engine/test/owner-writes.test.ts`, green in the
sweep, and gets no row here.

The flows are in `e2e/attachments.spec.ts` (`@e2e`). The read-only checks are in
`e2e/smoke/attachments.spec.ts` (`@smoke`).

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | upload-open-delete-undo (Done when 1): the test makes "Repetitie e2e bijlagen" on 2029-03-05. Planning on that week → hover the row → Openen. The drawer shows the heading "Bijlagen" and "Nog geen bijlagen". Soort stays Rider; the pdf "rider e2e.pdf" goes into the file input → POST /api/attachments/activiteit/:id 201. Soort → Foto; "zaal e2e.jpg" → 201. The list reads `Rider · rider e2e.pdf · 1 kB` and `Foto · zaal e2e.jpg · 1 kB`, and GET /api/attachments/activiteit/:id holds the same two (kind rider/foto, mime application/pdf / image/jpeg). Open: clicking the pdf's link gives a download named "rider e2e.pdf" whose bytes equal the upload (served as attachment, the pass per review m5). Clicking the photo's link opens a tab on /api/attachments/file/:id that shows the image inline, decoded (naturalWidth 48). Delete: "zaal e2e.jpg verwijderen" → DELETE 200, the list holds only the pdf, and GET of the file is 404. Ctrl+Z in a cell of the sheet → POST /api/batches/…/undo 200; the list reads both again and the file answers 200. Re-entry (review I2): Sluiten, then Openen again: the drawer reads both from the server; one more Ctrl+Z undoes the photo's upload, the list re-reads to the pdf alone, and the file is 404. Denied actor (wire): the owner session's GET /api/attachments/activiteit/:id → 404, and GET /api/attachments/file/:pdf → 404. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/drawer-files.png (both files listed); after the undo: shakeout/drawer-undo-restored.png; the photo opened inline: shakeout/photo-inline.png. Test: `e2e/attachments.spec.ts` › `upload-open-delete-undo @e2e` |
| 2 | photo-location-gone (Done when 2): the test builds a jpeg from the invented photo with an Exif APP1 after SOI (IFD0: Make "InventCam e2e", Orientation 6, a GPS IFD pointer; GPS IFD: LatitudeRef N, Latitude 50/1 51/1 1234/100) and a trailing "MOTION e2e video GPS 50.8512N 4.3567E" after EOI, as a motion photo carries. It goes up through the drawer of "Repetitie e2e fotolocatie" (2029-03-12) with Soort Foto → 201; the list reads `Foto · gps e2e.jpg · 1 kB`. Downloaded on the API: 200, image/jpeg, `inline`, length = the size the upload answered and less than the bytes sent. The stored file holds none of "InventCam", "MOTION", "GPS", "50.8512", nor the latitude rational's bytes; it ends at FFD9. It has one APP1, an `Exif\0\0` block whose IFD0 holds only tag 0x0112, value 6 (Orientation kept). Its scan is byte for byte the photo's. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/photo-stripped.png (the stripped photo listed) · Test: `e2e/attachments.spec.ts` › `photo-location-gone @e2e` |
| 3 | refusals-in-dutch (Done when 3): in the drawer of "Repetitie e2e weigeringen" (2029-03-19), through the file input: "logo e2e.svg" (image/svg+xml, an svg with a script), "pagina e2e.pdf" (an html page named .pdf) and "programma e2e.pdf" (an MZ/PE executable named .pdf) are each 415, the alert reads "Dit bestandstype kan niet. Gebruik pdf, jpg, png of webp." and "Nog geen bijlagen" stays. Boundary: a pdf of 10 MB + 1 byte is 413, the alert reads "Dit bestand is te groot (max. 10 MB).", nothing is listed, and the server's list is empty. A pdf of exactly 10 MB is 201, the alert goes, and the list reads `Rider · precies e2e.pdf · 10 MB`. Mid-flow failure: the upload's connection is reset; the drawer shows an alert, lists nothing new, and the server still holds only "precies e2e.pdf". | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/refused-type.png (the type refusal); the size refusal: shakeout/refused-size.png. Test: `e2e/attachments.spec.ts` › `refusals-in-dutch @e2e` |
| 4 | bijlagen-on-tourstop-and-assignment (R5): the test makes "Tourstop e2e bijlagen" (2029-03-26, Theater Het Anker), an activity that week and a Toewijzing of Noor Claes on it. Tourstops on that week → Openen: "Bijlagen", "Nog geen bijlagen"; Soort Zaalblad, "zaalblad e2e.pdf" → 201, listed `Zaalblad · zaalblad e2e.pdf · 1 kB`. Toewijzingen, opened on a link with the condition Activiteit is that activity (1 row) → Openen on Noor Claes: "Bijlagen", "Nog geen bijlagen", the Soort picker and "Bestand toevoegen". Empty edge, a dataset without attachments: Organisaties → Openen on Theater Het Anker: the drawer shows its fields (Ankerdijk 8) and no Bijlagen region or text; GET /api/attachments/organisatie/:id → 404. | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/tourstop-bijlagen.png (the tourstop with its file) · the assignment: shakeout/assignment-bijlagen.png; the organisation without: shakeout/organisation-no-bijlagen.png. Test: `e2e/attachments.spec.ts` › `bijlagen-on-tourstop-and-assignment @e2e` |

Edges not driven, with the reason:
- Concurrent (two tabs deleting the same file, or an undo after another deleted it): the 409 "Dit bestand is intussen gewijzigd." is covered by `apps/grid/src/grid/Grid.test.tsx` and the engine's undo test; driving two tabs on one batch adds no surface the browser alone shows.
- Owner and link writes (Done when 4): no theatre column or attachment is owner-writable (R5), so no screen reaches it; `owner-writes.test.ts` covers it.
- A streamed upload without Content-Length (411, review S1): the browser's `fetch` always sends one, so the browser cannot produce it; `attachments.test.ts` covers it.

Bite check: which test goes red when a dangerous path breaks.
- The keep-list stripper, GPS or a trailer kept, or Orientation lost (attack 7): row 2, on the bytes the server serves.
- The pdf served inline instead of as attachment: row 1 waits for a download and fails without one.
- Sniffing by magic bytes instead of by name or mime (attack 1): row 3, an html and an executable named .pdf.
- The size limit off by one, or the Dutch messages falling back to English: row 3's boundary pair and its exact alert texts.
- Undo of an upload and of a delete, and the files version re-read after the drawer is closed (review I2): row 1, checked on the server after each undo.
- A dataset declaring attachments it should not, or a theatre dataset losing them: row 4.
- An owner reading an editor's files: row 1's denied-actor checks.

Observations found while driving, outside the four flows (pre-existing, not in this diff):
- The drawer's red "Verwijderen" button sits flush against the drawer's left edge, outside the 16 px inset every other drawer block has. Seen on every drawer, the organisation's (no attachments) too. Live DOM, Organisaties → Openen on Theater Het Anker at 1600×900: `.nv-drawer` spans x 1239–1600, the button 1240–1337. Visible in every screenshot above. Cosmetic.
