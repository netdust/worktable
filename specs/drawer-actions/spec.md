# Drawer actions — design

Oct 22, 2026 · @Stefan. Parent: `specs/studio/spec.md`. Follows `specs/selection-actions/spec.md`; studio's revised plan builds on both.

## Why

Studio's update flow was: tick sites in Sites, click Bijwerken, then go to the dashboard (or Opdrachten) to read the preview, drop a site with a × in a table cell, and click Bevestigen. Stefan:

> "i select some site, click bijwerken. then i need to go to the dashboard to click an other button? thats a weird flow. i understand the second step, prepare the update and give me chance to look at it... but maybe this should happen in a opdracht drawer or a popup that opens instead of me having to nivagate around the app" — Stefan, 2026-10-22

> "yes, spec it that way, make sure the way it works is general enough so we don't need to update the engine every time we have new actions performed on rows" — Stefan, 2026-10-22

So:
- the record an action makes opens in the drawer right away;
- the drawer follows an outside process live;
- the drawer offers the next steps as buttons.

All of it is declared by the domain. A new button, a new state or a new kind of request is a domain change, never an engine change.

## What the person sees (studio as the example)

1. In Sites, Stefan ticks five sites and clicks **Bijwerken**.
2. The new opdracht opens in the drawer, without leaving Sites. It shows "Aangevraagd", then "Voorbereiden", with a busy mark, and its five sites each with their state.
3. As the worker prepares each site, the drawer updates by itself. Each site line gains its summary, e.g. "WordPress 6.6.1 → 6.6.2 · 4 plugins · YOOtheme 4.4 → 4.5". The opdracht's own summary reads "2 van 5 voorbereid"; the worker writes that text, and the engine only shows it.
4. When the preview is done, the drawer shows **Bevestigen** and **Annuleren** for the opdracht, and **Niet nu** on each site line.
5. Bevestigen moves it on. The drawer follows the run ("Bezig") until every site reads klaar or mislukt.
6. Closing the drawer at any point loses nothing. The opdracht waits on the dashboard under Te bevestigen. Clicking its row there opens the same drawer, with the same buttons, without leaving the dashboard.

## Requirements

- **R1 Declared transitions are buttons.** A lifecycle transition may declare a drawer button: its own button label, separate from the `label` the action-token page uses, so no existing transition becomes a button by itself. In every drawer (the table's, a related record's, the board's, calendar's, timeline's and gallery's, and a dashboard row's (R7); the matrix's drawers are left out), each transition that:
  - declares a button,
  - leads out of the record's current state,
  - lists the viewer's role, and
  - matches its condition, when it has one (see R6)

  shows as a button with that label. Pressing it writes the transition with `expect` set to the current state, the engine's existing compare-and-swap. A refusal (a writer rule, a lost race, a role) shows as a notice. A success re-reads the record and makes one Undo entry. A domain adds or removes a button by adding or removing a labelled transition.
  Source: "make sure the way it works is general enough so we don't need to update the engine every time we have new actions performed on rows" — Stefan, 2026-10-22.
- **R2 Buttons on link items.** In a drawer's link list, each link item whose link dataset declares a lifecycle offers that link record's buttons (R1's rule, on the link record). Studio's "Niet nu" on one site of an opdracht is a declared transition on the site link. Its condition reads the parent's state through a lookup, so it shows only while the opdracht waits for confirmation.
  Source: as R1; "Niet nu (take one site out)" — playback approved 2026-10-22 ("yes, spec it that way").
- **R3 An action opens what it made.** An action (single or selection) may declare that it opens its result. After a successful run, the grid opens the drawer of the first record the run created, or, for a single action that created nothing, the record it ran on. That drawer is a full one: R1, R2, R4 and R5 apply, wherever the action was pressed (the selection bar, a drawer).
  Source: "maybe this should happen in a opdracht drawer or a popup that opens" — Stefan, 2026-10-22.
- **R4 A drawer is live while an outside process has the record.** A lifecycle may name its live states: the states in which an outside process (a worker, an agent) is busy with the record or will pick it up next. While an open drawer's record is in one, the drawer re-reads the record and its link items every 3 seconds and shows a busy mark. It stops when the record leaves those states or the drawer closes. No list view polls. Progress text ("2 van 5") is an ordinary column the outside process writes, not an engine feature.
  Source: as R3; "Voorbereiden… 2 van 5 sites" in the playback approved 2026-10-22.
- **R5 A link item can carry a detail line.** A link declaration may name a column of the link dataset whose text the drawer shows under each link item: studio's per-site summary of what an update changes.
  Source: as R4; the playback's "WordPress 6.6.1 → 6.6.2 · 4 plugins · YOOtheme 4.4 → 4.5".
- **R6 Actions and buttons may say when they apply.** A declared action (single or selection), and a declared transition button, may carry a condition on its record: each named column (a stored column or a lookup) equals a value, or is one of a list.
  - The server is the one judge. On every row it serves (and on every link item), it marks which declared buttons and actions apply for this viewer: role, current state and condition. The grid shows only what the server marked.
  - The server refuses an action run on a record that does not match (422).
  - A transition's condition decides only whether its button shows. Whether the transition itself is allowed stays with the lifecycle's roles and the domain's writer, as today, because a button press is an ordinary transition write.
  - For a selection action, every selected record must match. The selection bar disables the action, with "Past niet op N rijen", when any ticked row does not.

  A new state-dependent button is then a declaration too.
  Source: as R1. Invented — approved with this spec. It is the action-side twin of R1's state rule.

- **R7 A dashboard list row opens its drawer.** A row in a dashboard list tile whose view reads a dataset opens that record's drawer on the dashboard, with R1–R5, instead of nothing. Tiles over queries keep today's behaviour. Studio's Te bevestigen tile then opens the opdracht in place.
  Source: "instead of me having to nivagate around the app" — Stefan, 2026-10-22. Invented — approved with this spec.

## Settled after the builder check (Claude's calls, 2026-10-22)

- **Live states include waiting states** (R4). A drawer opened right after the action shows the record in aangevraagd, which only the worker moves; after Bevestigen it is in bevestigd, which only the worker moves. Studio's live states are aangevraagd, voorbereiden, bevestigd and bezig. A scheduled request's open drawer polls too, which is harmless, because it only polls while the drawer is open.
- **A drawer button is opt-in** (R1). Theatre already labels uitgenodigd → bevestigd and → geweigerd for the person's token page, for every role including editor. Reusing `label` would put "Bevestigen" and "Weigeren" in planners' drawers. A separate button declaration keeps theatre unchanged.
- **Conditions are equality and lists only, and the server judges them** (R6). That is enough for every state-dependent button studio needs. The server marks availability on each row it serves, so the grid needs no second rule engine and cannot disagree with the server.
- **A transition's condition is about its button, not the transition** (R6). The same transition may be written by a service in another state; for studio, the worker skips a site at apply time. Whether a transition is allowed stays with the roles and the writer.
- **The matrix's drawers are left out** (R1). No domain needs buttons there yet.
- **Progress is a domain column** (R4). The engine has no notion of "done" link states.
- **Dashboard rows open a drawer** (R7). The flow Stefan asked for must also work from the dashboard, where he starts on a Monday.

## Non-goals

- Push from the server (websocket, server-sent events). R4 polls, and only an open drawer.
- Live list views or live dashboard tiles. They refresh as today.
- Bulk transitions from the selection bar. Selection actions cover bulk.
- Changing the action token page (`Act.tsx`), which already uses transition labels.

## Anti-goals

- A button the server would refuse by role, shown anyway.
- Polling that never stops, or that runs with no drawer open.
- Any domain word in the engine or the grid.
- A second write path for transitions. R1 and R2 use the existing PATCH with `expect`.

## Constraints

- The engine stays domain-free (`AGENTS.md`). `docs/SPEC.md` changes first: `/schema` serves a lifecycle's live states, a link's detail column and an action's opens flag. Each served row and link item carries the marks: the buttons and actions that apply for the viewer, with their labels (revised after the plan review: `/schema` does not list the transitions themselves).
- The existing lifecycle semantics are unchanged: the roles, `expect`, undo by inverse, hooks and tokens. Unlabelled transitions stay as they are. They are written by services, by the board, or by tokens.
- Dutch UI copy.
- The buttons write through the lifecycle column, so they are a security surface: the plan owes a threat model.

## How studio uses it (for the studio plan, not built here)

- actie's lifecycle declares buttons:
  - voorbereid → bevestigd "Bevestigen", administrator only, as today;
  - every user transition into geannuleerd "Annuleren".

  Its live states are aangevraagd, voorbereiden, bevestigd and bezig. Its samenvatting carries the worker's progress text.
- actie_site gains a lifecycle on `state`:
  - te_bevestigen → overgeslagen, button "Niet nu", for users, with the condition "the opdracht is voorbereid" through a lookup on actie_id;
  - overgeslagen → te_bevestigen, button "Toch wel", under the same condition, allowed by the writer only when the link has a voorstel.
  
  The worker's own link transitions stay unlabelled, written with `expect`. Its `voorstel_samenvatting` (or a similar text column) is the link's detail line.
- The four selection actions on Site declare that they open the opdracht they create.

Dropping a site from a request then happens in the drawer, by "Niet nu". The × in the Opdrachten table's Sites cell is no longer the way.

## Left to the builder

- The declaration names: the button field on a transition; the live states on `LifecycleDecl`; `detail` on `LinkDecl`; `opens` and `when` on actions and transitions.
- Where the buttons sit in the drawer, and the busy mark, within the grid's visual language.
- The poll's backoff on an error, and whether it pauses while the browser tab is hidden.
