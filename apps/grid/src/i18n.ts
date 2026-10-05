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
  needsFields: 'Needs {fields}: create it from the record screen',
  table: 'Table',
  export: 'Export',
  exportFailed: 'Export failed',
  chooseSpace: 'Choose where to work',
  general: 'General',
  noMatches: 'No matches',
  moreResults: 'More results: refine your search',
  viewType: 'View type',
  matrix: 'Matrix',
  calendar: 'Calendar',
  soon: 'soon',
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
  newView: '+ View',
  viewName: 'Name',
  modified: 'modified',
  save: 'Save',
  saveAsNew: 'Save as new view',
  revert: 'Revert',
  reverted: 'Reverted',
  mine: 'Mine',
  sharedView: 'Shared with the team',
  moreActions: 'More actions',
  rename: 'Rename',
  duplicate: 'Duplicate',
  share: 'Share with the team',
  unshare: 'Only for me',
  viewRemoved: 'View removed',
  copyOf: '{name} (copy)',
  moveUp: 'Move up',
  moveDown: 'Move down',
  keepAsNew: 'Save your change with “{action}” before you leave',
  dragToOrder: 'Drag to order · Alt+↑/↓',
  delete: 'Verwijderen',
  deleteConfirm: 'Zeker?',
  inUse: 'Nog in gebruik door {by}.',
  and: 'en',
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

/** The engine's 409 `by` as one sentence: "Nog in gebruik door Activiteiten (3) en Personen (1)." */
export function inUse(by: { label: string; count: number }[]): string {
  const named = by.map(({ label, count }) => `${label} (${count})`)
  const last = named.pop() ?? ''
  return t('inUse', { by: named.length === 0 ? last : `${named.join(', ')} ${t('and')} ${last}` })
}

export function rowCount(n: number): string {
  return n === 1 ? t('row') : t('rows', { n })
}
