import { LoaderCircle, X } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { rowOf } from '../api'
import { BACKED_OFF, EVERY, ERRORS, REFUSED, waiting } from '../grid/useLive'
import { t } from '../i18n'
import type { ApiError, Model, Opened, Row, Tone } from '../types'
import type { Notice } from './Toast'

const FOLLOWED = 20
const SHOWN_FOR = 6000
const OPENING_WAIT = 5000
/** The newest lines the dock shows: more would cover the table; the rest fold into one count. */
const VISIBLE = 3

/** What a follow is for: the action's label, the record it made, and the rows it acted on. */
export interface Run {
  label: string
  dataset: string
  id: number
  acted: { model: string; ids: number[] } | null
}

type Phase = 'running' | 'waiting' | 'done'

interface Line {
  key: string
  run: Run
  state: string
  tone: Tone | undefined
  phase: Phase
}

export interface Runs {
  /** Starts following a record just made; false, and nothing followed, outside a live state. */
  follow(run: Run, row: Row): boolean
  /** A record made by a plain create: followed, and said so. */
  created(dataset: string, row: Row): void
  /** Counts every follow that ended: the places that show the records read them again on it. */
  ended: number
  /** `"<model>:<id>"` of the rows an action acted on that is still running. */
  running: ReadonlySet<string>
  lines: readonly Line[]
  dismiss(key: string): void
  /** Asks the screen to open a record; the screen that can answers with `settled`. */
  open(dataset: string, id: number): void
  opening: Opened | null
  settled(): void
}

const idle: Runs = {
  follow: () => false, created: () => undefined, ended: 0, running: new Set(), lines: [],
  dismiss: () => undefined, open: () => undefined, opening: null, settled: () => undefined,
}

export const RunsContext = createContext<Runs>(idle)
export const useRuns = (): Runs => useContext(RunsContext)

/** Where the grid puts its selection panel, above the run lines. */
export const DockSlot = createContext<HTMLElement | null>(null)
/** Where the toast goes while the dock shows: above everything else in it, so none overlaps. */
export const ToastSlot = createContext<HTMLElement | null>(null)

const keyOf = (dataset: string, id: number) => `${dataset}:${id}`

function stateOf(model: Model, row: Row): { state: string; tone: Tone | undefined; live: boolean } {
  const column = model.lifecycle as string
  const value = String(row.fields[column] ?? '')
  const field = model.fields[column]
  return { state: field?.options?.[value] ?? value, tone: field?.tones?.[value], live: model.live?.includes(value) === true }
}

const phaseOf = (live: boolean, row: Row): Phase => (!live ? 'done' : waiting(row) ? 'waiting' : 'running')

/** Follows the records this browser made in a live state until they leave it, wherever the viewer goes meanwhile. */
/** `show` answers whether a screen can show a record of that dataset (it moves to one that can); false opens nothing. */
export function useRunFollower(models: Record<string, Model>, host: { notify: (notice: Notice) => void; show: (dataset: string) => boolean }): Runs {
  const [lines, setLines] = useState<Line[]>([])
  const [ended, setEnded] = useState(0)
  const [opening, setOpening] = useState<Opened | null>(null)
  const loops = useRef(new Map<string, () => void>())
  const latest = useRef({ models, host })
  latest.current = { models, host }

  const forget = useCallback((key: string) => {
    loops.current.get(key)?.()
    loops.current.delete(key)
    setLines((was) => was.filter((line) => line.key !== key))
  }, [])

  const finish = useCallback((key: string, row: Row | null) => {
    loops.current.delete(key)
    setEnded((n) => n + 1)
    if (!row) return setLines((was) => was.filter((line) => line.key !== key))
    let phase: Phase = 'done'
    let tone: Tone | undefined
    setLines((was) => was.map((line) => {
      if (line.key !== key) return line
      const model = latest.current.models[line.run.dataset]
      const read = model ? stateOf(model, row) : null
      phase = read ? phaseOf(read.live, row) : 'done'
      tone = read?.tone
      return { ...line, state: read?.state ?? line.state, tone, phase }
    }))
    // Setters run lazily; a bad end or a wait stays for the viewer, any other end goes by itself.
    setTimeout(() => {
      if (phase === 'done' && tone !== 'bad') setLines((was) => was.filter((line) => line.key !== key))
    }, SHOWN_FOR)
  }, [])

  const poll = useCallback((key: string, run: Run) => {
    let stopped = false
    let errors = 0
    let timer: ReturnType<typeof setTimeout>
    const wait = () => {
      timer = setTimeout(read, errors >= ERRORS ? BACKED_OFF : EVERY)
    }
    async function read() {
      try {
        const found = await rowOf(run.dataset, run.id)
        if (stopped) return
        const model = latest.current.models[run.dataset]
        if (!found || !model) return finish(key, null)
        const now = stateOf(model, found)
        if (phaseOf(now.live, found) !== 'running') return finish(key, found)
        setLines((was) => was.map((line) => (line.key === key ? { ...line, state: now.state, tone: now.tone } : line)))
        errors = 0
      } catch (error) {
        if (stopped) return
        if (REFUSED.has((error as ApiError).status ?? 0)) return finish(key, null)
        errors += 1
      }
      wait()
    }
    loops.current.get(key)?.()
    loops.current.set(key, () => {
      stopped = true
      clearTimeout(timer)
    })
    wait()
  }, [finish])

  const follow = useCallback((run: Run, row: Row): boolean => {
    const model = latest.current.models[run.dataset]
    if (!model?.lifecycle || !model.live) return false
    const now = stateOf(model, row)
    if (!now.live) return false
    const key = keyOf(run.dataset, run.id)
    setLines((was) => {
      const next = [...was.filter((line) => line.key !== key), { key, run, state: now.state, tone: now.tone, phase: 'running' as Phase }]
      for (const dropped of next.splice(0, Math.max(0, next.length - FOLLOWED))) {
        loops.current.get(dropped.key)?.()
        loops.current.delete(dropped.key)
      }
      return next
    })
    poll(key, run)
    return true
  }, [poll])

  const created = useCallback((dataset: string, row: Row) => {
    if (follow({ label: row.title, dataset, id: row.id, acted: null }, row)) latest.current.host.notify({ message: t('createdRequested', { title: row.title }) })
  }, [follow])

  const open = useCallback((dataset: string, id: number) => {
    if (latest.current.host.show(dataset)) setOpening({ dataset, id })
  }, [])

  // A request no screen took is dropped, so it never opens a drawer on some later screen.
  useEffect(() => {
    if (!opening) return
    const timer = setTimeout(() => setOpening(null), OPENING_WAIT)
    return () => clearTimeout(timer)
  }, [opening])

  useEffect(() => () => {
    for (const stop of loops.current.values()) stop()
    loops.current.clear()
  }, [])

  const running = useMemo(() => new Set(lines.filter((line) => line.phase === 'running').flatMap((line) => (line.run.acted?.ids ?? []).map((id) => keyOf(line.run.acted?.model ?? '', id)))), [lines])
  const asked = useRef<Opened | null>(null)
  asked.current = opening
  // A screen opened the record: the line that asked for it has done its job.
  const settled = useCallback(() => {
    if (asked.current) forget(keyOf(asked.current.dataset, asked.current.id))
    setOpening(null)
  }, [forget])
  return useMemo(() => ({ follow, created, ended, running, lines, dismiss: forget, open, opening, settled }), [follow, created, ended, running, lines, forget, open, opening, settled])
}

function RunLines() {
  const { lines, dismiss, open } = useRuns()
  const shown = lines.slice(-VISIBLE)
  const more = lines.length - shown.length
  // Always there, so a screen reader hears a line that arrives in it.
  return (
    <div className="nv-runs" aria-live="polite">
      {more > 0 && <div className="nv-run nv-run--more">{t('runsMore', { n: more })}</div>}
      {shown.map((line) => {
        const text = t(line.phase === 'waiting' ? 'runWaiting' : line.phase === 'running' ? 'runBusy' : 'runDone', { action: line.run.label, state: line.state })
        return (
          <section key={line.key} className="nv-run" role="region" aria-label={text} aria-busy={line.phase === 'running'} data-phase={line.phase} data-tone={line.tone}>
            {line.phase === 'running' && <LoaderCircle className="nv-run__spin" size={14} aria-hidden="true" />}
            {line.phase === 'waiting'
              ? <button type="button" className="nv-run__open" onClick={() => open(line.run.dataset, line.run.id)}>{text}</button>
              : <span>{text}</span>}
            <button type="button" className="nv-run__close" aria-label={t('dismiss')} onClick={() => dismiss(line.key)}><X size={14} aria-hidden="true" /></button>
          </section>
        )
      })}
    </div>
  )
}

/** The bottom of the work column: the toast, then the grid's selection panel, then the lines of running requests. */
export function Dock({ onSlot, onToast }: { onSlot: (slot: HTMLElement | null) => void; onToast?: (slot: HTMLElement | null) => void }): ReactNode {
  const dock = useRef<HTMLDivElement>(null)
  // The table keeps room under whatever the dock holds, as measured.
  useEffect(() => {
    const el = dock.current
    const sheet = el?.parentElement
    if (!el || !sheet) return
    const measure = () => sheet.style.setProperty('--nv-dock-h', `${el.offsetHeight}px`)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => {
      watch.disconnect()
      sheet.style.removeProperty('--nv-dock-h')
    }
  }, [])
  return (
    <div className="nv-dock" ref={dock}>
      <div className="nv-dock__panel" ref={onToast} data-react-aria-top-layer />
      <div className="nv-dock__panel" ref={onSlot} />
      <RunLines />
    </div>
  )
}
