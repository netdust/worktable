import { EllipsisVertical } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Dialog, Popover } from 'react-aria-components'
import { recordLink as readLink, rotateRecordLink } from '../api'
import { t } from '../i18n'
import type { Row } from '../types'
import { type Action, MoreMenu } from '../ui/MoreMenu'

interface Props {
  row: Row
  recordLink?: string
  onDelete?: () => Promise<void>
  onSaid?: (message: string) => void
}

/** The record's own tools in the drawer's head, behind one menu: its link, and delete asked twice. */
export function DrawerTools({ row, recordLink, onDelete, onSaid }: Props) {
  const [asking, setAsking] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  if (row.id <= 0) return null
  const copy = (read: Promise<string>, done: string) =>
    read.then((link) => navigator.clipboard.writeText(link)).then(() => onSaid?.(done), () => onSaid?.(t('recordLinkFailed')))
  const items: Action[] = [
    ...(recordLink ? [
      { label: t('copyLink'), run: () => void copy(readLink(recordLink, row.id), t('linkCopied')) },
      { label: t('recordLinkNew'), run: () => void copy(rotateRecordLink(recordLink, row.id), t('recordLinkRotated')) },
    ] : []),
    ...(onDelete ? [{ label: t('delete'), tone: 'danger' as const, run: () => setAsking(true) }] : []),
  ]
  return (
    <>
      {items.length > 0 && <MoreMenu actions={items} label={t('recordActions')} icon={EllipsisVertical} menu={t('recordActions')} trigger={anchor} />}
      {asking && (
        <Popover triggerRef={anchor} isOpen onOpenChange={(open) => !open && setAsking(false)} placement="bottom end" offset={4} className="nv-menu__layer">
          <Dialog className="nv-dw-ask" aria-label={t('delete')}>
            <Sure onDelete={() => (onDelete as () => Promise<void>)().finally(() => setAsking(false))} />
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
