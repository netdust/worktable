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
  loading: 'Laden',
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
  openRecord: 'Open {title}',
  recordGone: 'Dit record bestaat niet meer of je mag het niet zien',
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
  shareMenu: 'Exporteren / delen',
  excel: 'Excel',
  calendar: 'Agenda (.ics)',
  copyLink: 'Link kopiëren',
  linkCopied: 'Link gekopieerd',
  linkViewGone: 'De gedeelde weergave is er niet voor jou; je ziet {view} zonder de filters van de link.',
  publish: 'Publiceren',
  publishAgain: 'Nieuwe link maken? De vorige stopt.',
  publishNew: 'Nieuwe link maken',
  publishing: 'Bezig met publiceren…',
  publishedOnce: 'Het publieke adres van deze weergave, voor de website. Je ziet het alleen nu.',
  publishQueryOnly: 'Publiceren kan alleen op een berekende weergave.',
  publishFailed: 'Publiceren lukte niet.',
  publicAddress: 'Publiek adres',
  copy: 'Kopiëren',
  exportFailed: 'Exporteren mislukt',
  allSpace: 'Alle {label}',
  spaceCount: '{count} {label}',
  searchSpace: '{label} zoeken',
  noMatches: 'Geen resultaten',
  moreResults: 'Nog {n} meer: verfijn je zoekopdracht',
  viewType: 'View type',
  matrix: 'Matrix',
  hintMove: 'bewegen',
  hintEdit: 'bewerken',
  hintCancel: 'annuleren',
  hintSearch: 'zoeken en springen',
  shortcuts: 'Sneltoetsen',
  changed: 'Gewijzigd',
  addColumn: '+ Kolom',
  openColumn: 'Open',
  openSlots: 'Open plaatsen: {count}',
  fillSlot: 'Open plek invullen',
  fillPickRole: 'Kies eerst een rol',
  fillPickPerson: 'Kies een persoon',
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
  moveView: 'Verplaats {name}',
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
  actTitle: 'Je antwoord',
  actHint: 'Kies je antwoord.',
  actDead: 'Deze link werkt niet meer',
  actAnswered: 'Al beantwoord',
  actClosed: 'Deze uitnodiging is niet meer open.',
  actDone: 'Bedankt. Je antwoord is doorgegeven: {answer}.',
  actRetryLater: 'Te veel pogingen. Probeer het zo meteen opnieuw.',
  actFailed: 'Dat lukte niet. Probeer het opnieuw.',
  personTitle: 'Je overzicht',
  personDead: 'Deze link werkt niet meer',
  personNothing: 'Er is nog niets voor je gedeeld.',
  personFailed: 'Dat lukte niet. Probeer het later opnieuw.',
  forOwnersPublish: 'Voor eigenaars publiceren',
  forOwnersStop: 'Niet meer voor eigenaars',
  forOwnersDone: 'Gepubliceerd voor eigenaars',
  forOwnersStopped: 'Niet meer zichtbaar voor eigenaars',
  forOwnersHidden: '“{key}” is niet zichtbaar voor eigenaars. Verberg die kolom eerst.',
  forOwnersFailed: 'Publiceren voor eigenaars lukte niet.',
  forOwnersPublic: 'Een publieke weergave kan niet ook voor eigenaars zijn.',
  recordLinkNew: 'Nieuwe link',
  recordLinkRotated: 'Nieuwe link gekopieerd; de vorige werkt niet meer',
  recordLinkFailed: 'De link ophalen lukte niet.',
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
  filterWhereWord: 'Waar',
  filterAnd: 'En',
  filterOr: 'Of',
  filterJoin: 'Verbinding',
  filterRow: 'Voorwaarde {n}',
  filterField: 'Veld',
  filterOperator: 'Vergelijking',
  filterAdd: 'Voorwaarde toevoegen',
  filterRemove: 'Voorwaarde weghalen',
  filterSearch: '{field} zoeken',
  filterSearchHint: 'Zoek een waarde',
  filterValue: 'Waarde',
  filterMore: 'nog {n} — typ om te zoeken',
  filterNoOther: 'Geen andere waarden',
  or: 'of',
  fromDay: 'Van',
  toDay: 'Tot',
  betweenDays: 'tussen {from} en {to}',
  'op.choice.in': 'is',
  'op.choice.nin': 'is niet',
  'op.choice.empty': 'is leeg',
  'op.choice.filled': 'is niet leeg',
  'op.text.like': 'bevat',
  'op.text.nlike': 'bevat niet',
  'op.text.eq': 'is',
  'op.text.empty': 'is leeg',
  'op.date.week': 'is deze week',
  'op.date.next_week': 'is volgende week',
  'op.date.month': 'is deze maand',
  'op.date.between': 'ligt tussen',
  'op.bool.in': 'is',
  'period.week': 'deze week',
  'period.next_week': 'volgende week',
  'period.month': 'deze maand',
  publishChange: 'Publieke weergave bijwerken',
  removeItem: '{name} verwijderen',
  removeLinkAsk: '{item} van {name} verwijderen?',
  createView: 'Weergave maken',
  history: 'Geschiedenis',
  historyEmpty: 'Nog geen wijzigingen',
  historyFailed: 'De geschiedenis kon niet gelezen worden',
  historyCreated: 'aangemaakt',
  historySelf: 'jij',
  historySystem: 'systeem',
  historyHidden: 'planning',
  historyGone: 'onbekend',
  historyLink: 'bevestigd door {name}',
  historyAlsoOne: 'Dit maakt ook 1 andere wijziging ongedaan',
  historyAlso: 'Dit maakt ook {n} andere wijzigingen ongedaan',
  transitionNotAllowed: 'Deze statuswijziging is niet toegestaan.',
  transitionLost: 'De status is intussen gewijzigd. De cel toont nu wat er staat.',
  undoDeleteSkipped: 'Verwijderen kan niet ongedaan gemaakt worden',
  redoSkipped: 'Opnieuw doen kan hier niet',
  attachments: 'Bijlagen',
  attachmentsNone: 'Nog geen bijlagen',
  attachmentKind: 'Soort',
  attachmentAdd: 'Bestand toevoegen',
  attachmentType: 'Dit bestandstype kan niet. Gebruik pdf, jpg, png of webp.',
  attachmentTooLarge: 'Dit bestand is te groot (max. {n} MB).',
  attachmentName: 'Deze bestandsnaam kan niet: hoogstens 200 tekens, zonder stuurtekens.',
  attachmentRateLimited: 'Te veel bestanden in korte tijd. Probeer het zo meteen opnieuw.',
  attachmentReadOnly: 'Hier kunnen geen bestanden toegevoegd of verwijderd worden.',
  attachmentForbidden: 'Je mag hier geen bestanden toevoegen of verwijderen.',
  attachmentLength: 'Het bestand kwam niet volledig aan. Probeer het opnieuw.',
  attachmentGone: 'Dit bestand bestaat niet meer of je mag het niet zien.',
  attachmentChangedSince: 'Dit bestand is intussen gewijzigd.',
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

// The engine says these in English: it knows no domain words.
const ENGINE_CODES: Record<string, StringKey> = {
  transition_not_allowed: 'transitionNotAllowed',
  transition_lost: 'transitionLost',
}

/** A refusal in the site's words (`error.<code>`), else the grid's own for an engine code, else as the server said it. */
export function errorText(code: string, message: string): string {
  const own = Object.hasOwn(ENGINE_CODES, code) ? t(ENGINE_CODES[code]) : message
  return refusals[ERROR + code] ?? own
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
    : code === 'changed_since' && error.dataset === 'attachment' ? t('attachmentChangedSince')
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

const KB = 1024

/** "47 kB", "2,3 MB": a file's size as the page's language writes numbers. */
export function fileSize(bytes: number): string {
  const number = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 })
  return bytes < KB * KB ? `${number.format(Math.max(1, Math.round(bytes / KB)))} kB` : `${number.format(bytes / KB / KB)} MB`
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
