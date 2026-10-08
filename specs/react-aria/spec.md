# React Aria: the grid's UI parts from one library

Branch `feature/react-aria`, cut from `feature/field-contract` at 8759e91 (which holds the
unmerged grid-toolbar work and the approved `specs/field-contract.md`). The approved look is
today's grid and `design/grid-prototype.html`.

## Why
Stefan, 2026-10-08, after the grid-toolbar shake-out, on the date editor showing `09/10/2026`
and the to-many and select editors:
> "with fields there are still design issues"
> "i don't want to create to many custom fields, but the ui has to be tight"
> "i assume switching layout repo is too late?" — then, choosing to switch now: "i go for 3"
> "use as much from library as possible, custom components behave different, tight I mean it looks good and is a joy to use"

Sakani (`@sakaniui/react` 0.3.29, a third-party library that came with the baseline copy in
7ede61a) has no date or time input, a `Calendar` with English names, a Sunday start and no
locale, a `Combobox` that takes no accessible name without a visible label, and a `Popover`
capped at 320px. The grid hand-built a listbox, a combobox or a popover in ten files to work
around it.

## Requirements

**R1. One UI library: React Aria Components.**
- `react-aria-components` and `@internationalized/date` are added; `@sakaniui/react` is removed
  with its `tokens.css`, `style.css` and every rule in `app.css` that reaches into its class
  names (`[class*="_…"]`).
- The colour variables the CSS reads from Sakani are declared in `theme.css`.
- `docs/SPEC.md` names it in the grid's paragraph: the grid's UI parts come from React Aria
  Components; the sheet is the grid's own.
- Source: "i go for 3"; "use as much from library as possible".

**R2. The look stays the grid's.**
- React Aria ships no styles. Every part is styled in `app.css` with the grid's own classes and
  tokens, light and dark, compact, normal and ruim, to match today's screens and the prototype.
- No screen changes look except the editors R4 changes.
- Source: "tight I mean it looks good and is a joy to use".

**R3. Dutch everywhere a date or time shows or is entered.**
- One `I18nProvider` at the root with the page's locale (`<html lang="nl">`): `dd-mm-jjjj`,
  24-hour time, weeks starting on Monday.
- Source: the `09/10/2026` screenshot; invented — approved 2026-10-08 (the design, section 1).

**R4. The cell editors come from the library, per `specs/field-contract.md`.**
- date: `DateField` with a `Calendar` in a `Popover`. datetime: `DateField` with hour and
  minute segments and the same calendar. time: `TimeField`. Values convert one to one with the
  engine's stored strings: `YYYY-MM-DD` through `parseDate`, `YYYY-MM-DDTHH:mm` through
  `parseDateTime`, no zone.
- select: `ListBox` in a `Popover`, each option drawn as the cell draws it (pill for a column
  keyed `status`, dot otherwise, icon and word for a kind with an icon, in its tone), the
  current option marked.
- relation to-one: `ComboBox` over the engine's records, the current space's first, at most
  50 with a count of the rest; plus the open-panel icon of contract rule 1.
- relation to-many: `TagGroup` for the chips, flowing inline in one box capped at two lines and
  then scrolling, with a `ComboBox` after the last chip offering only records not chosen; the
  removal question is a `Dialog` with role `alertdialog`.
- long text: `TextField` with `TextArea` in a `Popover`. boolean: `Switch`.
- An editor that needs Enter, Tab or Escape itself reports through the sheet's existing
  `onCommit` and `onCancel`.
- Source: the three editor screenshots; "use as much from library as possible".

**R5. The chrome comes from the library.**

| Today | Becomes |
|---|---|
| `Button` (Drawer, Grid, Links, Confirm, NewViewDialog, Share, SidePanel, SignIn, Toolbar, ViewPanel) | `Button` |
| MoreMenu (Sakani `Menu` and a hand-built portal) | `MenuTrigger` + `Menu` |
| GridBar column picker (Sakani `Popover` + `Checkbox`) | `DialogTrigger` + `Popover` + `CheckboxGroup` |
| Search (`Input` + `Kbd`) | `SearchField` + `Keyboard` |
| RailFoot and Theme (`SegmentedControl`) | `ToggleButtonGroup` |
| Matrix note (`Textarea`) | `TextField` + `TextArea` |
| ViewList (`SidebarItem`) | `GridList` for the views tree, items as links |
| NewViewDialog, Share, the sign-in overlay | `Modal` + `Dialog` |
| SpaceSelect, Pick, FilterBuilder's pickers (hand-built listboxes) | `ComboBox` or `Select` + `ListBox` |
| Toast's `Kbd` | `Keyboard` |
| `Spinner` | the grid's own CSS spinner (React Aria has none) |
| `EmptyState` | plain markup |

- Toast stays the grid's own; React Aria's toast is not stable.
- Source: "A"; "use as much from library as possible".

**R6. The sheet stays the grid's own.**
- The table, its key machine (type to edit, Enter and Tab commit and move, Escape, Delete,
  copy and paste), day bands, group facts and the draft row are unchanged.
- Source: "A, keep our sheet".

**R7. Nothing else changes.**
- No engine change, no new behaviour beyond R4's editors, no change to what a write sends.
- Source: invented — approved 2026-10-08 (the design, sections 4 and 5).

## Field contract changes
`specs/field-contract.md` is updated with this feature:
- date and datetime: the typed-text editor and "no calendar popover" give way to R4's
  `DateField` and `Calendar`.
- The component budget names React Aria as the source of every editor.

## Done when
- `bun run check` passes; the grid suite passes, with tests that clicked Sakani markup or the
  native date input rewritten against roles; new unit tests cover the date conversions and each
  editor's commit and cancel.
- The e2e suite passes, its date flows typing into the new fields.
- `grep -r sakaniui apps/grid` finds nothing, and the lockfile holds no `@sakaniui` entry.
- Stefan sees one screenshot per surface: the sheet, the date, select, to-one and to-many
  editors, the menus, the dialogs and the filter builder, light and dark.
