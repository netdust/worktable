import { defineDataset, type Role } from '@worktable/engine'

const long = (label: string) => ({ type: 'text' as const, label, nullable: true, long: true as const })
const text = (label: string) => ({ type: 'text' as const, label, nullable: true })
const relation = (label: string, to: string) => ({ type: 'integer' as const, label, nullable: true, relation: to })
const vlag = (label: string) => ({ type: 'boolean' as const, label, nullable: true })

const worker = { written_by: 'service' as const }

const both: Role[] = ['editor', 'administrator']

export const soorten = {
  gezondheidscheck: 'Gezondheidscheck',
  malwarescan: 'Malwarescan',
  bijwerken: 'Bijwerken',
  smoketest: 'Smoketest',
  plugin_installeren: 'Studio-plugin installeren',
  inloggen: 'Inloggen',
  cache_legen: 'Cache legen',
  cron_draaien: 'Cron draaien',
  onderhoudsmodus_aan: 'Onderhoudsmodus aan',
  onderhoudsmodus_uit: 'Onderhoudsmodus uit',
}

/** Soorten that show a preview and wait for Bevestigen before the worker changes a site. */
export const bevestigd: string[] = ['bijwerken', 'plugin_installeren', 'onderhoudsmodus_aan', 'onderhoudsmodus_uit']

export const gezondheden = {
  options: { ok: 'In orde', let_op: 'Let op', storing: 'Storing', onbekend: 'Onbekend' },
  tones: { ok: 'ok', let_op: 'warn', storing: 'bad', onbekend: 'grey' },
} as const

export const organisatie = defineDataset({
  name: 'organisatie',
  label: 'Organisaties',
  new_label: 'Nieuwe organisatie',
  icon: 'users',
  title: 'naam',
  custom: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    soort: { type: 'text', label: 'Soort', default: 'klant', options: { klant: 'Klant', intern: 'Intern' } },
    notities: long('Notities'),
  },
})

export const site = defineDataset({
  name: 'site',
  label: 'Sites',
  icon: 'box',
  title: 'naam',
  board: { column: 'gezondheid' },
  gallery: { kind: 'screenshot' },
  created_by: 'service',
  attachments: { kinds: { screenshot: 'Screenshot' }, deleted_by: 'person' },
  scoped: 'organisatie_id',
  custom: true,
  columns: {
    naam: { type: 'text', label: 'Naam', ...worker },
    in_registry: { type: 'boolean', label: 'In registry', default: true, ...worker },
    organisatie_id: relation('Organisatie', 'organisatie'),
    adres: { type: 'text', label: 'Adres', nullable: true, href: true, ...worker },
    sla: vlag('SLA'),
    smoke_urls: long("Extra smoke-URL's"),
    notities: long('Notities'),
    gezondheid: { type: 'text', label: 'Gezondheid', default: 'onbekend', ...gezondheden, ...worker },
    statuscode: { type: 'integer', label: 'HTTP', nullable: true, footer: 'none', ...worker },
    responstijd_ms: { type: 'integer', label: 'Responstijd (ms)', nullable: true, footer: 'none', ...worker },
    wp_versie: { ...text('WordPress'), ...worker },
    php_versie: { ...text('PHP'), ...worker },
    updates_plugins: { type: 'integer', label: 'Updates plugins', default: 0, nullable: true, ...worker },
    updates_themas: { type: 'integer', label: "Updates thema's", default: 0, nullable: true, ...worker },
    updates_core: { type: 'boolean', label: 'Update core', default: false, nullable: true, ...worker },
    tls_dagen: { type: 'integer', label: 'TLS (dagen)', nullable: true, footer: 'none', ...worker },
    laatste_check: { type: 'datetime', label: 'Laatste check', nullable: true, ...worker },
    plugin: { type: 'boolean', label: 'Studio-plugin', default: false, ...worker },
    plugin_versie: { ...text('Plugin-versie'), ...worker },
    db_versie: { ...text('Database-versie'), ...worker },
    admins: { ...long('Beheerders'), ...worker },
    bekende_admins: long('Bekende beheerders'),
    core_bestanden: {
      type: 'text',
      label: 'Core-bestanden',
      nullable: true,
      options: { ok: 'In orde', afwijkend: 'Afwijkend', onbekend: 'Onbekend' },
      tones: { ok: 'ok', afwijkend: 'bad', onbekend: 'grey' },
      ...worker,
    },
    cron_achterstand: { type: 'integer', label: 'Cron-achterstand (min)', nullable: true, footer: 'none', ...worker },
    php_fouten: { type: 'integer', label: 'PHP-fouten', nullable: true, footer: 'none', ...worker },
    uploadmap_mb: { type: 'integer', label: 'Uploadmap (MB)', nullable: true, footer: 'none', ...worker },
    db_mb: { type: 'integer', label: 'Database (MB)', nullable: true, footer: 'none', ...worker },
    onderhoudsmodus: { type: 'boolean', label: 'Onderhoudsmodus', default: false, nullable: true, ...worker },
  },
  indexes: [['naam'], ['organisatie_id']],
})

export const actie = defineDataset({
  name: 'actie',
  label: 'Opdrachten',
  new_label: 'Nieuwe opdracht',
  icon: 'flag',
  title: 'titel',
  date: 'gepland_op',
  board: { column: 'status', drag: false },
  custom: true,
  columns: {
    titel: text('Titel'),
    soort: { type: 'text', label: 'Soort', options: soorten },
    status: {
      type: 'text',
      label: 'Status',
      default: 'aangevraagd',
      options: {
        aangevraagd: 'Aangevraagd',
        voorbereiden: 'Voorbereiden',
        voorbereid: 'Voorbereid',
        bevestigd: 'Bevestigd',
        bezig: 'Bezig',
        klaar: 'Klaar',
        deels: 'Deels',
        mislukt: 'Mislukt',
        geannuleerd: 'Geannuleerd',
      },
      tones: { klaar: 'ok', deels: 'warn', mislukt: 'bad', voorbereid: 'amber', bezig: 'sky' },
    },
    bron: {
      type: 'text',
      label: 'Bron',
      default: 'handmatig',
      options: { handmatig: 'Handmatig', schema: 'Schema' },
    },
    gepland_op: { type: 'datetime', label: 'Gepland op', nullable: true },
    voorbereid_op: { type: 'datetime', label: 'Voorbereid op', nullable: true, readonly: true },
    samenvatting: long('Samenvatting'),
  },
  links: {
    sites: {
      label: 'Sites',
      item: 'Site',
      dataset: 'actie_site',
      key: 'actie_id',
      target: 'site_id',
      state: 'state',
      detail: 'samenvatting',
      meter: false,
    },
  },
  lifecycle: {
    column: 'status',
    live: ['aangevraagd', 'voorbereiden', 'voorbereid', 'bevestigd', 'bezig'],
    transitions: [
      { from: ['aangevraagd'], to: 'bezig', roles: both },
      { from: ['aangevraagd'], to: 'voorbereiden', roles: both },
      { from: ['voorbereiden'], to: 'voorbereid', roles: both },
      { from: ['voorbereiden'], to: 'mislukt', roles: both },
      { from: ['voorbereid'], to: 'bevestigd', roles: ['administrator'], button: 'Bevestigen', primary: true },
      { from: ['voorbereid'], to: 'aangevraagd', roles: both },
      { from: ['bevestigd'], to: 'bezig', roles: both },
      { from: ['bevestigd'], to: 'geannuleerd', roles: ['administrator'], button: 'Annuleren' },
      { from: ['bezig'], to: 'klaar', roles: both },
      { from: ['bezig'], to: 'deels', roles: both },
      { from: ['bezig'], to: 'mislukt', roles: both },
      { from: ['aangevraagd', 'voorbereiden', 'voorbereid'], to: 'geannuleerd', roles: both, button: 'Annuleren' },
    ],
  },
  indexes: [['status']],
})

export const actieSite = defineDataset({
  name: 'actie_site',
  label: 'Opdracht per site',
  icon: 'list',
  title: { via: 'site_id', else: 'state' },
  listed: false,
  custom: false,
  columns: {
    actie_id: { type: 'integer', label: 'Actie', relation: 'actie' },
    site_id: { type: 'integer', label: 'Site', relation: 'site' },
    state: {
      type: 'text',
      label: 'Status',
      default: 'wacht',
      options: {
        wacht: 'Niet gestart',
        te_bevestigen: 'Preview klaar',
        bezig: 'Bezig',
        klaar: 'Klaar',
        mislukt: 'Mislukt',
        overgeslagen: 'Overgeslagen',
      },
      tones: { te_bevestigen: 'amber', bezig: 'sky', klaar: 'ok', mislukt: 'bad', overgeslagen: 'grey' },
    },
    voorstel: long('Voorstel'),
    samenvatting: long('Samenvatting'),
    resultaat: long('Resultaat'),
  },
  lookups: { actie_status: { label: 'Status opdracht', via: 'actie_id', field: 'status' } },
  lifecycle: {
    column: 'state',
    transitions: [
      { from: ['wacht'], to: 'te_bevestigen', roles: both },
      { from: ['wacht', 'te_bevestigen'], to: 'bezig', roles: both },
      { from: ['wacht', 'bezig'], to: 'overgeslagen', roles: both },
      { from: ['wacht', 'te_bevestigen', 'bezig'], to: 'mislukt', roles: both },
      {
        from: ['te_bevestigen'],
        to: 'overgeslagen',
        roles: both,
        button: 'Niet nu',
        icon: 'clock',
        when: { actie_status: 'voorbereid' },
      },
      {
        from: ['overgeslagen'],
        to: 'te_bevestigen',
        roles: both,
        button: 'Toch wel',
        icon: 'undo',
        when: { actie_status: 'voorbereid', resultaat: null },
      },
      { from: ['bezig'], to: 'klaar', roles: both },
    ],
  },
  indexes: [['actie_id'], ['site_id']],
})

export const onderhoud = defineDataset({
  name: 'onderhoud',
  label: 'Onderhoudslog',
  icon: 'clock',
  title: 'samenvatting',
  date: 'datum',
  scoped: 'organisatie_id',
  created_by: 'service',
  custom: false,
  columns: {
    site_id: { type: 'integer', label: 'Site', relation: 'site', ...worker },
    datum: { type: 'datetime', label: 'Datum', ...worker },
    soort: { type: 'text', label: 'Soort', options: soorten, ...worker },
    uitkomst: {
      type: 'text',
      label: 'Uitkomst',
      options: { ok: 'In orde', bevindingen: 'Bevindingen', mislukt: 'Mislukt' },
      tones: { ok: 'ok', bevindingen: 'warn', mislukt: 'bad' },
      ...worker,
    },
    samenvatting: { type: 'text', label: 'Samenvatting', ...worker },
    details: { ...long('Details'), ...worker },
    actie_id: { ...relation('Actie', 'actie'), ...worker },
    organisatie_id: { ...relation('Organisatie', 'organisatie'), ...worker },
  },
  indexes: [['site_id'], ['datum']],
})

export const project = defineDataset({
  name: 'project',
  label: 'Projecten',
  new_label: 'Nieuw project',
  icon: 'star',
  title: 'naam',
  scoped: 'organisatie_id',
  custom: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    organisatie_id: relation('Organisatie', 'organisatie'),
    repo: text('Repo'),
    notities: long('Notities'),
  },
})

export const werkpakket = defineDataset({
  name: 'werkpakket',
  label: 'Features',
  new_label: 'Nieuwe feature',
  icon: 'list',
  title: 'naam',
  date: 'bijgewerkt',
  board: { column: 'fase' },
  scoped: 'organisatie_id',
  custom: true,
  columns: {
    project_id: { type: 'integer', label: 'Project', relation: 'project' },
    naam: { type: 'text', label: 'Naam' },
    repo: text('Repo'),
    branch: text('Branch'),
    plan: text('Plan'),
    fase: {
      type: 'text',
      label: 'Fase',
      default: 'ontwerp',
      options: {
        ontwerp: 'Ontwerp',
        plan: 'Plan',
        bouwen: 'Bouwen',
        review: 'Review',
        geblokkeerd: 'Geblokkeerd',
        klaar: 'Klaar',
        geparkeerd: 'Geparkeerd',
      },
      tones: { geblokkeerd: 'bad', review: 'warn', bouwen: 'violet', klaar: 'ok' },
    },
    laatste_stap: text('Laatste stap'),
    volgende_stap: text('Volgende stap'),
    geblokkeerd_door: text('Geblokkeerd door'),
    bijgewerkt: { type: 'datetime', label: 'Bijgewerkt', nullable: true, readonly: true },
    voortgang: { type: 'text', label: 'Voortgang', nullable: true, readonly: true },
    organisatie_id: relation('Organisatie', 'organisatie'),
  },
  lookups: { project: { label: 'Project', via: 'project_id', field: 'naam' } },
  indexes: [['project_id'], ['repo', 'branch']],
})

export const taak = defineDataset({
  name: 'taak',
  label: 'Taken',
  new_label: 'Nieuwe taak',
  icon: 'check',
  title: 'titel',
  date: 'deadline',
  scoped: 'organisatie_id',
  custom: true,
  columns: {
    titel: { type: 'text', label: 'Titel' },
    status: {
      type: 'text',
      label: 'Status',
      default: 'open',
      options: {
        open: 'Open',
        bezig: 'Bezig',
        geblokkeerd: 'Geblokkeerd',
        gedaan: 'Gedaan',
        overgeslagen: 'Overgeslagen',
      },
      tones: { bezig: 'sky', geblokkeerd: 'bad', gedaan: 'ok', overgeslagen: 'grey' },
    },
    stap: text('Plan-stap'),
    deadline: { type: 'date', label: 'Deadline', nullable: true },
    wie: { type: 'text', label: 'Wie', nullable: true, options: { stefan: 'Stefan', claude: 'Claude' } },
    notities: long('Notities'),
    organisatie_id: relation('Organisatie', 'organisatie'),
    project_id: relation('Project', 'project'),
    werkpakket_id: relation('Werkpakket', 'werkpakket'),
    site_id: relation('Site', 'site'),
    actie_id: relation('Actie', 'actie'),
  },
  indexes: [['deadline'], ['status'], ['werkpakket_id', 'stap']],
})

export const agendapunt = defineDataset({
  name: 'agendapunt',
  label: 'Agenda',
  new_label: 'Nieuw agendapunt',
  icon: 'calendar',
  title: 'titel',
  date: 'datum',
  calendar: { day: 'datum', start: 'start_at', end: 'eind_at', lanes: ['organisatie_id'] },
  scoped: 'organisatie_id',
  custom: true,
  columns: {
    titel: { type: 'text', label: 'Titel' },
    datum: { type: 'date', label: 'Datum' },
    start_at: { type: 'datetime', label: 'Start', nullable: true },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true },
    soort: {
      type: 'text',
      label: 'Soort',
      default: 'afspraak',
      options: { afspraak: 'Afspraak', deadline: 'Deadline', herinnering: 'Herinnering' },
      tones: { deadline: 'warn', herinnering: 'sky' },
    },
    organisatie_id: relation('Organisatie', 'organisatie'),
    notities: long('Notities'),
  },
  indexes: [['datum']],
})
