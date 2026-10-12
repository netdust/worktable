import { type ActionDecl, type Domain, defineDataset, defineQuery, type OptionsFrom } from '../../src'

// A slot is filled by a member; pick_list ranks the members who may fill each slot.
export const PICKS: OptionsFrom = { source: 'pick_list', match: { slot_id: 'id' }, value: 'member_id', sort: ['rank'] }

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  columns: { name: { type: 'text', label: 'Name' } },
})

const slot = defineDataset({
  name: 'slot',
  label: 'Slots',
  title: 'name',
  custom: false,
  owners: { owner: 'member_id' },
  columns: {
    name: { type: 'text', label: 'Name', owner_visible: true },
    member_id: { type: 'integer', label: 'Member', nullable: true, relation: 'member', options_from: PICKS },
  },
})

const pick = defineDataset({
  name: 'pick',
  label: 'Picks',
  title: 'note',
  custom: false,
  columns: {
    slot_id: { type: 'integer', label: 'Slot', relation: 'slot' },
    member_id: { type: 'integer', label: 'Member', relation: 'member' },
    rank: { type: 'integer', label: 'Rank' },
    note: { type: 'text', label: 'Note', nullable: true },
  },
})

const pickList = defineQuery({
  name: 'pick_list',
  label: 'Pick list',
  title: 'note',
  sql: 'SELECT id, slot_id, member_id, rank, note FROM pick WHERE deleted_at IS NULL',
  columns: {
    id: { type: 'integer', label: 'Id' },
    slot_id: { type: 'integer', label: 'Slot' },
    member_id: { type: 'integer', label: 'Member', relation: 'member' },
    rank: { type: 'integer', label: 'Rank' },
    note: { type: 'text', label: 'Note', nullable: true },
  },
})

const fillSlot: ActionDecl = {
  label: 'Fill',
  on: 'slot',
  input: { member_id: { relation: 'member', label: 'Member', options_from: PICKS } },
  run: (row, input) => ({
    updates: [{ dataset: 'slot', id: Number(row.id), values: { member_id: (input.member_id as { id: number }).id } }],
  }),
}

const domain: Domain = {
  datasets: [member, slot, pick],
  queries: [pickList],
  writers: { slot: { create: (values) => values, update: (values) => values } },
  actions: { fill_slot: fillSlot },
  seed: (insert) => {
    insert('member', [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cy' }])
    insert('slot', [{ name: 'First' }, { name: 'Second' }])
    // Rank and id disagree: Cy (id 3) ranks first on slot 1.
    insert('pick', [
      { slot_id: 1, member_id: 1, rank: 3 },
      { slot_id: 1, member_id: 2, rank: 2 },
      { slot_id: 1, member_id: 3, rank: 1 },
      { slot_id: 2, member_id: 1, rank: 1 },
    ])
  },
  views: [],
}

export default domain
