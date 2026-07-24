# The server — phase 2a, one page

The server is a **derived index over the folder, plus the one
guarded write**. It must stay small enough that deleting it and
restarting from the files is always a safe no-op. If a feature can't
survive that test, it doesn't belong in the server.

## Job description

1. Watch the folder; parse frontmatter; hold an in-memory index.
2. Answer reads for the view layer.
3. Execute exactly one write: the owner's seal.

## API — the whole surface

| Endpoint | What |
| --- | --- |
| `GET /views` | list of view documents (name + definition frontmatter) |
| `GET /views/:name` | the view resolved: definition + matching records (frontmatter core + open bag; body excluded) |
| `GET /records/:domain/:slug` | one record: frontmatter, body, artifact file list |
| `GET /records/:domain/:slug/artifacts/:file` | one artifact's content (read-only) |
| `GET /events` | SSE: invalidation ticks on file change (no payloads, no state — the client refetches) |
| `POST /seal` | `{record, decision, note}` → executes `seal.py record` on the owner's behalf. **The only write.** |

Nothing else. No record-editing API (agents use files; the owner
fine-tunes via files/Obsidian until the frontend adds body editing —
which, when it comes, is a second guarded write, never a general
one). No view-editing API (views are files). No flow API (the run
state is files; a "runs" view document covers visualization).

## Authority

Single owner. One bearer token, held by the human; the seal endpoint
IS the seal button's backend, and a request with the owner token is
the owner's explicit say-so. Agents never hold this token — their
interface is the filesystem, where the pretooluse guard and
`gate-then-status` already govern writes. No accounts, no roles, no
delegation — that's folio's problem space, deliberately not ours.

## Index rules (ADR-001 inherited)

- Rebuilt from the folder on start; file-watch keeps it fresh.
- Deleting the index/cache is a safe no-op, always.
- The index may add derived columns (artifact presence, review
  counts); it may never hold anything that isn't derivable.

## Size discipline

Target: one file, few hundred lines, stdlib-plus-minimal (runtime
choice is an implementation detail; smallest wins). The view layer
(phase 2b) consumes `GET /views/:name` + `/events` — the exact seam
folio's harvest identified (five hooks), so the harvested view
designs port onto this API without translation.

## The record panel (phase 2b contract)

A record folder is presented as ONE thing, because the API already
returns it as one thing: `GET /records/:domain/:slug` = frontmatter
core + item.md body + `artifacts[]`. The panel (folio's slideover,
reborn) renders: header from the core (status, dates, run link),
first tab = the cover (item.md body), then one read-only tab per
artifact, lazy-loaded. Tab order derives from the flow definition —
the nodes' `out:` sequence is the lifecycle order, so the file that
declares the flow also orders the presentation; unknown artifacts
sort after, by name. Reviews appear as a tab when reports exist on
the serving host; activity starts as seal + run info (per-folder git
history is derivable and may become a read endpoint later). The
frontend never sees "files in a folder" — it sees a record with
sections. Folder-ness stays below the API waterline.

## Non-goals, permanently

Databases as truth · multi-user auth · agent write APIs · view or
flow editing over HTTP · anything whose loss would lose data. The
folder is the record; the server is a view; the seal is the only
door, and the owner holds the only key.
