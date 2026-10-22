import { Button } from 'react-aria-components'
import { useEffect, useMemo, useState } from 'react'
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

/** Above the grid while rows are ticked: the count, one button per selection action, and the way out. */
export function SelectionBar({ count, actions, onRun, onClear }: {
  count: number
  actions: ModelAction[]
  onRun: (action: ModelAction, input: Record<string, unknown>) => Promise<void>
  onClear: () => void
}) {
  const over = count > MAX_SELECTION
  return (
    <div className="nv-selection" role="region" aria-label={t('selectedCount', { n: count })}>
      <span className="nv-selection__count">{t('selectedCount', { n: count })}</span>
      {actions.map((action) => <ActionInputs key={action.name} action={action} disabled={over} onRun={(input) => onRun(action, input)} />)}
      {over && <span className="nv-selection__max" role="alert">{t('selectionMax')}</span>}
      <Button className="nv-button nv-button--secondary nv-button--sm" onPress={onClear}>{t('selectionClear')}</Button>
    </div>
  )
}
