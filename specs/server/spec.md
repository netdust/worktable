# Spec: worktable server (phase 2a)

The gateable form of docs/SERVER.md — same decisions, testable shape.

## Problem

Records, views, and flow runs are plain files; humans without a
terminal need them served — and need exactly one action across the
network: the seal. Anything bigger than "derived index + one guarded
write" recreates the folio drift.

## Requirements

- R01 `GET /views` lists view documents (name + definition
  frontmatter); `GET /views/<name>` returns the definition plus
  matching records (frontmatter core + open bag, body excluded),
  scoped to the definition's `source` folder and grouped/sorted per
  its `group_by`/`sort`. (Arbitrary `filter:` predicates are not a
  query language in 2a — source scoping only; revisit if a real view
  needs more.)
- R02 `GET /records/<domain>/<slug>` returns one record: frontmatter,
  item.md body, and its artifact file list; `…/artifacts/<file>`
  returns one artifact's content, read-only.
- R03 `GET /events` is an SSE stream emitting invalidation ticks when
  files change; it carries no state and no payloads — clients
  refetch.
- R04 `POST /seal` `{record, node, decision, note?}` executes
  netdust-flow's `seal.py record` on the owner's behalf and is THE
  ONLY write. `record` is `<domain>/<slug>`; `node` names the flow's
  human node being sealed (seal.py records per node); decision ∈
  approved|rejected; anything else is a 400 recording nothing.
- R05 Every request requires the owner bearer token (single token,
  from environment); a missing or wrong token gets 401 with no body
  detail. There are no other principals, accounts, or roles.
- R06 The index is derived: built from the folder at start, refreshed
  by watching; deleting all server state and restarting is a safe
  no-op (the survival test).
- R07 Path safety: only files inside the served root are reachable;
  traversal attempts (.., absolute paths, symlink escapes) get 404.
- R08 Stdlib only, one file, no daemons beyond itself; binds to
  127.0.0.1 by default (exposure is a deployment decision, not a
  default).

## Acceptance

- A01 Views resolve correctly: the dossiers view returns the
  gezondleven-be record grouped under `final` with its frontmatter
  (R01).
- A02 A record response carries frontmatter, body, and artifact list;
  each listed artifact is fetchable; item.md is not listed as its own
  artifact (R02).
- A03 A file change is followed by an SSE tick within the watch
  interval (R03).
- A04 `POST /seal` with the owner token records a real seal readable
  by `seal.py check`; a bad decision value is a 400 and records
  nothing (R04).
- A05 Every endpoint returns 401 without the token; `/seal` with a
  wrong token records nothing (R05).
- A06 Deleting server state and restarting yields identical view
  responses (R06).
- A07 `GET …/artifacts/../item.md` and friends are 404, never file
  content from outside the record folder (R07).

## Non-goals (permanent, from docs/SERVER.md)

Record/view/flow editing over HTTP · multi-user auth · databases as
truth · anything whose loss loses data.
