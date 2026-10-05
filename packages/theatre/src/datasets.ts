import { defineDataset } from '@worktable/engine'

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
    organisatie_id: { type: 'integer', label: 'Organisatie', nullable: true },
    site_ref: { type: 'text', label: 'Site-referentie', nullable: true },
  },
})

export const activiteit = defineDataset({
  name: 'activiteit',
  label: 'Activiteiten',
  title: 'omschrijving',
  date: 'plandag',
  custom: true,
  columns: {
    productie_id: { type: 'integer', label: 'Productie', relation: 'productie' },
    speelreeks_id: { type: 'integer', label: 'Speelreeks', nullable: true },
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
    start_at: { type: 'datetime', label: 'Start' },
    eind_at: { type: 'datetime', label: 'Einde', nullable: true },
    plandag: { type: 'date', label: 'Plandag' },
    locatie_id: { type: 'integer', label: 'Locatie', nullable: true },
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
  },
  indexes: [['plandag']],
})
