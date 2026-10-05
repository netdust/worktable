import { readFileSync } from 'node:fs'
import { defineQuery } from '@worktable/engine'

export const zichtbareFiches = defineQuery({
  name: 'zichtbare_fiches',
  label: 'Zichtbare fiches',
  title: 'titel',
  sql: readFileSync(new URL('./queries/zichtbare_fiches.sql', import.meta.url), 'utf8'),
  columns: {
    id: { type: 'integer', label: 'Id' },
    titel: { type: 'text', label: 'Titel' },
    type: { type: 'text', label: 'Type' },
    gemeente: { type: 'text', label: 'Gemeente' },
    postcode: { type: 'text', label: 'Postcode' },
    prioriteit: { type: 'integer', label: 'Prioriteit' },
  },
})
