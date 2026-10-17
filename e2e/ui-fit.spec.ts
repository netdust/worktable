import { expect, type Locator, type Page, test } from '@playwright/test'
import { openLooks } from './editor'
import { shot } from './shots'
import { openView, openWeek, pickIn } from './tree'

// R2: every part of a popover, field and filter row stays inside its own box, in light and dark, at each density.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const WEEK = '2026-10-12'

type Fit = { what: string; edge: string; at: number; limit: number }

/** The parts that cross their box's content edge (inside its padding and scrollbar), by more than half a pixel. */
function outside(box: Locator, parts: string): Promise<Fit[]> {
  return box.evaluate((el, selector) => {
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const left = r.left + el.clientLeft + Number.parseFloat(style.paddingLeft)
    const right = r.left + el.clientLeft + el.clientWidth - Number.parseFloat(style.paddingRight)
    const found: Fit[] = []
    for (const part of el.querySelectorAll<HTMLElement>(selector)) {
      const p = part.getBoundingClientRect()
      const what = (part.textContent || part.getAttribute('placeholder') || part.className).trim().slice(0, 30)
      if (p.right > right + 0.5) found.push({ what, edge: 'right', at: p.right, limit: right })
      if (p.left < left - 0.5) found.push({ what, edge: 'left', at: p.left, limit: left })
    }
    return found
  }, parts)
}

const rectOf = (target: Locator) =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })

async function cellOf(page: Page, row: Locator, label: string): Promise<Locator> {
  const index = await page
    .locator('thead th')
    .evaluateAll(
      (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
      label,
    )
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return row.locator('td').nth(index)
}

async function edit(cell: Locator) {
  await cell.click()
  await cell.press('Enter')
}

async function setTheme(page: Page, theme: 'Licht' | 'Donker') {
  await openLooks(page)
  await page.getByRole('radiogroup', { name: 'Thema' }).getByRole('radio', { name: theme }).click()
}

async function setDensity(page: Page, density: 'Compact' | 'Normaal' | 'Ruim') {
  await openLooks(page)
  await page.getByRole('radiogroup', { name: 'Rijhoogte' }).getByRole('radio', { name: density }).click()
}

/** Light and dark, each shot named after the surface. */
async function bothThemes(page: Page, name: string, open: () => Promise<void>, close: () => Promise<void>) {
  if (!process.env.SHAKEOUT_SHOTS) return
  for (const theme of ['Licht', 'Donker'] as const) {
    await setTheme(page, theme)
    await open()
    await shot(page, `${name}-${theme === 'Licht' ? 'light' : 'dark'}`)
    await close()
  }
  await setTheme(page, 'Licht')
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('select-and-picker-fit @e2e', async ({ page }) => {
  // Its own row, an open place with known candidates: never whatever the earlier specs left first in the list.
  const api = page.request
  const rowsOf = async (path: string) =>
    ((await (await api.get(path)).json()) as { rows: Record<string, unknown>[] }).rows
  const productie = (await rowsOf('/api/rows/productie?limit=500')).find((r) => r.titel === 'Nachtwacht')?.id
  const speler = (await rowsOf('/api/rows/rol?limit=500')).find((r) => r.naam === 'Speler')?.id
  const made = await api.post('/api/rows/activiteit', {
    data: {
      productie_id: productie,
      soort: 'repetitie',
      datum: '2028-11-07',
      omschrijving: 'ui-fit eigen rij',
      start_at: '2028-11-07T10:00',
      eind_at: '2028-11-07T12:00',
    },
  })
  expect(made.status(), await made.text()).toBe(201)
  const activiteit = ((await made.json()) as { id: number }).id
  const place = await api.post('/api/rows/toewijzing', {
    data: { activiteit_id: activiteit, rol_id: speler, aantal: 1, state: 'open' },
  })
  expect(place.status(), await place.text()).toBe(201)
  try {
    const view = ((await (await api.get('/api/views')).json()) as { views: { id: number; name: string }[] }).views.find(
      (v) => v.name === 'Toewijzingen',
    )
    const only = JSON.stringify([{ field: 'activiteit_id', op: 'in', values: [String(activiteit)] }])
    await page.goto(`/#view=${view?.id}&f=${encodeURIComponent(only)}`)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
    const row = page.locator('tbody tr.nv-tr').first()
    await expect(page.locator('tbody tr.nv-tr')).toHaveCount(1)

    for (const density of ['Compact', 'Normaal', 'Ruim'] as const) {
      await setDensity(page, density)

      // Bug 1: the select's options, the current one too, end inside the popover.
      const status = await cellOf(page, row, 'Status')
      await edit(status)
      const select = page.locator('.nv-pop.nv-select')
      await expect(select.getByRole('option').first()).toBeVisible()
      expect.soft(await outside(select, '[role="option"]'), `select options, ${density}`).toEqual([])
      const cell = await rectOf(status)
      const pop = await rectOf(select)
      expect.soft(Math.abs(pop.left - cell.left), `select under its cell, ${density}`).toBeLessThanOrEqual(1)
      await page.keyboard.press('Escape')
      await expect.soft(select).toHaveCount(0)

      // Bug 3: the to-one picker's search fits its panel, its list is as wide, and both line up under the cell.
      const person = await cellOf(page, row, 'Persoon')
      await edit(person)
      const picker = page.locator('.nv-pop.nv-picker')
      const list = page.locator('.nv-picker__pop')
      await expect(list.getByRole('option').first()).toBeVisible()
      expect.soft(await outside(picker, '.nv-picker__input'), `picker search, ${density}`).toEqual([])
      expect
        .soft(await outside(list.locator('.nv-picker__list'), '[role="option"]'), `picker options, ${density}`)
        .toEqual([])
      const field = await rectOf(picker)
      const under = await rectOf(list)
      const own = await rectOf(person)
      expect.soft(Math.abs(field.left - own.left), `picker at the cell's left, ${density}`).toBeLessThanOrEqual(1)
      expect.soft(field.top, `picker under the cell, ${density}`).toBeGreaterThanOrEqual(own.bottom - 0.5)
      expect.soft(Math.abs(under.width - field.width), `list as wide as the search, ${density}`).toBeLessThanOrEqual(1)
      expect.soft(Math.abs(under.left - field.left), `list under the search, ${density}`).toBeLessThanOrEqual(1)
      await page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)
    }
    await setDensity(page, 'Normaal')

    await bothThemes(
      page,
      'select',
      async () => {
        await edit(await cellOf(page, row, 'Status'))
        await expect(page.locator('.nv-select').getByRole('option').first()).toBeVisible()
      },
      () => page.keyboard.press('Escape'),
    )
    await bothThemes(
      page,
      'picker',
      async () => {
        await edit(await cellOf(page, row, 'Persoon'))
        await expect(page.locator('.nv-picker__pop').getByRole('option').first()).toBeVisible()
      },
      () => page.keyboard.press('Escape'),
    )
  } finally {
    for (const t of await rowsOf(
      `/api/rows/toewijzing?limit=50&filter=${encodeURIComponent(JSON.stringify({ activiteit_id: activiteit }))}`,
    ))
      await api.delete(`/api/rows/toewijzing/${t.id}`)
    await api.delete(`/api/rows/activiteit/${activiteit}`)
  }
})

test('space-switcher-fits @e2e', async ({ page }) => {
  await page.goto('/')
  await openView(page, 'Toewijzingen')
  const button = page.getByRole('button', { name: 'Alle producties', exact: true })
  for (const density of ['Compact', 'Normaal', 'Ruim'] as const) {
    await setDensity(page, density)
    await button.click()
    const pop = page.locator('.nv-space__pop')
    await expect(pop.getByRole('option').first()).toBeVisible()
    // Bug 2: the search and every option end inside the panel, and the panel is as wide as the switcher.
    expect.soft(await outside(pop, '.nv-picker__input'), `space search, ${density}`).toEqual([])
    expect
      .soft(await outside(pop.locator('.nv-picker__list'), '[role="option"]'), `space options, ${density}`)
      .toEqual([])
    const trigger = await rectOf(button)
    const panel = await rectOf(pop)
    expect
      .soft(Math.abs(panel.width - trigger.width), `panel as wide as the switcher, ${density}`)
      .toBeLessThanOrEqual(1)
    expect.soft(Math.abs(panel.left - trigger.left), `panel under the switcher, ${density}`).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(pop).toHaveCount(0)
  }
  await setDensity(page, 'Normaal')
  await bothThemes(
    page,
    'space',
    async () => {
      await button.click()
      await expect(page.locator('.nv-space__pop').getByRole('option').first()).toBeVisible()
    },
    () => page.keyboard.press('Escape'),
  )
})

test('chips-fit @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
  const row = page.locator('tbody tr.nv-tr[data-title="voorstelling Gent"]').first()
  await expect(row).toBeVisible()

  // Bug 4: the chip box shows whole rows of chips, none cut by its bottom edge or crowded by its scrollbar.
  const people = await cellOf(page, row, 'Mensen')
  const openPeople = async () => {
    await edit(people)
    await expect(page.locator('.nv-picker .nv-chosen [role="row"]')).toHaveCount(3)
  }
  await openPeople()
  const box = page.locator('.nv-picker__box')
  const cut = await box.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = r.top + el.clientTop
    const bottom = top + el.clientHeight
    return [...el.querySelectorAll<HTMLElement>('[role="row"], .nv-picker__input')]
      .map((part) => ({ what: part.textContent || 'search', r: part.getBoundingClientRect() }))
      .filter(
        ({ r: p }) => p.bottom > top + 0.5 && p.top < bottom - 0.5 && (p.top < top - 0.5 || p.bottom > bottom + 0.5),
      )
      .map(({ what, r: p }) => ({ what, top: p.top, bottom: p.bottom, boxTop: top, boxBottom: bottom }))
  })
  expect.soft(cut, 'no chip row cut by the box').toEqual([])
  expect.soft(await outside(box, '[role="row"]'), 'chips clear of the scrollbar').toEqual([])
  await page.keyboard.press('Escape')
  await bothThemes(page, 'chips', openPeople, () => page.keyboard.press('Escape'))
})

/** The editor's width beside its cell's, and what its content needs: its padding, segments, gap and button. */
const widthsOf = (cell: Locator) =>
  cell.locator('.nv-datefield').evaluate((el) => {
    const td = el.closest('td') as HTMLElement
    const group = el.querySelector('.nv-datefield__group') as HTMLElement
    const input = el.querySelector('.nv-datefield__input') as HTMLElement
    const button = el.querySelector('.nv-datefield__open') as HTMLElement
    const style = getComputedStyle(el)
    const need =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight) +
      input.scrollWidth +
      Number.parseFloat(getComputedStyle(group).columnGap || '0') +
      button.getBoundingClientRect().width
    return { cell: td.clientWidth, editor: el.getBoundingClientRect().width, need, text: input.scrollWidth }
  })

test('date-editors-fit @e2e', async ({ page }) => {
  // Bug 6: a date editor is its cell's width while its content fits, and grows by no more than its content needs.
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
  const row = page.locator('tbody tr.nv-tr[data-title="voorstelling Gent"]').first()
  await expect(row).toBeVisible()
  const start = await cellOf(page, row, 'Tijd')
  await edit(start)
  await expect(start.locator('.nv-datefield').getByRole('spinbutton').first()).toBeFocused()
  const moment = await widthsOf(start)
  expect
    .soft(moment.editor, 'datetime: its cell or its content, no more')
    .toBeLessThanOrEqual(Math.max(moment.cell, moment.need) + 0.5)
  await page.keyboard.press('Escape')
  await bothThemes(
    page,
    'datetime',
    async () => {
      await edit(start)
      await expect(start.locator('.nv-datefield').getByRole('spinbutton').first()).toBeFocused()
    },
    () => page.keyboard.press('Escape'),
  )

  await page.goto('/')
  await openView(page, 'Optie of bevestigd', 'Activiteiten')
  const first = page.locator('tbody tr.nv-tr').first()
  await expect(first).toBeVisible()
  const datum = await cellOf(page, first, 'Datum')
  await edit(datum)
  await expect(datum.locator('.nv-datefield').getByRole('spinbutton').first()).toBeFocused()
  const day = await widthsOf(datum)
  expect.soft(day.need, 'a date fits its cell').toBeLessThanOrEqual(day.cell)
  expect.soft(Math.abs(day.editor - day.cell), 'date: as wide as its cell').toBeLessThanOrEqual(0.5)
  await page.keyboard.press('Escape')
  const moment2 = await cellOf(page, first, 'Start')
  await edit(moment2)
  await expect(moment2.locator('.nv-datefield').getByRole('spinbutton').first()).toBeFocused()
  const wide = await widthsOf(moment2)
  expect
    .soft(wide.editor, 'datetime: its cell or its content, no more')
    .toBeLessThanOrEqual(Math.max(wide.cell, wide.need) + 0.5)
  await page.keyboard.press('Escape')
})

/** The vertical centre of each visible text or control in a row of the builder. */
const centres = (row: Locator, parts: string) =>
  row.evaluate((el, selector) => {
    return [...el.querySelectorAll<HTMLElement>(selector)].map((part) => {
      const r = part.getBoundingClientRect()
      return { what: (part.textContent || part.className).trim().slice(0, 20), centre: (r.top + r.bottom) / 2 }
    })
  }, parts)

test('filter-row-fits @e2e', async ({ page }) => {
  await openWeek(page, 'Planning', 'Activiteiten', 'plandag', WEEK)
  await page
    .locator('.nv-bar')
    .getByRole('button', { name: /^Filter\s*\d*$/ })
    .click()
  const builder = page.locator('.nv-fb')
  const first = builder.getByRole('group', { name: /^Voorwaarde 1$/ })
  await expect(first).toBeVisible()

  // Bug 5: "Waar", the pickers' words and the range's fields share one centre line.
  const line = await centres(first, '.nv-fb__join, .nv-pick__text, .nv-datefield__group')
  const middle = line[0].centre
  for (const part of line)
    expect.soft(Math.abs(part.centre - middle), `${part.what} on Waar's line`).toBeLessThanOrEqual(1)
  expect.soft(await outside(first.locator('.nv-fb__between'), '.nv-fb__date'), 'range fields fit').toEqual([])

  // The field picker's search and options stay inside its panel, which opens under its button.
  await first.getByRole('button', { name: /^Veld:/ }).click()
  const panel = first.locator('.nv-pick__panel')
  await expect(panel.getByRole('option').first()).toBeVisible()
  expect.soft(await outside(panel, '.nv-pick__search, [role="option"]'), 'field picker fits').toEqual([])
  const button = await rectOf(first.getByRole('button', { name: /^Veld:/ }))
  expect.soft(Math.abs((await rectOf(panel)).left - button.left), 'field list under its button').toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  // A range's calendar opens under its field.
  const from = first.getByRole('group', { name: 'Van' })
  await from.getByRole('button').click()
  const calendar = page.locator('.nv-fb__between .nv-pop')
  await expect(calendar.getByRole('grid')).toBeVisible()
  expect
    .soft(Math.abs((await rectOf(calendar)).left - (await rectOf(from)).left), 'calendar under its field')
    .toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(calendar).toHaveCount(0)

  // A choice's chip box and a text's field stay inside their cell of the row, clear of the remove button.
  await builder.getByRole('button', { name: 'Voorwaarde toevoegen' }).click()
  const second = builder.getByRole('group', { name: /^Voorwaarde 2$/ })
  await pickIn(second, 'Veld', 'Status')
  expect.soft(await outside(second.locator('.nv-fb__value'), '.nv-fb__box'), 'choice box fits').toEqual([])
  const secondLine = await centres(second, '.nv-fb__join, .nv-pick__text')
  for (const part of secondLine)
    expect.soft(Math.abs(part.centre - secondLine[0].centre), `${part.what} on its line`).toBeLessThanOrEqual(1)
  await pickIn(second, 'Veld', 'Omschrijving')
  const text = second.locator('.nv-fb__text')
  await expect(text).toBeVisible()
  const textLine = await centres(second, '.nv-fb__join, .nv-pick__text, .nv-fb__text')
  for (const part of textLine)
    expect.soft(Math.abs(part.centre - textLine[0].centre), `${part.what} on its line`).toBeLessThanOrEqual(1)
  const cellRight = await second.locator('.nv-fb__remove').evaluate((el) => el.getBoundingClientRect().left)
  expect.soft((await rectOf(text)).right, 'text field clear of the remove button').toBeLessThanOrEqual(cellRight + 0.5)

  await page.keyboard.press('Escape')
  await bothThemes(
    page,
    'filter',
    async () => {
      await page
        .locator('.nv-bar')
        .getByRole('button', { name: /^Filter\s*\d*$/ })
        .click()
      await expect(first).toBeVisible()
    },
    () => page.keyboard.press('Escape'),
  )
})

test('drawer-picker-keeps-its-frame @e2e', async ({ page }) => {
  await page.goto('/')
  await openView(page, 'Tourstops')
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/rows/speelreeks',
  )
  await page.getByRole('button', { name: 'Nieuwe tourstop' }).click()
  await page.getByRole('textbox', { name: 'Naam' }).fill('Kader e2e')
  await page.getByRole('textbox', { name: 'Naam' }).press('Enter')
  await page.getByRole('combobox', { name: 'Productie' }).fill('Nacht')
  await page.getByRole('option', { name: 'Nachtwacht' }).click()
  const answer = await created
  expect(answer.status()).toBe(201)
  const id = ((await answer.json()) as { id: number }).id
  try {
    await page.locator('tbody tr.nv-tr[data-title="Kader e2e"]').getByRole('button', { name: 'Openen' }).click()
    const action = page.getByRole('group', { name: 'Sjabloon toepassen' })
    const open = async () => {
      await action.getByRole('button', { name: /^Sjabloon: / }).click()
      await expect(page.locator('.nv-picker__pop').getByRole('option').first()).toBeVisible()
    }

    // Outside a cell the picker keeps its panel: a border and a shadow around the search.
    await open()
    const frame = await action.locator('.nv-pop.nv-picker').evaluate((el) => {
      const style = getComputedStyle(el)
      return { border: style.borderTopWidth, shadow: style.boxShadow }
    })
    expect.soft(frame.border, 'a border around the search').not.toBe('0px')
    expect.soft(frame.shadow, 'a shadow under the panel').not.toBe('none')
    await page.keyboard.press('Escape')
    await bothThemes(page, 'drawer-picker', open, () => page.keyboard.press('Escape'))
  } finally {
    expect((await page.request.delete(`/api/rows/speelreeks/${id}`)).status()).toBe(200)
  }
})

// The row's open button shows on hover; a rule with #root once kept it at opacity 0 for good.
test('open-button-shows-on-hover @e2e', async ({ page }) => {
  await page.goto('/')
  await openView(page, 'Personen')
  const row = page.locator('tbody tr.nv-tr').first()
  const open = row.getByRole('button', { name: 'Openen' })
  const opacity = () => open.evaluate((el) => Number(getComputedStyle(el).opacity))
  await page.mouse.move(0, 0)
  await expect.poll(opacity).toBe(0)
  await row.hover()
  await expect.poll(opacity).toBe(1)
})
