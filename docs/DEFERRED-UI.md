# Deferred UI features — folio IA that needs backend writes

Captured during the phase-2b UI build after comparing worktable against a
live, seeded folio instance (real folio screenshots reviewed 2026-07-24).
These are folio features worth having, but each requires expanding the
server beyond worktable's core principle — **the seal is the only write;
files are authored by agents / in obsidian / git** (folio's own
ADR-001). They are parked here deliberately, not forgotten.

## Built instead (the "free" folio IA — pure frontend, no new writes)

- Sidebar **project → view tree**: views grouped by their `source`
  folder (the project), nested with view-type icons, active-view
  highlight. Derived entirely from `GET /views`.
- Live **filter + group + sort bar** above every view (folio's shared
  FilterBar shape): filters/regroups/re-sorts the already-loaded
  records in the browser, state held in the URL. No file writes.

## Deferred — each needs a new write endpoint (revisit with the owner)

### 1. Saved filters/sorts on a view (folio: `useUpdateView`)
In folio a view *is* a saved filter/sort/group; changing a control
writes it back into the view. worktable's live controls are ephemeral
(URL only). To persist, either:
- **(a) frontmatter-authored, read-only from the UI** — a `filter:` /
  `sort:` / `group_by:` in the view's `.md` (written in obsidian or by
  an agent), which the server applies in `resolve_view`. This is a
  *read* change only (no UI write) and is the cheapest next step — it
  keeps seal-only-write intact while making saved views real. **Likely
  the first to pick up.**
- **(b) UI writes the view file** — a guarded `PATCH /views/<name>`
  endpoint. Breaks seal-only-write; needs a guard story.

### 2. Create from the UI (folio: `+ New work item`, `+ Add view`)
Create projects, views, and records from the rail/header `+` buttons.
Each is a filesystem write (a new folder, a new `views/*.md`, a new
`records/<domain>/<slug>/item.md`). Needs new write endpoints and a
guard model. Today these are authored in obsidian / by agents / in git
— the UI views + seals only.

### 3. Per-project field & status registries (folio: `fields`, `statuses` tables)
folio lets a project define its own status set + field types/labels.
worktable infers field types (ported `field-infer`) and maps statuses
to semantic categories (`statusCategory`) without per-project config.
A registry would need storage + a write surface. Inference is enough
until a real project needs custom statuses.

### 4. Inline edit (folio: click-to-edit title/status in the list row)
folio edits a field inline and persists. worktable rows open the
record; the only field mutation is the **seal** (a flow decision).
Inline edit of non-flow fields would need the field-write endpoint from
(1b).

### 5. Records in the rail / wiki nodes
folio's rail also lists a project's Wiki pages. worktable has no wiki
type; records are reached through a view, not the rail. Add only if a
"loose pages" need appears (read-only; would want a records-list
endpoint per source).

## Principle to preserve when revisiting

Any of these that introduces a write must keep the invariant legible:
**a flow-owned field (status, decisions) changes only through the
seal.** Non-flow field writes, if added, get their own guarded endpoint
and are never conflated with the seal.
