import { defineDataset } from '@worktable/engine'

export const fiche = defineDataset({
  name: 'fiche',
  label: 'Fiches',
  title: 'titel',
  custom: true,
  columns: {
    titel: { type: 'text', label: 'Titel' },
    type: {
      type: 'text',
      label: 'Type',
      options: { hulp: 'Hulp', preventie: 'Preventie', vroeginterventie: 'Vroeginterventie' },
    },
    gemeente: { type: 'text', label: 'Gemeente' },
    postcode: { type: 'text', label: 'Postcode' },
    telefoon: { type: 'text', label: 'Telefoon', nullable: true },
    email: { type: 'text', label: 'E-mail', nullable: true },
    website: { type: 'text', label: 'Website', nullable: true },
    prioriteit: { type: 'integer', label: 'Prioriteit', default: 0 },
    verborgen: { type: 'boolean', label: 'Verborgen', default: false },
  },
})
