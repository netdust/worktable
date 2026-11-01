# Selection actions — design

Oct 22, 2026 · @Stefan. Parent: `specs/studio/spec.md`. Studio's plans are revised to sit on this (`studio-domain` paused at Task 5).

## Why

Studio's first cut targeted every bulk action at a *group* of sites, because the grid cannot select rows and actions run on one record at a time. Stefan clicked through it and rejected that: "i find this a bad solution. a button that acts on the filtered items is better and/or making sure grid items are selectable should also be possible." He then asked whether this is "a better path? more natural to work with? if so, yes, engine first". It is: it works the way a grid works. Saved views already are named sets ("SLA-sites", "YOOtheme sites"). What the person saw when they clicked is exactly what the action records, which a group could not promise.

The work is domain-free. Studio needs it first. Theatre can use it later, for example to confirm several slots at once.

## What the person sees

On a table view of a dataset that declares a selection action:
- A checkbox in front of every row, and one in the header.
- Ticking rows shows an action bar above the grid: "3 geselecteerd", one button per selection action, and "Selectie wissen".
- The header checkbox selects every row the view shows: its filter, the space and the toolbar's search, folded groups included. The grid loads a whole view, so that is "everything in this view".
- Above 500 selected, the action buttons are disabled with "Maximaal 500 tegelijk".
- Pressing an action opens its inputs, as an action in the drawer does today. It runs once, as one batch, and its notice offers one Undo for the whole run.
- Opening one record's drawer from the table offers the same selection actions, run on that record alone.
- In the table's drawer, a link item opens the link's own record to read, so a link table kept out of the tree stays readable (studio's per-site preview). Adding and removing links stays in the sheet's links cell, as today.

## Requirements

- **R1 Selection actions.** A domain declares an action that runs once on a set of records of one dataset, beside today's single-record actions, which stay unchanged. Its `run` receives every selected record, its inputs and the context. Whatever it creates or updates lands in one batch and one transaction, and any refusal rolls back all of it.
  Source: "a button that acts on the filtered items is better and/or making sure grid items are selectable should also be possible" — Stefan, 2026-10-22.
- **R2 Selecting in the table.** The table view of a dataset with a selection action shows the checkboxes and the action bar described above. A run acts on the ids selected at the moment of the click, never on rows added later; the client sends those ids. Only the table skin selects; the board, calendar, gallery and matrix do not.
  Source: as R1.
- **R3 The server re-reads every id.** Each id is read as the caller, as a single action reads its record: unseen, outside the caller's scope, or deleted → 404 on the whole run. No ids, duplicates, or more than 500 ids → 400. The response names the batch and the created records, as today.
  Source: invented — the single action's own rule applied to many; approved with this spec.
- **R4 The drawer offers it on one record.** The table view's drawer, where single actions show today, offers each selection action, run on the open record alone. Other drawers (relation, board, calendar, gallery, dashboard) do not, as for single actions today. That is how studio's per-site action works with no second declaration.
  Source: invented — approved with this spec. It replaces studio's `<soort>_site` actions.
- **R5 A dataset can stay out of the tree.** A dataset may declare that the grid's tree leaves it out; the API is unchanged. In the table view's drawer, a link item now opens the link's own record, read-only, as a related record opens today. Adding and removing links stays in the sheet's links cell, as today. So the records of a link table out of the tree stay reachable: read from the drawer, removed from the cell. It is for link tables a person never browses, such as studio's `actie_site`. A section may not list such a dataset.
  Source: "ok, go ahead with the engine spec" — Stefan, 2026-10-22, approving a list that named "keeping a table out of the sidebar". The link tables in the tree were raised by Claude on 2026-10-22.
- **R6 Adding from a query asks what it needs.** On every view of a query that `creates` in a dataset (the table and the calendar alike), `+ Nieuw` opens that dataset's quick-create dialog whenever the new record still needs a title or another field the view cannot fill. The dialog asks title, required fields and space, as the dashboard's does, and saves into the dataset. The query reads again, and one Undo removes the record. Studio's Agenda is a calendar on a query that creates `agendapunt`, so a person adds to the agenda from the agenda.
  Source: "an Agenda should work like an agenda, i add by hand but it can also import data, so agendapunten should not exist, its confusing" — Stefan, 2026-10-22.
- **R7 The MCP can start one.** `@worktable/mcp`'s `action` tool also takes `ids` for a selection action, so Claude can start a studio request on a set of sites. It is the same route, with the same checks.
  Source: invented — approved with this spec. Without it, Claude could no longer start a request once studio drops its per-site actions.

## Non-goals

- Selection in skins other than the table.
- Bulk edit of fields (set a column on all selected rows), and bulk delete.
- Selections that persist across views or reloads.
- An action whose set is re-evaluated later: a run always acts on the ids sent.

## Anti-goals

- A run touching a record the person did not see or could not read.
- A run of N records producing N batches, N notices or N undos.
- Any domain word in the engine or the grid.

## Constraints

- The engine stays domain-free (`AGENTS.md`). `docs/SPEC.md` changes first: the engine's surface gains selection actions and the out-of-tree flag.
- The single-record `ActionDecl`, its route and theatre's actions stay byte-compatible.
- UI copy is Dutch, like the rest of the grid.
- Selection is a security surface (input parsing, scope per record), so the plan owes a threat model.

## Settled after the builder check (Claude's calls, 2026-10-22)

- **No separate "Alle N".** The grid loads a whole view (up to the engine's 5000), so the header checkbox is "all in this view", and the client already holds the ids. Over 500: the buttons are disabled with a message.
- **The browser proof runs on the engine's own test fixture domain,** served as a third instance in the e2e harness. That fixture gains:
  - a selection action;
  - a dataset kept out of the tree, reached through a link;
  - a query that `creates`.

  Theatre and fiche are untouched. Studio's revised plan then uses all three for real.
- **R5 includes opening a link item's own record, read-only, from the table's drawer.** Without it, a link table out of the tree strands its records. Studio needs them to read each site's `voorstel`. Studio drops a site before confirming by removing it from the request row's links cell in the table, which the sheet's links editor already does (as theatre's dagplanning removes a link). No drawer gains a field editor. (After the plan review, 2026-10-22.)
- **R4 is the table view's own drawer only,** the same place single actions show today. The other drawers can follow when a domain needs them.
- **This branch is cut from `main` after `feature/studio-mcp` merges.** R7 extends that package's `action` tool.

## Left to the builder

- The declaration's exact shape (a flag on `ActionDecl`, or its own type) and the request body (`ids` beside `id`).
- Keyboard and shift-click range selection: worth having if it is cheap in the existing grid, not required.
- Where the action bar sits relative to the toolbar, within the grid's existing visual language.
