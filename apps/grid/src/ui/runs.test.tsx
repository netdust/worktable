import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderNl } from '../test-setup'
import type { Model, Row } from '../types'

const remote = vi.hoisted(() => ({ rowOf: vi.fn() }))
vi.mock('../api', () => remote)
const { Dock, RunsContext, useRunFollower } = await import('./runs')
type Runs = ReturnType<typeof useRunFollower>

const job = {
  key: 'job', label: 'Job', title_label: 'Titel', title_readonly: false, lifecycle: 'state', live: ['busy', 'wait'],
  fields: { state: { type: 'select', label: 'Stand', required: false, fact: true, options: { busy: 'Bezig', wait: 'Voorbereid', done: 'Klaar', failed: 'Mislukt' }, tones: { failed: 'bad' } } },
} as unknown as Model
const plain = { key: 'note', label: 'Notitie', title_label: 'Titel', title_readonly: false, fields: {} } as unknown as Model

const cancel = { to: 'cancelled', label: 'Annuleren' }
const confirm = { to: 'ok', label: 'Bevestigen', primary: true as const }
const at = (state: string, buttons: { to: string; label: string; primary?: true }[] = []): Row => ({
  id: 1, title: 'Import', status: '', fields: { state }, available: { state, buttons, actions: [] },
})
const run = (acted: { model: string; ids: number[] } | null = null) => ({ label: 'Gezondheid checken', dataset: 'job', id: 1, acted })

const notify = vi.fn()
const show = vi.fn(() => true)
let runs!: Runs
function Harness() {
  runs = useRunFollower({ job, note: plain }, { notify, show })
  return <RunsContext.Provider value={runs}><Dock onSlot={() => undefined} /></RunsContext.Provider>
}
const start = (row: Row, acted: { model: string; ids: number[] } | null = null) => {
  let started = false
  act(() => { started = runs.follow(run(acted), row) })
  return started
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  renderNl(<Harness />)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  remote.rowOf.mockReset()
  notify.mockReset()
  show.mockReset()
})

describe('following a record an outside process holds', () => {
  it('shows the action and the state with a busy indicator while the record is live', () => {
    expect(start(at('busy'))).toBe(true)
    const line = screen.getByRole('region', { name: 'Gezondheid checken · Bezig' })
    expect(line.getAttribute('aria-busy')).toBe('true')
  })

  it('announces its lines politely: the region is there before the first line', () => {
    const region = document.querySelector('.nv-runs')

    expect(region?.getAttribute('aria-live')).toBe('polite')
    start(at('busy'))
    expect(document.querySelectorAll('.nv-runs')).toHaveLength(1)
    expect(region?.querySelector('[role="region"]')).not.toBeNull()
  })

  it('never starts for a record outside a live state, or of a model with no lifecycle', async () => {
    expect(start(at('done'))).toBe(false)
    act(() => { expect(runs.follow({ ...run(), dataset: 'note' }, at('busy'))).toBe(false) })
    await tick(30_000)
    expect(screen.queryByRole('region')).toBeNull()
    expect(remote.rowOf).not.toHaveBeenCalled()
  })

  it('keeps running while the only button offered is a non-primary one', async () => {
    remote.rowOf.mockResolvedValue(at('busy', [cancel]))
    start(at('busy'))
    await tick(3100)
    expect(runs.ended).toBe(0)
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Bezig' }).getAttribute('aria-busy')).toBe('true')
  })

  it('ends as waiting on a primary button: ended rises once, and the line opens the record', async () => {
    remote.rowOf.mockResolvedValue(at('wait', [confirm, cancel]))
    start(at('busy'))
    await tick(3100)
    expect(runs.ended).toBe(1)
    await tick(30_000)
    expect(runs.ended).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Gezondheid checken · Voorbereid — openen' }))
    expect(show).toHaveBeenCalledWith('job')
    expect(runs.opening).toEqual({ dataset: 'job', id: 1 })
    // The line goes only once a screen has opened the record.
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Voorbereid — openen' })).toBeTruthy()
    act(() => runs.settled())
    expect(runs.opening).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('keeps the line and opens nothing where no screen can show the record, and clears an opening nobody takes', async () => {
    remote.rowOf.mockResolvedValue(at('wait', [confirm]))
    start(at('busy'))
    await tick(3100)
    show.mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Gezondheid checken · Voorbereid — openen' }))
    expect(runs.opening).toBeNull()
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Voorbereid — openen' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Gezondheid checken · Voorbereid — openen' }))
    expect(runs.opening).toEqual({ dataset: 'job', id: 1 })
    await tick(5100)
    expect(runs.opening).toBeNull()
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Voorbereid — openen' })).toBeTruthy()
  })

  it('leaving the live states bumps ended once and shows the final state for 6 s', async () => {
    remote.rowOf.mockResolvedValue(at('done'))
    start(at('busy'))
    await tick(3100)
    expect(runs.ended).toBe(1)
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Klaar' }).getAttribute('aria-busy')).toBe('false')
    await tick(6100)
    expect(screen.queryByRole('region')).toBeNull()
    expect(runs.ended).toBe(1)
  })

  it('a bad final state stays until dismissed', async () => {
    remote.rowOf.mockResolvedValue(at('failed'))
    start(at('busy'))
    await tick(3100)
    await tick(60_000)
    expect(screen.getByRole('region', { name: 'Gezondheid checken · Mislukt' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Negeren' }))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('marks the rows it acted on while it runs, and no longer after', async () => {
    remote.rowOf.mockResolvedValue(at('done'))
    start(at('busy'), { model: 'site', ids: [4, 5] })
    expect([...runs.running].sort()).toEqual(['site:4', 'site:5'])
    await tick(3100)
    expect(runs.running.size).toBe(0)
  })

  it('backs off to 15 s after three errors', async () => {
    remote.rowOf.mockRejectedValue({ code: 'boom', message: 'x', status: 500 })
    start(at('busy'))
    await tick(9100)
    expect(remote.rowOf).toHaveBeenCalledTimes(3)
    await tick(3000)
    expect(remote.rowOf).toHaveBeenCalledTimes(3)
    await tick(12_000)
    expect(remote.rowOf).toHaveBeenCalledTimes(4)
  })

  it('stops on a 404 and drops the line', async () => {
    remote.rowOf.mockRejectedValue({ code: 'not_found', message: 'x', status: 404 })
    start(at('busy'))
    await tick(3100)
    await tick(30_000)
    expect(remote.rowOf).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('follows at most 20 records, the oldest dropping first', () => {
    for (let id = 1; id <= 21; id++) act(() => { runs.follow({ ...run(), id }, { ...at('busy'), id }) })
    expect(screen.getAllByRole('region')).toHaveLength(20)
  })
})

describe('a plain create', () => {
  it('is followed and says aangevraagd when it starts in a live state', () => {
    act(() => runs.created('job', at('busy')))
    expect(notify).toHaveBeenCalledWith({ message: 'Import aangevraagd.' })
    expect(screen.getByRole('region', { name: 'Import · Bezig' })).toBeTruthy()
  })

  it('is not followed outside a live state', () => {
    act(() => runs.created('job', at('done')))
    act(() => runs.created('note', at('busy')))
    expect(notify).not.toHaveBeenCalled()
    expect(screen.queryByRole('region')).toBeNull()
  })
})
