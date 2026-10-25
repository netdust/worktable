# Views and actions — design

Oct 24, 2026 · @Stefan. Parent: `specs/studio/spec.md`. Follows `studio-polish`, merged at 4cb4a7a.

## Why

The first real studio run worked end to end, and clicking through it showed what the grid still does wrong:
- a requested run says it is done before anything ran;
- the result never appears without a page refresh;
- the actions sit in a strip above the table and in a pile in the drawer;
- the seeded views are locked, and some duplicate each other.

Stefan: "we spend enough time finetuning UI". This is one round that settles it, not another round of small tweaks.

The rules from `studio-polish` still hold:
- the grid offers only what the person can do;
- every change is generic or declared by the domain, so no domain word enters the engine or the grid.

## Requirements

**Selection.**
- **R1 Tick boxes on hover.** A row's tick box shows beside its row number when the pointer is over the row, and stays while the row is ticked. While any row is ticked, every row shows its box. Keyboard focus on the number cell shows it too.
  Source: "have the checkbox show on hover, next to the number" — Stefan, 2026-10-24.
- **R2 A floating action panel.** The selection's count, its actions and "Selectie wissen" float in a panel at the bottom of the grid, over the rows, while rows are ticked. The strip above the table goes, and no row moves when the first row is ticked.
  Source: "have the action buttons show on floating panel at the bottom of the grid" — Stefan, 2026-10-24.

**A requested run.** These rules apply when this browser creates a record whose lifecycle state is one of its dataset's `live` states. It may do so through an action (from a selection or from one record) or through a plain create, such as "+ Nieuwe opdracht". *My call:* plain creates count too, because the worker picks them up the same way.
- **R3 It says what happened.** The toast says the action was requested ("… aangevraagd"), not done ("… uitgevoerd").
- **R4 It shows that it runs.** Until the created record leaves its live states, the floating panel shows an animated indicator with the action's label and the record's state. This holds even after the selection is cleared. The rows it acted on show the same indicator in their number cell. A drawer that follows a live record shows the same indicator, not the text "Volgt live" alone.
  Source: "make sure the indicator is more obvious then just the text label" — Stefan, 2026-10-24, after a health check on one site.
- **R5 The result appears by itself.** When the created record leaves its live states:
  - the view re-reads, along with the rail's counts, an open dashboard and an open drawer;
  - the panel shows the final state with its tone for a few seconds, then closes.

  The grid follows only the records this browser's own requests created, polling as the drawer already does. It stops when the page closes.
  Source: "once done, nothing actually changed, i need to refresh the page" — Stefan, 2026-10-24.
- **R5a Waiting on the person ends the run's indicator.** A record may reach a live state in which this viewer has a button to press, such as an update waiting for Bevestigen. At that point the follow ends as if the record had left its live states: the view re-reads, and the panel shows the state with a link that opens the record. The indicator never spins over something that waits on the person looking at it.
  Source: invented — my call; studio's live states include one that waits up to a day for Stefan.
- **R5b The follow outlives the page you started it from.** The run's indicator and its final state show at the bottom of the main area on every page (any view or a dashboard), not only on the table the run started from. The selection panel (R2) belongs to the table; the run's status belongs to the app.
  Source: invented — my call; R5 re-reads an open dashboard, so the follow must survive navigation.

**The drawer.**
- **R6 An action bar in the drawer's head.** A record's declared actions and its lifecycle buttons move into an icon bar in the drawer's head line, beside the step arrows, the widen button and close:
  - the primary button (R6 of `studio-polish`) shows as a button;
  - the other actions sit in a ⋮ menu;
  - an action with inputs opens them from its menu item.

  Nothing of the record's actions stays in the drawer's body. Verwijderen moves into the ⋮ menu and keeps its confirmation. *My call:* buttons on a linked item's line, such as "Niet nu" on one site of an opdracht, stay on that line, because they act on another record.
  Source: "the action buttons in the drawer are dumped there, if needed use a actionbar with exta menu like this" — Stefan, 2026-10-24, with a screenshot: a title, then save · ↑ ↓ · three view toggles · ⋮ · widen · close.

**How it looks.**
- **R7 Vertical lines.** A table shows lines between its columns by default, as visible as its row lines, in both themes. Bijstellen › Rasterlijnen still turns them off.
  Source: "the vertical lines are still not visible, the grid used to show these" — Stefan, 2026-10-24.

**Views.**
- **R8 A seeded view is a normal view.** By default, a view a domain seeds is a shared view that any administrator may change, rename, delete and restore, as a team dashboard is today. An editor copies it, as now. A public or for-owners seeded view keeps its administrator-only rule.
  *My call:* an administrator's change to such a view saves for everyone, the way a change to one's own view saves today, sort clicks included. An editor's change stays in their own browser with the "changed" mark, as on any shared view that is not theirs. The step-3f board rule in `docs/SPEC.md` ("on a locked or standard view that switch stays in the planner's own layout") is restated to match.
  Source: "we can't seed views that are just normal views? … having to option to lock views is not bad, but it should not be default" — Stefan, 2026-10-24, answering how far the lock should change; before that: "they can be there, but deletable, have me choose what views i want".
- **R9 A seeded view may be locked.** A domain may declare a seeded view `locked`, which keeps today's behaviour: read-only to everyone, copied to change, brought up to its declaration by `--seed-missing`. Only a locked view shows the lock.
  Source: as R8.
- **R10 The seed respects a person's change.** `--seed-missing` never overwrites, restores or adds again a seeded view that a person changed, renamed or deleted. Any saved change counts, a layout change included. A view nobody has touched still follows its declaration, and a removed declaration still removes an untouched view, as today. The seed's report names each view it left alone because a person changed it, so a later declaration change that does not land is visible.
  Source: invented — follows from R8, since a deleted view that comes back at the next start was never deleted.
- **R10a A dashboard tile whose view is gone.** A person may delete a view that a dashboard tile names.
  - The seed never fails over it. On an untouched seeded dashboard, it drops that tile and names it in its report.
  - On a dashboard a person changed, the tile shows that its view was deleted, and an administrator removes it in the composer.
  - The delete itself is never refused because a tile names the view.

  Source: invented — my call; today a missing tile view makes `--seed-missing` exit 1 and blocks every other seed change.
- **R11 A stored layout never empties a view.** A layout this browser keeps for a view may name a column the view does not have, for example one saved by another app at the same address. Each such sort key, filter, group or hidden column is dropped on read, and the rest of the layout applies.
  Source: invented — Stefan's Sites view showed no rows and "cannot sort on "start_at"" (2026-10-24), from a layout another app had stored under the same view number.

**Two follow-ups from `studio-polish`, on the same screens.**
- **R12** With a drawer open at 1280 px, the toolbar keeps to one row.
- **R13** A refused create says it could not be created, not "wijzigen".
  Source (R12, R13): invented — listed as follow-ups at studio-polish's close; folded in here because R2 and R6 rebuild the same screens.

**Studio's use (packages/studio).**
- **R14** Studio drops the seeded view "Alle sites", which repeats "Sites". The dashboard's "Sites in orde" progress tile takes its total from "Sites". *My call:* "Sites" gains the in-registry filter that "Alle sites" had, as every other site view has, so a site that left the registry never keeps that tile from being full. Such a site is still listed under "Sites met aandacht".
  Source: "there's 'alle sites' wich ofcourse already have, its the original dataset" — Stefan, 2026-10-24.
- **R15** Studio declares no locked view.
- **R16** A site's three update counts (`updates_plugins`, `updates_themas`, `updates_core`) may be empty. A failed read can then leave them empty, where today it can only keep a stale count or write a false zero. Empty is not zero: the table shows it blank and a total skips it.
  Source: invented — the studio-worker feature review (S13, 2026-10-24) found that a failed read must neither write "0 updates" nor leave an old count under a fresh check date.

## Non-goals

- Following runs that this browser did not request, such as the worker's schedule or another person's. A dashboard still refreshes on focus.
- Server push. Polling as the drawer already does is enough.
- Choosing which seeded views a new database gets. Stefan deletes what he does not want.

## Anti-goals

- A "done" message for something that has not run.
- A view that comes back after Stefan deleted it.
- Any domain word in the engine or the grid.

## Constraints

- `docs/SPEC.md` changes first: R8–R10 change the SavedView row's rule ("A seeded view is owned by the system owner `-1` … read-only to everyone").
- R8–R10 are an access rule: the plan owes a threat model.
- Theatre and fiche declare no locked view, so their seeded views unlock too (R8 is the default). Their tests follow the new rule, named in the plan.

## Left to the builder

- How a seeded view remembers that a person touched it (a column, or its revisions), and the declaration's name (`locked: true`).
- The panel's exact place and size, the indicator's form and how long the final state stays (R5), within the grid's visual language.
- Which icons the drawer's action bar uses for the record's actions.
