import type { ApiError } from './types'

const strings = {
  views: 'Views',
  noViews: 'No views declared',
  noViewsHint: 'Save a view on a source to list it here.',
  noRows: 'No rows',
  noRowsInWindow: 'No rows in this window',
  noRowsMatch: 'No rows match the search or filters',
  search: 'Search',
  goToView: 'Go to {view}',
  new: 'New',
  readOnly: 'This list is read-only',
  week: 'Week',
  previous: 'Previous',
  next: 'Next',
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  pickDay: 'Pick a day',
  saved: 'Saved',
  saving: 'Saving…',
  notSaved: 'Not saved',
  undo: 'Undo',
  redo: 'Redo',
  yes: 'Yes',
  no: 'No',
  empty: '—',
  rows: '{n} rows',
  row: '1 row',
  dismiss: 'Dismiss',
  columns: 'Columns',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  remove: 'Remove',
  groupBy: 'Group by',
  sortedBy: 'Sorted by',
  none: 'None',
  total: 'Total',
  noValue: 'No value',
  required: 'Required',
  filter: 'Filter',
  addFilter: '+ Filter',
  removeFilter: 'Remove filter {field}',
  any: 'Any',
  open: 'Open',
  close: 'Close',
  theme: 'Theme',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  density: 'Dichtheid',
  densityCompact: 'Compact',
  densityNormal: 'Normaal',
  densityRoomy: 'Ruim',
  needsFields: 'Needs {fields}: create it from the record screen',
  export: 'Export',
  exportFailed: 'Export failed',
  allSpace: 'Alle {label}',
  spaceCount: '{count} {label}',
  searchSpace: '{label} zoeken',
  noMatches: 'No matches',
  moreResults: 'More results: refine your search',
  viewType: 'View type',
  matrix: 'Matrix',
  hintMove: 'move',
  hintEdit: 'edit',
  hintCancel: 'cancel',
  hintSearch: 'search and jump',
  changed: 'Changed',
  addColumn: '+ Column',
  hideColumn: 'Hide',
  showColumn: 'Show',
  awayReason: 'Away: {reason}',
  awayWarning: 'Away and assigned',
  statusLabel: 'Status',
  noteLabel: 'Note',
  sharedCell: 'Also in this cell',
  onIt: 'On it',
  matrixNotExported: 'The matrix is not exported yet',
  viewName: 'Name',
  modified: 'modified',
  save: 'Save',
  saveAsNew: 'Save as new view',
  revert: 'Revert',
  reverted: 'Reverted',
  mine: 'Alleen voor jou',
  readOnlyView: 'Standaardweergave, alleen te kopiëren',
  readOnlyTitle: 'Standaardweergave: maak een kopie om aan te passen',
  moreActions: 'More actions',
  rename: 'Rename',
  duplicate: 'Kopie maken',
  renameView: 'Naam wijzigen',
  share: 'Delen met het team',
  unshare: 'Niet meer delen',
  viewRemoved: 'View removed',
  copyOf: '{name} (copy)',
  moveUp: 'Omhoog',
  moveDown: 'Omlaag',
  keepAsNew: 'Save your change with “{action}” before you leave',
  dragToOrder: 'Drag to order · Alt+↑/↓',
  delete: 'Verwijderen',
  deleteConfirm: 'Zeker?',
  inUse: 'Nog in gebruik door {by}.',
  and: 'en',
  fixedFilter: '+ {n} vaste filter',
  fixedFilters: '+ {n} vaste filters',
  signIn: 'Aanmelden',
  email: 'E-mailadres',
  sendLink: 'Stuur me een link',
  checkMail: 'Als dit adres een account heeft, staat er nu een link in je mailbox. Hij werkt 15 minuten.',
  confirmHint: 'Druk op de knop om je aan te melden.',
  linkDead: 'Deze link werkt niet meer. Vraag een nieuwe aan.',
  sessionLapsed: 'Je bent afgemeld. Meld je opnieuw aan in een ander tabblad; wat je hier niet bewaarde, blijft staan.',
  signOut: 'Afmelden',
  changedSince: '{label} is intussen gewijzigd; ongedaan maken kan niet.',
  deletedSince: '{label}: dit record is intussen verwijderd; ongedaan maken kan niet.',
  alreadyUndone: 'Dit is al ongedaan gemaakt.',
  notUndoable: 'Dit kan niet ongedaan gemaakt worden.',
  actionDone: '{action} uitgevoerd.',
  addViewTo: 'Weergave toevoegen aan {model}',
  moreFor: 'Meer voor {model}',
  fold: 'Inklappen',
  unfold: 'Uitklappen',
  kindGrid: 'Grid',
  kindCalendar: 'Kalender',
  kindBoard: 'Bord',
  later: 'later',
  newViewOf: 'Nieuwe {kind}weergave',
  newViewName: 'Naam',
  whoEdits: 'Wie mag ze aanpassen',
  team: 'Het team',
  onlyMe: 'Alleen ik',
  teamHint: 'Iedereen in het team ziet ze en kan filters en kolommen aanpassen.',
  onlyMeHint: 'Alleen jij ziet ze; delen kan later.',
  onSource: 'Op {source}',
  scopedTo: 'beperkt tot {scope}',
  cancel: 'Annuleren',
  createView: 'Weergave maken',
}

export type StringKey = keyof typeof strings

let overrides: Partial<Record<StringKey, string>> = {}
let refusals: Record<string, string> = {}

const ERROR = 'error.'

function words(given: Record<string, unknown> | undefined, keep: (key: string) => boolean): Record<string, string> {
  return Object.fromEntries(
    Object.entries(given ?? {}).filter((entry): entry is [string, string] => keep(entry[0]) && typeof entry[1] === 'string' && entry[1] !== ''),
  )
}

/** The site's words from the schema (`strings`); any key left out keeps its English. */
export function setStrings(given: Record<string, unknown> | undefined): void {
  overrides = words(given, (key) => Object.hasOwn(strings, key))
  refusals = words(given, (key) => key.startsWith(ERROR) && key.length > ERROR.length)
}

/** A refusal in the site's words (`error.<code>`), else as the server said it. */
export function errorText(code: string, message: string): string {
  return refusals[ERROR + code] ?? message
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return (overrides[key] ?? strings[key]).replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

/** WordPress sets `<html lang>` to the admin locale; a tag Intl refuses falls back to English. */
export function locale(): string {
  const lang = document.documentElement.lang || 'en'
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(lang).length > 0 ? lang : 'en'
  } catch {
    return 'en'
  }
}

/** Why an undo or redo was refused, in Dutch; a removed record names `deleted_at`, under its dataset's label. */
export function undoText(error: Partial<ApiError>): string {
  const code = error.code ?? 'unknown'
  const label = error.label ?? ''
  const said = code === 'in_use' && error.by?.length ? inUse(error.by)
    : code === 'changed_since' ? t(error.column === 'deleted_at' ? 'deletedSince' : 'changedSince', { label })
    : code === 'already_undone' ? t('alreadyUndone')
    : code === 'not_undoable' ? t('notUndoable')
    : String(error.message ?? code)
  return errorText(code, said)
}

/** The engine's 409 `by` as one sentence: "Nog in gebruik door Activiteiten (3) en Personen (1)." */
export function inUse(by: { label: string; count: number }[]): string {
  const named = by.map(({ label, count }) => `${label} (${count})`)
  const last = named.pop() ?? ''
  return t('inUse', { by: named.length === 0 ? last : `${named.join(', ')} ${t('and')} ${last}` })
}

export function rowCount(n: number): string {
  return n === 1 ? t('row') : t('rows', { n })
}

/** The title line's summary: "21 rijen · 3 groepen"; the groups only where the view groups. */
export function summary(rows: number, groups: number | null): string {
  const said = [rows === 1 ? '1 rij' : `${rows} rijen`]
  if (groups !== null) said.push(groups === 1 ? '1 groep' : `${groups} groepen`)
  return said.join(' · ')
}

/** What a view's saved filters with no chip are called in the toolbar. */
export function fixedCount(n: number): string {
  return n === 1 ? t('fixedFilter', { n }) : t('fixedFilters', { n })
}
