import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { state, THEATRE } from './auth'
import { card, glide, lane, lift, orders, said } from './board'
import { shot } from './shots'
import { openView } from './tree'

type Api = APIRequestContext
type Values = Record<string, unknown>
type Board = Record<string, number[]>
type Stored = { id: number; status: string; position: string | null }

// Weeks no other spec uses, one per flow, so no flow's cards meet another's on a board.
const WEEK = {
  between: '2032-02-02',
  reorder: '2032-02-09',
  fresh: '2032-02-16',
  toManual: '2032-02-23',
  cross: '2032-03-01',
  steady: '2032-03-08',
  undo: '2032-03-15',
  keyboard: '2032-03-22',
  refused: '2032-03-29',
}
const MANUAL = ['position']
const SORTED = ['plandag', 'start_at']

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function posted(api: Api, path: string, data: Values): Promise<number> {
  const response = await api.post(path, { data })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: number }).id
}

async function nachtwacht(api: Api): Promise<number> {
  const response = await api.get('/api/rows/productie?limit=500')
  return ((await response.json()) as { rows: { id: number; titel: string }[] }).rows.find(
    (r) => r.titel === 'Nachtwacht',
  )?.id as number
}

/** The flow's invented activities, made one after the other so their ids run as made, and removed after it. */
function activities(api: Api) {
  const ids: number[] = []
  let productie: number | undefined
  return {
    async add(omschrijving: string, day: string, status: string, start = '10:00'): Promise<number> {
      productie ??= await nachtwacht(api)
      const data = { productie_id: productie, soort: 'repetitie', status, omschrijving, datum: day }
      const id = await posted(api, '/api/rows/activiteit', {
        ...data,
        start_at: `${day}T${start}`,
        eind_at: `${day}T23:00`,
      })
      ids.push(id)
      return id
    },
    async remove() {
      for (const id of ids) await api.delete(`/api/rows/activiteit/${id}`)
    },
  }
}

/** A board of activities on one week, the week its own stored filter; manual when it sorts on position. */
const boardOf = (api: Api, name: string, monday: string, sort: string[], more: Values = {}) =>
  posted(api, '/api/views', {
    name,
    source: 'activiteit',
    skin: 'board',
    filters: { plandag: { $gte: monday, $lte: plusDays(monday, 6) } },
    sort,
    group_by: null,
    visible_fields: ['soort', 'plandag', 'start_at'],
    ...more,
  })

async function stored(api: Api, id: number): Promise<Stored> {
  const response = await api.get(`/api/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ id }))}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { rows: Stored[] }).rows[0] as Stored
}

/** The view open on its board, once the card `shown` is on it. */
async function open(page: Page, view: string, shown: number, model = 'Activiteiten') {
  await openView(page, view, model)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(view)
  await expect(card(page, shown)).toBeAttached()
}

async function reopen(page: Page, view: string, shown: number, model = 'Activiteiten') {
  await page.reload()
  await open(page, view, shown, model)
}

/** A reading of the board with one card taken out and put at `index` of column `label`. */
function moved(board: Board, id: number, label: string, index: number): Board {
  const next = Object.fromEntries(Object.entries(board).map(([key, ids]) => [key, ids.filter((one) => one !== id)]))
  next[label]?.splice(index, 0, id)
  return next
}

/** The slot in a column, read once the board painted: its index among the cards (-1 when it draws none) and its box. */
const slotAt = (page: Page, label: string) =>
  page.evaluate(
    (label) =>
      new Promise<{ index: number; top: number; height: number }>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const list = document.querySelector(`section.nv-board__column[aria-label="${label}"] .nv-board__list`)
            const children = [...(list?.children ?? [])]
            const index = children.findIndex((child) => child.classList.contains('nv-board__slot'))
            const box = children[index]?.getBoundingClientRect()
            done({ index, top: box?.top ?? Number.NaN, height: box?.height ?? Number.NaN })
          }),
        ),
      ),
    label,
  )

const slotIn = async (page: Page, label: string) => (await slotAt(page, label)).index

/** The planner's own copy of a view's sort, as this browser keeps it (grid/layout.ts); null while it keeps none. */
const storedSort = (page: Page, view: number) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as { sort: unknown }).sort
  }, `ntdst-views/layout/v2/${view}`)

const changedMark = (page: Page) =>
  page.locator('.nv-toolbar').getByRole('button', { name: 'More actions', exact: true })

/** A card held by the mouse over slot `index` of another column, aimed where that column's cards sat before the drag. */
async function holdAcross(page: Page, id: number, label: string, index: number) {
  const list = lane(page, label).locator('.nv-board__list')
  const box = await list.boundingBox()
  if (!box) throw new Error(`no list in ${label}`)
  const cards = await list
    .locator('[data-card]')
    .evaluateAll((all) =>
      all.map((one) => ({ top: one.getBoundingClientRect().top, bottom: one.getBoundingClientRect().bottom })),
    )
  const [above, below] = [cards[index - 1], cards[index]]
  const y =
    above && below ? (above.bottom + below.top) / 2 : below ? below.top + 4 : above ? above.bottom + 6 : box.y + 12
  await glide(page, await lift(page, card(page, id)), { x: box.x + box.width / 2, y })
}

/** A card held by the mouse over another card of its own column, whose place it takes. */
async function holdOnto(page: Page, id: number, onto: number) {
  const target = await card(page, onto).boundingBox()
  if (!target) throw new Error(`card ${onto} is not on the page`)
  const from = await lift(page, card(page, id))
  await glide(page, from, { x: from.x, y: target.y + target.height / 2 })
}

test.describe('step 3f: the board drags on dnd-kit', () => {
  test.describe.configure({ timeout: 120_000 })
  // Every column on screen: a drop needs its target in view.
  test.use({ viewport: { width: 1600, height: 900 } })

  test('board-drop-between @e2e', async ({ page }) => {
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.between, 1)
      const held = await made.add('e2e tussen sleep', day, 'optie')
      const bevestigd: number[] = []
      for (const n of [1, 2, 3, 4]) bevestigd.push(await made.add(`e2e tussen ${n}`, day, 'bevestigd'))
      view = await boardOf(api, 'e2e Bord tussen', WEEK.between, MANUAL)
      await page.goto('/')
      await open(page, 'e2e Bord tussen', held)
      const first = await orders(page)
      expect(first).toEqual({ Optie: [held], Bevestigd: bevestigd, Geannuleerd: [] })

      // Between the second and the third card: the slot is drawn there, and the card lands there.
      await holdAcross(page, held, 'Bevestigd', 2)
      await expect.poll(() => slotIn(page, 'Bevestigd')).toBe(2)
      await expect(said(page)).toHaveText(/boven Bevestigd, plaats 3 van 5/)
      await shot(page, 'board-drop-between')
      await page.mouse.up()
      const landed = moved(first, held, 'Bevestigd', 2)
      await expect.poll(() => orders(page)).toEqual(landed)
      await expect.poll(async () => (await stored(api, held)).status).toBe('bevestigd')
      expect((await stored(api, held)).position).not.toBeNull()

      await reopen(page, 'e2e Bord tussen', held)
      await expect.poll(() => orders(page)).toEqual(landed)
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  test('board-reorder @e2e', async ({ page }) => {
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.reorder, 2)
      const optie: number[] = []
      for (const n of [1, 2, 3, 4]) optie.push(await made.add(`e2e volgorde ${n}`, day, 'optie'))
      const [one, , three, four] = optie as [number, number, number, number]
      view = await boardOf(api, 'e2e Bord volgorde', WEEK.reorder, MANUAL)
      await page.goto('/')
      await open(page, 'e2e Bord volgorde', one)
      const first = await orders(page)
      expect(first.Optie).toEqual(optie)

      // The last card to the top.
      await holdOnto(page, four, one)
      await expect(said(page)).toHaveText(/boven Optie, plaats 1 van 4/)
      await page.mouse.up()
      const once = moved(first, four, 'Optie', 0)
      await expect.poll(() => orders(page)).toEqual(once)
      await expect.poll(async () => (await stored(api, four)).position).not.toBeNull()

      // Then the last one up to the second place, below the ranked card and above the unranked ones.
      await holdOnto(page, three, one)
      await expect(said(page)).toHaveText(/boven Optie, plaats 2 van 4/)
      await page.mouse.up()
      const twice = moved(once, three, 'Optie', 1)
      await expect.poll(() => orders(page)).toEqual(twice)
      await expect.poll(async () => (await stored(api, three)).position).not.toBeNull()

      await reopen(page, 'e2e Bord volgorde', one)
      await expect.poll(() => orders(page)).toEqual(twice)
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  test('board-reorder-fresh @e2e', async ({ page }) => {
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.fresh, 3)
      const optie: number[] = []
      for (const n of [1, 2, 3, 4]) optie.push(await made.add(`e2e vers ${n}`, day, 'optie'))
      for (const n of [1, 2]) await made.add(`e2e vers bevestigd ${n}`, day, 'bevestigd')
      const [one, , three] = optie as [number, number, number]
      view = await boardOf(api, 'e2e Bord vers', WEEK.fresh, MANUAL)
      await page.goto('/')
      await open(page, 'e2e Bord vers', one)
      const first = await orders(page)
      expect(first.Optie).toEqual(optie)
      for (const id of optie) expect((await stored(api, id)).position).toBeNull()

      // Card 1 down to the third place: third at once, and nothing else on the board moves.
      await holdOnto(page, one, three)
      await expect(said(page)).toHaveText(/boven Optie, plaats 3 van 4/)
      await page.mouse.up()
      const placed = moved(first, one, 'Optie', 2)
      await expect.poll(() => orders(page)).toEqual(placed)
      await expect.poll(async () => (await stored(api, one)).position).not.toBeNull()

      await reopen(page, 'e2e Bord vers', one)
      await expect.poll(() => orders(page)).toEqual(placed)
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  test('board-sorted-to-manual @e2e', async ({ page, browser }) => {
    const api = page.request
    const made = activities(api)
    const admin = await browser.newContext({ baseURL: THEATRE.app, storageState: state('admin') })
    let view = 0
    try {
      // Made latest day first: the ids run against the dates the board sorts on.
      const optie: number[] = []
      for (const n of [6, 5, 4, 3]) optie.push(await made.add(`e2e datum ${n}`, plusDays(WEEK.toManual, n), 'optie'))
      const bevestigd: number[] = []
      for (const n of [5, 2])
        bevestigd.push(await made.add(`e2e datum bevestigd ${n}`, plusDays(WEEK.toManual, n), 'bevestigd'))
      // A colleague's shared board, sorted, with its week as its own filter: locked for the planner, with nothing changed.
      view = await boardOf(admin.request, 'e2e Bord gesorteerd', WEEK.toManual, SORTED, { shared: true })
      await page.goto('/')
      await open(page, 'e2e Bord gesorteerd', optie[0] as number)
      await expect(changedMark(page)).toHaveCount(0)
      const first = await orders(page)
      expect(first).toEqual({ Optie: optie.toReversed(), Bevestigd: bevestigd.toReversed(), Geannuleerd: [] })

      // The earliest card to the third place of its column: the board turns manual in the planner's own layout.
      const [earliest, , third] = first.Optie as [number, number, number]
      await holdOnto(page, earliest, third)
      await expect(said(page)).toHaveText(/boven Optie, plaats 3 van 4/)
      await page.mouse.up()
      const manual = moved(first, earliest, 'Optie', 2)
      await expect.poll(() => orders(page)).toEqual(manual)
      await expect(changedMark(page)).toBeVisible()
      await expect
        .poll(() => storedSort(page, view))
        .toEqual([
          { id: 'position', desc: false },
          { id: 'plandag', desc: false },
          { id: 'start_at', desc: false },
        ])
      await shot(page, 'board-sorted-to-manual')
      await expect.poll(async () => (await stored(api, earliest)).position).not.toBeNull()

      await reopen(page, 'e2e Bord gesorteerd', earliest)
      await expect.poll(() => orders(page)).toEqual(manual)
      await expect(changedMark(page)).toBeVisible()

      // Revert: the dates' order again, on the view's own week.
      await changedMark(page).click()
      await page.getByRole('menuitem', { name: 'Terugzetten' }).click()
      await expect.poll(() => orders(page)).toEqual(first)
      await expect(changedMark(page)).toHaveCount(0)
      expect(await storedSort(page, view)).toBeNull()
    } finally {
      if (view) await admin.request.delete(`/api/views/${view}`)
      await admin.close()
      await made.remove()
    }
  })

  test('board-sorted-cross-column @e2e', async ({ page, browser }) => {
    const api = page.request
    const made = activities(api)
    const admin = await browser.newContext({ baseURL: THEATRE.app, storageState: state('admin') })
    let view = 0
    try {
      const held = await made.add('e2e kruis donderdag', plusDays(WEEK.cross, 3), 'optie')
      // Latest day first: neither the ids nor the pointer put the card where the dates do.
      const bevestigd: number[] = []
      for (const n of [4, 2, 0]) bevestigd.push(await made.add(`e2e kruis ${n}`, plusDays(WEEK.cross, n), 'bevestigd'))
      view = await boardOf(admin.request, 'e2e Bord gesorteerd kruis', WEEK.cross, SORTED, { shared: true })
      await page.goto('/')
      await open(page, 'e2e Bord gesorteerd kruis', held)
      const first = await orders(page)
      expect(first.Bevestigd).toEqual(bevestigd.toReversed())
      const sortBefore = await storedSort(page, view)

      // Over Bevestigd's top: the column is tinted and draws no slot.
      await holdAcross(page, held, 'Bevestigd', 0)
      await expect(lane(page, 'Bevestigd')).toHaveClass(/nv-board__column--drop/)
      await expect(page.locator('.nv-board__slot')).toHaveCount(0)
      await shot(page, 'board-sorted-cross-column')
      await page.mouse.up()

      // It lands at its date's place, Thursday between Wednesday and Friday, and only its column is written.
      const sorted = moved(first, held, 'Bevestigd', 2)
      await expect.poll(() => orders(page)).toEqual(sorted)
      await expect.poll(async () => (await stored(api, held)).status).toBe('bevestigd')
      expect((await stored(api, held)).position).toBeNull()
      await expect(changedMark(page)).toHaveCount(0)

      await reopen(page, 'e2e Bord gesorteerd kruis', held)
      await expect.poll(() => orders(page)).toEqual(sorted)
      await expect(changedMark(page)).toHaveCount(0)
      expect(await storedSort(page, view)).toEqual(sortBefore)
    } finally {
      if (view) await admin.request.delete(`/api/views/${view}`)
      await admin.close()
      await made.remove()
    }
  })

  test('board-slot-steady @e2e', async ({ page }) => {
    test.setTimeout(240_000)
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.steady, 2)
      for (let n = 1; n <= 64; n++) await made.add(`e2e druk ${n}`, day, 'optie')
      for (let n = 1; n <= 16; n++) await made.add(`e2e druk bevestigd ${n}`, day, 'bevestigd')
      const held = await made.add('e2e druk sleep', day, 'bevestigd')
      // Cards with their title only: the more cards the pointer passes, the more chances for the slot to step back.
      view = await boardOf(api, 'e2e Bord druk', WEEK.steady, MANUAL, { visible_fields: [] })
      await page.goto('/')
      await open(page, 'e2e Bord druk', held)
      await expect(lane(page, 'Optie').locator('.nv-board__count')).toHaveText('64')

      // The held card, last of its column, in the board's middle: the board, Optie with it, is scrolled.
      await card(page, held).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const scroller = page.locator('.nv-board')
      expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(200)
      const frame = await scroller.boundingBox()
      const list = await lane(page, 'Optie').locator('.nv-board__list').boundingBox()
      if (!frame || !list) throw new Error('no board on the page')
      const patches: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'PATCH') patches.push(request.url())
      })

      // Into Optie a third down the board, clear of the band where dnd-kit scrolls up; then only down, 4px at a time.
      let at = await glide(page, await lift(page, card(page, held)), {
        x: list.x + list.width / 2,
        y: frame.y + frame.height * 0.3,
      })
      const steps = [{ y: at.y, ...(await slotAt(page, 'Optie')) }]
      while (at.y + 4 < frame.y + frame.height * 0.75) {
        at = { x: at.x, y: at.y + 4 }
        await page.mouse.move(at.x, at.y)
        steps.push({ y: at.y, ...(await slotAt(page, 'Optie')) })
      }
      await shot(page, 'board-slot-steady')
      await page.keyboard.press('Escape')
      await page.mouse.up()

      const seen = steps.map((step) => step.index)
      const trail = seen.join(',')
      test.info().annotations.push({ type: 'slot indices', description: trail })
      expect(Math.min(...seen), trail).toBeGreaterThanOrEqual(0)
      for (const [step, index] of seen.entries())
        expect(index, `step ${step}: ${trail}`).toBeGreaterThanOrEqual(seen[step - 1] ?? 0)
      expect((seen.at(-1) ?? 0) - (seen[0] ?? 0), trail).toBeGreaterThanOrEqual(4)
      // And the slot is drawn by the pointer, on the scrolled column, never a scroll's height away.
      for (const [step, { y, top, height }] of steps.entries())
        expect(Math.abs(y - top), `step ${step}: pointer ${y}, slot ${top}`).toBeLessThan(height)
      // Escape put it back, and nothing was written.
      await expect(page.locator('.nv-board__card--lifted')).toHaveCount(0)
      expect(patches).toEqual([])
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  test('board-undo-both @e2e', async ({ page }) => {
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.undo, 1)
      const optie: number[] = []
      for (const n of ['a', 'b', 'c']) optie.push(await made.add(`e2e ongedaan ${n}`, day, 'optie'))
      const held = await made.add('e2e ongedaan sleep', day, 'bevestigd')
      await made.add('e2e ongedaan blijft', day, 'bevestigd')
      const [a, b] = optie as [number, number]
      view = await boardOf(api, 'e2e Bord ongedaan', WEEK.undo, MANUAL)
      await page.goto('/')
      await open(page, 'e2e Bord ongedaan', held)
      const first = await orders(page)
      const dropped = moved(first, held, 'Optie', 2)
      const written = async () =>
        (await Promise.all([a, b, held].map((id) => stored(api, id)))).map((r) => [r.status, r.position !== null])

      for (const focus of ['page', 'drawer'] as const) {
        await test.step(`drop, then ⌘Z with the focus on the ${focus}`, async () => {
          // Below two unranked cards: the step ranks them, then writes the card's column and place.
          await holdAcross(page, held, 'Optie', 2)
          await expect.poll(() => slotIn(page, 'Optie')).toBe(2)
          await page.mouse.up()
          await expect.poll(() => orders(page)).toEqual(dropped)
          await expect.poll(written).toEqual([
            ['optie', true],
            ['optie', true],
            ['optie', true],
          ])

          if (focus === 'page') await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          else {
            await card(page, held).click()
            const drawer = page.getByRole('complementary', { name: 'e2e ongedaan sleep' })
            await drawer.getByRole('button', { name: 'Sluiten' }).focus()
          }
          // One ⌘Z: the column, the place and every rank the step wrote.
          await page.keyboard.press('ControlOrMeta+z')
          await expect.poll(() => orders(page)).toEqual(first)
          await expect.poll(written).toEqual([
            ['optie', false],
            ['optie', false],
            ['bevestigd', false],
          ])

          await reopen(page, 'e2e Bord ongedaan', held)
          await expect.poll(() => orders(page)).toEqual(first)
        })
      }
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  test('board-keyboard @e2e', async ({ page }) => {
    const api = page.request
    const made = activities(api)
    let view = 0
    try {
      const day = plusDays(WEEK.keyboard, 1)
      const held = await made.add('e2e toets a', day, 'optie')
      const other = await made.add('e2e toets b', day, 'optie')
      for (const n of ['c', 'd', 'e']) await made.add(`e2e toets ${n}`, day, 'bevestigd')
      view = await boardOf(api, 'e2e Bord toetsen', WEEK.keyboard, MANUAL)
      await page.goto('/')
      await open(page, 'e2e Bord toetsen', held)
      const first = await orders(page)
      const press = async (key: string, words: RegExp) => {
        await page.keyboard.press(key)
        await expect(said(page)).toHaveText(words)
      }

      // Space lifts; ↓ ↑ within a column, ← → to the neighbour at the same place; Space drops.
      await card(page, held).focus()
      await press('Space', /^e2e toets a opgepakt in Optie, plaats 1 van 2\.$/)
      await press('ArrowDown', /^e2e toets a boven Optie, plaats 2 van 2\.$/)
      await press('ArrowRight', /^e2e toets a boven Bevestigd, plaats 2 van 4\.$/)
      await press('ArrowDown', /^e2e toets a boven Bevestigd, plaats 3 van 4\.$/)
      await press('ArrowUp', /^e2e toets a boven Bevestigd, plaats 2 van 4\.$/)
      await press('ArrowLeft', /^e2e toets a boven Optie, plaats 2 van 2\.$/)
      await press('ArrowRight', /^e2e toets a boven Bevestigd, plaats 2 van 4\.$/)
      await expect.poll(() => slotIn(page, 'Bevestigd')).toBe(1)
      await shot(page, 'board-keyboard')
      await press('Space', /^e2e toets a neergezet in Bevestigd, plaats 2 van 4\.$/)
      const dropped = moved(first, held, 'Bevestigd', 1)
      await expect.poll(() => orders(page)).toEqual(dropped)
      await expect.poll(async () => (await stored(api, held)).status).toBe('bevestigd')

      await reopen(page, 'e2e Bord toetsen', held)
      await expect.poll(() => orders(page)).toEqual(dropped)

      // Escape cancels: the card stays and nothing is written.
      const patches: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'PATCH') patches.push(request.url())
      })
      await card(page, other).focus()
      await press('Space', /^e2e toets b opgepakt in Optie, plaats 1 van 1\.$/)
      await press('ArrowRight', /^e2e toets b boven Bevestigd, plaats 1 van 5\.$/)
      await press('Escape', /^Slepen geannuleerd: e2e toets b blijft in Optie\.$/)
      await expect(page.locator('.nv-board__card--lifted')).toHaveCount(0)
      await expect.poll(() => orders(page)).toEqual(dropped)
      expect(await stored(api, other)).toMatchObject({ status: 'optie', position: null })
      expect(patches).toEqual([])
    } finally {
      if (view) await api.delete(`/api/views/${view}`)
      await made.remove()
    }
  })

  // Moved from step 3e, where it failed only on a board crowded by the earlier specs: now crowded on purpose.
  test('board-drag-refused @e2e', async ({ page }) => {
    test.setTimeout(240_000)
    const api = page.request
    const made = activities(api)
    const toewijzingen: number[] = []
    let activiteit = 0
    const place = async (naam: string, state: string) => {
      const id = await posted(api, '/api/rows/toewijzing', { activiteit_id: activiteit, naam, state })
      toewijzingen.push(id)
      return id
    }
    try {
      activiteit = await made.add('e2e weiger mij', plusDays(WEEK.refused, 1), 'bevestigd')
      // Geweigerd runs far below the screen; Bevestigd holds enough above the card that the board scrolls to it.
      for (let n = 1; n <= 64; n++) await place(`e2e geweigerd ${n}`, 'geweigerd')
      for (let n = 1; n <= 20; n++) await place(`e2e bevestigd ${n}`, 'bevestigd')
      const id = await place('e2e bevestigd blijft', 'bevestigd')
      await page.goto('/')
      await open(page, 'Bord toewijzingen', id, 'Toewijzingen')
      const both = async () => {
        const all = await orders(page)
        return { Bevestigd: all.Bevestigd, Geweigerd: all.Geweigerd }
      }
      const first = await both()
      expect(first.Geweigerd?.length).toBeGreaterThanOrEqual(64)
      const refusal = () =>
        page.waitForResponse(
          (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/rows/toewijzing/${id}`,
        )
      // Bevestigd never goes to Geweigerd (only an invitation is declined): the writer refuses, the card snaps back and the refusal shows.
      const back = async () => {
        await expect(page.getByText(/statuswijziging is niet toegestaan/).first()).toBeVisible()
        await expect(lane(page, 'Bevestigd').locator(`[data-card="${id}"]`)).toBeVisible()
        await expect.poll(both).toEqual(first)
        await reopen(page, 'Bord toewijzingen', id, 'Toewijzingen')
        await expect.poll(both).toEqual(first)
      }

      // Mouse: the board scrolled to the card, Geweigerd beside it; the pointer sideways only, so the board stays put.
      await card(page, id).evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
      const scroller = page.locator('.nv-board')
      const scrolled = await scroller.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
      expect(scrolled.top).toBeGreaterThan(200)
      const target = await lane(page, 'Geweigerd').boundingBox()
      if (!target) throw new Error('no Geweigerd column')
      let refused = refusal()
      const from = await lift(page, card(page, id))
      await glide(page, from, { x: target.x + target.width / 2, y: from.y })
      await expect(lane(page, 'Geweigerd')).toHaveClass(/nv-board__column--drop/)
      expect(await scroller.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual(scrolled)
      await shot(page, 'board-drag-refused')
      await page.mouse.up()
      expect((await refused).status()).toBe(422)
      await back()

      // Keyboard: Space lifts, → takes it to Geweigerd at its place, Space drops.
      refused = refusal()
      await card(page, id).focus()
      await page.keyboard.press('Space')
      await expect(page.locator('.nv-board__card--lifted')).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await expect(said(page)).toHaveText(/^e2e bevestigd blijft boven Geweigerd, plaats \d+ van \d+\.$/)
      await page.keyboard.press('Space')
      expect((await refused).status()).toBe(422)
      await back()
    } finally {
      for (const id of toewijzingen) await api.delete(`/api/rows/toewijzing/${id}`)
      await made.remove()
    }
  })
})
