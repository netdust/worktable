import { defineDataset, type GroupFact, type HookResult, type OptionsFrom, type WriteContext } from '@worktable/engine'

// An open slot's person picker lists its candidates, best first.
export const KANDIDATEN: OptionsFrom = {
  source: 'kandidaten',
  match: { toewijzing_id: 'id' },
  value: 'persoon_id',
  sort: ['rang'],
}

// A day band's facts on the planning sources.
export const dagFacts: GroupFact[] = [
  { kind: 'first', column: 'start_at', where: { soort: 'voorstelling' }, label: 'voorstelling' },
  { kind: 'empty', column: 'start_at', label: 'zonder tijd' },
]

export const soorten = {
  options: {
    voorstelling: 'Voorstelling',
    repetitie: 'Repetitie',
    opbouw: 'Opbouw',
    afbouw: 'Afbouw',
    reis: 'Reis',
    overnachting: 'Overnachting',
    maaltijd: 'Maaltijd',
    vergadering: 'Vergadering',
    andere: 'Andere',
  },
  tones: {
    voorstelling: 'rose',
    repetitie: 'violet',
    opbouw: 'amber',
    afbouw: 'amber',
    reis: 'sky',
    overnachting: 'slate',
    maaltijd: 'green',
    vergadering: 'teal',
    andere: 'grey',
  },
} as const

const statussen = {
  options: { optie: 'Optie', bevestigd: 'Bevestigd', geannuleerd: 'Geannuleerd' },
  tones: { optie: 'warn', bevestigd: 'ok', geannuleerd: 'bad' },
} as const

const bijlagen = {
  kinds: { rider: 'Rider', zaalblad: 'Zaalblad', bonnetje: 'Bonnetje', foto: 'Foto', document: 'Document' },
}

export const organisatie = defineDataset({
  name: 'organisatie',
  label: 'Organisaties',
  new_label: 'Nieuwe organisatie',
  icon: 'pin',
  title: 'naam',
  custom: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    soort: {
      type: 'text',
      label: 'Soort',
      options: {
        eigen: 'Eigen',
        partner: 'Partner',
        venue: 'Venue',
        agentschap: 'Agentschap',
        leverancier: 'Leverancier',
      },
    },
    adres: { type: 'text', label: 'Adres', nullable: true },
    lat: { type: 'real', label: 'Breedtegraad', nullable: true },
    lng: { type: 'real', label: 'Lengtegraad', nullable: true },
    toegang: { type: 'text', label: 'Toegang', nullable: true },
    contact: { type: 'text', label: 'Contact', nullable: true },
    parameters: { type: 'json', label: 'Parameters', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
})

export const productie = defineDataset({
  name: 'productie',
  label: 'Producties',
  new_label: 'Nieuwe productie',
  icon: 'tag',
  title: 'titel',
  custom: true,
  columns: {
    titel: { type: 'text', label: 'Titel' },
    seizoen: { type: 'text', label: 'Seizoen', nullable: true },
    status: {
      type: 'text',
      label: 'Status',
      default: 'ontwikkeling',
      options: { ontwikkeling: 'Ontwikkeling', actief: 'Actief', archief: 'Archief' },
    },
    organisatie_id: { type: 'integer', label: 'Organisatie', nullable: true, relation: 'organisatie' },
    site_ref: { type: 'text', label: 'Site-referentie', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
})

export const activiteit = defineDataset({
  name: 'activiteit',
  label: 'Activiteiten',
  new_label: 'Nieuwe activiteit',
  icon: 'calendar',
  title: 'omschrijving',
  date: 'plandag',
  calendar: { day: 'plandag', start: 'start_at', end: 'eind_at', lanes: ['productie_id', 'speelreeks_id'] },
  board: { column: 'status' },
  gallery: { kind: 'foto' },
  custom: true,
  scoped: 'productie_id',
  group_facts: dagFacts,
  columns: {
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    speelreeks_id: { type: 'integer', label: 'Tourstop', nullable: true, relation: 'speelreeks' },
    soort: { type: 'text', label: 'Soort', ...soorten },
    omschrijving: { type: 'text', label: 'Omschrijving', nullable: true },
    datum: { type: 'date', label: 'Datum' },
    start_at: { type: 'datetime', label: 'Start', nullable: true },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true },
    plandag: { type: 'date', label: 'Plandag', readonly: true },
    locatie_id: { type: 'integer', label: 'Eigen locatie', nullable: true, relation: 'organisatie', hidden: true },
    plaats: { type: 'text', label: 'Plaats', nullable: true, hidden: true },
    status: {
      type: 'text',
      label: 'Status',
      default: 'optie',
      ...statussen,
    },
    verrekening_default: { type: 'text', label: 'Verrekening', nullable: true },
    bron: { type: 'text', label: 'Bron', default: 'plan', options: { plan: 'Plan', registratie: 'Registratie' } },
    notities: { type: 'text', label: 'Notities', nullable: true, long: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
  lookups: {
    locatie: { label: 'Locatie', via: 'speelreeks_id', field: 'locatie_id', own: 'locatie_id', from: 'Tourstop' },
  },
  links: {
    mensen: {
      label: 'Mensen',
      item: 'Toewijzing',
      dataset: 'toewijzing',
      key: 'activiteit_id',
      target: 'persoon_id',
      state: 'state',
    },
  },
  indexes: [['plandag']],
  attachments: bijlagen,
})

export const persoon = defineDataset({
  name: 'persoon',
  label: 'Personen',
  new_label: 'Nieuwe persoon',
  icon: 'user',
  title: 'weergavenaam',
  custom: true,
  owners: { owner: 'id' },
  record_link: { email: 'email' },
  columns: {
    voornaam: { type: 'text', label: 'Voornaam', owner_visible: true },
    achternaam: { type: 'text', label: 'Achternaam', owner_visible: true },
    weergavenaam: { type: 'text', label: 'Naam', readonly: true, owner_visible: true },
    email: { type: 'text', label: 'E-mail', nullable: true, owner_visible: true },
    telefoon: { type: 'text', label: 'Telefoon', nullable: true, owner_visible: true },
    organisatie_id: { type: 'integer', label: 'Organisatie', nullable: true, relation: 'organisatie' },
    contract_type: {
      type: 'text',
      label: 'Contract',
      nullable: true,
      options: { vast: 'Vast', freelance: 'Freelance', dagcontract: 'Dagcontract' },
    },
    dietary: { type: 'text', label: 'Dieet', nullable: true },
    actief: { type: 'boolean', label: 'Actief', default: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
})

// A person without an email, or a name-only row, gets no invite: the planner reads why, and no token is minted.
function invite(row: Record<string, unknown>, ctx: WriteContext): HookResult {
  const person = typeof row.persoon_id === 'number' ? ctx.find('persoon', row.persoon_id) : null
  const email = typeof person?.email === 'string' ? person.email.trim() : ''
  if (email === '')
    return { notice: `Geen uitnodiging: ${person?.weergavenaam ?? row.naam ?? ''} heeft geen e-mailadres.` }
  const activity = typeof row.activiteit_id === 'number' ? ctx.find('activiteit', row.activiteit_id) : null
  return {
    token: { to: ['bevestigd', 'geweigerd'], days: 14 },
    mail: (link) =>
      link
        ? {
            to: email,
            subject: 'Uitnodiging',
            text: `Je bent uitgenodigd: ${activity?.omschrijving ?? 'een activiteit'}.\nBevestig of weiger via ${link}`,
          }
        : null,
  }
}

export const toewijzing = defineDataset({
  name: 'toewijzing',
  label: 'Toewijzingen',
  new_label: 'Nieuwe toewijzing',
  icon: 'users',
  title: { via: 'persoon_id', else: 'naam' },
  board: { column: 'state' },
  custom: true,
  owners: { owner: 'persoon_id' },
  matrix: {
    down: 'activiteit_id',
    across: 'persoon_id',
    label: 'naam',
    cell: 'state',
    note: 'notitie',
    keys: { v: 'voorlopig', u: 'uitgenodigd', b: 'bevestigd', g: 'geweigerd', x: 'geannuleerd' },
    marks: { voorlopig: '~', uitgenodigd: '?', bevestigd: '✓', geweigerd: '✗', geannuleerd: '–' },
    count: 'bevestigd',
    away: {
      dataset: 'beschikbaarheid',
      across: 'persoon_id',
      label: 'reden',
      end: 'eind_at',
      where: { soort: 'afwezig' },
    },
    open: { match: 'rol_id', count: 'aantal', fill: 'vul_slot' },
  },
  columns: {
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit', owner_visible: true },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon', options_from: KANDIDATEN },
    naam: { type: 'text', label: 'Naam', nullable: true },
    rol_id: { type: 'integer', label: 'Rol', nullable: true, relation: 'rol', owner_visible: true },
    aantal: { type: 'integer', label: 'Aantal', default: 1 },
    // The DDL default stays: changing it rebuilds the table. The writer decides the state on create.
    state: {
      type: 'text',
      label: 'Status',
      default: 'uitgenodigd',
      owner_visible: true,
      options: {
        open: 'Open',
        voorlopig: 'Voorlopig',
        uitgenodigd: 'Uitgenodigd',
        bevestigd: 'Bevestigd',
        geweigerd: 'Geweigerd',
        geannuleerd: 'Geannuleerd',
      },
      tones: { voorlopig: 'sky', uitgenodigd: 'warn', bevestigd: 'ok', geweigerd: 'bad', geannuleerd: 'bad' },
    },
    notitie: { type: 'text', label: 'Notitie', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
  lookups: {
    datum: { label: 'Datum', via: 'activiteit_id', field: 'datum' },
    start_at: { label: 'Start', via: 'activiteit_id', field: 'start_at' },
    eind_at: { label: 'Einde', via: 'activiteit_id', field: 'eind_at' },
    productie: { label: 'Productie', via: 'activiteit_id', field: 'productie_id' },
  },
  lifecycle: {
    column: 'state',
    transitions: [
      { from: ['open', 'uitgenodigd', 'bevestigd', 'geweigerd'], to: 'voorlopig', roles: ['editor', 'administrator'] },
      { from: ['open', 'voorlopig'], to: 'uitgenodigd', roles: ['editor', 'administrator'] },
      { from: ['open', 'voorlopig'], to: 'bevestigd', roles: ['editor', 'administrator'] },
      { from: ['uitgenodigd'], to: 'bevestigd', roles: ['editor', 'administrator', 'owner'], label: 'Bevestigen' },
      { from: ['uitgenodigd'], to: 'geweigerd', roles: ['editor', 'administrator', 'owner'], label: 'Weigeren' },
      { from: ['geweigerd'], to: 'uitgenodigd', roles: ['editor', 'administrator'] },
      { from: '*', to: 'geannuleerd', roles: ['editor', 'administrator'] },
    ],
    hooks: { uitgenodigd: invite },
    // The activity's title carries its day and place.
    token_projection: ['activiteit_id', 'rol_id', 'state'],
  },
  indexes: [['persoon_id'], ['activiteit_id']],
  attachments: bijlagen,
})

export const beschikbaarheid = defineDataset({
  name: 'beschikbaarheid',
  label: 'Beschikbaarheden',
  new_label: 'Nieuwe beschikbaarheid',
  icon: 'clock',
  title: { via: 'persoon_id', else: 'reden' },
  date: 'start_at',
  // An absence covers every day from its start to its end.
  calendar: { day: 'start_at', start: 'start_at', end: 'eind_at', lanes: ['persoon_id'], spans: true },
  custom: true,
  owners: { owner: 'persoon_id' },
  columns: {
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    start_at: { type: 'datetime', label: 'Start', owner_visible: true },
    eind_at: { type: 'datetime', label: 'Einde', owner_visible: true },
    soort: {
      type: 'text',
      label: 'Soort',
      default: 'afwezig',
      owner_visible: true,
      owner_writable: true,
      options: { afwezig: 'Afwezig', onzeker: 'Onzeker', beschikbaar: 'Beschikbaar', voorkeur: 'Voorkeur' },
      tones: { afwezig: 'bad', onzeker: 'warn', beschikbaar: 'ok', voorkeur: 'sky' },
    },
    reden: { type: 'text', label: 'Reden', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
})

export const rol = defineDataset({
  name: 'rol',
  label: 'Rollen',
  new_label: 'Nieuwe rol',
  icon: 'check',
  title: 'naam',
  custom: true,
  config: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    categorie: {
      type: 'text',
      label: 'Categorie',
      options: { artistiek: 'Artistiek', techniek: 'Techniek', productie: 'Productie', logistiek: 'Logistiek' },
    },
    standaard_verrekening: { type: 'text', label: 'Standaard verrekening', nullable: true },
    dagtarief: { type: 'real', label: 'Dagtarief', nullable: true },
    uurtarief: { type: 'real', label: 'Uurtarief', nullable: true },
    kleur: { type: 'text', label: 'Kleur', nullable: true },
  },
})

export const speelreeks = defineDataset({
  name: 'speelreeks',
  label: 'Tourstops',
  new_label: 'Nieuwe tourstop',
  icon: 'film',
  title: 'naam',
  date: 'start_datum',
  calendar: { day: 'start_datum', end: 'eind_datum', lanes: ['productie_id'], spans: true },
  custom: true,
  scoped: 'productie_id',
  columns: {
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    naam: { type: 'text', label: 'Naam' },
    locatie_id: { type: 'integer', label: 'Locatie', nullable: true, relation: 'organisatie' },
    start_datum: { type: 'date', label: 'Start' },
    eind_datum: { type: 'date', label: 'Einde' },
    status: {
      type: 'text',
      label: 'Status',
      default: 'optie',
      ...statussen,
    },
  },
  attachments: bijlagen,
})

export const sjabloon = defineDataset({
  name: 'sjabloon',
  label: 'Sjablonen',
  new_label: 'Nieuw sjabloon',
  icon: 'list',
  title: 'naam',
  custom: true,
  config: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    items: { type: 'json', label: 'Items' },
  },
})

export const persoonRol = defineDataset({
  name: 'persoon_rol',
  label: 'Rollen per persoon',
  new_label: 'Nieuwe rol voor een persoon',
  icon: 'users',
  title: { via: 'persoon_id', else: 'notitie' },
  custom: true,
  columns: {
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    rol_id: { type: 'integer', label: 'Rol', relation: 'rol' },
    dagtarief: { type: 'real', label: 'Dagtarief', nullable: true },
    uurtarief: { type: 'real', label: 'Uurtarief', nullable: true },
    voorkeur: { type: 'boolean', label: 'Voorkeur', default: false },
    notitie: { type: 'text', label: 'Notitie', nullable: true },
  },
  indexes: [['persoon_id'], ['rol_id']],
})

export const taak = defineDataset({
  name: 'taak',
  label: 'Taken',
  new_label: 'Nieuwe taak',
  icon: 'check',
  title: 'titel',
  date: 'deadline',
  custom: true,
  columns: {
    titel: { type: 'text', label: 'Titel' },
    deadline: { type: 'date', label: 'Deadline', nullable: true },
    toegewezen_aan: { type: 'integer', label: 'Toegewezen aan', nullable: true, relation: 'persoon' },
    gekoppeld_aan: {
      type: 'text',
      label: 'Gekoppeld aan',
      nullable: true,
      options: { productie: 'Productie', speelreeks: 'Tourstop', activiteit: 'Activiteit', organisatie: 'Organisatie' },
    },
    record_id: { type: 'integer', label: 'Record', nullable: true },
    status: {
      type: 'text',
      label: 'Status',
      default: 'open',
      options: { open: 'Open', gedaan: 'Gedaan' },
      tones: { gedaan: 'ok' },
    },
    notitie: { type: 'text', label: 'Notitie', nullable: true },
  },
  indexes: [['deadline']],
})
