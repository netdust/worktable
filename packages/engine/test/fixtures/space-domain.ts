import { type Domain, defineDataset, defineQuery } from '../../src'

// A domain declaring a space, sections, group facts and an inherited column, in generic words.
const team = defineDataset({
  name: 'team',
  label: 'Teams',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const member = defineDataset({
  name: 'member',
  label: 'Members',
  title: 'name',
  custom: false,
  owners: { owner: 'id' },
  columns: { name: { type: 'text', label: 'Name' } },
})

const room = defineDataset({
  name: 'room',
  label: 'Rooms',
  title: 'name',
  custom: false,
  columns: { name: { type: 'text', label: 'Name' } },
})

const job = defineDataset({
  name: 'job',
  label: 'Jobs',
  title: 'name',
  custom: false,
  owners: { owner: 'member_id' },
  scoped: 'team_id',
  group_facts: [
    { kind: 'first', column: 'begins', where: { kind: 'main' }, label: 'main' },
    { kind: 'count', where: { kind: 'side' }, label: 'side' },
    { kind: 'empty', column: 'begins', label: 'open' },
  ],
  columns: {
    name: { type: 'text', label: 'Name' },
    team_id: { type: 'integer', label: 'Team', relation: 'team' },
    member_id: { type: 'integer', label: 'Member', nullable: true, relation: 'member' },
    kind: { type: 'text', label: 'Kind', options: { main: 'Main', side: 'Side' } },
    begins: { type: 'datetime', label: 'Begins', nullable: true },
    room_id: { type: 'integer', label: 'Room', nullable: true, relation: 'room' },
  },
})

const jobRoom = defineQuery({
  name: 'job_room',
  label: 'Job rooms',
  title: 'name',
  scoped: 'team_id',
  sql: `SELECT j.id, j.name, j.team_id, COALESCE(j.room_id, 1) AS room_id,
          CASE WHEN j.room_id IS NULL THEN 'team' ELSE 'own' END AS room_from
        FROM job j WHERE j.deleted_at IS NULL`,
  columns: {
    id: { type: 'integer', label: 'Id' },
    name: { type: 'text', label: 'Name' },
    team_id: { type: 'integer', label: 'Team', relation: 'team' },
    room_id: {
      type: 'integer',
      label: 'Room',
      relation: 'room',
      readonly: true,
      inherited: { flag: 'room_from', own: 'own' },
    },
    room_from: { type: 'text', label: 'Room from', options: { own: 'Own', team: 'Team' } },
  },
})

const domain: Domain = {
  datasets: [team, member, room, job],
  queries: [jobRoom],
  space: { dataset: 'team' },
  sections: [
    { label: 'Work', sources: ['job_room', 'job'] },
    { label: 'Setup', sources: ['team', 'room'] },
  ],
  seed: (insert) => {
    insert('team', [{ name: 'Red' }])
    insert('member', [{ name: 'Ann' }])
    insert('room', [{ name: 'Hall' }])
    insert('job', [{ name: 'One', team_id: 1, member_id: 1, kind: 'main' }])
  },
  views: [],
}

export default domain
