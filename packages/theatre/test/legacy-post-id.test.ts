import { expect, test } from 'bun:test'
import theatre from '../src'

const IMPORTED = ['organisatie', 'productie', 'activiteit', 'persoon', 'toewijzing', 'beschikbaarheid']

test('every imported theatre dataset declares a nullable readonly legacy_post_id', () => {
  for (const name of IMPORTED) {
    const d = theatre.datasets.find((d) => d.name === name)
    expect(d?.columns.legacy_post_id).toMatchObject({ type: 'integer', nullable: true, readonly: true })
  }
})

test('the datasets step 1 adds are not imported and carry none', () => {
  const added = theatre.datasets.filter((d) => !IMPORTED.includes(d.name))
  expect(added.map((d) => d.name).sort()).toEqual(['persoon_rol', 'rol', 'sjabloon', 'speelreeks', 'taak'])
  for (const d of added) expect(d.columns.legacy_post_id).toBeUndefined()
})
