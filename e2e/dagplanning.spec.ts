import { expect, type Locator, type Page, test } from '@playwright/test'
import { fillDate } from './segments'
import { shot } from './shots'
import { dropViews, openView, openWeek, pickIn } from './tree'

const WEEK = '2026-12-21'

type Api = Page['request']
type Values = Record<string, unknown>

async function rowsOf<T = Values>(api: Api, dataset: string, filter?: Values): Promise<T[]> {
  const query = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
  const response = await api.get(`/api/rows/${dataset}?limit=500${query}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: T[] }).rows
}

async function idOf(api: Api, dataset: string, values: Values): Promise<number> {
  const response = await api.post(`/api/rows/${dataset}`, { data: values })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

const idByName = async (api: Api, dataset: string, column: string, name: string) =>
  (await rowsOf<Values & { id: number }>(api, dataset)).find((r) => r[column] === name)?.id as number

// The header may still be laying out its columns: wait for the one asked for.
async function columnIndex(page: Page, label: string): Promise<number> {
  const find = () =>
    page
      .locator('thead th')
      .evaluateAll(
        (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
        label,
      )
  let index = -1
  await expect
    .poll(
      async () => {
        index = await find()
        return index
      },
      { message: `column ${label}` },
    )
    .toBeGreaterThanOrEqual(0)
  return index
}

const named = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)
const cellOf = async (page: Page, title: string, label: string): Promise<Locator> =>
  named(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))

async function openDagplanning(page: Page) {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planning')
}

test('period-is-the-period @e2e', async ({ page }) => {
  const api = page.request
  const productie = await idByName(api, 'productie', 'titel', 'Nachtwacht')
  const [near, far] = ['periode in december', 'periode in februari']
  const made = [
    await idOf(api, 'activiteit', { productie_id: productie, soort: 'repetitie', datum: WEEK, omschrijving: near }),
    await idOf(api, 'activiteit', {
      productie_id: productie,
      soort: 'repetitie',
      datum: '2027-02-15',
      omschrijving: far,
    }),
  ]
  try {
    await page.goto('/')
    await openView(page, 'Planning', 'Activiteiten')
    const bar = page.locator('.nv-bar')
    // The view's period is its date column's one condition: lit in the period chips, named in the title line, never a chip.
    const week = bar.getByRole('radiogroup', { name: 'Periode' }).getByRole('radio', { name: 'Week' })
    await expect(week).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^Week \d+ · /)
    await expect(bar.locator('.nv-chip--filter')).toHaveCount(0)
    await shot(page, 'period-is-a-filter')

    // The lit Week pressed again shows every date.
    await week.click()
    await expect(week).toHaveAttribute('aria-checked', 'false')
    await expect(named(page, near)).toHaveCount(1)
    await expect(named(page, far)).toHaveCount(1)

    // Set in the builder, a date condition on the period's column is the period: named in the title line, not a chip.
    await bar.getByRole('button', { name: /^Filter\s*\d*$/ }).click()
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const row = page.getByRole('group', { name: /^Voorwaarde \d/ }).last()
    await pickIn(row, 'Veld', 'Plandag')
    await pickIn(row, 'Vergelijking', 'ligt tussen')
    await fillDate(row.getByRole('group', { name: 'Van', exact: true }), WEEK)
    await fillDate(row.getByRole('group', { name: 'Tot', exact: true }), '2026-12-27')
    await page.keyboard.press('Escape')
    await expect(page.locator('.nv-toolbar__summary')).toHaveText(/^Week \d+ · 21–27 dec$/)
    await expect(bar.locator('.nv-chip--filter')).toHaveCount(0)
    await expect(named(page, near)).toHaveCount(1)
    await expect(named(page, far)).toHaveCount(0)
  } finally {
    for (const id of made) await api.delete(`/api/rows/activiteit/${id}`)
  }
})

// The specs share one database: what this flow made would show up in later ones, so it goes again whatever happens.
test('people-tags @e2e', async ({ page }) => {
  const api = page.request
  await dropViews(page, ['Planning (kopie)'])
  try {
    await peopleTags(page)
  } finally {
    await cleanUp(api)
  }
})

async function cleanUp(api: Api) {
  const activity = (await rowsOf<{ id: number }>(api, 'activiteit', { omschrijving: PEOPLE_TITLE }))[0]?.id
  if (activity !== undefined) {
    for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: activity }))
      await api.delete(`/api/rows/toewijzing/${t.id}`)
    await api.delete(`/api/rows/activiteit/${activity}`)
  }
  const { views } = (await (await api.get('/api/views')).json()) as { views: { id: number; name: string }[] }
  const copies = views.filter((v) => v.name === 'Planning (kopie)')
  for (const view of copies) await api.delete(`/api/views/${view.id}`)
}

const PEOPLE_TITLE = 'mensen e2e'

async function peopleTags(page: Page) {
  const api = page.request
  const title = PEOPLE_TITLE
  const activity = await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum: WEEK,
    start_at: `${WEEK}T15:00`,
    omschrijving: title,
  })
  const bram = await idByName(api, 'persoon', 'weergavenaam', 'Bram De Wilde')
  const noor = await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes')
  const sam = await idByName(api, 'persoon', 'weergavenaam', 'Sam Peeters')
  await idOf(api, 'toewijzing', { activiteit_id: activity, persoon_id: bram, state: 'bevestigd' })
  await openDagplanning(page)

  const people = async () => cellOf(page, title, 'Mensen')
  const names = async () => (await people()).locator('.nv-names')
  const assigned = async () =>
    (await rowsOf<{ persoon_id: number | null }>(api, 'toewijzing', { activiteit_id: activity }))
      .map((t) => t.persoon_id)
      .sort()
  const option = (name: string) => page.getByRole('option', { name })
  const openPeople = async () => {
    await (await people()).click()
    await (await people()).press('Enter')
  }

  // A row shows its people as coloured names on one line.
  await expect(await names()).toHaveText('Bram De Wilde')
  await expect((await names()).locator('.nv-pill--ok')).toHaveText('Bram De Wilde')

  // One box: the chosen names, then the search; the list offers only the others. Picking adds as uitgenodigd and keeps the box open.
  await openPeople()
  const search = page.getByRole('combobox', { name: 'Mensen' })
  const chosen = page.locator('.nv-picker .nv-chosen [role="row"]')
  await expect(chosen).toHaveText(['Bram De Wilde'])
  await expect(option('Bram De Wilde')).toHaveCount(0)
  await search.fill('Noor')
  await option('Noor Claes').click()
  await expect(chosen).toHaveText(['Bram De Wilde', 'Noor Claes'])
  await expect(chosen.filter({ hasText: 'Noor Claes' })).toHaveClass(/nv-pill--warn/)
  await expect(search).toBeVisible()
  expect(await assigned()).toEqual([bram, noor].sort())

  // Undo takes the add back (the history is per page: before any reload); add again, and a reload keeps it.
  await search.press('Escape')
  await (await people()).press('Control+z')
  await expect(await names()).toHaveText('Bram De Wilde')
  await expect.poll(assigned).toEqual([bram])
  await openPeople()
  await search.fill('Noor')
  await option('Noor Claes').click()
  await expect.poll(assigned).toEqual([bram, noor].sort())
  await page.reload()
  await expect(await names()).toHaveText('Bram De Wilde, Noor Claes')

  // Backspace in the empty search removes the last name; an uitgenodigd one without a question.
  await openPeople()
  await search.press('Backspace')
  await expect.poll(assigned).toEqual([bram])
  await expect(page.getByRole('alertdialog')).toHaveCount(0)

  // × on a bevestigd name asks first; Annuleren keeps it.
  await page.getByRole('button', { name: 'Bram De Wilde verwijderen' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Toewijzing van Bram De Wilde verwijderen?')
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await assigned()).toEqual([bram])

  // A stale pick: the same person was assigned elsewhere meanwhile; the writer refuses, and the row reads again.
  await idOf(api, 'toewijzing', { activiteit_id: activity, persoon_id: sam })
  await search.fill('Sam')
  await option('Sam Peeters').click()
  await expect(page.getByRole('status', { name: 'Deze persoon is al toegewezen aan deze activiteit.' })).toBeVisible()
  await shot(page, 'people-tags')
  await expect.poll(assigned).toEqual([bram, sam].sort())
  await search.press('Escape')

  // A copy of the view keeps Planning's order: Mensen right after Tourstop.
  await page.getByRole('button', { name: 'More actions: Planning' }).click()
  await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
  await page.reload()
  await openView(page, 'Planning (kopie)', 'Activiteiten')
  const heads = (await page.locator('thead th').allTextContents()).map((h) => h.replace(/\s*[↑↓]$/, '').trim())
  expect(heads.indexOf('Mensen')).toBe(heads.indexOf('Tourstop') + 1)
}

// The shake-out's edges: the people cell's colours and overflow, the removal question by keyboard, the draft row, Tourstop.

type Assigned = { persoon_id: number | null; naam?: string | null; state: string }

async function withActivity(page: Page, title: string, start: string, flow: (activity: number) => Promise<void>) {
  const api = page.request
  const activity = await idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    datum: WEEK,
    start_at: `${WEEK}T${start}`,
    omschrijving: title,
  })
  try {
    await flow(activity)
  } finally {
    for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: activity }))
      await api.delete(`/api/rows/toewijzing/${t.id}`)
    await api.delete(`/api/rows/activiteit/${activity}`)
  }
}

const personId = (api: Api, name: string) => idByName(api, 'persoon', 'weergavenaam', name)

test('people-colours-and-overflow @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  const api = page.request
  const title = 'mensen kleuren e2e'
  await withActivity(page, title, '09:00', async (activity) => {
    const states: [string, string][] = [
      ['Bram De Wilde', 'bevestigd'],
      ['Noor Claes', 'uitgenodigd'],
      ['Sam Peeters', 'geweigerd'],
      ['Lotte Verhaegen', 'geannuleerd'],
    ]
    for (const [name, state] of states)
      await idOf(api, 'toewijzing', { activiteit_id: activity, persoon_id: await personId(api, name), state })
    await idOf(api, 'toewijzing', { activiteit_id: activity, naam: 'Gastregisseur', state: 'bevestigd' })
    await openDagplanning(page)

    const cell = await cellOf(page, title, 'Mensen')
    const names = cell.locator('.nv-names')
    const all = 'Bram De Wilde, Noor Claes, Sam Peeters, Lotte Verhaegen, Gastregisseur'
    await expect(names).toHaveText(all)
    await expect(names).toHaveAttribute('title', all)
    await expect(names.locator('.nv-pill--ok')).toHaveText(['Bram De Wilde'])
    await expect(names.locator('.nv-pill--warn')).toHaveText(['Noor Claes'])
    await expect(names.locator('.nv-pill--bad')).toHaveText(['Sam Peeters', 'Lotte Verhaegen'])
    await expect(names.locator('.nv-pill--muted')).toHaveText(['Gastregisseur'])
    const colour = (name: string) =>
      names.locator('.nv-pill', { hasText: name }).evaluate((el) => getComputedStyle(el).color)
    const [green, amber, red, grey] = await Promise.all(
      ['Bram De Wilde', 'Noor Claes', 'Sam Peeters', 'Gastregisseur'].map(colour),
    )
    expect(new Set([green, amber, red, grey]).size).toBe(4)
    expect(await colour('Lotte Verhaegen')).toBe(red)

    // One line, cut with an ellipsis: the names overflow their box, which neither wraps nor grows the row.
    const box = await names.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        overflow: el.scrollWidth > el.clientWidth,
        ellipsis: style.textOverflow,
        wrap: style.whiteSpace,
        height: el.getBoundingClientRect().height,
        line: Number.parseFloat(style.lineHeight) || 20,
      }
    })
    expect(box.overflow).toBe(true)
    expect(box.ellipsis).toBe('ellipsis')
    expect(box.wrap).toBe('nowrap')
    expect(box.height).toBeLessThanOrEqual(box.line * 1.5)
    const rowHeight = (await named(page, title).boundingBox())?.height ?? 0
    expect(rowHeight).toBeLessThanOrEqual(46)
    await shot(page, 'people-cell')

    // The box: every chosen name, a × only for a person; the list offers none of them.
    await cell.click()
    await cell.press('Enter')
    const chosen = page.locator('.nv-picker .nv-chosen [role="row"]')
    await expect(chosen).toHaveText(['Bram De Wilde', 'Noor Claes', 'Sam Peeters', 'Lotte Verhaegen', 'Gastregisseur'])
    await expect(chosen.filter({ hasText: 'Gastregisseur' }).getByRole('button')).toHaveCount(0)
    await expect(page.locator('.nv-picker .nv-chosen__remove')).toHaveCount(4)
    for (const [name] of states) await expect(page.getByRole('option', { name })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Mensen' })).toBeFocused()
    await shot(page, 'people-box')
    await page.getByRole('combobox', { name: 'Mensen' }).press('Escape')
    await expect(page.getByRole('combobox', { name: 'Mensen' })).toHaveCount(0)
  })
})

async function openPeopleOf(page: Page, title: string): Promise<Locator> {
  const cell = await cellOf(page, title, 'Mensen')
  await cell.click()
  await cell.press('Enter')
  const search = page.getByRole('combobox', { name: 'Mensen' })
  await expect(search).toBeFocused()
  return search
}

/** One activity with Bram De Wilde bevestigd on it, Dagplanning open, and the question asked by Backspace. */
async function withQuestion(
  page: Page,
  title: string,
  start: string,
  flow: (activity: number, search: Locator) => Promise<void>,
) {
  const api = page.request
  await withActivity(page, title, start, async (activity) => {
    await idOf(api, 'toewijzing', {
      activiteit_id: activity,
      persoon_id: await personId(api, 'Bram De Wilde'),
      state: 'bevestigd',
    })
    await openDagplanning(page)
    const search = await openPeopleOf(page, title)
    await search.press('Backspace')
    await expect(page.getByRole('alertdialog')).toContainText('Toewijzing van Bram De Wilde verwijderen?')
    await flow(activity, search)
  })
}

const assignedTo = async (api: Api, activity: number) =>
  (await rowsOf<Assigned>(api, 'toewijzing', { activiteit_id: activity })).map((t) => t.persoon_id)

// Bugs: the question holds the keyboard on Annuleren; Enter there reached the grid and marked the cell; Tab never reached Verwijderen; its buttons had no stylesheet.
test('removal-question-by-keyboard @e2e', async ({ page }) => {
  const api = page.request
  const bram = await personId(api, 'Bram De Wilde')
  const writes: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'PATCH') writes.push(new URL(req.url()).pathname)
  })
  await withQuestion(page, 'mensen vraag e2e', '11:00', async (activity, search) => {
    const question = page.getByRole('alertdialog')
    const cancel = question.getByRole('button', { name: 'Annuleren' })
    const remove = question.getByRole('button', { name: 'Verwijderen' })

    // Backspace on a confirmed last name asks; the question holds the keyboard on Annuleren, in the app's own buttons.
    await expect(cancel).toBeFocused()
    const style = (button: Locator) =>
      button.evaluate((el) => {
        const s = getComputedStyle(el)
        return { font: s.fontFamily, background: s.backgroundColor, border: s.borderTopStyle }
      })
    const [cancelStyle, removeStyle] = [await style(cancel), await style(remove)]
    expect(cancelStyle.font).toMatch(/^"?IBM Plex Sans/)
    expect(cancelStyle.border).not.toBe('outset')
    expect(removeStyle.background).not.toBe(cancelStyle.background)
    await shot(page, 'removal-question')

    // Escape keeps the person, and the search has the keyboard again.
    await page.keyboard.press('Escape')
    await expect(question).toHaveCount(0)
    await expect(search).toBeFocused()
    expect(await assignedTo(api, activity)).toEqual([bram])
    await expect(page.locator('.nv-picker .nv-chosen [role="row"]')).toHaveText(['Bram De Wilde'])

    // Space on the focused Annuleren keeps them too.
    await search.press('Backspace')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Space')
    await expect(question).toHaveCount(0)
    await expect(search).toBeFocused()
    expect(await assignedTo(api, activity)).toEqual([bram])

    // Enter on it keeps them without the grid committing the people cell as a value: no write, no marked cell.
    await search.press('Backspace')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(question).toHaveCount(0)
    expect(await assignedTo(api, activity)).toEqual([bram])
    await page.waitForTimeout(500)
    expect(writes).toEqual([])
    await expect(page.locator('td.nv-td--error')).toHaveCount(0, { timeout: 1000 })
    await expect(search).toBeFocused({ timeout: 1000 })

    // Tab reaches Verwijderen.
    await search.press('Backspace')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(remove).toBeFocused({ timeout: 1000 })
    await page.keyboard.press('Escape')
    await expect(question).toHaveCount(0)

    // The × asks as well; Verwijderen removes, and that is final: Ctrl+Z does not bring them back.
    await page.getByRole('button', { name: 'Bram De Wilde verwijderen' }).click()
    await remove.click()
    await expect.poll(() => assignedTo(api, activity)).toEqual([])
    await expect(page.locator('.nv-picker .nv-chosen [role="row"]')).toHaveCount(0)
    await search.press('Escape')
    await (await cellOf(page, 'mensen vraag e2e', 'Mensen')).press('Control+z')
    await page.waitForTimeout(500)
    expect(await assignedTo(api, activity)).toEqual([])
    await expect((await cellOf(page, 'mensen vraag e2e', 'Mensen')).locator('.nv-names')).toHaveText('')
  })
})

// Bug: at 1280 wide the people box runs past the viewport's right edge.
test('people-box-fits-at-1280 @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const api = page.request
  await withActivity(page, 'mensen breedte e2e', '16:00', async (activity) => {
    for (const name of ['Bram De Wilde', 'Noor Claes', 'Sam Peeters', 'Lotte Verhaegen'])
      await idOf(api, 'toewijzing', {
        activiteit_id: activity,
        persoon_id: await personId(api, name),
        state: 'bevestigd',
      })
    await openDagplanning(page)
    await openPeopleOf(page, 'mensen breedte e2e')
    const box = await page
      .locator('.nv-pop.nv-picker')
      .evaluate((el) => ({ right: el.getBoundingClientRect().right, width: innerWidth }))
    await shot(page, 'people-box-1280')
    expect(box.right).toBeLessThanOrEqual(box.width)
  })
})

test('people-list-opens-up-to-its-size @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  const api = page.request
  const production = await idByName(api, 'productie', 'titel', 'Nachtwacht')
  const earlier: number[] = []
  for (let hour = 8; hour < 20; hour++)
    earlier.push(
      await idOf(api, 'activiteit', {
        productie_id: production,
        soort: 'repetitie',
        datum: WEEK,
        start_at: `${WEEK}T${String(hour).padStart(2, '0')}:00`,
        omschrijving: `vooraf ${hour} e2e`,
      }),
    )
  try {
    await withActivity(page, 'mensen omhoog e2e', '23:00', async () => {
      await openDagplanning(page)
      // Room below the row for less than the list, and far more above it: the list must open upwards at its own height.
      const row = (await named(page, 'mensen omhoog e2e').boundingBox()) ?? { y: 0, height: 0 }
      expect(row.y).toBeGreaterThan(400)
      await page.setViewportSize({ width: 1280, height: Math.round(row.y + row.height + 120) })
      const search = await openPeopleOf(page, 'mensen omhoog e2e')
      await search.press('ArrowDown')
      const list = page.locator('.nv-picker__pop')
      await expect(list.getByRole('option').first()).toBeVisible()
      const at = await list.evaluate((el) => ({
        placement: el.getAttribute('data-placement'),
        ...el.getBoundingClientRect().toJSON(),
      }))
      const input = (await search.boundingBox()) ?? { y: 0 }
      await shot(page, 'people-list-up')
      expect(at.placement).toBe('top')
      expect(at.bottom).toBeLessThanOrEqual(input.y)
      expect(input.y - at.bottom).toBeLessThanOrEqual(12)
      expect(at.height).toBeLessThanOrEqual(300)
    })
  } finally {
    for (const id of earlier) await api.delete(`/api/rows/activiteit/${id}`)
  }
})

// + Nieuw in Planning creates the activity at once once a production is chosen, so its Mensen links to a real record.
test('new-row-people @e2e', async ({ page }) => {
  const api = page.request
  const posts: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname.startsWith('/api/rows/'))
      posts.push(new URL(req.url()).pathname)
  })
  await openDagplanning(page)
  const add = page.getByRole('button', { name: 'Nieuwe activiteit' })
  // Without a production the row cannot be made: the draft asks Productie and nothing is written.
  await add.click()
  await expect(page.getByRole('combobox', { name: 'Productie' })).toBeFocused()
  expect(posts).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.locator('tbody tr.nv-tr--draft')).toHaveCount(0)

  await page.getByRole('button', { name: 'Alle producties', exact: true }).click()
  await page.getByRole('option', { name: 'Nachtwacht', exact: true }).click()
  let made: number | undefined
  try {
    const created = page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/activiteit',
    )
    await add.click()
    const response = await created
    expect(response.status()).toBe(201)
    made = ((await response.json()) as { id: number }).id
    await expect(page.locator('tbody tr.nv-tr--draft')).toHaveCount(0)

    const [row] = await rowsOf<{ id: number; omschrijving: string | null }>(api, 'activiteit', { id: made })
    expect(row?.id).toBe(made)
    await page.waitForLoadState('networkidle')
    const index = await columnIndex(page, 'Mensen')
    const cell = page.locator('tbody tr.nv-tr[data-title=""]').first().locator('td').nth(index)
    await expect(cell).not.toHaveAttribute('aria-readonly', 'true')
    await cell.click()
    await cell.press('Enter')
    await page.getByRole('combobox', { name: 'Mensen' }).fill('Noor')
    await page.getByRole('option', { name: 'Noor Claes' }).click()
    await expect
      .poll(async () => (await rowsOf<Assigned>(api, 'toewijzing', { activiteit_id: made })).map((t) => t.persoon_id))
      .toEqual([await personId(api, 'Noor Claes')])
    await shot(page, 'new-row-people')
    expect(posts.filter((p) => p === '/api/rows/toewijzing')).toHaveLength(1)
    await page.getByRole('combobox', { name: 'Mensen' }).press('Escape')
  } finally {
    if (made !== undefined) {
      for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: made }))
        await api.delete(`/api/rows/toewijzing/${t.id}`)
      await api.delete(`/api/rows/activiteit/${made}`)
    }
    await page.getByRole('button', { name: 'Nachtwacht', exact: true }).click()
    await page.getByRole('option', { name: 'Alle producties', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Alle producties', exact: true })).toBeVisible()
  }
})

test('period-empty-result @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', '2030-01-07')
  const empty = page.locator('.nv-center').getByText('Geen rijen in deze periode', { exact: true })
  await expect(empty).toBeVisible()
  await expect(page.locator('.nv-center')).toContainText('Week 2 · 7–13 jan')

  // Centred in the grid's room, across and down.
  const [room, text] = await Promise.all([page.locator('.nv-center').boundingBox(), empty.boundingBox()])
  const middle = (b: { x: number; y: number; width: number; height: number } | null) =>
    b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 }
  expect(Math.abs(middle(room).x - middle(text).x)).toBeLessThan(4)
  expect(Math.abs(middle(room).y - middle(text).y)).toBeLessThan(40)
  await shot(page, 'period-empty')
})

// Bug: a double-click on an option adds twice; the second is refused, so a person added once reads as a failed add.
test('people-double-pick @e2e', async ({ page }) => {
  const api = page.request
  const posts: number[] = []
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/toewijzing')
      posts.push(res.status())
  })
  await withActivity(page, 'mensen dubbel e2e', '17:00', async (activity) => {
    await openDagplanning(page)
    const search = await openPeopleOf(page, 'mensen dubbel e2e')
    await search.fill('Noor')
    await page.getByRole('option', { name: 'Noor Claes' }).dblclick()
    await expect.poll(() => assignedTo(api, activity)).toEqual([await personId(api, 'Noor Claes')])
    await page.waitForTimeout(800)
    await shot(page, 'people-double-pick')
    expect(posts).toEqual([201])
    await expect(page.getByRole('status', { name: 'Deze persoon is al toegewezen aan deze activiteit.' })).toHaveCount(
      0,
      {
        timeout: 1000,
      },
    )
  })
})
