import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { state } from './auth'
import { openEditor, openLooks } from './editor'
import { fillDate } from './segments'
import { shot } from './shots'
import { modelNode, openView, openWeek } from './tree'

// The React Aria editors and chrome, driven as a hand drives them: each write counted on the wire.
// One empty week of its own, so no other flow sees these rows.
const WEEK = '2027-05-10'
const day = (n: number) => `2027-05-${String(10 + n).padStart(2, '0')}`

type Api = Page['request']
type Values = Record<string, unknown>
type Box = { left: number; right: number; top: number; bottom: number }

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

async function stored(api: Api, dataset: string, id: number): Promise<Values> {
  const [row] = await rowsOf(api, dataset, { id })
  return row
}

async function activity(api: Api, omschrijving: string, values: Values): Promise<number> {
  return idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'repetitie',
    status: 'optie',
    omschrijving,
    ...values,
  })
}

async function removeActivity(api: Api, id: number) {
  for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: id }))
    await api.delete(`/api/rows/toewijzing/${t.id}`)
  await api.delete(`/api/rows/activiteit/${id}`)
}

/** Every write of one method on paths the pattern matches, its body parsed, in the order sent. */
function writes(page: Page, method: string, path: RegExp): Values[] {
  const seen: Values[] = []
  page.on('request', (request: Request) => {
    if (request.method() !== method || !path.test(new URL(request.url()).pathname)) return
    seen.push((request.postDataJSON() as Values | null) ?? {})
  })
  return seen
}

/** Long enough for a write a key would have sent to reach the wire. */
const settle = (page: Page) => page.waitForTimeout(400)

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

async function edit(cell: Locator) {
  await cell.click()
  await cell.press('Enter')
}

const boxOf = (target: Locator): Promise<Box> =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** The relative luminance of the first painted background at or above the element. */
const luminance = (target: Locator): Promise<number> =>
  target.evaluate((el) => {
    let at: Element | null = el
    while (at) {
      const match = getComputedStyle(at).backgroundColor.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/)
      if (match && (match[4] === undefined || Number(match[4]) > 0.5)) {
        const [r, g, b] = [match[1], match[2], match[3]].map((v) => {
          const c = Number(v) / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      at = at.parentElement
    }
    return 1
  })

async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
  await openLooks(page)
  await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
  await expect(page.locator('#root')).toHaveAttribute('data-theme', theme === 'Donker' ? 'dark' : 'light')
}

/** Opens a surface in light and in dark, checks that its own background follows the theme, and shoots it in each. */
async function inBothThemes(page: Page, name: string, open: () => Promise<Locator>, close: () => Promise<void>) {
  // The theme crossfades over 220ms; measured mid-fade under load, a dark surface still reads light.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['Licht', 'Donker'] as const) {
    await setTheme(page, theme)
    const surface = await open()
    const lum = await luminance(surface)
    if (theme === 'Donker') expect.soft(lum, `${name} is dark in dark mode`).toBeLessThan(0.1)
    else expect.soft(lum, `${name} is light in light mode`).toBeGreaterThan(0.6)
    await shot(page, `${name}-${theme === 'Licht' ? 'light' : 'dark'}`)
    await close()
  }
  await setTheme(page, 'Licht')
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
})

const segmentTexts = (cell: Locator) => cell.getByRole('spinbutton').allTextContents()

test('edit-date-cell @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra datum'
  const id = await activity(api, title, { datum: day(0) })
  const patches = writes(page, 'PATCH', new RegExp(`^/api/rows/activiteit/${id}$`))
  try {
    await openWeek(page, 'Optie of bevestigd', 'Activiteiten', 'plandag', WEEK)
    const datum = () => cellOf(page, title, 'Datum')
    await expect(await datum()).toHaveText('10-05-2027')

    // Typed into the segments in Dutch order, Enter writes once.
    await edit(await datum())
    expect(await segmentTexts(await datum())).toEqual(['10', '05', '2027'])
    await fillDate(await datum(), day(2))
    await (await datum()).getByRole('spinbutton').last().press('Enter')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ datum: day(2) })
    await expect(await datum()).toHaveText('12-05-2027')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(0)

    // Escape after typing writes nothing and shows the stored day.
    await edit(await datum())
    await fillDate(await datum(), day(3))
    await page.keyboard.press('Escape')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(0)
    await expect(await datum()).toHaveText('12-05-2027')

    // An incomplete date: Enter and Tab keep the editor and write nothing; leaving drops it and writes nothing.
    await edit(await datum())
    const dayPart = (await datum()).locator('[data-type="day"]')
    await dayPart.click()
    for (let i = 0; i < 3 && !(await dayPart.getAttribute('data-placeholder')); i++)
      await page.keyboard.press('Backspace')
    await expect(dayPart).toHaveAttribute('data-placeholder')
    await page.keyboard.press('Enter')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(3)
    await page.keyboard.press('Tab')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(3)
    await page.getByRole('heading', { level: 1 }).click()
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(0)
    await expect(await datum()).toHaveText('12-05-2027')

    // Required: Delete empties nothing; clearing never empties every segment (the stored day comes back), so Enter waits.
    await (await datum()).click()
    await (await datum()).press('Delete')
    await edit(await datum())
    await fillDate(await datum(), '')
    const blank = await (await datum()).locator('[data-placeholder]').count()
    expect(blank, 'never every segment empty').toBeLessThan(3)
    await page.keyboard.press('Enter')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect((await datum()).getByRole('spinbutton')).toHaveCount(0)
    await expect(await datum()).toHaveText('12-05-2027')
    await settle(page)
    expect(patches.slice(1).filter((body) => body.datum !== day(2))).toEqual([])
    expect((await stored(api, 'activiteit', id)).datum).toBe(day(2))
    const sent = patches.length

    // The calendar opens under the field, Monday first; a day click drafts it and Enter writes it once.
    await edit(await datum())
    await (await datum()).locator('.nv-datefield__open').click()
    const calendar = openEditor(page)
    await expect(calendar.getByRole('grid')).toBeVisible()
    await expect(calendar.locator('th').first()).toHaveText('ma')
    await calendar.getByRole('button', { name: /14 mei 2027/ }).click()
    await expect(calendar).toHaveCount(0)
    expect(await segmentTexts(await datum())).toEqual(['14', '05', '2027'])
    await settle(page)
    expect(patches.length, 'a day click writes nothing before Enter').toBe(sent)
    await page.keyboard.press('Enter')
    await expect.poll(() => patches.length).toBe(sent + 1)
    expect(patches.at(-1)).toEqual({ datum: day(4) })
    await expect(await datum()).toHaveText('14-05-2027')

    await inBothThemes(
      page,
      'date-calendar',
      async () => {
        await edit(await datum())
        await (await datum()).locator('.nv-datefield__open').click()
        await expect(openEditor(page).getByRole('grid')).toBeVisible()
        return openEditor(page)
      },
      async () => {
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        await expect(openEditor(page)).toHaveCount(0)
      },
    )
    await settle(page)
    expect(patches.length, 'opening and closing the calendar writes nothing').toBe(sent + 1)
  } finally {
    await removeActivity(api, id)
  }
})

test('edit-datetime-cell @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra moment'
  const id = await activity(api, title, { datum: day(1), start_at: `${day(1)}T10:00` })
  const patches = writes(page, 'PATCH', new RegExp(`^/api/rows/activiteit/${id}$`))
  try {
    await openWeek(page, 'Optie of bevestigd', 'Activiteiten', 'plandag', WEEK)
    const start = () => cellOf(page, title, 'Start')

    // 24-hour segments; Tab writes once and moves right.
    await edit(await start())
    await expect((await start()).locator('[data-type="dayPeriod"]')).toHaveCount(0)
    await fillDate(await start(), `${day(1)}T20:30`)
    expect(await segmentTexts(await start())).toEqual(['11', '05', '2027', '20', '30'])
    await page.keyboard.press('Tab')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ start_at: `${day(1)}T20:30` })
    await expect((await start()).getByRole('spinbutton')).toHaveCount(0)
    await expect(await cellOf(page, title, 'Einde')).toBeFocused()

    // Escape after a typed hour writes nothing.
    await edit(await start())
    await (await start()).locator('[data-type="hour"]').click()
    await page.keyboard.type('08')
    await page.keyboard.press('Escape')
    await expect((await start()).getByRole('spinbutton')).toHaveCount(0)

    // An empty minute: Enter keeps the editor, nothing is written; Escape leaves.
    await edit(await start())
    const minute = (await start()).locator('[data-type="minute"]')
    await minute.click()
    for (let i = 0; i < 3 && !(await minute.getAttribute('data-placeholder')); i++)
      await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    await expect((await start()).getByRole('spinbutton')).toHaveCount(5)
    await page.keyboard.press('Escape')
    await expect((await start()).getByRole('spinbutton')).toHaveCount(0)
    await settle(page)
    expect(patches).toHaveLength(1)

    // A calendar day keeps the time; Enter writes once.
    await edit(await start())
    await (await start()).locator('.nv-datefield__open').click()
    const calendar = openEditor(page)
    await calendar.getByRole('button', { name: /12 mei 2027/ }).click()
    await expect(calendar).toHaveCount(0)
    expect(await segmentTexts(await start())).toEqual(['12', '05', '2027', '20', '30'])
    await page.keyboard.press('Enter')
    await expect.poll(() => patches.length).toBe(2)
    expect(patches[1]).toEqual({ start_at: `${day(2)}T20:30` })

    // Optional: every segment cleared and Enter empties it, once.
    await edit(await start())
    await fillDate(await start(), '')
    await page.keyboard.press('Enter')
    await expect.poll(() => patches.length).toBe(3)
    expect(patches[2]).toEqual({ start_at: null })
    expect((await stored(api, 'activiteit', id)).start_at ?? null).toBeNull()
    await expect(await start()).toHaveText('')
  } finally {
    await removeActivity(api, id)
  }
})

test('edit-select-cell @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra keuze'
  const id = await activity(api, title, { datum: day(2) })
  const patches = writes(page, 'PATCH', new RegExp(`^/api/rows/activiteit/${id}$`))
  try {
    await openWeek(page, 'Optie of bevestigd', 'Activiteiten', 'plandag', WEEK)
    const soort = () => cellOf(page, title, 'Soort')
    const list = openEditor(page).getByRole('listbox')

    // Required: no "leeg"; the current option is marked; the list opens under its cell.
    await edit(await soort())
    await expect(list.getByRole('option').first()).toHaveText('Voorstelling')
    await expect(list.getByRole('option', { name: '—' })).toHaveCount(0)
    await expect(list.locator('[data-current]')).toHaveText('Repetitie')
    expect(overlaps(await boxOf(openEditor(page)), await boxOf(await soort())), 'the list never covers its cell').toBe(
      false,
    )

    // A letter and Enter write once.
    await page.keyboard.press('o')
    await page.keyboard.press('Enter')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ soort: 'opbouw' })
    await expect(await soort()).toHaveText('Opbouw')
    await expect(openEditor(page)).toHaveCount(0)

    // Escape writes nothing.
    await edit(await soort())
    await page.keyboard.press('m')
    await page.keyboard.press('Escape')
    await expect(openEditor(page)).toHaveCount(0)
    await expect(await soort()).toHaveText('Opbouw')

    // A click on an option in the portalled list writes once.
    await edit(await soort())
    await list.getByRole('option', { name: 'Reis' }).click()
    await expect.poll(() => patches.length).toBe(2)
    expect(patches[1]).toEqual({ soort: 'reis' })
    await expect(openEditor(page)).toHaveCount(0)

    // Tab writes once and moves right.
    await edit(await soort())
    await page.keyboard.press('m')
    await page.keyboard.press('Tab')
    await expect.poll(() => patches.length).toBe(3)
    expect(patches[2]).toEqual({ soort: 'maaltijd' })
    await expect(await cellOf(page, title, 'Datum')).toBeFocused()

    // Delete on a required select empties nothing.
    await (await soort()).click()
    await (await soort()).press('Delete')
    await settle(page)
    expect(patches).toHaveLength(3)
    expect((await stored(api, 'activiteit', id)).soort).toBe('maaltijd')

    await inBothThemes(
      page,
      'select-editor',
      async () => {
        await edit(await cellOf(page, title, 'Status'))
        await expect(list.getByRole('option').first()).toBeVisible()
        return openEditor(page)
      },
      async () => {
        await page.keyboard.press('Escape')
        await expect(openEditor(page)).toHaveCount(0)
      },
    )
    await settle(page)
    expect(patches).toHaveLength(3)
  } finally {
    await removeActivity(api, id)
  }
})

async function openDagplanning(page: Page) {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planning')
}

test('edit-relation-cell @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra relatie'
  const id = await activity(api, title, { datum: day(3), start_at: `${day(3)}T10:00` })
  const patches = writes(page, 'PATCH', /^\/api\/rows\/activiteit\/\d+$/)
  try {
    await openDagplanning(page)
    const locatie = () => cellOf(page, title, 'Locatie')
    const search = page.getByRole('combobox', { name: 'Locatie' })

    // Typing searches; Enter picks once; the picker opens under its cell.
    await edit(await locatie())
    expect(overlaps(await boxOf(page.locator('.nv-pop.nv-picker')), await boxOf(await locatie()))).toBe(false)
    await search.fill('Anker')
    await expect(page.getByRole('option', { name: 'Theater Het Anker' })).toBeVisible()
    await search.press('Enter')
    await expect.poll(() => patches.length).toBe(1)
    await expect((await locatie()).locator('.nv-cell__text')).toHaveText('Theater Het Anker')
    expect((await stored(api, 'activiteit', id)).locatie_id).toBe(
      await idByName(api, 'organisatie', 'naam', 'Theater Het Anker'),
    )

    // A click on an option in the portalled list picks once.
    await edit(await locatie())
    await search.fill('Loods')
    await page.getByRole('option', { name: 'Repetitiekot De Loods' }).click()
    await expect.poll(() => patches.length).toBe(2)
    await expect(search).toHaveCount(0)
    await expect((await locatie()).locator('.nv-cell__text')).toHaveText('Repetitiekot De Loods')

    // Escape writes nothing, and a second Escape on the sheet changes nothing.
    await edit(await locatie())
    await search.fill('Spiegel')
    await search.press('Escape')
    await expect(search).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect((await locatie()).locator('.nv-cell__text')).toHaveText('Repetitiekot De Loods')
    await settle(page)
    expect(patches).toHaveLength(2)

    await inBothThemes(
      page,
      'to-one-picker',
      async () => {
        await edit(await locatie())
        await expect(page.locator('.nv-picker__pop').getByRole('option').first()).toBeVisible()
        return page.locator('.nv-picker__pop')
      },
      async () => {
        await search.press('Escape')
        await expect(search).toHaveCount(0)
      },
    )

    // Optional: Delete empties it once.
    await (await locatie()).click()
    await (await locatie()).press('Delete')
    await expect.poll(() => patches.length).toBe(3)
    expect((await stored(api, 'activiteit', id)).locatie_id ?? null).toBeNull()

    // Required (Productie): Delete empties nothing, and the picker offers nothing to clear it with.
    await openWeek(page, 'Optie of bevestigd', 'Activiteiten', 'plandag', WEEK)
    const productie = await cellOf(page, title, 'Productie')
    await productie.click()
    await productie.press('Delete')
    await edit(productie)
    const required = page.getByRole('combobox', { name: 'Productie' })
    await expect(required).toBeVisible()
    await expect(page.locator('.nv-picker__pop').getByRole('option', { name: '—' })).toHaveCount(0)
    await required.press('Delete')
    await required.press('Escape')
    await settle(page)
    expect(patches).toHaveLength(3)
    expect((await stored(api, 'activiteit', id)).productie_id).toBe(
      await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    )
  } finally {
    await removeActivity(api, id)
  }
})

test('add-and-remove-link @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra mensen'
  const id = await activity(api, title, { datum: day(4), start_at: `${day(4)}T10:00` })
  const posts = writes(page, 'POST', /^\/api\/rows\/toewijzing$/)
  const deletes = writes(page, 'DELETE', /^\/api\/rows\/toewijzing\/\d+$/)
  const assigned = async () =>
    (await rowsOf<{ persoon_id: number }>(api, 'toewijzing', { activiteit_id: id })).map((t) => t.persoon_id).sort()
  try {
    const noor = await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes')
    const bram = await idByName(api, 'persoon', 'weergavenaam', 'Bram De Wilde')
    await openDagplanning(page)
    const people = () => cellOf(page, title, 'Mensen')
    const search = page.getByRole('combobox', { name: 'Mensen' })
    const chosen = page.locator('.nv-picker .nv-chosen [role="row"]')

    // Enter adds once and empties the search; the box opens under its cell.
    await edit(await people())
    expect(overlaps(await boxOf(page.locator('.nv-pop.nv-picker')), await boxOf(await people()))).toBe(false)
    await search.fill('Noor')
    await expect(page.getByRole('option', { name: 'Noor Claes' })).toBeVisible()
    await search.press('Enter')
    await expect(chosen).toHaveText(['Noor Claes'])
    await expect(search).toHaveValue('')
    expect(posts).toHaveLength(1)

    // A click on an option adds once; the list offers only those not chosen.
    await search.fill('Bram')
    await page.getByRole('option', { name: 'Bram De Wilde' }).click()
    await expect(chosen).toHaveText(['Noor Claes', 'Bram De Wilde'])
    await search.fill('Noor')
    await expect(page.getByRole('option', { name: 'Noor Claes' })).toHaveCount(0)
    await search.fill('')
    await expect.poll(assigned).toEqual([noor, bram].sort())
    expect(posts).toHaveLength(2)
    await search.press('Escape')
    await expect(search).toHaveCount(0)

    await inBothThemes(
      page,
      'to-many-chips',
      async () => {
        await edit(await people())
        await expect(chosen).toHaveCount(2)
        return page.locator('.nv-pop.nv-picker')
      },
      async () => {
        await search.press('Escape')
        await expect(search).toHaveCount(0)
      },
    )

    // Backspace in the empty search removes the last chip, uitgenodigd, without a question; Escape writes nothing more.
    await edit(await people())
    await search.press('Backspace')
    await expect(chosen).toHaveText(['Noor Claes'])
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect.poll(assigned).toEqual([noor])
    await search.press('Escape')
    await expect(search).toHaveCount(0)
    await expect((await people()).locator('.nv-names')).toHaveText('Noor Claes')
    await settle(page)
    expect(posts).toHaveLength(2)
    expect(deletes).toHaveLength(1)

    // Delete on the sheet never clears a to-many.
    await (await people()).click()
    await (await people()).press('Delete')
    await settle(page)
    expect(deletes).toHaveLength(1)
    expect(await assigned()).toEqual([noor])
  } finally {
    await removeActivity(api, id)
  }
})

test('open-related-record @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra openen'
  const anker = await idByName(api, 'organisatie', 'naam', 'Theater Het Anker')
  const id = await activity(api, title, { datum: day(5), start_at: `${day(5)}T10:00`, locatie_id: anker })
  const patches = writes(page, 'PATCH', /^\/api\/rows\//)
  try {
    await openDagplanning(page)
    const locatie = await cellOf(page, title, 'Locatie')
    const button = locatie.getByRole('button', { name: 'Open Theater Het Anker' })
    const drawer = page.locator('.nv-drawer')

    // The icon shows on hover; a click opens the related record's panel, not the editor.
    await locatie.hover()
    await expect(button).toBeVisible()
    await button.click()
    await expect(drawer).toHaveCount(1)
    await expect(drawer).toContainText('Theater Het Anker')
    await expect(drawer).toContainText('Ankerdijk 8, 8000 Brugge')
    await expect(page.getByRole('combobox', { name: 'Locatie' })).toHaveCount(0)
    await shot(page, 'related-record')
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)

    // A double-click opens one panel and no editor.
    await locatie.hover()
    await button.dblclick()
    await expect(drawer).toHaveCount(1)
    await expect(page.getByRole('combobox', { name: 'Locatie' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)

    // An empty to-one has no icon.
    await locatie.click()
    await locatie.press('Delete')
    await expect(locatie.getByRole('button', { name: /^Open / })).toHaveCount(0)
    await settle(page)
    expect(patches).toHaveLength(1)
  } finally {
    await removeActivity(api, id)
  }
})

test('edit-long-text @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra notitie'
  const id = await activity(api, title, { datum: day(5), start_at: `${day(5)}T14:00` })
  const noor = await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes')
  const join = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: noor, state: 'uitgenodigd' })
  const patches = writes(page, 'PATCH', new RegExp(`^/api/rows/toewijzing/${join}$`))
  const note = 'eerste regel\ntweede regel — café ☕'
  try {
    await openWeek(page, 'Toewijzingen per activiteit', 'Activiteiten', 'plandag', WEEK)
    // One cell per person column, counted past the label and the open column.
    const spot = async () => {
      await expect(page.locator('thead th.nv-mx__head[title="Noor Claes"]')).toBeVisible()
      const column = await page
        .locator('thead th.nv-mx__head')
        .evaluateAll((heads) => heads.findIndex((th) => th.getAttribute('title') === 'Noor Claes'))
      return named(page, title).locator('td[data-cell]').nth(column)
    }
    const field = page.getByRole('textbox', { name: 'Notitie' })

    // Enter on the cell opens its panel; the note line opens its field; Enter in it is a newline; leaving writes it once.
    await (await spot()).click()
    await (await spot()).press('Enter')
    await page.locator('.nv-drawer .nv-dw-note').click()
    await expect(field).toBeVisible()
    await field.click()
    await page.keyboard.type('eerste regel')
    await page.keyboard.press('Enter')
    await page.keyboard.type('tweede regel — café ☕')
    await expect(field).toHaveValue(note)
    await settle(page)
    expect(patches, 'nothing is written while typing').toHaveLength(0)
    await page.keyboard.press('Tab')
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ notitie: note })
    expect((await stored(api, 'toewijzing', join)).notitie).toBe(note)

    // Focus in and out without a change writes nothing; left, the note reads as its line again.
    const line = page.locator('.nv-drawer .nv-dw-note')
    await expect(line).toHaveText(note)
    await line.click()
    await field.click()
    await page.keyboard.press('Tab')
    await settle(page)
    expect(patches).toHaveLength(1)
    await shot(page, 'long-text-note')

    // The note is there after a reload.
    await page.reload()
    await expect(named(page, title)).toHaveCount(1)
    await (await spot()).click()
    await (await spot()).press('Enter')
    await expect(line).toHaveText(note)
  } finally {
    await removeActivity(api, id)
  }
})

test('toggle-bool @e2e', async ({ page }) => {
  const api = page.request
  const id = await idOf(api, 'persoon', { voornaam: 'Ra', achternaam: 'Schakelaar' })
  const patches = writes(page, 'PATCH', new RegExp(`^/api/rows/persoon/${id}$`))
  const actief = async () => (await stored(api, 'persoon', id)).actief
  try {
    await page.goto('/')
    await openView(page, 'Personen')
    await page.getByRole('searchbox').fill('Schakelaar')
    const row = named(page, 'Ra Schakelaar')
    await expect(row).toHaveCount(1)
    const cell = await cellOf(page, 'Ra Schakelaar', 'Actief')
    const toggle = cell.getByRole('switch', { name: 'Actief' })
    await expect(toggle).toBeChecked()
    await expect(cell).toContainText('Ja')

    // A click flips it in place, once, with no editor.
    await cell.locator('.nv-switch').click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual({ actief: false })
    await expect(toggle).not.toBeChecked()
    await expect(cell).toContainText('Nee')
    await expect(openEditor(page)).toHaveCount(0)
    await expect.poll(actief).toBe(false)

    // Space and Enter on the selected cell flip it, once each.
    await cell.locator('.nv-cell__muted').click()
    await settle(page)
    expect(patches, 'a click on the word beside the switch only selects the cell').toHaveLength(1)
    await cell.press('Space')
    await expect.poll(() => patches.length).toBe(2)
    await cell.press('Enter')
    await expect.poll(() => patches.length).toBe(3)
    await cell.press('Space')
    await expect.poll(() => patches.length).toBe(4)
    await settle(page)
    expect(patches.map((body) => body.actief)).toEqual([false, true, false, true])
    await expect(toggle).toBeChecked()
    await expect.poll(actief).toBe(true)
    await shot(page, 'toggle-bool')
  } finally {
    await api.delete(`/api/rows/persoon/${id}`)
  }
})

test('reorder-views @e2e', async ({ page }) => {
  const api = page.request
  const names = ['ra een', 'ra twee', 'ra drie']
  const ids: number[] = []
  for (const name of names) {
    const made = await api.post('/api/views', { data: { name, source: 'organisatie', shared: false } })
    expect(made.status(), await made.text()).toBe(201)
    ids.push(((await made.json()) as { id: number }).id)
  }
  try {
    await page.goto('/')
    await openView(page, 'Organisaties')
    const list = modelNode(page, 'Organisaties').getByRole('group', { name: 'View type' })
    const order = () => list.locator('.nv-view__label').allTextContents()
    await expect.poll(order).toEqual(['Organisaties', ...names])

    // By keyboard: Enter on the drag button starts at the nearest place that moves it, ↑ goes one further, Enter drops.
    await list.getByRole('button', { name: 'Verplaats ra drie' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Plaatsen tussen ra een en ra twee')
    await page.keyboard.press('Enter')
    await expect.poll(order).toEqual(['Organisaties', 'ra een', 'ra drie', 'ra twee'])

    // By the view's ⋯: Omhoog.
    await page.getByRole('button', { name: 'More actions: ra drie', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Omhoog' }).click()
    await expect.poll(order).toEqual(['Organisaties', 'ra drie', 'ra een', 'ra twee'])

    // By mouse: drag one view onto another's place.
    const row = (name: string) => list.locator('.nv-view', { has: page.getByRole('button', { name, exact: true }) })
    await row('ra twee').dragTo(row('ra drie'), { targetPosition: { x: 40, y: 3 } })
    await expect.poll(order).toEqual(['Organisaties', 'ra twee', 'ra drie', 'ra een'])

    // Escape cancels a keyboard drag, moving nothing.
    await list.getByRole('button', { name: 'Verplaats ra een' }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Escape')
    await expect.poll(order).toEqual(['Organisaties', 'ra twee', 'ra drie', 'ra een'])

    // A seeded view offers no move in its ⋯; the order holds for this visit only (prefs are not stored).
    await page.getByRole('button', { name: 'More actions: Organisaties', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /Omhoog|Omlaag/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await shot(page, 'reorder-views')
  } finally {
    for (const id of ids) await api.delete(`/api/views/${id}`)
  }
})

test.describe('the chrome as an administrator', () => {
  test.use({ storageState: state('admin') })

  test('chrome-light-and-dark @e2e', async ({ page }) => {
    await openWeek(page, 'Bevestigd', 'Activiteiten', 'plandag', '2026-10-12')
    await expect(page.locator('tbody tr.nv-tr').first()).toBeVisible()

    await inBothThemes(
      page,
      'sheet',
      async () => page.locator('.nv-table, table').first(),
      async () => {},
    )

    await inBothThemes(
      page,
      'rail-views',
      async () => page.getByRole('navigation', { name: 'Views' }),
      async () => {},
    )

    const node = modelNode(page, 'Activiteiten')
    await inBothThemes(
      page,
      'model-menu',
      async () => {
        await node.locator('.nv-model').first().hover()
        await node.getByRole('button', { name: 'Meer voor Activiteiten', exact: true }).click()
        const menu = page.getByRole('menu', { name: 'Meer voor Activiteiten' })
        await expect(menu.getByRole('menuitem').first()).toBeVisible()
        return menu
      },
      async () => {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menu')).toHaveCount(0)
      },
    )

    const share = page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' })
    await inBothThemes(
      page,
      'share-menu',
      async () => {
        await share.click()
        const menu = page.getByRole('menu', { name: 'Exporteren / delen' })
        await expect(menu.getByRole('menuitem').first()).toBeVisible()
        return menu
      },
      async () => {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menu')).toHaveCount(0)
      },
    )

    await inBothThemes(
      page,
      'new-view-dialog',
      async () => {
        await node.locator('.nv-model').first().hover()
        await node.getByRole('button', { name: 'Weergave toevoegen aan Activiteiten' }).click()
        await page
          .getByRole('menu', { name: 'Weergave toevoegen aan Activiteiten' })
          .getByRole('menuitem', { name: 'Grid' })
          .click()
        const dialog = page.getByRole('dialog', { name: 'Nieuwe gridweergave' })
        await expect(dialog.getByRole('textbox', { name: 'Naam' })).toBeVisible()
        return dialog
      },
      async () => {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
      },
    )

    await inBothThemes(
      page,
      'filter-builder',
      async () => {
        await page
          .locator('.nv-bar')
          .getByRole('button', { name: /^Filter\s*\d*$/ })
          .click()
        const builder = page.locator('.nv-fb')
        await expect(builder.getByRole('group', { name: 'Van' }).first()).toBeVisible()
        await builder.getByRole('group', { name: 'Van' }).first().getByRole('button').click()
        await expect(page.locator('.nv-fb__between .nv-pop').getByRole('grid')).toBeVisible()
        return builder
      },
      async () => {
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        await expect(page.locator('.nv-fb')).toHaveCount(0)
      },
    )
  })

  test('share-dialog-light-and-dark @e2e', async ({ page }) => {
    const copy = 'Voorstellingen (kopie)'
    const views = async () =>
      ((await (await page.request.get('/api/views')).json()) as { views: { id: number; name: string }[] }).views
    try {
      await page.goto('/')
      await openView(page, 'Voorstellingen')
      await page.getByRole('button', { name: 'More actions: Voorstellingen', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Kopie maken' }).click()
      await expect.poll(async () => (await views()).some((v) => v.name === copy)).toBe(true)
      await openView(page, copy, 'Voorstellingen')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy)
      const share = page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' })
      await inBothThemes(
        page,
        'share-dialog',
        async () => {
          await share.click()
          await page.getByRole('menuitem', { name: 'Publiceren' }).click()
          const dialog = page.getByRole('dialog', { name: 'Publiceren' })
          // Published once already: the dialog asks first, and a new link stops the old one.
          const again = dialog.getByRole('button', { name: 'Nieuwe link maken' })
          await expect(dialog.getByRole('textbox', { name: 'Publiek adres' }).or(again)).toBeVisible()
          if (await again.isVisible()) await again.click()
          await expect(dialog.getByRole('textbox', { name: 'Publiek adres' })).toHaveValue(/\/api\/public\/views\//)
          return dialog
        },
        async () => {
          await page.keyboard.press('Escape')
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await expect(share).toBeFocused()
        },
      )
    } finally {
      for (const view of (await views()).filter((v) => v.name === copy))
        await page.request.delete(`/api/views/${view.id}`)
    }
  })
})

// Defects this shake-out found, each driven as a hand drives it. test.fail() keeps the gate green until the fix pass turns them.

test('calendar-clears-its-cell @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra kalender'
  const id = await activity(api, title, { datum: day(6), start_at: `${day(6)}T10:00` })
  try {
    await openWeek(page, 'Optie of bevestigd', 'Activiteiten', 'plandag', WEEK)
    for (const label of ['Datum', 'Start']) {
      const cell = await cellOf(page, title, label)
      await edit(cell)
      await cell.locator('.nv-datefield__open').click()
      await expect(openEditor(page).getByRole('grid')).toBeVisible()
      const pop = await boxOf(openEditor(page))
      expect
        .soft(pop.top, `${label}: the calendar starts under its cell`)
        .toBeGreaterThanOrEqual((await boxOf(cell)).bottom)
      expect
        .soft(pop.top, `${label}: the calendar starts under the editor`)
        .toBeGreaterThanOrEqual((await boxOf(cell.locator('.nv-datefield'))).bottom)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(openEditor(page)).toHaveCount(0)
    }
  } finally {
    await removeActivity(api, id)
  }
})

test('open-related-record-by-keyboard @e2e', async ({ page }) => {
  const api = page.request
  const title = 'ra openen toetsen'
  const anker = await idByName(api, 'organisatie', 'naam', 'Theater Het Anker')
  const id = await activity(api, title, { datum: day(6), start_at: `${day(6)}T11:00`, locatie_id: anker })
  const patches = writes(page, 'PATCH', /^\/api\/rows\//)
  try {
    await openDagplanning(page)
    const locatie = await cellOf(page, title, 'Locatie')
    const drawer = page.locator('.nv-drawer')
    const picker = page.getByRole('combobox', { name: 'Locatie' })

    // The owner's key (2026-10-09): Ctrl+Enter, Cmd+Enter on a Mac, opens the related record's panel, not the editor.
    for (const key of ['Control+Enter', 'Meta+Enter']) {
      await locatie.click()
      await expect(locatie).toBeFocused()
      await page.keyboard.press(key)
      await expect(drawer).toHaveCount(1)
      await expect(drawer).toContainText('Theater Het Anker')
      await expect(drawer).toContainText('Ankerdijk 8, 8000 Brugge')
      await expect(picker).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
    }

    // Plain Enter still opens the picker.
    await locatie.click()
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)

    // An empty to-one: the key opens nothing, neither the panel nor the editor.
    await locatie.click()
    await locatie.press('Delete')
    await expect(locatie.getByRole('button', { name: /^Open / })).toHaveCount(0)
    await page.keyboard.press('Control+Enter')
    await expect(drawer).toHaveCount(0)
    await expect(picker).toHaveCount(0)
    expect(patches.length, 'only the Delete wrote').toBe(1)
  } finally {
    await removeActivity(api, id)
  }
})

test('own-view-keeps-a-new-condition @e2e', async ({ page }) => {
  const made = await page.request.post('/api/views', {
    data: { name: 'ra eigen voorwaarde', source: 'activiteit', shared: false },
  })
  expect(made.status(), await made.text()).toBe(201)
  const id = ((await made.json()) as { id: number }).id
  try {
    await page.goto('/')
    await openView(page, 'ra eigen voorwaarde', 'Activiteiten')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ra eigen voorwaarde')
    await page
      .locator('.nv-bar')
      .getByRole('button', { name: /^Filter\s*\d*$/ })
      .click()
    const saved = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname === `/api/views/${id}`,
    )
    await page.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
    const groups = page.getByRole('group', { name: /^Voorwaarde \d/ })
    await expect(groups).toHaveCount(1)
    await saved
    await settle(page)
    await expect(groups, 'the new condition is still there to fill in').toHaveCount(1, { timeout: 1000 })
  } finally {
    await page.request.delete(`/api/views/${id}`)
  }
})
