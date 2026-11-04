# Work model: categories, parents, editable skins, a default view

Written on 2026-11-04 from a conversation with Stefan that started from Orbit (coollabsio/orbit): what a
dedicated task app has that worktable's generic skins lack. A parent spec, cut into three plans (see "The
cut"). A requirement marked `invented` is Claude's call and waits for Stefan's approval of this document.

## Why

Worktable draws any dataset with the same skins and knows no domain word. That is its strength, and it is
why three things a task app takes for granted are missing:

- **What "done" means.** Every status column has its own words. Studio's writer hard-codes `gedaan` and
  `overgeslagen` to count `voortgang`; the timeline hides cancelled bars by reading the tone `bad`; a queue or
  a "Te doen" view would need to know, per dataset, which options are still open.
- **Work inside work.** A plan has tasks, a task has steps. Today that is faked with `werkpakket_id` plus a
  `stap` label.
- **Skins you work in.** Every skin but the grid and the matrix is read-only (SPEC, Skins: "In v1 every skin
  but the grid and the matrix is read-only"). Taken are useless as a grid, yet the board is the only other place
  where anything can be changed.

> "Catégories / Parent Id / Every skin is editable with logical actions for what it is / And last a skin can be
> set as default view (tasks for instance are useless as grid, but default could be bord or grouped list)"
> — Stefan, 2026-11-04

## Requirements

### R1 — Categories on an options column

An options column may declare `categories: { <option>: open | active | done | cancelled }`, one category per
option, every option named once. The four words are generic English, so the engine stays domain-free. A
lifecycle column may declare them too.

The engine and the grid read categories, never option names, wherever they mean "still to do" or "finished":

- **Progress** (R2) counts `done` over everything that is not `cancelled`.
- **Every skin but the grid** hides `done` and `cancelled` rows by default, with one toggle in the chip row
  ("Afgerond tonen") that the view's layout remembers. The grid shows everything, as now.
- **A status chip** in the grid, on a board card and in the drawer shows the category's mark beside the tone:
  an empty circle, a half circle, a check, a cross.
- **The timeline** draws a `cancelled` bar as cancelled, instead of reading the tone `bad`.

A column without categories behaves exactly as today. Declaring categories on a column that has no options is
refused at startup, as is a category word outside the four, or an option with none.

Source: "Catégories … sound good" — Stefan, 2026-11-04, after Orbit's `StatusCategory`
(`crates/orbit/src/workspace.rs:201`). The four words and "hidden by default outside the grid" are `invented`.

### R2 — A parent, and progress from children

A dataset may declare `parent: <column>`, a relation column to the dataset itself. The engine refuses a write
that would make a row its own ancestor (422 `parent_cycle`), and refuses a parent outside the caller's scope
as it refuses any relation.

- **The grid** shows a dataset with a parent as a tree: children indented under their parent, collapsed or
  open per view, sorting within each level. Filtering keeps a matching child's ancestors, greyed.
- **The drawer** lists a row's children with their status chips and offers "+ Subtaak" (the dataset's new
  label), which creates a child with the parent set.
- **Progress.** A dataset may declare `progress: { dataset, key, column }`: the rows of `dataset` whose `key`
  is this row's id, counted by the categories of their `column`. A dataset with a `parent` and categories gets
  progress from its own children without declaring it. The engine serves progress as a read-only value on
  each row (`{ done, total }`, cancelled left out), so no writer computes it and it is never stale. The board
  card, the grid row and the drawer show it as "done/total" with a thin bar.

Source: "parent is sound good" — Stefan, 2026-11-04, after Orbit's sub-issues (`parent_id`,
`SubIssueProgress`). The cycle refusal and the cross-dataset `progress` are `invented`.

### R3 — Every skin is editable, by the action that fits it

The SPEC's "read-only in v1" line goes. Each skin offers the edits that its shape means, and nothing more.
Every edit is an ordinary write: through the writer and the lifecycle check, with a revision, one undo, and an
optimistic display that snaps back with the writer's refusal when it is refused. A skin offers an edit only on
a column the viewer may write (role, `readonly`, `written_by`, a lookup or a derived value are never offered);
on a query, only through a column that `writes` to a dataset.

| Skin | Edits |
|---|---|
| Board | Drag a card to another column: writes the column (a transition on a lifecycle column). Drag within a column: manual order, as now. "+" in a column: create with that value. |
| Calendar | Drag an item to another day: writes its day, keeping its time. In week view, drag to another hour or pull its end: writes start and end. Click an empty day or slot: create with that date or time. |
| Timeline | Drag a bar: moves start and end together. Pull an edge: writes start or end. Draw on an empty row: sets the dates of a row that has none. Drag to another lane: writes the lane relation. Snaps to days. |
| Gallery | Drag a card to another group: writes the group column. Drop a file on a card: an attachment of the gallery's kind. |
| Grid | As now, plus R2's tree: drag a row onto another to make it a child, or out to the top level. |
| Matrix | As now. |

A calendar or timeline item whose dates are a lookup or derived is not draggable and says why on hover. The
lifecycle column moves only by declared transitions; a drop on a column no transition reaches is not offered.

Source: "Every skin is editable with logical actions for what it is" — Stefan, 2026-11-04. Which edit each skin
offers is `invented`, after Orbit's timeline (`features/tasks/timeline/useTimelineDrag.ts`: move, resize, draw,
day snap, Escape cancels).

### R4 — A default view per source

Each source has one default view: the view the rail opens when the source is chosen, and the view a link to
the source opens. An administrator marks any shared view of the source as its default from the view's menu
("Standaardweergave"); marking one unmarks the other. A domain's seed may mark one. Without a mark, the first
view opens, as now. A planner's own unshared view is never a default.

For Studio the seed marks: Taken → a board on status; Features → the board on `fase`; Opdrachten → the board
on status. A grouped list is the grid grouped by a column (the grid groups today); it is offered as a default
like any other view.

Source: "a skin can be set as default view (tasks for instance are useless as grid, but default could be bord
or grouped list)" — Stefan, 2026-11-04. Who may set it and the three Studio defaults are `invented`.

## Studio adopts it

- `taak.status`: open → open, bezig → active, geblokkeerd → active, gedaan → done, overgeslagen → cancelled.
  `taak` gains `parent: 'parent_id'`.
- `werkpakket` declares `progress: { dataset: 'taak', key: 'werkpakket_id', column: 'status' }`; the stored
  `voortgang` column and its writer code go, replaced by the engine's progress. The worktable skill in
  netdust-plugins stops naming `voortgang` and keeps writing the werkpakket last for `bijgewerkt`.
- `actie.status` and `actie_site.state` declare categories; `werkpakket.fase` too (ontwerp, plan → open;
  bouwen, review, geblokkeerd → active; klaar → done; geparkeerd → cancelled).

## Out of scope

The queue skin and the "Te doen" query (next, on R1); task relations (blocks, blocked by); a comment thread per
record; chat; GitHub sync. None is built, stubbed or prepared for here.

## The cut

Three plans, each its own `feature/<name>` branch, in this order because each builds on the one before:

1. **`categories-parent`** — R1 and R2, engine and grid, and Studio adopting them.
2. **`editable-skins`** — R3, one skin at a time behind the same write path; board first (it is nearly there),
   then calendar, timeline, gallery.
3. **`default-view`** — R4.

## Open questions for Stefan

1. Should a parent's status follow its children (all done → parent done)? Proposed: no, never automatic;
   the drawer says "alle subtaken afgerond" and offers the button.
2. Calendar and timeline create on an empty day: a quick title field in place, or the full new-row drawer?
   Proposed: quick title, like the board's "+".
