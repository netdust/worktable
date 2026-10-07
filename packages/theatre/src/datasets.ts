import { defineDataset, type GroupFact } from '@worktable/engine'

// A day band's facts on the planning sources.
export const dagFacts: GroupFact[] = [
  { kind: 'first', column: 'start_at', where: { soort: 'voorstelling' }, label: 'voorstelling' },
  { kind: 'empty', column: 'start_at', label: 'zonder tijd' },
]

export const organisatie = defineDataset({
  name: 'organisatie',
  label: 'Organisaties',
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
  title: 'omschrijving',
  date: 'plandag',
  custom: true,
  scoped: 'productie_id',
  group_facts: dagFacts,
  columns: {
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    speelreeks_id: { type: 'integer', label: 'Speelreeks', nullable: true, relation: 'speelreeks' },
    soort: {
      type: 'text',
      label: 'Soort',
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
    },
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
      options: { optie: 'Optie', bevestigd: 'Bevestigd', geannuleerd: 'Geannuleerd' },
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
  title: 'weergavenaam',
  custom: true,
  owners: { owner: 'id' },
  columns: {
    voornaam: { type: 'text', label: 'Voornaam' },
    achternaam: { type: 'text', label: 'Achternaam' },
    weergavenaam: { type: 'text', label: 'Naam', readonly: true },
    email: { type: 'text', label: 'E-mail', nullable: true },
    telefoon: { type: 'text', label: 'Telefoon', nullable: true },
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

export const toewijzing = defineDataset({
  name: 'toewijzing',
  label: 'Toewijzingen',
  title: { via: 'persoon_id', else: 'naam' },
  custom: true,
  owners: { owner: 'persoon_id' },
  matrix: {
    down: 'activiteit_id',
    across: 'persoon_id',
    label: 'naam',
    cell: 'state',
    note: 'notitie',
    keys: { u: 'uitgenodigd', b: 'bevestigd', g: 'geweigerd', x: 'geannuleerd' },
    marks: { uitgenodigd: '?', bevestigd: '✓', geweigerd: '✗', geannuleerd: '–' },
    count: 'bevestigd',
    away: { dataset: 'beschikbaarheid', across: 'persoon_id', label: 'reden', end: 'eind_at' },
  },
  columns: {
    activiteit_id: { type: 'integer', label: 'Activiteit', relation: 'activiteit' },
    persoon_id: { type: 'integer', label: 'Persoon', nullable: true, relation: 'persoon' },
    naam: { type: 'text', label: 'Naam', nullable: true },
    state: {
      type: 'text',
      label: 'Status',
      default: 'uitgenodigd',
      options: {
        open: 'Open',
        uitgenodigd: 'Uitgenodigd',
        bevestigd: 'Bevestigd',
        geweigerd: 'Geweigerd',
        geannuleerd: 'Geannuleerd',
      },
    },
    notitie: { type: 'text', label: 'Notitie', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
  indexes: [['persoon_id'], ['activiteit_id']],
})

export const beschikbaarheid = defineDataset({
  name: 'beschikbaarheid',
  label: 'Beschikbaarheden',
  title: { via: 'persoon_id', else: 'reden' },
  date: 'start_at',
  custom: true,
  owners: { owner: 'persoon_id' },
  columns: {
    persoon_id: { type: 'integer', label: 'Persoon', relation: 'persoon' },
    start_at: { type: 'datetime', label: 'Start' },
    eind_at: { type: 'datetime', label: 'Einde' },
    reden: { type: 'text', label: 'Reden', nullable: true },
    legacy_post_id: { type: 'integer', label: 'Legacy post', nullable: true, readonly: true },
  },
})

export const rol = defineDataset({
  name: 'rol',
  label: 'Rollen',
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
  label: 'Speelreeksen',
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
      options: { optie: 'Optie', bevestigd: 'Bevestigd', geannuleerd: 'Geannuleerd' },
    },
  },
})

export const sjabloon = defineDataset({
  name: 'sjabloon',
  label: 'Sjablonen',
  title: 'naam',
  custom: true,
  config: true,
  columns: {
    naam: { type: 'text', label: 'Naam' },
    items: { type: 'json', label: 'Items' },
  },
})
