import { defineDataset, type GroupFact, type HookResult, type WriteContext } from '@worktable/engine'

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
    locatie_id: { type: 'integer', label: 'Locatie', nullable: true, relation: 'organisatie' },
    plaats: { type: 'text', label: 'Plaats', nullable: true },
    status: {
      type: 'text',
      label: 'Status',
      default: 'optie',
      ...statussen,
    },
    verrekening_default: { type: 'text', label: 'Verrekening', nullable: true },
    bron: { type: 'text', label: 'Bron', default: 'plan', options: { plan: 'Plan', registratie: 'Registratie' } },
    notities: { type: 'text', label: 'Notities', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
  indexes: [['plandag']],
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
    away: { dataset: 'beschikbaarheid', across: 'persoon_id', label: 'reden', end: 'eind_at' },
    open: { match: 'rol_id', count: 'aantal', fill: 'vul_slot' },
  },
  columns: {
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit', owner_visible: true },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon' },
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
})

export const beschikbaarheid = defineDataset({
  name: 'beschikbaarheid',
  label: 'Beschikbaarheden',
  new_label: 'Nieuwe beschikbaarheid',
  icon: 'clock',
  title: { via: 'persoon_id', else: 'reden' },
  date: 'start_at',
  custom: true,
  owners: { owner: 'persoon_id' },
  columns: {
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    start_at: { type: 'datetime', label: 'Start', owner_visible: true },
    eind_at: { type: 'datetime', label: 'Einde', owner_visible: true },
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
