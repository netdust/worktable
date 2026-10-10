import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type APIRequestContext, type Browser, expect, type Locator, type Page, test } from '@playwright/test'
import { SERVICE, state, THEATRE } from './auth'
import { shot } from './shots'
import { openView, openWeek } from './tree'

// Weeks the seed and the other specs leave empty, one per flow, so no flow sees another's rows.
const WEEK = {
  apply: '2028-03-13',
  counts: '2028-02-21',
  fill: '2028-02-07',
  invite: '2028-02-14',
  decline: '2028-02-28',
  noEmail: '2028-03-06',
  stale: '2028-03-20',
}
const MATRIX = 'Toewijzingen per activiteit'
const SJABLOON = 'speeldag op locatie (met plaatsen)'
const API = 'http://127.0.0.1:5174/api'

type Api = APIRequestContext
type Values = Record<string, unknown>

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

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

async function stored(api: Api, dataset: string, id: number): Promise<Values | undefined> {
  const [row] = await rowsOf(api, dataset, { id })
  return row
}

async function activity(api: Api, omschrijving: string, day: string, start = '20:00'): Promise<number> {
  return idOf(api, 'activiteit', {
    productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
    soort: 'voorstelling',
    status: 'optie',
    omschrijving,
    datum: day,
    start_at: `${day}T${start}`,
  })
}

async function removeActivity(api: Api, id: number) {
  for (const t of await rowsOf<{ id: number }>(api, 'toewijzing', { activiteit_id: id }))
    await api.delete(`/api/rows/toewijzing/${t.id}`)
  await api.delete(`/api/rows/activiteit/${id}`)
}

/** An invented person; the address, when given, is one no other flow uses. */
const person = (api: Api, voornaam: string, achternaam: string, email: string | null = null) =>
  idOf(api, 'persoon', { voornaam, achternaam, ...(email ? { email } : {}) })

const rolId = (api: Api, naam: string) => idByName(api, 'rol', 'naam', naam)

const mails = (): string[] => (existsSync(THEATRE.outbox) ? readdirSync(THEATRE.outbox).sort() : [])

/** The newest mail to `email` since `before` that carries a link of `kind`, read from the outbox as a mail client would. */
async function mailedLink(email: string, before: string[], kind: 'act' | 'link'): Promise<string> {
  const pattern = new RegExp(`http\\S+#/${kind}/[\\w.-]+`)
  for (let tries = 0; tries < 100; tries++) {
    for (const name of mails().filter((file) => !before.includes(file))) {
      const text = readFileSync(join(THEATRE.outbox, name), 'utf8')
      const link = text.startsWith(`To: ${email}\n`) ? text.match(pattern)?.[0] : undefined
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`no #/${kind}/ mail to ${email}`)
}

const mailsTo = (email: string, before: string[]) =>
  mails().filter(
    (name) => !before.includes(name) && readFileSync(join(THEATRE.outbox, name), 'utf8').startsWith(`To: ${email}\n`),
  )

/** The first column of the first row, straight from the e2e database with bound parameters. */
function readDb(sql: string, ...params: (string | number)[]): unknown {
  const script = `import { Database } from 'bun:sqlite'
    const row = new Database(${JSON.stringify(THEATRE.db)}, { readonly: true }).query(${JSON.stringify(sql)}).get(...${JSON.stringify(params)})
    console.log(JSON.stringify(row ? Object.values(row)[0] : null))`
  return JSON.parse(execFileSync('bun', ['-e', script]).toString().trim() || 'null')
}

/** One write to the e2e database: the clock moved past a token's end is a write the running engine reads on its next request. */
function writeDb(sql: string, ...params: (string | number)[]): number {
  const script = `import { Database } from 'bun:sqlite'
    const db = new Database(${JSON.stringify(THEATRE.db)})
    db.exec('PRAGMA busy_timeout = 5000')
    db.query(${JSON.stringify(sql)}).run(...${JSON.stringify(params)})
    console.log(JSON.stringify(String(db.query('SELECT changes() AS n').get().n)))`
  return Number(JSON.parse(execFileSync('bun', ['-e', script]).toString().trim()))
}

/** The engine's CLI on the e2e database, as global setup runs it. */
function cli(...args: string[]): string {
  const run = spawnSync(
    'bun',
    ['packages/engine/src/serve.ts', '--domain', THEATRE.domain, '--db', THEATRE.db, ...args],
    {
      encoding: 'utf8',
      timeout: 20_000,
      killSignal: 'SIGKILL',
    },
  )
  if (run.status !== 0) throw new Error(`${args.join(' ')} exited ${run.status}: ${run.stderr}`)
  return run.stdout.trim()
}

/** A browser context with no cookies at all: a person who never signed in. */
const stranger = (browser: Browser) => browser.newContext({ storageState: { cookies: [], origins: [] } })

const signedIn = (browser: Browser, who: 'admin' | 'editor' | 'owner') =>
  browser.newContext({ storageState: state(who) })

/** The row of a matrix or grid by its title. */
const row = (page: Page, title: string) => page.locator(`tbody tr.nv-tr[data-title="${title}"]`)

/** A matrix cell: one per person column, counted past the label and the open column. */
async function spot(page: Page, title: string, name: string): Promise<Locator> {
  const head = page.locator(`thead th.nv-mx__head[title="${name}"]`)
  await expect(head).toBeVisible()
  const index = await page
    .locator('thead th.nv-mx__head')
    .evaluateAll((heads, wanted) => heads.findIndex((th) => th.getAttribute('title') === wanted), name)
  return row(page, title).locator('td[data-cell]').nth(index)
}

const openCell = (page: Page, title: string) => row(page, title).locator('[data-testid="open"]')

async function columnIndex(page: Page, label: string): Promise<number> {
  let index = -1
  await expect
    .poll(async () => {
      index = await page
        .locator('thead th')
        .evaluateAll(
          (heads, wanted) => heads.findIndex((th) => (th.textContent ?? '').replace(/\s*[↑↓]$/, '').trim() === wanted),
          label,
        )
      return index
    })
    .toBeGreaterThanOrEqual(0)
  return index
}

const cellOf = async (page: Page, title: string, label: string): Promise<Locator> =>
  row(page, title)
    .locator('td')
    .nth(await columnIndex(page, label))

const answered = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((res) => res.request().method() === method && path.test(new URL(res.url()).pathname))

/** Fills the row's open slot with a person through the matrix's own picker; answers the action's reply. */
async function fillFromMatrix(page: Page, title: string, name: string) {
  await openCell(page, title).getByRole('button').click()
  const picker = page.getByRole('region', { name: 'Open plek invullen' })
  await picker.getByRole('searchbox', { name: 'Kies een persoon' }).fill(name)
  const reply = answered(page, 'POST', /^\/api\/actions\/vul_slot$/)
  await picker.getByRole('button', { name, exact: true }).click()
  return reply
}

/** Types a state key into a person's matrix cell; answers the PATCH it sends. */
async function typeState(page: Page, title: string, name: string, key: string) {
  const cell = await spot(page, title, name)
  await cell.click()
  const reply = answered(page, 'PATCH', /^\/api\/rows\/toewijzing\/\d+$/)
  await cell.press(key)
  return reply
}

/** The invite for a slot made straight on the API: the hook mints the token and mails the link. */
async function invited(
  api: Api,
  activiteit: number,
  persoon: number,
  email: string,
): Promise<{ id: number; link: string }> {
  const before = mails()
  const id = await idOf(api, 'toewijzing', { activiteit_id: activiteit, persoon_id: persoon, state: 'uitgenodigd' })
  return { id, link: await mailedLink(email, before, 'act') }
}

const tokenOf = (link: string) => link.split('#/act/')[1] as string

async function forOwnersOn(api: Api): Promise<number> {
  const views = ((await (await api.get('/api/views')).json()) as { views: { id: number; name: string }[] }).views
  const id = views.find((v) => v.name === 'Mijn producties')?.id as number
  expect((await api.put(`/api/views/${id}/for-owners`, { data: {} })).status()).toBe(200)
  return id
}

async function recordLink(api: Api, persoon: number): Promise<string> {
  const response = await api.get(`/api/record-links/persoon/${persoon}`)
  expect(response.status()).toBe(200)
  return ((await response.json()) as { link: string }).link
}

const linkToken = (link: string) => link.split('#/link/')[1] as string

test.describe('step 2', () => {
  test('apply-template-with-slots @e2e', async ({ page }) => {
    const api = page.request
    const naam = 'Speelreeks e2e met plaatsen'
    const reeks = await idOf(api, 'speelreeks', {
      naam,
      productie_id: await idByName(api, 'productie', 'titel', 'Nachtwacht'),
      locatie_id: await idByName(api, 'organisatie', 'naam', 'Zaal De Spiegel'),
      start_datum: WEEK.apply,
      eind_datum: plusDays(WEEK.apply, 3),
    })
    let batch: string | undefined
    try {
      await page.goto('/')
      await openView(page, 'Tourstops')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tourstops')
      await row(page, naam).getByRole('button', { name: 'Openen' }).click()
      const action = page.getByRole('group', { name: 'Sjabloon toepassen' })
      await action.getByRole('button', { name: /^Sjabloon: / }).click()
      await page.getByRole('combobox', { name: 'Sjabloon' }).fill('plaatsen')
      await page.getByRole('option', { name: SJABLOON }).click()
      const applied = answered(page, 'POST', /^\/api\/actions\/sjabloon_toepassen$/)
      await action.getByRole('button', { name: 'Sjabloon toepassen', exact: true }).click()
      const reply = await applied
      expect(reply.status()).toBe(201)
      const body = (await reply.json()) as { batch_id: string; created: { dataset: string }[] }
      batch = body.batch_id
      expect(body.created.filter((c) => c.dataset === 'activiteit')).toHaveLength(28)
      expect(body.created.filter((c) => c.dataset === 'toewijzing')).toHaveLength(8)

      // The matrix on that week: every Voorstelling waits for two players, every Voorbereiding for a light technician.
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.apply)
      await expect(row(page, 'Voorstelling')).toHaveCount(4)
      for (const cell of await openCell(page, 'Voorstelling').all()) {
        await expect(cell).toHaveAttribute('aria-label', 'Open plaatsen: 2. Speler')
        await expect(cell).toHaveText('2 Speler')
      }
      await expect(row(page, 'Voorbereiding')).toHaveCount(4)
      for (const cell of await openCell(page, 'Voorbereiding').all())
        await expect(cell).toHaveAttribute('aria-label', 'Open plaatsen: 1. Lichttechnicus')
      // An activity the template gave no slots has an empty open cell.
      for (const cell of await openCell(page, 'Lunch').all()) await expect(cell).toHaveText('')
      await expect(page.locator('[data-testid="open-count"]')).toHaveText('12')
      await shot(page, 'apply-template-with-slots')
    } finally {
      if (batch) await api.post(`/api/batches/${batch}/undo`, { data: {} })
      await api.delete(`/api/rows/speelreeks/${reeks}`)
    }
  })

  test('open-counts @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e open plaatsen'
    const id = await activity(api, title, WEEK.counts)
    const bare = await activity(api, 'e2e zonder plaatsen', WEEK.counts, '14:00')
    const lotte = await idByName(api, 'persoon', 'weergavenaam', 'Lotte Verhaegen')
    try {
      const two = await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Speler'), aantal: 2 })
      await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Speler'), aantal: 1 })
      await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Lichttechnicus'), aantal: 1 })
      // A filled row and a free-text name are not open: the name gets its own column, as "extern" did.
      await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: lotte, state: 'voorlopig' })
      await idOf(api, 'toewijzing', { activiteit_id: id, naam: 'Gastspeler Extern', state: 'voorlopig' })

      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.counts)
      await expect(openCell(page, title)).toHaveAttribute('aria-label', 'Open plaatsen: 4. Speler, Lichttechnicus')
      await expect(openCell(page, title)).toHaveText('4 Speler, Lichttechnicus')
      await expect(page.locator('thead th.nv-mx__head[title="Gastspeler Extern"]')).toBeVisible()
      await expect(await spot(page, title, 'Gastspeler Extern')).not.toHaveText('')
      await expect(openCell(page, 'e2e zonder plaatsen')).toHaveText('')
      await expect(openCell(page, 'e2e zonder plaatsen')).not.toHaveAttribute('aria-label', /.*/)
      await expect(page.locator('[data-testid="open-count"]')).toHaveText('4')
      await shot(page, 'open-counts')

      // Boundary: a slot never waits for zero or fewer people.
      for (const aantal of [0, -1]) {
        const refused = await api.patch(`/api/rows/toewijzing/${two}`, { data: { aantal } })
        expect(refused.status(), `aantal ${aantal}`).toBe(422)
      }
      expect((await stored(api, 'toewijzing', two))?.aantal).toBe(2)
    } finally {
      await removeActivity(api, id)
      await removeActivity(api, bare)
    }
  })

  test('fill-splits-slot-and-undo @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e drie spelers'
    const id = await activity(api, title, WEEK.fill)
    const slot = await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Speler'), aantal: 3 })
    const sam = await idByName(api, 'persoon', 'weergavenaam', 'Sam Peeters')
    try {
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.fill)
      await expect(openCell(page, title)).toHaveAttribute('aria-label', 'Open plaatsen: 3. Speler')

      const reply = await fillFromMatrix(page, title, 'Sam Peeters')
      expect(reply.status()).toBe(201)
      await expect(openCell(page, title)).toHaveAttribute('aria-label', 'Open plaatsen: 2. Speler')
      await expect(await spot(page, title, 'Sam Peeters')).toHaveText(/~/)
      const after = await rowsOf<Values>(api, 'toewijzing', { activiteit_id: id })
      expect(after).toHaveLength(2)
      expect(after.find((t) => t.id === slot)).toMatchObject({ state: 'open', aantal: 2, persoon_id: null })
      expect(after.find((t) => t.id !== slot)).toMatchObject({ state: 'voorlopig', aantal: 1, persoon_id: sam })
      await shot(page, 'fill-splits-slot')

      // One undo, from the open cell the picker gave the keyboard back to, reverses both.
      await expect(openCell(page, title)).toBeFocused()
      const undone = answered(page, 'POST', /^\/api\/batches\/[^/]+\/undo$/)
      await page.keyboard.press('ControlOrMeta+z')
      expect((await undone).status()).toBe(200)
      await expect(openCell(page, title)).toHaveAttribute('aria-label', 'Open plaatsen: 3. Speler')
      const back = await rowsOf<Values>(api, 'toewijzing', { activiteit_id: id })
      expect(back).toHaveLength(1)
      expect(back[0]).toMatchObject({ id: slot, state: 'open', aantal: 3, persoon_id: null })

      // Two planners fill the same last place at once: one lands, the other is refused, no one is doubled.
      const last = await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Lichttechnicus') })
      const lotte = await idByName(api, 'persoon', 'weergavenaam', 'Lotte Verhaegen')
      const fills = await Promise.all(
        [sam, lotte].map((who) =>
          api.post('/api/actions/vul_slot', { data: { id: last, input: { persoon_id: who } } }),
        ),
      )
      expect(fills.map((r) => r.status()).sort()).toEqual([201, 409])
      const filled = await stored(api, 'toewijzing', last)
      expect(filled).toMatchObject({ state: 'voorlopig', aantal: 1 })
      expect(await rowsOf(api, 'toewijzing', { activiteit_id: id })).toHaveLength(2)
    } finally {
      await removeActivity(api, id)
    }
  })

  test('invite-in-outbox @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e uitnodiging'
    const email = 'ines.brievenbus@e2e-invite.test'
    const id = await activity(api, title, WEEK.invite)
    const ines = await person(api, 'Ines', 'Brievenbus', email)
    await idOf(api, 'toewijzing', { activiteit_id: id, rol_id: await rolId(api, 'Speler'), aantal: 1 })
    try {
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.invite)
      expect((await fillFromMatrix(page, title, 'Ines Brievenbus')).status()).toBe(201)
      await expect(await spot(page, title, 'Ines Brievenbus')).toHaveText(/~/)
      // Pencilled in is not invited: nothing went out yet.
      const before = mails()
      const reply = await typeState(page, title, 'Ines Brievenbus', 'u')
      expect(reply.status()).toBe(200)
      expect(reply.request().postDataJSON()).toMatchObject({ state: 'uitgenodigd', expect: { state: 'voorlopig' } })
      await expect(await spot(page, title, 'Ines Brievenbus')).toHaveText(/\?/)
      const link = await mailedLink(email, before, 'act')
      expect(link).toMatch(/^http:\/\/127\.0\.0\.1:5174\/#\/act\/[\w-]{43}$/)
      expect(mailsTo(email, before)).toHaveLength(1)
      const text = readFileSync(join(THEATRE.outbox, mailsTo(email, before)[0] as string), 'utf8')
      expect(text).toContain(`Je bent uitgenodigd: ${title}.`)
      const [assignment] = await rowsOf<Values>(api, 'toewijzing', { persoon_id: ines })
      expect(
        readDb('SELECT count(*) FROM action_token WHERE record_id = ? AND used_at IS NULL', assignment?.id as number),
      ).toBe(1)
      await shot(page, 'invite-in-outbox')

      // Undo takes the invite back: the mailed link dies. A redo would leave a dead invite, so it is refused.
      const undone = answered(page, 'POST', /^\/api\/batches\/[^/]+\/undo$/)
      await page.keyboard.press('ControlOrMeta+z')
      expect((await undone).status()).toBe(200)
      await expect(await spot(page, title, 'Ines Brievenbus')).toHaveText(/~/)
      expect(
        readDb('SELECT count(*) FROM action_token WHERE record_id = ? AND used_at IS NULL', assignment?.id as number),
      ).toBe(0)
      const redone = answered(page, 'POST', /^\/api\/batches\/[^/]+\/undo$/)
      await page.keyboard.press('ControlOrMeta+Shift+z')
      expect((await redone).status()).toBe(422)
      await expect(page.getByText('Opnieuw doen kan hier niet').first()).toBeVisible()
      await expect(await spot(page, title, 'Ines Brievenbus')).toHaveText(/~/)
      expect((await stored(api, 'toewijzing', assignment?.id as number))?.state).toBe('voorlopig')
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${ines}`)
    }
  })

  test('confirm-without-login @e2e', async ({ page, browser }) => {
    const api = page.request
    const title = 'e2e bevestigen'
    const email = 'jonas.bevestiger@e2e-invite.test'
    const id = await activity(api, title, WEEK.invite, '14:00')
    const jonas = await person(api, 'Jonas', 'Bevestiger', email)
    const outsider = await stranger(browser)
    try {
      const { id: slot, link } = await invited(api, id, jonas, email)
      const tab = await outsider.newPage()
      const viewed = answered(tab, 'POST', /^\/api\/act\/view$/)
      await tab.goto(link)
      expect((await viewed).status()).toBe(200)
      const card = tab.getByRole('region', { name: 'Je antwoord' })
      await expect(card.getByRole('heading', { level: 1 })).toHaveText('Je antwoord')
      await expect(card).toContainText(title)
      await expect(card).toContainText('Uitgenodigd')
      // The token left the address bar before anything was read; no cookie, no session.
      expect(tab.url()).toBe('http://127.0.0.1:5174/')
      expect(await outsider.cookies()).toEqual([])
      await expect(card.getByRole('button', { name: 'Bevestigen' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Weigeren' })).toBeVisible()
      await shot(tab, 'confirm-page')

      const acted = answered(tab, 'POST', /^\/api\/act$/)
      await card.getByRole('button', { name: 'Bevestigen' }).click()
      expect((await acted).status()).toBe(200)
      await expect(card.getByRole('status')).toHaveText('Bedankt. Je antwoord is doorgegeven: Bevestigen.')
      await expect(card.getByRole('button')).toHaveCount(0)
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('bevestigd')
      await shot(tab, 'confirm-without-login')

      // The planner's matrix reads it, and the history names the person, not a planner.
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.invite)
      await expect(await spot(page, title, 'Jonas Bevestiger')).toHaveText(/✓/)
      const history = (await (await api.get('/api/history/toewijzing?limit=50')).json()) as {
        entries: {
          record: { id: number }
          by: string
          actor: string | null
          changes: { field: string; new: unknown }[]
        }[]
      }
      const answer = history.entries.find((e) => e.record.id === slot && e.changes.some((c) => c.field === 'state'))
      expect(answer).toMatchObject({ by: 'link', actor: 'Jonas Bevestiger' })
    } finally {
      await outsider.close()
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${jonas}`)
    }
  })

  test('reused-or-expired-refused @e2e', async ({ page, browser }) => {
    const api = page.request
    const email = 'lena.hergebruik@e2e-invite.test'
    const used = await activity(api, 'e2e hergebruik', WEEK.invite, '10:00')
    const late = await activity(api, 'e2e verlopen', WEEK.invite, '11:00')
    const lena = await person(api, 'Lena', 'Hergebruik', email)
    const outsider = await stranger(browser)
    try {
      const first = await invited(api, used, lena, email)
      const tab = await outsider.newPage()
      await tab.goto(first.link)
      const card = tab.getByRole('region', { name: 'Je antwoord' })
      await card.getByRole('button', { name: 'Bevestigen' }).click()
      await expect(card.getByRole('status')).toContainText('Bedankt.')

      // The same link again, as a person would click the mail twice: one refusal, nothing written.
      const again = await outsider.newPage()
      const viewed = answered(again, 'POST', /^\/api\/act\/view$/)
      await again.goto(first.link)
      expect((await viewed).status()).toBe(401)
      await expect(again.getByRole('region', { name: 'Je antwoord' }).getByRole('status')).toHaveText(
        'Deze link werkt niet meer',
      )
      await expect(again.getByRole('button')).toHaveCount(0)
      await shot(again, 'reused-link-refused')
      const replay = await outsider.request.post(`${API}/act`, {
        data: { token: tokenOf(first.link), to: 'geweigerd' },
      })
      expect(replay.status()).toBe(401)
      const reused = await replay.text()
      expect((await stored(api, 'toewijzing', first.id))?.state).toBe('bevestigd')

      // A token past its end: the same refusal, byte for byte, and the slot stays invited.
      const second = await invited(api, late, lena, email)
      expect(
        writeDb(
          "UPDATE action_token SET expires_at = '2000-01-01T00:00:00.000Z' WHERE record_id = ? AND used_at IS NULL",
          second.id,
        ),
      ).toBe(1)
      const expired = await outsider.newPage()
      await expired.goto(second.link)
      await expect(expired.getByRole('region', { name: 'Je antwoord' }).getByRole('status')).toHaveText(
        'Deze link werkt niet meer',
      )
      const stale = await outsider.request.post(`${API}/act`, {
        data: { token: tokenOf(second.link), to: 'bevestigd' },
      })
      expect(stale.status()).toBe(401)
      expect(await stale.text()).toBe(reused)
      expect(stale.headers()['cache-control']).toBe('no-store')
      expect(stale.headers()['access-control-allow-origin']).toBeUndefined()
      expect((await stored(api, 'toewijzing', second.id))?.state).toBe('uitgenodigd')
    } finally {
      await outsider.close()
      await removeActivity(api, used)
      await removeActivity(api, late)
      await api.delete(`/api/rows/persoon/${lena}`)
    }
  })

  test('token-a-not-b @e2e', async ({ page, browser }) => {
    const api = page.request
    const email = 'milan.plekwissel@e2e-invite.test'
    const a = await activity(api, 'e2e plek A', WEEK.invite, '15:00')
    const b = await activity(api, 'e2e plek B', WEEK.invite, '16:00')
    const milan = await person(api, 'Milan', 'Plekwissel', email)
    const outsider = await stranger(browser)
    try {
      const slotA = await invited(api, a, milan, email)
      const slotB = await invited(api, b, milan, email)
      // Token A names its own record only: a body naming B is not read, and A's answer lands on A.
      const reply = await outsider.request.post(`${API}/act`, {
        data: { token: tokenOf(slotA.link), to: 'geweigerd', id: slotB.id, record_id: slotB.id },
      })
      expect(reply.status()).toBe(200)
      expect((await stored(api, 'toewijzing', slotA.id))?.state).toBe('geweigerd')
      expect((await stored(api, 'toewijzing', slotB.id))?.state).toBe('uitgenodigd')

      // Mid-flow refusal: an answer the token does not offer is refused, and the token survives it.
      const odd = await outsider.request.post(`${API}/act`, { data: { token: tokenOf(slotB.link), to: 'open' } })
      expect(odd.status()).toBe(422)
      expect((await odd.json()).code).toBe('transition_not_allowed')
      expect((await stored(api, 'toewijzing', slotB.id))?.state).toBe('uitgenodigd')

      // B's page still shows B and its own answers.
      const tab = await outsider.newPage()
      await tab.goto(slotB.link)
      const card = tab.getByRole('region', { name: 'Je antwoord' })
      await expect(card).toContainText('e2e plek B')
      await expect(card).not.toContainText('e2e plek A')
      await shot(tab, 'token-b-shows-b')

      // A token whose slot went to someone else is refused like any bad token.
      const lotte = await idByName(api, 'persoon', 'weergavenaam', 'Lotte Verhaegen')
      expect((await api.patch(`/api/rows/toewijzing/${slotB.id}`, { data: { persoon_id: lotte } })).status()).toBe(200)
      const moved = await outsider.request.post(`${API}/act`, { data: { token: tokenOf(slotB.link), to: 'bevestigd' } })
      expect(moved.status()).toBe(401)
      expect((await moved.json()).code).toBe('bad_token')
      expect((await stored(api, 'toewijzing', slotB.id))?.state).not.toBe('bevestigd')
    } finally {
      await outsider.close()
      await removeActivity(api, a)
      await removeActivity(api, b)
      await api.delete(`/api/rows/persoon/${milan}`)
    }
  })

  test('cancelled-invite-offers-no-answer @e2e', async ({ page, browser }) => {
    // Found in the shake-out (row 19): a slot that left uitgenodigd offers no answer that could only be refused.
    const api = page.request
    const email = 'kato.annuleer@e2e-invite.test'
    const id = await activity(api, 'e2e geannuleerde uitnodiging', WEEK.decline, '10:00')
    const kato = await person(api, 'Kato', 'Annuleer', email)
    const outsider = await stranger(browser)
    try {
      const { id: slot, link } = await invited(api, id, kato, email)
      const cancelled = await api.patch(`/api/rows/toewijzing/${slot}`, {
        data: { state: 'geannuleerd', expect: { state: 'uitgenodigd' } },
      })
      expect(cancelled.status()).toBe(200)
      const tab = await outsider.newPage()
      await tab.goto(link)
      const card = tab.getByRole('region', { name: 'Je antwoord' })
      await expect(card).toContainText('Geannuleerd')
      await expect(card.getByRole('status')).toHaveText('Deze uitnodiging is niet meer open.')
      await shot(tab, 'cancelled-invite-offers-no-answer')
      await expect(card.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0, { timeout: 2000 })
      await expect(card.getByRole('button', { name: 'Weigeren' })).toHaveCount(0, { timeout: 2000 })
      const view = await outsider.request.post(`${API}/act/view`, { data: { token: tokenOf(link) } })
      expect(view.status()).toBe(200)
      expect(await view.json()).toMatchObject({ answerable: false, to: [] })
      // A replayed answer is still refused, and the row keeps the planner's state.
      const replay = await outsider.request.post(`${API}/act`, { data: { token: tokenOf(link), to: 'bevestigd' } })
      expect(replay.status()).toBe(409)
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('geannuleerd')
    } finally {
      await outsider.close()
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${kato}`)
    }
  })

  test('decline-shows-geweigerd @e2e', async ({ page, browser }) => {
    const api = page.request
    const title = 'e2e weigeren'
    const email = 'tilda.weigerling@e2e-invite.test'
    const id = await activity(api, title, WEEK.decline)
    const tilda = await person(api, 'Tilda', 'Weigerling', email)
    const outsider = await stranger(browser)
    try {
      const { id: slot, link } = await invited(api, id, tilda, email)
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.decline)
      await expect(await spot(page, title, 'Tilda Weigerling')).toHaveText(/\?/)

      const tab = await outsider.newPage()
      await tab.goto(link)
      const card = tab.getByRole('region', { name: 'Je antwoord' })
      await card.getByRole('button', { name: 'Weigeren' }).click()
      await expect(card.getByRole('status')).toHaveText('Bedankt. Je antwoord is doorgegeven: Weigeren.')
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('geweigerd')

      // The planner's matrix, reloaded, shows the refusal; the table says it in words.
      await page.reload()
      await expect(await spot(page, title, 'Tilda Weigerling')).toHaveText(/✗/)
      await shot(page, 'decline-shows-geweigerd')
      await page.goto('/')
      await openView(page, 'Toewijzingen')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
      await expect(await cellOf(page, 'Tilda Weigerling', 'Status')).toHaveText('Geweigerd')

      // Re-entry: the planner invites her again. A new link goes out, and only the newest works.
      const before = mails()
      const again = await api.patch(`/api/rows/toewijzing/${slot}`, {
        data: { state: 'uitgenodigd', expect: { state: 'geweigerd' } },
      })
      expect(again.status()).toBe(200)
      const fresh = await mailedLink(email, before, 'act')
      expect(fresh).not.toBe(link)
      const old = await outsider.request.post(`${API}/act/view`, { data: { token: tokenOf(link) } })
      expect(old.status()).toBe(401)
      const view = await outsider.request.post(`${API}/act/view`, { data: { token: tokenOf(fresh) } })
      expect(view.status()).toBe(200)
    } finally {
      await outsider.close()
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${tilda}`)
    }
  })

  test('no-email-no-invite @e2e', async ({ page }) => {
    const api = page.request
    const title = 'e2e zonder adres'
    const id = await activity(api, title, WEEK.noEmail)
    const noor = await idByName(api, 'persoon', 'weergavenaam', 'Noor Claes')
    const slot = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: noor, state: 'voorlopig' })
    try {
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.noEmail)
      const before = mails()
      const tokens = readDb('SELECT count(*) FROM action_token')
      const reply = await typeState(page, title, 'Noor Claes', 'u')
      expect(reply.status()).toBe(200)
      expect(((await reply.json()) as { notices: string[] }).notices).toEqual([
        'Geen uitnodiging: Noor Claes heeft geen e-mailadres.',
      ])
      await expect(page.getByText('Geen uitnodiging: Noor Claes heeft geen e-mailadres.')).toBeVisible()
      await shot(page, 'no-email-no-invite')
      await page.waitForTimeout(500)
      expect(mails().filter((name) => !before.includes(name))).toEqual([])
      expect(readDb('SELECT count(*) FROM action_token')).toBe(tokens)
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('uitgenodigd')
    } finally {
      await removeActivity(api, id)
    }
  })

  test('disallowed-transition @e2e', async ({ page, browser }) => {
    const api = page.request
    const title = 'e2e verboden overgang'
    const id = await activity(api, title, WEEK.stale, '10:00')
    const wout = await person(api, 'Wout', 'Overgang')
    const slot = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: wout, state: 'geannuleerd' })
    try {
      await page.goto('/')
      await openView(page, 'Toewijzingen')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
      const status = () => cellOf(page, 'Wout Overgang', 'Status')
      await expect(await status()).toHaveText('Geannuleerd')
      // Geannuleerd → Bevestigd is no declared transition: refused in Dutch, and the cell shows what is stored.
      await (await status()).click()
      await (await status()).press('Enter')
      const reply = answered(page, 'PATCH', new RegExp(`^/api/rows/toewijzing/${slot}$`))
      await page.locator('.nv-pop[data-editor]').getByRole('option', { name: 'Bevestigd' }).click()
      const refused = await reply
      expect(refused.status()).toBe(422)
      expect((await refused.json()).code).toBe('transition_not_allowed')
      await expect(row(page, 'Wout Overgang').getByRole('alert')).toHaveText(
        /Deze statuswijziging is niet toegestaan\./,
      )
      await expect(await status()).toHaveText(/^Geannuleerd/)
      await shot(page, 'disallowed-transition')
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('geannuleerd')

      // Denied actor: the owner may answer its own invite, never make a planner's move.
      const owner = await signedIn(browser, 'owner')
      try {
        const lotte = await idByName(api, 'persoon', 'weergavenaam', 'Lotte Verhaegen')
        const own = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: lotte, state: 'voorlopig' })
        const move = await owner.request.patch(`${API}/rows/toewijzing/${own}`, { data: { state: 'bevestigd' } })
        expect(move.status()).toBe(422)
        expect((await move.json()).code).toBe('transition_not_allowed')
        expect((await stored(api, 'toewijzing', own))?.state).toBe('voorlopig')
      } finally {
        await owner.close()
      }
    } finally {
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${wout}`)
    }
  })

  test('swap-pencils-back-in @e2e', async ({ page, browser }) => {
    // Ruling R21: another person on an uitgenodigd, bevestigd or geweigerd row is pencilled in; geannuleerd stays.
    const api = page.request
    const id = await activity(api, 'e2e wissel', WEEK.stale, '11:00')
    const joppe = await person(api, 'Joppe', 'Wisselaar', 'joppe.wisselaar@e2e-invite.test')
    const mona = await person(api, 'Mona', 'Ruilvink', 'mona.ruilvink@e2e-invite.test')
    const jules = await person(api, 'Jules', 'Afgezegd')
    const hanne = await person(api, 'Hanne', 'Invaller', 'hanne.invaller@e2e-invite.test')
    const ilse = await person(api, 'Ilse', 'Gevraagd', 'ilse.gevraagd@e2e-invite.test')
    const confirmed = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: joppe, state: 'bevestigd' })
    const cancelled = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: jules, state: 'geannuleerd' })
    const admin = await signedIn(browser, 'admin')
    const outsider = await stranger(browser)
    type View = { id: number; name: string; for_owners: boolean }
    let shown: number | undefined
    let wasShown = true
    try {
      const views = (await (await admin.request.get(`${API}/views`)).json()) as { views: View[] }
      const view = views.views.find((v) => v.name === 'Mijn producties') as View
      wasShown = view.for_owners
      shown = view.id
      expect((await admin.request.put(`${API}/views/${shown}/for-owners`, { data: {} })).status()).toBe(200)
      const pageOf = async (persoon: number) => {
        const response = await admin.request.get(`${API}/record-links/persoon/${persoon}`)
        expect(response.status()).toBe(200)
        const tab = await outsider.newPage()
        await tab.goto(((await response.json()) as { link: string }).link)
        const table = tab.getByRole('table', { name: 'Mijn producties' })
        await expect(table).toBeVisible()
        return { tab, table }
      }
      // Before the swap, Joppe's confirmed row gives him Nachtwacht on his page.
      const before = await pageOf(joppe)
      await expect(before.table.locator('tbody tr td').first()).toHaveText('Nachtwacht')
      await before.tab.close()

      await page.goto('/')
      await openView(page, 'Toewijzingen')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toewijzingen')
      const sent = mails()
      const tokens = readDb('SELECT count(*) FROM action_token')
      const swap = async (from: string, to: string, slot: number) => {
        const persoon = await cellOf(page, from, 'Persoon')
        await persoon.click()
        await persoon.press('Enter')
        await page.getByRole('combobox', { name: 'Persoon' }).fill(to.split(' ')[0] as string)
        const reply = answered(page, 'PATCH', new RegExp(`^/api/rows/toewijzing/${slot}$`))
        await page.getByRole('option', { name: to, exact: true }).click()
        const answer = await reply
        expect(answer.status()).toBe(200)
        expect(answer.request().postDataJSON()).not.toHaveProperty('state')
      }

      await expect(await cellOf(page, 'Joppe Wisselaar', 'Status')).toHaveText(/^Bevestigd/)
      await swap('Joppe Wisselaar', 'Mona Ruilvink', confirmed)
      await expect(await cellOf(page, 'Mona Ruilvink', 'Status')).toHaveText(/^Voorlopig/)
      await row(page, 'Mona Ruilvink').scrollIntoViewIfNeeded()
      await shot(page, 'swap-pencils-back-in')
      expect((await stored(api, 'toewijzing', confirmed))?.state).toBe('voorlopig')
      // Re-entry: one undo puts Joppe back, confirmed; the swap is then made again.
      const undo = answered(page, 'POST', /^\/api\/batches\/[^/]+\/undo$/)
      await page.keyboard.press('Control+z')
      expect((await undo).status()).toBe(200)
      await expect(await cellOf(page, 'Joppe Wisselaar', 'Status')).toHaveText(/^Bevestigd/)
      expect((await stored(api, 'toewijzing', confirmed))?.state).toBe('bevestigd')
      await swap('Joppe Wisselaar', 'Mona Ruilvink', confirmed)
      await expect(await cellOf(page, 'Mona Ruilvink', 'Status')).toHaveText(/^Voorlopig/)

      // Geannuleerd edge: the planner's cancellation outlives a change of person.
      await expect(await cellOf(page, 'Jules Afgezegd', 'Status')).toHaveText(/^Geannuleerd/)
      await swap('Jules Afgezegd', 'Hanne Invaller', cancelled)
      await expect(await cellOf(page, 'Hanne Invaller', 'Status')).toHaveText(/^Geannuleerd/)
      expect((await stored(api, 'toewijzing', cancelled))?.state).toBe('geannuleerd')

      // Nobody was invited by either swap: no mail, no token.
      await page.waitForTimeout(500)
      expect(mails().filter((name) => !sent.includes(name))).toEqual([])
      expect(readDb('SELECT count(*) FROM action_token')).toBe(tokens)

      // Joppe lost Nachtwacht with his row; Mona has nothing until she confirms.
      for (const who of [joppe, mona]) {
        const after = await pageOf(who)
        await expect(after.table.locator('tbody tr')).toHaveCount(0)
        await expect(after.tab.getByRole('region', { name: 'Je overzicht' })).not.toContainText('Nachtwacht')
        await after.tab.close()
      }

      // The other personal states on the wire: an invited person swapped, a declined free-text name renamed.
      const asked = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: ilse, state: 'uitgenodigd' })
      const moved = await api.patch(`/api/rows/toewijzing/${asked}`, { data: { persoon_id: joppe } })
      expect(moved.status()).toBe(200)
      expect((await stored(api, 'toewijzing', asked))?.state).toBe('voorlopig')
      const guest = await idOf(api, 'toewijzing', { activiteit_id: id, naam: 'Gast Weigeraar', state: 'geweigerd' })
      const renamed = await api.patch(`/api/rows/toewijzing/${guest}`, { data: { naam: 'Gast Vervanger' } })
      expect(renamed.status()).toBe(200)
      expect((await stored(api, 'toewijzing', guest))?.state).toBe('voorlopig')
    } finally {
      // The person-page flows publish the view themselves: leave it as found.
      if (shown !== undefined && !wasShown) await admin.request.delete(`${API}/views/${shown}/for-owners`)
      await outsider.close()
      await admin.close()
      await removeActivity(api, id)
      for (const one of [joppe, mona, jules, hanne, ilse]) await api.delete(`/api/rows/persoon/${one}`)
    }
  })

  test('stale-state-409 @e2e', async ({ page, browser }) => {
    const api = page.request
    const title = 'e2e verouderd'
    const id = await activity(api, title, WEEK.stale, '14:00')
    const vera = await person(api, 'Vera', 'Verouderd')
    const slot = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: vera, state: 'voorlopig' })
    const colleague = await signedIn(browser, 'admin')
    try {
      // Two planners on the same matrix, both reading "voorlopig".
      const other = await colleague.newPage()
      await openWeek(page, MATRIX, 'Activiteiten', 'plandag', WEEK.stale)
      await openWeek(other, MATRIX, 'Activiteiten', 'plandag', WEEK.stale)
      await expect(await spot(page, title, 'Vera Verouderd')).toHaveText(/~/)
      await expect(await spot(other, title, 'Vera Verouderd')).toHaveText(/~/)

      expect((await typeState(other, title, 'Vera Verouderd', 'b')).status()).toBe(200)
      // The first planner still shows ~ and sends what it showed: the server has moved on.
      await expect(await spot(page, title, 'Vera Verouderd')).toHaveText(/~/)
      const reply = await typeState(page, title, 'Vera Verouderd', 'u')
      expect(reply.status()).toBe(409)
      expect(reply.request().postDataJSON()).toMatchObject({ state: 'uitgenodigd', expect: { state: 'voorlopig' } })
      expect((await reply.json()).code).toBe('transition_lost')
      await expect(row(page, title).getByRole('alert')).toHaveText(
        'De status is intussen gewijzigd. De cel toont nu wat er staat.',
      )
      await expect(await spot(page, title, 'Vera Verouderd')).toHaveText(/✓/)
      await shot(page, 'stale-state-409')
      expect((await stored(api, 'toewijzing', slot))?.state).toBe('bevestigd')
    } finally {
      await colleague.close()
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${vera}`)
    }
  })

  test('planner-and-person-race-409 @e2e', async ({ page, browser }) => {
    const api = page.request
    const email = 'pieter.race@e2e-invite.test'
    const id = await activity(api, 'e2e race', WEEK.stale, '18:00')
    const pieter = await person(api, 'Pieter', 'Race', email)
    const outsider = await stranger(browser)
    const colleague = await signedIn(browser, 'admin')
    try {
      // The planner's PATCH with expect against the person's /act, released together, three rounds.
      for (let round = 0; round < 3; round++) {
        const { id: slot, link } = await invited(api, id, pieter, email)
        const [planner, personAnswer] = await Promise.all([
          api.patch(`/api/rows/toewijzing/${slot}`, {
            data: { state: 'geannuleerd', expect: { state: 'uitgenodigd' } },
          }),
          outsider.request.post(`${API}/act`, { data: { token: tokenOf(link), to: 'bevestigd' } }),
        ])
        const statuses = [planner.status(), personAnswer.status()].sort()
        expect(statuses).toEqual([200, 409])
        const loser = planner.status() === 409 ? planner : personAnswer
        expect((await loser.json()).code).toBe('transition_lost')
        const final = (await stored(api, 'toewijzing', slot))?.state
        expect(final).toBe(planner.status() === 200 ? 'geannuleerd' : 'bevestigd')
        await api.delete(`/api/rows/toewijzing/${slot}`)
      }

      // Two planners, both with expect: one success, one 409.
      const slot = await idOf(api, 'toewijzing', { activiteit_id: id, persoon_id: pieter, state: 'voorlopig' })
      const [mine, theirs] = await Promise.all([
        api.patch(`/api/rows/toewijzing/${slot}`, { data: { state: 'bevestigd', expect: { state: 'voorlopig' } } }),
        colleague.request.patch(`${API}/rows/toewijzing/${slot}`, {
          data: { state: 'uitgenodigd', expect: { state: 'voorlopig' } },
        }),
      ])
      expect([mine.status(), theirs.status()].sort()).toEqual([200, 409])
    } finally {
      await outsider.close()
      await colleague.close()
      await removeActivity(api, id)
      await api.delete(`/api/rows/persoon/${pieter}`)
    }
  })

  test.describe('person pages', () => {
    test.use({ storageState: state('admin') })

    test('link-shows-own-projects-only @e2e', async ({ page, browser }) => {
      const api = page.request
      const sam = await idByName(api, 'persoon', 'weergavenaam', 'Sam Peeters')
      // Someone else's confirmed production, which Lotte's page must not show.
      const other = await activity(api, 'e2e Nachtwacht van Sam', plusDays(WEEK.decline, 2))
      await idOf(api, 'toewijzing', {
        activiteit_id: other,
        persoon_id: sam,
        state: 'bevestigd',
        rol_id: await rolId(api, 'Speler'),
      })
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const outsider = await stranger(browser)
      try {
        // The administrator shows "Mijn producties" to owners from Exporteren / delen.
        await page.goto('/')
        await openView(page, 'Mijn producties')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mijn producties')
        await page.locator('.nv-toolbar').getByRole('button', { name: 'Exporteren / delen' }).click()
        const menu = page.getByRole('menu', { name: 'Exporteren / delen' })
        const publish = menu.getByRole('menuitem', { name: 'Voor eigenaars publiceren' })
        const withdraw = menu.getByRole('menuitem', { name: 'Niet meer voor eigenaars' })
        await expect(publish.or(withdraw)).toBeVisible()
        // On an instance where the view is already shown to owners, it stays shown.
        if (await publish.isVisible()) {
          const put = answered(page, 'PUT', /^\/api\/views\/\d+\/for-owners$/)
          await publish.click()
          await put
          await expect(page.getByText('Gepubliceerd voor eigenaars')).toBeVisible()
        } else {
          await page.keyboard.press('Escape')
        }

        // Lotte's link, copied from her drawer in Personen.
        await openView(page, 'Personen')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personen')
        await row(page, 'Lotte Verhaegen').getByRole('button', { name: 'Openen' }).click()
        const group = page.getByRole('group', { name: 'Link kopiëren' })
        await group.getByRole('button', { name: 'Link kopiëren' }).click()
        await expect(group.getByRole('status')).toHaveText('Link gekopieerd')
        const link = await page.evaluate(() => navigator.clipboard.readText())
        expect(link).toMatch(/^http:\/\/127\.0\.0\.1:5174\/#\/link\/persoon\.1\.[\w-]{43}$/)

        const tab = await outsider.newPage()
        const views = answered(tab, 'GET', /^\/api\/owner\/views$/)
        await tab.goto(link)
        const sent = (await views).request().headers()
        expect(sent.authorization).toMatch(/^RecordLink persoon\.1\./)
        const pageOf = tab.getByRole('region', { name: 'Je overzicht' })
        await expect(pageOf.getByRole('heading', { level: 2 })).toHaveText(['Mijn producties'])
        const table = pageOf.getByRole('table', { name: 'Mijn producties' })
        await expect(table.locator('thead th')).toHaveText([
          'Productie',
          'Rollen',
          'Eerste dag',
          'Laatste dag',
          'Toegang tot',
        ])
        await expect(table.locator('tbody tr')).toHaveCount(1)
        await expect(table.locator('tbody tr td').first()).toHaveText('De Kersentuin')
        await expect(pageOf).not.toContainText('Nachtwacht')
        expect(tab.url()).toBe('http://127.0.0.1:5174/')
        expect(await outsider.cookies()).toEqual([])
        await shot(tab, 'link-shows-own-projects-only')
      } finally {
        await outsider.close()
        await removeActivity(api, other)
      }
    })

    test('rotated-link-refused @e2e', async ({ page, browser }) => {
      const api = page.request
      await forOwnersOn(api)
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const outsider = await stranger(browser)
      try {
        const old = await recordLink(api, 1)
        await page.goto('/')
        await openView(page, 'Personen')
        await row(page, 'Lotte Verhaegen').getByRole('button', { name: 'Openen' }).click()
        const group = page.getByRole('group', { name: 'Link kopiëren' })
        const rotated = answered(page, 'POST', /^\/api\/record-links\/persoon\/1\/rotate$/)
        await group.getByRole('button', { name: 'Nieuwe link' }).click()
        expect((await rotated).status()).toBe(200)
        await expect(group.getByRole('status')).toHaveText('Nieuwe link gekopieerd; de vorige werkt niet meer')
        const fresh = await page.evaluate(() => navigator.clipboard.readText())
        expect(fresh).not.toBe(old)

        const stale = await outsider.newPage()
        await stale.goto(old)
        await expect(stale.getByRole('region', { name: 'Je overzicht' }).getByRole('status')).toHaveText(
          'Deze link werkt niet meer',
        )
        await expect(stale.getByRole('table')).toHaveCount(0)
        await shot(stale, 'rotated-link-refused')
        const refused = await outsider.request.get(`${API}/owner/views`, {
          headers: { authorization: `RecordLink ${linkToken(old)}` },
        })
        expect(refused.status()).toBe(401)
        expect(await refused.json()).toMatchObject({ code: 'bad_link' })
        expect(refused.headers()['cache-control']).toBe('no-store')
        expect(refused.headers()['referrer-policy']).toBe('no-referrer')
        expect(refused.headers()['x-robots-tag']).toBe('noindex')

        const works = await outsider.newPage()
        await works.goto(fresh)
        await expect(works.getByRole('table', { name: 'Mijn producties' })).toBeVisible()

        // Revoking is rotating without handing the new link on: the fresh one stops too.
        expect((await api.post('/api/record-links/persoon/1/rotate', { data: {} })).status()).toBe(200)
        const revoked = await outsider.request.get(`${API}/owner/views`, {
          headers: { authorization: `RecordLink ${linkToken(fresh)}` },
        })
        expect(revoked.status()).toBe(401)
        // Denied actor: an editor copies no links.
        const editor = await signedIn(browser, 'editor')
        expect((await editor.request.get(`${API}/record-links/persoon/1`)).status()).toBe(403)
        await editor.close()
      } finally {
        await outsider.close()
      }
    })

    test('declined-or-invited-no-project @e2e', async ({ page, browser }) => {
      const api = page.request
      await forOwnersOn(api)
      const fien = await person(api, 'Fien', 'Weigert', 'fien.weigert@e2e-invite.test')
      const gijs = await person(api, 'Gijs', 'Uitgenodigd', 'gijs.uitgenodigd@e2e-invite.test')
      const kersentuin = (
        await rowsOf<Values>(api, 'activiteit', {
          productie_id: await idByName(api, 'productie', 'titel', 'De Kersentuin'),
        })
      )[0]?.id as number
      const outsider = await stranger(browser)
      const slots: number[] = []
      try {
        // On De Kersentuin, where Lotte is confirmed: Fien declines her invite, Gijs leaves his unanswered.
        const declined = await invited(api, kersentuin, fien, 'fien.weigert@e2e-invite.test')
        const open = await invited(api, kersentuin, gijs, 'gijs.uitgenodigd@e2e-invite.test')
        slots.push(declined.id, open.id)
        const answer = await outsider.request.post(`${API}/act`, {
          data: { token: tokenOf(declined.link), to: 'geweigerd' },
        })
        expect(answer.status()).toBe(200)
        expect((await stored(api, 'toewijzing', declined.id))?.state).toBe('geweigerd')
        expect((await stored(api, 'toewijzing', open.id))?.state).toBe('uitgenodigd')

        for (const [who, id] of [
          ['declined', fien],
          ['invited', gijs],
        ] as const) {
          const tab = await outsider.newPage()
          await tab.goto(await recordLink(api, id))
          const table = tab.getByRole('table', { name: 'Mijn producties' })
          await expect(table).toBeVisible()
          await expect(table.locator('tbody tr')).toHaveCount(0)
          await expect(tab.getByRole('region', { name: 'Je overzicht' })).not.toContainText('De Kersentuin')
          await shot(tab, `${who}-no-project`)
        }
      } finally {
        await outsider.close()
        for (const slot of slots) await api.delete(`/api/rows/toewijzing/${slot}`)
        await api.delete(`/api/rows/persoon/${fien}`)
        await api.delete(`/api/rows/persoon/${gijs}`)
      }
    })

    test('owner-view-key-script @e2e', async ({ page, browser }) => {
      const api = page.request
      await forOwnersOn(api)
      // The declared owner-visible columns, as the administrator's /schema serves them.
      const schema = (await (await api.get('/api/schema')).json()) as {
        sources: Record<string, { columns: Record<string, { owner_visible?: boolean }> }>
      }
      const visibleOf = (source: string): string[] => {
        return Object.entries(schema.sources[source]?.columns ?? {})
          .filter(([, f]) => f.owner_visible)
          .map(([k]) => k)
      }
      const outsider = await stranger(browser)
      try {
        // Bram is an ordinary person: no account, only his link.
        const token = linkToken(await recordLink(api, await idByName(api, 'persoon', 'weergavenaam', 'Bram De Wilde')))
        const headers = { authorization: `RecordLink ${token}` }
        const list = await outsider.request.get(`${API}/owner/views`, { headers })
        expect(list.status()).toBe(200)
        const views = ((await list.json()) as { views: { id: number; source: string; columns: { key: string }[] }[] })
          .views
        expect(views.length).toBeGreaterThan(0)
        for (const view of views) {
          const allowed = visibleOf(view.source)
          expect(allowed.length).toBeGreaterThan(0)
          for (const column of view.columns) expect(allowed).toContain(column.key)
          const read = await outsider.request.get(`${API}/owner/views/${view.id}/rows`, { headers })
          expect(read.status()).toBe(200)
          const body = (await read.json()) as { columns: { key: string }[]; rows: Values[] }
          for (const r of body.rows) for (const key of Object.keys(r)) expect(allowed).toContain(key)
          for (const column of body.columns) expect(allowed).toContain(column.key)
          // A hidden key named in filter, sort or group is refused, not answered.
          for (const q of [
            `filter=${encodeURIComponent(JSON.stringify({ persoon_id: 1 }))}`,
            'sort=persoon_id',
            'group=productie_id',
            `filter=${encodeURIComponent(JSON.stringify({ $or: [{ productie_id: 1 }] }))}`,
          ]) {
            const probe = await outsider.request.get(`${API}/owner/views/${view.id}/rows?${q}`, { headers })
            expect(probe.status(), q).toBe(400)
            expect((await probe.json()).code).toBe('column_not_owner_visible')
          }
        }
        // The link opens its own pages only.
        for (const path of ['/rows/toewijzing', '/schema', '/history/toewijzing', '/views', '/schema?format=openapi']) {
          expect((await outsider.request.get(`${API}${path}`, { headers })).status(), path).toBe(403)
        }
      } finally {
        await outsider.close()
      }
    })

    test('link-request-identical @e2e', async ({ browser }) => {
      const outsider = await stranger(browser)
      try {
        const ask = (email: string) => outsider.request.post(`${API}/record-links/request`, { data: { email } })
        const before = mails()
        const known = await ask('lotte@lantaarn.test')
        const unknown = await ask('niemand@nergens.test')
        const known2 = await ask('LOTTE@lantaarn.test')
        const shape = async (r: Awaited<ReturnType<typeof ask>>) => {
          const { date: _d, ...headers } = r.headers()
          return { status: r.status(), headers, body: (await r.body()).toString('base64') }
        }
        const a = await shape(known)
        expect(await shape(unknown)).toEqual(a)
        expect(await shape(known2)).toEqual(a)
        expect(a.status).toBe(200)
        expect(a.headers['cache-control']).toBe('no-store')
        // Delivery happens after the answer: the known address gets its link, the unknown one nothing.
        const link = await mailedLink('lotte@lantaarn.test', before, 'link')
        expect(link).toMatch(/#\/link\/persoon\.1\.[\w-]{43}$/)
        expect(mailsTo('niemand@nergens.test', before)).toEqual([])
      } finally {
        await outsider.close()
      }
    })
  })

  test('agent-token-write-undo-revoke @e2e', async ({ browser }) => {
    const name = 'e2e-agent-revoke'
    const token = cli('--create-service', name, '--role', 'editor')
    expect(token).toMatch(/^[\w-]{20,}$/)
    const agent = await stranger(browser)
    const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
    try {
      const shared = readFileSync(SERVICE.token, 'utf8').trim()
      expect((await agent.request.get(`${API}/auth/me`, { headers: bearer(shared) })).status()).toBe(200)

      // A write as the service account, logged as it.
      const made = await agent.request.post(`${API}/rows/activiteit`, {
        headers: bearer(token),
        data: {
          productie_id: 2,
          soort: 'repetitie',
          status: 'optie',
          omschrijving: 'e2e door de agent',
          datum: '2028-04-03',
          start_at: '2028-04-03T10:00',
        },
      })
      expect(made.status(), await made.text()).toBe(201)
      const { id } = (await made.json()) as { id: number }
      const revisions = (await (
        await agent.request.get(`${API}/revisions/activiteit/${id}`, { headers: bearer(token) })
      ).json()) as {
        revisions: { batch_id: string | null }[]
      }
      const batch = revisions.revisions[0]?.batch_id as string
      expect(batch).toBeTruthy()
      const history = (await (
        await agent.request.get(`${API}/history/activiteit?filter=${encodeURIComponent(JSON.stringify({ id }))}`, {
          headers: bearer(shared),
        })
      ).json()) as { entries: { record: { id: number }; by: string; actor: string | null }[] }
      expect(history.entries.find((e) => e.record.id === id)).toMatchObject({ by: 'account', actor: name })

      // A lifecycle write from an agent must say what it saw.
      const blind = await agent.request.post(`${API}/rows/toewijzing`, {
        headers: bearer(token),
        data: { activiteit_id: id, naam: 'Agent Gast', state: 'voorlopig' },
      })
      expect(blind.status()).toBe(201)
      const guest = ((await blind.json()) as { id: number }).id
      const noExpect = await agent.request.patch(`${API}/rows/toewijzing/${guest}`, {
        headers: bearer(token),
        data: { state: 'bevestigd' },
      })
      expect(noExpect.status()).toBe(400)
      expect((await noExpect.json()).code).toBe('bad_body')
      await agent.request.delete(`${API}/rows/toewijzing/${guest}`, { headers: bearer(token) })

      // Undone by its batch, by the agent itself.
      const undo = await agent.request.post(`${API}/batches/${batch}/undo`, { headers: bearer(token), data: {} })
      expect(undo.status(), await undo.text()).toBe(200)
      const gone = await agent.request.get(
        `${API}/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ id }))}`,
        {
          headers: bearer(token),
        },
      )
      expect(((await gone.json()) as { rows: unknown[] }).rows).toHaveLength(0)

      // Denied actor: an agent copies no links and shows nothing to owners.
      expect((await agent.request.get(`${API}/record-links/persoon/1`, { headers: bearer(token) })).status()).toBe(403)
      expect(
        (await agent.request.put(`${API}/views/1/for-owners`, { headers: bearer(token), data: {} })).status(),
      ).toBe(403)

      // Rotated: the old token is refused. Disabled: the new one is refused on the next request.
      const rotated = cli('--rotate-service', name)
      const old = await agent.request.get(`${API}/auth/me`, { headers: bearer(token) })
      expect(old.status()).toBe(401)
      expect((await agent.request.get(`${API}/auth/me`, { headers: bearer(rotated) })).status()).toBe(200)
      cli('--disable-service', name)
      const off = await agent.request.post(`${API}/rows/activiteit`, {
        headers: bearer(rotated),
        data: {
          productie_id: 2,
          soort: 'repetitie',
          status: 'optie',
          omschrijving: 'e2e na intrekken',
          datum: '2028-04-03',
        },
      })
      expect(off.status()).toBe(401)
      const after = await agent.request.get(
        `${API}/rows/activiteit?filter=${encodeURIComponent(JSON.stringify({ omschrijving: 'e2e na intrekken' }))}`,
        { headers: bearer(shared) },
      )
      expect(((await after.json()) as { rows: unknown[] }).rows).toHaveLength(0)
    } finally {
      await agent.close()
    }
  })
})
