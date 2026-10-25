# Action row: a calmer table and the drawer's actions in its body

Parent: `specs/studio/spec.md`. Follows `views-and-actions` (merged 2026-10-25, main 6e2df3a).

## Why

Stefan used the grid live after views-and-actions, with the 28 real sites in the dark theme. He found the table out of
balance. He also missed **Bevestigen** on a prepared update, because it sat in the drawer's head, and he thought the
update was stuck. This round undoes part of views-and-actions' R6 and calms the table. It opens nothing new.

Goals: the table reads quietly; a record's actions are where his eye already is; a site opens in one click.
Non-goals: logging in as an administrator on a site, a new theme, new actions. Login as admin is the next round: a Netdust mu-plugin on each studio site (its own repository, installed outside `deploy.payload`, signed requests, single-use login links), which can also report health without WP-CLI. Stefan agreed to the idea on 2026-10-25 ("installing a mu-plugin to facilated some feratures is a good idea, no?").
Anti-goal: a primary action a person can miss.

Approved by Stefan on 2026-10-25: "nothing missed, approve the spec, write the plans".

## Requirements

**The table.**
- **R1 Quieter lines.** The table's lines between columns and between rows are subtler than today's in both themes. They
  are still visible in the dark theme, but they no longer compete with the text. Bijstellen › Rasterlijnen still turns
  the column lines off.
  Source: "you overdid it with the grid contrast, the lines can be mure subtle" — Stefan, 2026-10-25, with a screenshot of Sites in the dark theme.
  Source (again): "also contrast between lines and background can be lower" — Stefan, 2026-10-25, on the first version of R1–R3. Measured against his reference screenshot: dark row line about 18 above the background, column line about 10.
- **R2 One text size.** Every cell of a table row uses the same font size (13px) and the same face: text, numbers,
  dates, versions, labels, pills, switches and the row-number gutter. The title differs in weight and colour, never
  in size. Numbers, dates and versions use the body face with tabular figures, no monospace. A row is 32px tall in the
  default density (compact 28px, roomy 40px), the table only; the matrix keeps its own.
  Source: "fontsize in each cell should be the same, not sometimes bigger ( textfields seem bigger )" — Stefan, 2026-10-25.
  Source (again): "no the grid is not ok, fontsizes per cell are not the same, heres a example screenshot of what looks good ( fontsize and cell height )" — Stefan, 2026-10-25, reference screenshot: one 13px face, 32px rows, pills at text size. This replaces the earlier "my call" that numbers keep a monospace face.
- **R3 The totals bar is pinned at the bottom of the table.** "Totaal · N rijen" sits below the rows at the bottom of the
  table pane and is never drawn over rows. Under the last row there is empty scroll space, and the selection panel
  floats over the grid above the totals, in that space; rows scroll visibly under it, and the last row can be scrolled
  clear of it. The grid's viewport does not shrink when rows are ticked. The matrix keeps its own foot.
  Source: "there's a bar ( totaal 28 ) floating above the actions" — Stefan, 2026-10-25, screenshot.
  Source (again): "why is the action panel not hovering? it pushes the up the grid bottom and that's weird, just have it hover over de the grid at the bottom" — Stefan, 2026-10-25, on the first redo of R1–R3.
  Source (again): "this is how nocodb ends its grid, we can do the same" — Stefan, 2026-10-25, NocoDB screenshot: empty scroll space under the last row, floating controls above a footer pinned at the pane's bottom.

**The drawer.**
- **R4 The actions are a row in the drawer's body.** A record's lifecycle buttons and declared actions leave the
  drawer's head and form one action row in its body:
  - the primary action (for example Bevestigen) is a filled button and comes first;
  - the other actions sit beside it on one line as quiet buttons, never stacked one under another;
  - when they do not fit on one line, the rest go into a "Meer" menu at the end of the row;
  - an action with inputs opens them under the row.
  Source: "otium update stays on voorbereid, as if i need to do something. i did not see the bevestigen button. this indicates that action button in the header ( as i asked ) is not a good idea. they should move underneath the 'Sites' section, but dont have 4 buttons underneath eachother, give it some good UI" — Stefan, 2026-10-25.
- **R5 Where the row sits.** On a record with linked items, like an opdracht's Sites, the row sits directly under the
  first linked list. *My call:* a record without one, like a site or a taak, has the row directly under its fields.
  Source: as R4 for the opdracht. The rest is *my call*, put to Stefan on 2026-10-25 and answered "continue".
- **R6 The head keeps the record's own tools.** The drawer's head keeps the step arrows, widen and close, plus a ⋮ menu
  that holds only Link kopiëren, Nieuwe link and Verwijderen (with its confirmation). A linked item's own buttons, such
  as "Niet nu" on one site of an opdracht, stay on that item's line.
  Source: follows from R4; the record tools are views-and-actions R6, unchanged.
- **R7 Visit site.** A site's drawer has a "Website openen" icon button in its head, next to ⋮. It opens the site's
  public address in a new tab. A site with no known address shows no button.
  Source: "2 good buttons ( icons ) in the header of the drawer are visit site / login as admin into the site" — Stefan, 2026-10-25. He agreed ("continue") that the studio may keep each site's public production address for this button, though it comes from `site.yml`. Login as admin is deferred to its own round.

**Studio and worker.**
- **R8** A site record holds its public production address. The worker's registry sync writes it from the site's
  `site.yml` (`environments.production.url`) and keeps it current. No other `site.yml` value enters the studio.
  Source: as R7.
- **R9** After the worker updates a site, it reads the site's update counts again, so the table no longer shows the
  updates it just applied. Today otium kept "7 plugin updates" after 7 plugins were updated, until the next health check.
  Source: invented — found in the otium update of 2026-10-25; approved 2026-10-25 ("approve the spec").

## Left to the builder
- The exact line colours and font size, within R1 and R2, shown to Stefan in screenshots in both themes before the
  rest of the round goes on.
- How the engine says which field is a site's address, or whether a generic "link to open" declaration serves it. The
  engine stays domain-free.
- R1–R7 live in worktable (`specs/action-row/plan.md`). R8 and R9 live in netdust-studio (the worker) as two plans: `specs/fresh-counts/plan.md` (R9, buildable now) and `specs/site-address/plan.md` (R8, after action-row is live).
