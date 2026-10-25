import { X } from 'lucide-react'
import { type RefObject, useContext, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { errorText, t } from '../i18n'
import type { ApiError, ModelAction, Row } from '../types'
import { type Action, MoreMenu } from '../ui/MoreMenu'
import { ActionInputs } from './ActionInputs'
import { DrawerWriteContext } from './drawerWrite'
import type { RunAction } from './Drawer'

const GAP = 8
const MORE = 40

interface Item {
  key: string
  label: string
  primary: boolean
  run: () => void
}

interface Measure {
  room: number
  widths: number[]
}

/** Reads the row's room and each button's width from the layout; tests hand in their own. */
function measureRow(row: HTMLElement): Measure {
  const buttons = [...row.querySelectorAll<HTMLElement>(':scope > .nv-button')]
  return { room: row.clientWidth, widths: buttons.map((button) => button.offsetWidth) }
}

/** How many of the buttons fit before the row needs a Meer menu; the first, a primary, never folds. */
export function fitting({ room, widths }: Measure, primary: boolean): number {
  if (room === 0) return widths.length
  const all = widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1)
  if (all <= room) return widths.length
  let used = MORE
  let shown = 0
  for (const width of widths) {
    if (used + GAP + width > room && !(primary && shown === 0)) break
    used += GAP + width
    shown += 1
  }
  return shown
}

interface Props {
  model: string | undefined
  row: Row
  onDone?: () => Promise<Row | null>
  actions: ModelAction[]
  onAction?: RunAction
  onSaid?: (message: string) => void
  measure?: (row: HTMLElement) => Measure
}

/** A record's lifecycle buttons and declared actions as one line in the drawer's body: the primary filled and first, the rest quiet, what does not fit behind Meer. */
export function ActionRow({ model, row, onDone, actions, onAction, onSaid, measure = measureRow }: Props) {
  const write = useContext(DrawerWriteContext)
  const [pressing, setPressing] = useState(false)
  const [asking, setAsking] = useState<ModelAction | null>(null)
  const [shown, setShown] = useState<number | null>(null)
  const line = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<string, HTMLElement>())
  const more = useRef<HTMLButtonElement | null>(null)

  const press = (to: string) => {
    if (pressing || !write || !onDone || !model || !row.available) return
    setPressing(true)
    void write.press(model, row.id, row.available, to, onDone).finally(() => setPressing(false))
  }
  const run = (action: ModelAction) => {
    if (Object.keys(action.input).length > 0) return setAsking(action)
    void onAction?.(action, {}).catch((error: ApiError) => onSaid?.(errorText(error.code, error.message)))
  }
  const marked = write && onDone && model && row.available ? row.available.buttons : []
  const items: Item[] = [
    ...[...marked].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary))).map((button) => ({ key: `to:${button.to}`, label: button.label, primary: Boolean(button.primary), run: () => press(button.to) })),
    ...(onAction ? actions.filter((action) => !row.available || row.available.actions.includes(action.name)).map((action) => ({ key: `action:${action.name}`, label: action.label, primary: false, run: () => run(action) })) : []),
  ]
  const signature = items.map((item) => item.key).join('|')

  // The first pass shows every button to read its width; the second keeps what fits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the buttons change with the record or its marks, and with nothing else.
  useLayoutEffect(() => setShown(null), [signature, row.id])
  useLayoutEffect(() => {
    if (shown !== null || !line.current) return
    setShown(fitting(measure(line.current), items[0]?.primary ?? false))
  }, [shown, items, measure])
  useLayoutEffect(() => {
    const element = line.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let width = element.clientWidth
    const watch = new ResizeObserver(() => {
      if (element.clientWidth !== width) setShown(null)
      width = element.clientWidth
    })
    watch.observe(element)
    return () => watch.disconnect()
  }, [])
  // The inputs panel opens under the row: the keyboard follows it to its first input.
  useLayoutEffect(() => {
    if (asking) panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.nv-dw-ask__close)')?.focus()
  }, [asking])

  if (row.id <= 0 || items.length === 0) return null
  const visible = shown === null ? items.length : shown
  const folded = items.slice(visible)
  const leave = () => {
    const key = asking ? `action:${asking.name}` : ''
    setAsking(null)
    const back = buttons.current.get(key) ?? more.current
    back?.focus()
  }
  const menu: Action[] = folded.map((item) => ({ label: item.label, run: item.run }))
  return (
    <div className="nv-dw-actions">
      <div className="nv-dw-actions__row" ref={line}>
        {items.slice(0, visible).map((item) => (
          <Button key={item.key} ref={(element) => { if (element) buttons.current.set(item.key, element); else buttons.current.delete(item.key) }}
            className={`nv-button nv-button--${item.primary ? 'primary' : 'secondary'} nv-button--sm`} isDisabled={pressing} onPress={item.run}>{item.label}</Button>
        ))}
        {folded.length > 0 && <MoreMenu actions={menu} label={t('moreInRow')} menu={t('moreInRow')} trigger={more as RefObject<HTMLButtonElement | null>} />}
      </div>
      {asking && (
        <div ref={panel} className="nv-dw-ask nv-dw-ask--inline" onKeyDown={(event) => {
          // Typing here is typing here: the drawer's keys (↑ ↓ j k step to another record) never see it.
          if (event.key !== 'Escape') return event.stopPropagation()
          const open = event.target instanceof Element && event.target.closest('[aria-expanded="true"]')
          if (open) return
          event.stopPropagation()
          leave()
        }}>
          <Button className="nv-dw-ask__close" aria-label={t('close')} onPress={leave}><X size={14} aria-hidden="true" /></Button>
          <ActionInputs action={asking} record={{ ...row.fields, id: row.id }} onRun={(input) => (onAction as RunAction)(asking, input).then(() => setAsking(null))} />
        </div>
      )}
    </div>
  )
}
