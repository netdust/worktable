import { Database } from 'bun:sqlite'

// Two read-only views on activiteit that the theatre seed no longer declares, kept for the gates that edit
// activiteit itself: system-owned and shared, as a seeded view is. Run by global setup with bun.
const VIEWS = [
  {
    name: 'Bevestigd',
    filters: { status: 'bevestigd' },
    sort: ['start_at'],
    group_by: 'plandag',
    visible_fields: ['productie_id', 'soort', 'start_at', 'eind_at', 'status', 'plaats'],
  },
  {
    name: 'Optie of bevestigd',
    filters: { status: { $in: ['optie', 'bevestigd'] } },
    sort: ['plandag', 'start_at'],
    group_by: null,
    visible_fields: ['productie_id', 'soort', 'datum', 'start_at', 'eind_at', 'status', 'plaats'],
  },
]

const sqlite = new Database(process.argv[2] as string)
const insert = sqlite.query(
  `INSERT INTO saved_view (name, source_type, source, skin, filters, sort, group_by, visible_fields, owner_id, shared)
   VALUES (?, 'dataset', 'activiteit', 'table', ?, ?, ?, ?, -1, 1)`,
)
const json = JSON.stringify
for (const v of VIEWS) insert.run(v.name, json(v.filters), json(v.sort), v.group_by, json(v.visible_fields))
sqlite.close()
