# Feature review: attachments (F1)

Branch `feature/attachments`, main `67f9962` .. `ba7b81d` (11 commits). Two reviewers: superpowers' whole-branch review on the most capable model (verdict: ready with fixes, nothing Critical), and `security-sentinel` (nothing Blocking; a streamed-upload probe and a 600k-case stripper fuzz).

## Fix pass (one wave)

| # | From | Finding | Disposition | Fixed |
|---|---|---|---|---|
| I1 | whole-branch, Important | `docs/SPEC.md` never states the photo stripping, and `spec.md` R2 still describes the old drop list | fix: one sentence in the SPEC Attachment row (keep-list of decode and colour segments/chunks, Orientation kept in a minimal Exif, nothing after EOI/IEND/RIFF end, an unwalkable image 415); R2 updated to the keep-list | 0040f5b |
| I2 | whole-branch, Important (+ Task 3 deferred minor) | `Entry.refresh` closes over the `Attachments` instance that made the step: after closing and reopening the drawer, undo re-reads a dead instance; the history panel and the action toast never refresh | fix: Grid keeps a files version per `dataset:id`; `refresh` bumps it; `Attachments` re-reads in an effect on the version; the history panel's and toast's undo paths bump it too. Vitest: upload, unmount, remount, undo → the list re-reads; an undo from the history panel re-reads | 969ff96 |
| S1 | security, Should fix (reproduced) | Without `Content-Length` (or with `Transfer-Encoding`), Hono's `bodyLimit` buffers the whole stream before `recordOf`, kind, name, `checkWrite` and the rate limit run | fix: those checks move into `uploadGate` before the body limit; a request without `Content-Length` is 411 `length_required` (the grid's `fetch` always sends one). Test: a streamed body to an unknown record, with a bad kind, and over the rate limit, refused before any byte is read; no `Content-Length` → 411 | 86790e3 |
| S2 | security, Should fix | No total disk limit; attack 5 claimed disk exhaustion as mitigated; a failed insert leaves an orphan file, a failed rename a `.tmp` | ruling: a per-account byte quota is deferred until owners or links upload (step 6; in theatre only editors upload today) — moved to the threat model's deferrals with that reason. Fix now: a newly written file is removed when the database transaction fails; a `.tmp` is removed when the rename fails. Test the failed-insert case | a6aaa8f (cleanup), 0040f5b (deferral) |
| S3 | security, Should fix | `owner_writable` is allowed on relation columns: a link gets an unscoped existence check (`checkRelations`) and can point its row at records it cannot read | fix: validation refuses `owner_writable` on a relation column; test it | a6aaa8f |
| M1 | security | Editors' downloads carry no `Cache-Control` | fix: `Cache-Control: private, no-store` on every download | a6aaa8f |
| m1 | whole-branch | `bad_name`, `rate_limited`, `read_only`, `unknown_attachment`, `forbidden`, `length_required` reach the Dutch UI in English | fix: Dutch messages in the upload and delete refusal mapping | 969ff96 |
| m2 | whole-branch | An attachment undo conflict (409 on `deleted_at`) reads "dit record is intussen verwijderd" | fix: a Dutch attachment-specific message ("Dit bestand is intussen gewijzigd.") | 969ff96 |
| m3 | whole-branch | Upload and delete controls show on a dataset without a writer (405 on use) | fix: the section offers upload and delete only when the model is writable | 969ff96 |
| m4 | whole-branch | `\p{Cf}` refuses ordinary names (an emoji with ZWJ, a soft hyphen) | ruling: refuse only bidi and invisible-direction controls (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) plus `\p{Cc}`; test an emoji-with-ZWJ name is accepted and U+202E refused | a6aaa8f |
| m7, M2 | both | ICC header device make/model, JFXX thumbnail, APP14, ANMF sub-chunks not in the deferrals | fix: added to the plan's threat-model deferrals | 0040f5b |
| m8 | whole-branch | png `cICP` dropped (HDR rendering) | fix: add `cICP`, `mDCv`, `cLLi` to `PNG_KEPT` (colour metadata, no location) | d5a9bdd |
| M3 | security | A later POST route shaped `/api/attachments/<word>/<digits>` would skip the JSON checks | fix: a route-matrix assertion that the exemption matches only the upload route | 86790e3 |
| m5 | whole-branch | A pdf "opens" as a download | no change: SPEC requires `attachment`; the shake-out treats a pdf download as the pass | — |
| m6 | whole-branch | writes.ts ↔ attachments.ts import cycle | noted, left (call-time only) | — |
| m9, M4, M5 | both | step-6 notes; a link's empty PATCH runs `writer.update`; repeat-bytes timing | noted, no change | — |

Deferred minors from the ledger (record re-check in the upload transaction, free-port probe race, client-filled `own`/`created_at`, fileSize boundary, no client-side size pre-check): left, per the whole-branch triage.

## Ledger rulings judged sound by the whole-branch reviewer
"writable" = writer + scope; owner rules in Task 1; house 404 codes; malformed Exif dropped; webp trailer dropped; keep-list stripper; `Store.push`; link 403 before scope; HEAD 403 for links; link `expect` dropped; B3 (the limit binds links only).
