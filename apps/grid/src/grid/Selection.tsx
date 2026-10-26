import { Button } from 'react-aria-components'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n'
import type { ModelAction } from '../types'
import { ActionInputs } from './ActionInputs'

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

/** A panel floating over the foot of the sheet while rows are ticked: the count, one button per selection action, and the way out. */
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
  const joined = useJoined(picked)
  const over = count > MAX_SELECTION
  if (count === 0) return null
  const run = (action: ModelAction, input: Record<string, unknown>) => {
    setBusy(true)
    return onRun(action, input).finally(() => setBusy(false))
  }
  return (
    <div className="nv-selection nv-selection--floating" role="region" aria-label={t('selectedCount', { n: count })}>
      <span className="nv-selection__count">{t('selectedCount', { n: count })}</span>
      {actions.map((action) => {
        const misfit = misfits?.(action) ?? 0
        return (
          <Fragment key={action.name}>
            <ActionInputs action={action} staleOn={joined} disabled={over || busy || misfit > 0} onRun={(input) => run(action, input)} />
            {misfit > 0 && <span className="nv-selection__max" title={action.label}>{t('selectionMisfit', { n: misfit })}</span>}
          </Fragment>
        )
      })}
      {over && <span className="nv-selection__max" role="alert">{t('selectionMax', { max: MAX_SELECTION })}</span>}
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={onClear}>{t('selectionClear')}</Button>
    </div>
  )
}
