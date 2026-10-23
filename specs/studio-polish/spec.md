# Studio polish — design

Oct 23, 2026 · @Stefan. Parent: `specs/studio/spec.md`. Follows `selection-actions`, `drawer-actions` and `studio-domain`, all merged.

## Why

Clicking through studio-domain's first working version and its shake-out turned up rough edges in worktable itself, not in studio. Studio's rules already refuse every one of the wrong writes. But the grid offers things a person cannot do, and it states some things wrongly:
- inline edits on columns only the worker writes;
- boards that drag and then snap back;
- "+ Nieuw" buttons that are refused;
- totals that add up HTTP codes;
- a live mark that reads like a status.

Stefan: "lets merge and have the coder resolve the bugs it found but which are not ours". Asking how a site is added: "'+ Nieuw' buttons on Sites should be there no?". The answer is no: a site comes from its `site.yml`, so the button must not be offered.

The rule for every item: the grid offers only what the person can do, and says it the way the person reads it. Each fix is declared by the domain or generic in the grid, so no domain word enters the engine.

## Requirements

**Who may write (engine shapes, enforced by the engine).**
- **R1 A column only services write.** A column may declare that only service accounts write it. To a person, `/schema` serves it read-only, so the table offers no inline edit and the board does not drag on it. The engine refuses a person's write to it, 403, before the writer runs. Services write it as today.
  Source: "a column a person may not write, served read-only to them" (studio-domain review U5/U7), accepted by Stefan ("lets merge and have the coder resolve the bugs").
- **R2 A dataset only services create.** A dataset may declare that only service accounts create its rows. To a person, the grid then offers no "+ Nieuw", no board-column "+" and no quick create. The engine refuses a person's create, 403.
  Source: "'+ Nieuw' buttons on Sites should be there no? i need to be able to add sites? or how else is a site added?" — Stefan, 2026-10-23, answered: sites come from `site.yml`.
- **R3 Attachments a service may not delete.** An attachments declaration may say that only people delete its files. The engine refuses a service's attachment delete, 403, by the delete route and by the undo of its own upload. This brings Ruling D to the screenshots.
  Source: the studio-domain security review (N3). Invented — approved with this spec.

**How it reads (declarations the grid honours).**
- **R4 A board may be grouping only.** A board may declare that it does not drag. Its cards still open.
  Source: U5. The "Opdrachten per status" board drags opdrachten through worker steps, which studio refuses (shake-out F1).
- **R5 A column says what its total is.** A number column may declare its footer: a sum (as today) or nothing.
  Source: U9. "HTTP 1100" is five status codes added up.
- **R6 A declared button may be the primary one.** A transition button may declare itself primary. The drawer shows it filled; the others stay quiet.
  Source: U11. Bevestigen and Annuleren look alike.
- **R7 A link may hide its meter.** A link may declare that its head shows no "have/need" count.
  Source: shake-out. "Sites 2/2" reads green and full before anything ran.

**Grid fixes (no declaration).**
- **R8** The live mark reads "Volgt live", not "Bezig…", so it is never mistaken for a status. (U10)
- **R9** After a button press or an Undo, a drawer re-reads its history as well as its record: the table's, a related record's, the board's and the dashboard's.
- **R10** The title pill shows the worst tone present: Storing before Let op. Both show when both are present.
- **R11** A save error never wraps the toolbar, and the toolbar's "+ Nieuw …" never covers an open drawer's title.
- **R12** A record's actions sit right under its buttons at the top of the drawer, not at its foot.
- **R13** A failed request because the server cannot be reached reads in Dutch: "Geen verbinding met de server. Probeer het opnieuw."
- **R14** A view of a query that creates nothing shows no "+ Nieuw" button at all (it shows a disabled "Nieuw <query>" today).
- **R17** A lifecycle column whose transitions declare buttons is changed through its buttons only: no inline select in a table, no drag on a board grouped by it. (Added by the plan review: the Opdrachten table's Status cell offered every status.)
- **R18** Sites and log rows are never deleted, so their drawer offers no Verwijderen and the engine refuses a delete. Studio's site and onderhoud writers simply declare no delete, which the engine already turns into both (added by the plan review: the shake-out's refused Verwijderen).
- **R19** The table's row separators stay visible at any display scale: a slightly stronger line than today's 1px `--color-border-subtle` (#e7eaee), which can vanish at 125–150% Windows scaling. Every domain's grid. Source: "for the grid, the horz lines are gone. there used to be thin seperation line" — Stefan, 2026-10-23 (they are present but too faint).

**Selection on a query (engine and grid).**
- **R15** A query declared `of` a dataset, whose rows' ids are that dataset's record ids, may declare itself selectable. Its table view then offers the dataset's selection actions on the ticked rows, which the server reads as that dataset's records, each as the caller. Studio's "Sites met aandacht" becomes tick-and-run.
  Source: U6 ("These need attention → check them" goes through Sites today).

**Studio's use (packages/studio).**
- **R16** Studio declares:
  - Site: naam, in_registry and the health columns are service-written (R1); Site is service-created (R2); the screenshots are person-deleted only (R3).
  - Onderhoud is service-created (R2).
  - "Opdrachten per status" does not drag (R4).
  - statuscode, responstijd_ms and tls_dagen total nothing (R5).
  - Bevestigen is primary (R6).
  - The opdracht's sites link hides its meter (R7).
  - "Sites met aandacht" is selectable (R15).

  Studio's writers keep their own rules as a second net.

## Non-goals

- Average or other footer kinds. A sum or nothing is enough today.
- Changing any studio rule. Only how the grid offers and shows them.

## Anti-goals

- A control the person sees that the server will refuse.
- Any domain word in the engine or the grid.

## Constraints

- `docs/SPEC.md` changes first: the engine surface gains R1–R7 and R15.
- Theatre and fiche declare none of the new shapes, so their behaviour is unchanged. R8–R14 change every domain's grid; their existing tests follow the new behaviour, named in the plan.
- R1–R3 and R15 are access rules: the plan owes a threat model.
- The import and the view seeding are trusted: they still write and create where R1 and R2 refuse a person.

## Left to the builder

- The declaration names (e.g. `written_by: 'service'`, `created_by: 'service'`, `deleted_by: 'user'`, `drag: false`, `footer: 'none'`, `primary: true`, `meter: false`, `selectable: true`).
- Where exactly the action buttons and the primary style sit, within the grid's visual language.
