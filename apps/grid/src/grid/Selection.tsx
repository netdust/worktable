import { Button } from 'react-aria-components'
import { useEffect, useMemo, useRef, useState } from 'react'
import { errorText, t } from '../i18n'
import type { ApiError, ModelAction } from '../types'
import { type Action, MoreMenu } from '../ui/MoreMenu'
import { ActionInputs } from './ActionInputs'
import { AskPanel } from './AskPanel'
import { measureLine, useFitting } from './fit'

/** The engine's cap on one run; the same number there. */
export const MAX_SELECTION = 500

export interface Selection {
  selected: ReadonlySet<number>
  toggle(id: number): void
  all(): void
  clear(): void
}

/** The ticked rows, kept to the rows the view still shows: a row that leaves the view leaves the selection. */
export function useSelection(rowIds: number[]): Selection {
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set())
  const key = rowIds.join()
  const selected = useMemo(() => {
    const shown = new Set(rowIds)
    return new Set([...ticked].filter((id) => shown.has(id)))
  }, [ticked, key])
  useEffect(() => {
    if (selected.size !== ticked.size) setTicked(selected)
  }, [selected])
  return {
    selected,
    toggle: (id) => setTicked((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    }),
    all: () => setTicked(new Set(rowIds)),
    clear: () => setTicked(new Set()),
  }
}

/** Counts the times a row joined the ticked set; a row leaving it counts nothing. */
function useJoined(picked?: ReadonlySet<number>): number {
  const [joined, setJoined] = useState(0)
  const seen = useRef<ReadonlySet<number>>(new Set())
  useEffect(() => {
    if (picked && [...picked].some((id) => !seen.current.has(id))) setJoined((n) => n + 1)
    seen.current = picked ?? new Set()
  }, [picked])
  return joined
}

/** An action that skips misfits is refused its condition only when none of the ticked rows fits. */
const refusalOf = (action: ModelAction) => (error: ApiError): string =>
  action.skips && error.code === 'condition_not_met' ? t('selectionNoneFits') : errorText(error.code, error.message)

const measureActions = (line: HTMLElement) => measureLine(line, ':scope > .nv-selection__item')
const roomOf = (line: HTMLElement) => line.closest<HTMLElement>('.nv-dock, .nv-frame') ?? line

/** A panel floating over the foot of the sheet while rows are ticked: the count, the selection actions on one line with what does not fit behind Meer, and the way out. */
export function SelectionBar({ count, picked, actions, misfits, onRun, onClear }: {
  count: number
  /** The ticked ids: a refusal holds for fewer rows, and goes when another row joins. */
  picked?: ReadonlySet<number>
  actions: ModelAction[]
  /** How many ticked rows an action does not apply to, by the marks the server put on them. */
  misfits?: (action: ModelAction) => number
  onRun: (action: ModelAction, input: Record<string, unknown>) => Promise<unknown>
  onClear: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<ModelAction | null>(null)
  const [refused, setRefused] = useState('')
  // What each picker's button reads now: a longer label is a wider action.
  const [labels, setLabels] = useState<Record<string, string>>({})
  const line = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement | null>(null)
  const joined = useJoined(picked)
  const over = count > MAX_SELECTION
  const misfitOf = (action: ModelAction) => misfits?.(action) ?? 0
  const signature = [count, over, ...actions.map((action) => `${action.name}:${misfitOf(action)}`), ...Object.entries(labels).map(([key, title]) => `${key}=${title}`)].join('|')
  // The line's own width follows what it shows, so the room it watches is the dock's.
  const shown = useFitting({ line, signature, primary: false, measure: measureActions, present: count > 0, watched: roomOf })
  useEffect(() => setRefused(''), [joined])
  // Another selection asks afresh: no panel stays open from the last one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the ticked set changing is the signal.
  useEffect(() => setAsking(null), [picked, count])
  useEffect(() => {
    if (count === 0) setLabels({})
  }, [count])
  if (count === 0) return null
  const run = (action: ModelAction, input: Record<string, unknown>) => {
    setBusy(true)
    setRefused('')
    return onRun(action, input).finally(() => setBusy(false))
  }
  const runFolded = (action: ModelAction) => {
    if (busy) return
    if (Object.keys(action.input).length > 0) return setAsking(action)
    run(action, {}).catch((error: ApiError) => setRefused(refusalOf(action)(error)))
  }
  const visible = shown === null ? actions.length : shown
  const folded: Action[] = actions.slice(visible).map((action) => {
    const misfit = misfitOf(action)
    return { label: action.label, run: () => runFolded(action), blocked: over ? t('selectionMax', { max: MAX_SELECTION }) : misfit > 0 ? t('selectionMisfit', { n: misfit }) : busy ? t('selectionBusy') : undefined }
  })
  const leave = () => {
    setAsking(null)
    more.current?.focus()
  }
  const pickedIn = (action: ModelAction) => (key: string, title: string) => setLabels((was) => ({ ...was, [`${action.name}.${key}`]: title }))
  return (
    <div className="nv-selection nv-selection--floating" role="region" aria-label={t('selectedCount', { n: count })}>
      <span className="nv-selection__count">{t('selectedCount', { n: count })}</span>
      <div className="nv-selection__actions" ref={line}>
        {actions.slice(0, visible).map((action) => {
          const misfit = misfitOf(action)
          return (
            <span key={action.name} className="nv-selection__item">
              <ActionInputs action={action} staleOn={joined} disabled={over || busy || misfit > 0} onRun={(input) => run(action, input)} onPicked={pickedIn(action)} refusalOf={refusalOf(action)} />
              {misfit > 0 && <span className="nv-selection__max" title={action.label}>{t('selectionMisfit', { n: misfit })}</span>}
            </span>
          )
        })}
        {folded.length > 0 && <MoreMenu actions={folded} label={t('moreInRow')} menu={t('moreInRow')} placement="bottom-end" trigger={more} />}
      </div>
      {asking && (
        <AskPanel key={asking.name} className="nv-selection__ask" onLeave={leave}>
          <ActionInputs action={asking} staleOn={joined} disabled={over || busy || misfitOf(asking) > 0} onRun={(input) => run(asking, input).then(() => setAsking(null))} onPicked={pickedIn(asking)} refusalOf={refusalOf(asking)} />
        </AskPanel>
      )}
      {over && <span className="nv-selection__max" role="alert">{t('selectionMax', { max: MAX_SELECTION })}</span>}
      {refused && <p className="nv-action__refused" role="alert">{refused}</p>}
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={onClear}>{t('selectionClear')}</Button>
    </div>
  )
}
