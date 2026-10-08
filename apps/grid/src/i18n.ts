import type { ApiError } from './types'

const strings = {
  views: 'Views',
  viewsShown: 'Weergaven',
  noViews: 'Geen weergaven',
  noViewsHint: 'Bewaar een weergave op een bron om ze hier te zien.',
  noRows: 'Geen rijen',
  noRowsInWindow: 'Geen rijen in deze periode',
  noRowsMatch: 'Geen rijen voor deze zoekterm of filters',
  search: 'Zoeken',
  goToView: 'Naar {view}',
  new: 'Nieuw',
  readOnly: 'Deze lijst is alleen-lezen',
  week: 'Week',
  time: 'Tijd',
  previous: 'Vorige',
  next: 'Volgende',
  period: 'Periode',
  previousPeriod: 'Vorige periode',
  nextPeriod: 'Volgende periode',
  thisWeek: 'Deze week',
  nextWeek: 'Volgende week',
  thisMonth: 'Deze maand',
  fromTo: 'Van–tot',
  periodFrom: 'Van',
  periodTo: 'Tot',
  all: 'Alles',
  apply: 'Toepassen',
  periodTooLong: 'Hoogstens {days} dagen',
  saved: 'Opgeslagen',
  saving: 'Opslaan…',
  notSaved: 'Niet opgeslagen',
  undo: 'Ongedaan maken',
  redo: 'Opnieuw',
  yes: 'Ja',
  no: 'Nee',
  empty: '—',
  via: 'via',
  rows: '{n} rijen',
  row: '1 rij',
  dismiss: 'Negeren',
  columns: 'Kolommen',
  moveLeft: 'Naar links',
  moveRight: 'Naar rechts',
  remove: 'Wissen',
  groupBy: 'Groeperen',
  groupOn: 'Groep: {field}',
  scopeIs: '{field} is {value}',
  sortedBy: 'Gesorteerd op',
  none: 'Geen',
  total: 'Totaal',
  noValue: 'Geen waarde',
  required: 'Verplicht',
  filter: 'Filter',
  addFilter: 'Filter',
  removeFilter: 'Filter {field} wissen',
  any: 'Alle',
  open: 'Openen',
  close: 'Sluiten',
  theme: 'Thema',
  themeAuto: 'Auto',
  themeLight: 'Licht',
  themeDark: 'Donker',
  density: 'Dichtheid',
  densityCompact: 'Compact',
  densityNormal: 'Normaal',
  densityRoomy: 'Ruim',
  needsFields: 'Heeft {fields} nodig: maak het aan vanuit het record',
  pickFirst: 'Kies eerst {fields}',
  export: 'Exporteren',
  exportFailed: 'Exporteren mislukt',
  allSpace: 'Alle {label}',
  spaceCount: '{count} {label}',
  searchSpace: '{label} zoeken',
  noMatches: 'Geen resultaten',
  moreResults: 'Meer resultaten: verfijn je zoekopdracht',
  viewType: 'View type',
  matrix: 'Matrix',
  hintMove: 'bewegen',
  hintEdit: 'bewerken',
  hintCancel: 'annuleren',
  hintSearch: 'zoeken en springen',
  shortcuts: 'Sneltoetsen',
  changed: 'Gewijzigd',
  addColumn: '+ Kolom',
  hideColumn: 'Verbergen',
  showColumn: 'Tonen',
  awayReason: 'Afwezig: {reason}',
  awayWarning: 'Afwezig en toegewezen',
  statusLabel: 'Status',
  noteLabel: 'Notitie',
  sharedCell: 'Ook in deze cel',
  onIt: 'Erbij',
  matrixNotExported: 'De matrix wordt nog niet geëxporteerd',
  viewName: 'Naam',
  modified: 'gewijzigd',
  save: 'Opslaan',
  saveAsNew: 'Opslaan als nieuwe weergave',
  revert: 'Terugzetten',
  reverted: 'Teruggezet',
  mine: 'Alleen voor jou',
  readOnlyView: 'Standaardweergave, alleen te kopiëren',
  readOnlyTitle: 'Standaardweergave: maak een kopie om aan te passen',
  colleagueView: 'Gedeeld door een collega, alleen te kopiëren',
  colleagueTitle: 'Gedeeld door een collega: maak een kopie om aan te passen',
  moreActions: 'More actions',
  moreActionsShown: 'Meer acties',
  views_shown: 'Weergaven',
  rename: 'Nieuwe naam',
  duplicate: 'Kopie maken',
  renameView: 'Naam wijzigen',
  share: 'Delen met het team',
  unshare: 'Niet meer delen',
  viewRemoved: 'Weergave verwijderd',
  copyOf: '{name} (kopie)',
  moveUp: 'Omhoog',
  moveDown: 'Omlaag',
  keepAsNew: 'Bewaar je wijziging met “{action}” voor je weggaat',
  dragToOrder: 'Sleep om te ordenen · Alt+↑/↓',
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
  renameModel: 'Naam wijzigen',
  changeIcon: 'Icoon wijzigen',
  exportModel: 'Exporteren',
  modelName: 'Nieuwe naam voor {model}',
  iconFor: 'Icoon voor {model}',
  adminOnly: 'Alleen een beheerder kan dit wijzigen',
  exportOpenView: 'Open eerst een weergave van dit model',
  exportNotReady: 'De weergave laadt nog',
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
  teamHint: 'Iedereen in het team ziet ze; alleen jij past ze aan, de anderen maken een kopie.',
  onlyMeHint: 'Alleen jij ziet ze; delen kan later.',
  onSource: 'Op {source}',
  scopedTo: 'beperkt tot {scope}',
  cancel: 'Annuleren',
  removeItem: '{name} verwijderen',
  removeLinkAsk: '{item} van {name} verwijderen?',
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

/** The site's words from the schema (`strings`); any key left out keeps the grid's own. */
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

/** The page's `<html lang>`; a tag Intl refuses falls back to English. */
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

/** "21 rijen"; "5000+ rijen" where the read limit cut the rows. */
export function rowCount(n: number, cut = false): string {
  return cut ? t('rows', { n: `${n}+` }) : n === 1 ? t('row') : t('rows', { n })
}

/** The title line's summary: "21 rijen · 3 groepen"; the groups only where the view groups. */
export function summary(rows: number, groups: number | null, cut = false): string {
  const said = [rowCount(rows, cut)]
  if (groups !== null) said.push(groups === 1 ? '1 groep' : `${groups} groepen`)
  return said.join(' · ')
}

/** What a view's saved filters with no chip are called in the toolbar. */
export function fixedCount(n: number): string {
  return n === 1 ? t('fixedFilter', { n }) : t('fixedFilters', { n })
}
