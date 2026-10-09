# Field contract

What every cell in the grid does, per field type. The audit (step 2) measures each column of
theatre and fiche against this; the field matrix test (step 3) enforces it.

A rule marked **Source: owner** is quoted from the brief of 2026-10-08. A rule marked
**invented — to approve** is my proposal; it is a question until the owner approves it.

## The five rules

1. **A to-one relation has a picker and an open-panel icon.** Editing opens a search over the
   target's records; the cell also carries an icon that opens the related record's panel.
   Source: owner.
2. **A to-many is a tag list over join rows.** Each chip is one join row; adding creates a join
   row, removing deletes one. Source: owner.
3. **A select shows a pill for the column keyed `status` and a dot otherwise.** Source: owner.
   (A kind with a declared icon keeps icon and word; invented — to approve, it is what ships.)
4. **Every cell is editable unless it declares a reason.** Source: owner.
5. **A non-editable cell shows that reason** — on hover and to a screen reader, never as an
   error after the attempt. Source: owner.

The reasons a cell may declare, invented — to approve: `readonly` (derived by the writer, e.g.
plandag, weergavenaam), `computed` (a query column without `writes`), `role` (the caller may
not write this source), `seeded` (a system-owned view or config row), `inherited` (the value
comes via a parent, edit it there). A cell with none of these is editable; an un-editable cell
without one is a defect.

## Per type

All rows share the keyboard of the sheet: arrows move, Enter or a typed character opens the
editor, Enter commits and moves down, Tab commits and moves right (Shift+Tab left), Escape
leaves without a write. Rows below name only what a type adds or changes.

| Type | Display | Edit control | Keyboard | Empty | Refused | Copy / paste | Clear |
|---|---|---|---|---|---|---|---|
| **text** (text, email, url) | One line, ellipsis, full text on hover. A title column bold. Long text (textarea, html) one line in the sheet. | Inline input in the cell. Long text: a textarea popover beside the cell. | Typed character starts the draft with it. Long text: Enter is a newline, Ctrl/Cmd+Enter commits. | Nothing shown. | The cell goes back to the stored value, the engine's message in a toast, the cell stays selected. | Copies the text. Paste writes the first line; long text keeps its newlines. | Delete/Backspace empties it, unless required. |
| **number** (int, float) | Right-aligned, tabular figures, Dutch decimal comma. | Inline input, decimal keypad. | A digit, `-` or `,` starts the draft. A non-number commits nothing and keeps the editor open with the field marked. | Nothing shown. | As text. | Copies the shown number. Paste accepts `,` or `.` decimals; a non-number is refused without a write. | As text. |
| **date** | `di 13 okt` in the sheet, tabular. Optional blank label from `group_facts` (e.g. "zonder tijd"). | React Aria `DateField` (`dd-mm-jjjj` under the page's locale) with a `Calendar` in a `Popover`, Monday first. Never the browser's native control. | Digits fill the segments; ↑↓ step the focused segment; the calendar opens from its button or Alt+↓. An incomplete date keeps the editor open and writes nothing. | Nothing, or the column's blank label. | As text. | Copies `jjjj-mm-dd`. Paste accepts `jjjj-mm-dd` and `dd-mm-jjjj`; anything else is refused without a write. | Empties it, unless required. |
| **datetime** | Time `14:00` in a day-grouped view, `di 13 okt 14:00` elsewhere; a range shows start and end. | The same `DateField` with hour and minute segments (24-hour) and the same calendar. | As date; the arrows move between segments. | As date. | As text. | Copies `jjjj-mm-ddTuu:mm`. Paste accepts that, or a date plus a time. | Empties it, unless required. |
| **boolean** | A switch with ja/nee. | None: flipped in place. | Space or Enter flips it. | Off ("nee"); a nullable boolean shows nothing until set. | The switch flips back and a toast says why. | Copies `ja`/`nee`. Paste accepts ja/nee/true/false/1/0. | Delete sets it to nee, or empty when nullable. |
| **select** (options) | Rule 3: pill for `status`, dot otherwise, in the option's tone; a kind with an icon shows the icon and word. | A listbox under the cell. Each option is drawn the way the cell draws it (pill, dot or icon, in its tone) and the current one is marked. invented — to approve | A letter jumps to the first option starting with it; ↑↓ move; Enter or Tab commits. | Nothing shown; the list offers "leeg" first unless required. | As text; a refused lifecycle transition names the allowed ones. | Copies the label. Paste matches a label or key, case-insensitive; no match is refused without a write. | Empties it, unless required. |
| **relation to-one** | The target's title as plain text, plus the open-panel icon on hover and focus (rule 1). | The relation picker: a search over the target, the current space's records first, at most 50 listed with a count of the rest. | Typing searches; ↑↓ move; Enter picks; Delete in an empty search clears. Ctrl/Cmd+Enter opens the panel. invented — approved 2026-10-09 | Nothing shown. | As text. | Copies the title. Paste matches exactly one title in the target and writes its id; none or several is refused without a write. | Empties it, unless required. |
| **relation to-many** (links) | Names on one line in their state's tone, comma-separated, ellipsis, all names on hover. | Rule 2: chips flow inline in one box, capped at two lines and then scrolling, the search after the last chip, the list under the box offering only records not chosen. invented — to approve (the cap) | Typing searches; Enter adds and empties the search; Backspace in an empty search removes the last chip (asking first when its state moved past the default). | Nothing shown. | The chip is not added or not removed; a toast says why. | Copies the names, comma-separated. Paste is refused: a join row is never written from text. | Never by Delete: chips are removed one by one in the editor. |
| **json** (custom, items) | A summary: the number of items for a list, the key count for an object, never raw JSON. | None in the sheet: the record panel shows it (reason `computed` until a structured editor exists). invented — to approve | Not editable from the keyboard in the sheet. | Nothing shown. | — | Copies the JSON text. Paste is refused. | Not clearable from the sheet. |

## The component budget

Every editor and every piece of chrome comes from React Aria Components (`specs/react-aria/spec.md`),
styled with the grid's own tokens. The sheet itself (table, key machine, bands) is the one custom
part. Sakani is not used.

## Across all types

- A required cell never empties: Delete does nothing, and a picker offers no "leeg". invented — to approve
- A refused write never leaves the optimistic value on screen. invented — to approve
- Every editor keeps the cell's own look under it while open; the popover never covers the
  cell being edited. invented — to approve
- The same column behaves the same in every skin it appears in (table, matrix panel, record
  panel); the matrix's own cell is the join row's state, outside this table. invented — to approve
