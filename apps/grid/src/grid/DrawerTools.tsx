import { EllipsisVertical, X } from 'lucide-react'
import { useContext, useRef, useState } from 'react'
import { Button, Dialog, Popover } from 'react-aria-components'
import { recordLink as readLink, rotateRecordLink } from '../api'
import { errorText, t } from '../i18n'
import type { ApiError, ModelAction, Row } from '../types'
import { type Action, MoreMenu } from '../ui/MoreMenu'
import { ActionInputs } from './ActionInputs'
import { DrawerWriteContext } from './drawerWrite'
import type { RunAction } from './Drawer'

type Asking = { kind: 'action'; action: ModelAction } | { kind: 'delete' }

interface Props {
  model: string | undefined
  row: Row
  onDone?: () => Promise<Row | null>
  actions: ModelAction[]
  onAction?: RunAction
  recordLink?: string
  onDelete?: () => Promise<void>
  onSaid?: (message: string) => void
}

/** The record's actions in the drawer's head: the primary button in view, everything else behind one menu. */
export function DrawerTools({ model, row, onDone, actions, onAction, recordLink, onDelete, onSaid }: Props) {
  const write = useContext(DrawerWriteContext)
  const [pressing, setPressing] = useState(false)
  const [asking, setAsking] = useState<Asking | null>(null)
  const anchor = useRef<HTMLButtonElement | null>(null)
  if (row.id <= 0) return null
  const leave = () => {
    setAsking(null)
    anchor.current?.focus()
  }
  const buttons = write && onDone && model && row.available ? row.available.buttons : []
  const primary = buttons.find((button) => button.primary)
  const press = (to: string) => {
    if (pressing || !write || !onDone || !model || !row.available) return
    setPressing(true)
    void write.press(model, row.id, row.available, to, onDone).finally(() => setPressing(false))
  }
  const copy = (read: Promise<string>, done: string) =>
    read.then((link) => navigator.clipboard.writeText(link)).then(() => onSaid?.(done), () => onSaid?.(t('recordLinkFailed')))
  const run = (action: ModelAction) => {
    if (Object.keys(action.input).length > 0) return setAsking({ kind: 'action', action })
    void onAction?.(action, {}).catch((error: ApiError) => onSaid?.(errorText(error.code, error.message)))
  }
  const items: Action[] = [
    ...buttons.filter((button) => button !== primary).map((button) => ({ label: button.label, run: () => press(button.to) })),
    ...(onAction ? actions.filter((action) => !row.available || row.available.actions.includes(action.name)).map((action) => ({ label: action.label, run: () => run(action) })) : []),
    ...(recordLink ? [
      { label: t('copyLink'), run: () => void copy(readLink(recordLink, row.id), t('linkCopied')) },
      { label: t('recordLinkNew'), run: () => void copy(rotateRecordLink(recordLink, row.id), t('recordLinkRotated')) },
    ] : []),
    ...(onDelete ? [{ label: t('delete'), tone: 'danger' as const, run: () => setAsking({ kind: 'delete' }) }] : []),
  ]
  return (
    <>
      {primary && <Button className="nv-button nv-button--primary nv-button--sm" isDisabled={pressing} onPress={() => press(primary.to)}>{primary.label}</Button>}
      {items.length > 0 && <MoreMenu actions={items} label={t('recordActions')} icon={EllipsisVertical} menu={t('recordActions')} trigger={anchor} />}
      {asking?.kind === 'action' && (
        // A panel under the head, not an overlay: the pickers inside it open their own, over the page.
        <div className="nv-dw-ask nv-dw-ask--panel" onKeyDown={(event) => {
          const open = event.target instanceof Element && event.target.closest('[aria-expanded="true"]')
          if (event.key !== 'Escape' || open) return
          event.stopPropagation()
          leave()
        }}>
          <Button className="nv-dw-ask__close" aria-label={t('close')} onPress={leave}><X size={14} aria-hidden="true" /></Button>
          <ActionInputs action={asking.action} record={{ ...row.fields, id: row.id }} onRun={(input) => (onAction as RunAction)(asking.action, input).then(() => setAsking(null))} />
        </div>
      )}
      {asking?.kind === 'delete' && (
        <Popover triggerRef={anchor} isOpen onOpenChange={(open) => !open && setAsking(null)} placement="bottom end" offset={4} className="nv-menu__layer">
          <Dialog className="nv-dw-ask" aria-label={t('delete')}>
            <Sure onDelete={() => (onDelete as () => Promise<void>)().finally(() => setAsking(null))} />
          </Dialog>
        </Popover>
      )}
    </>
  )
}

/** The second press of a delete. A double click's second click is not a confirmation. */
function Sure({ onDelete }: { onDelete: () => Promise<unknown> }) {
  const [sent, setSent] = useState(false)
  const clicks = useRef(0)
  const press = () => {
    const double = clicks.current > 1
    clicks.current = 0
    if (sent || double) return
    setSent(true)
    void onDelete().finally(() => setSent(false))
  }
  return (
    <div aria-live="polite" onMouseDownCapture={(event) => { clicks.current = event.detail }}>
      <Button className="nv-button nv-button--destructive nv-button--sm" isDisabled={sent} onPress={press}>{t('deleteConfirm')}</Button>
    </div>
  )
}
