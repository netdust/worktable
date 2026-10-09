import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { Share2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { type Action, MoreMenu } from './MoreMenu'

interface Publish {
  /** The view is public already: a new link stops the old one, so it is asked first. */
  isPublic: boolean
  /** Makes the view public and answers its token. */
  run: () => Promise<string>
}

interface Props {
  onExcel?: () => void
  /** Why Excel is off, said under it. */
  excelBlocked?: string
  /** Absent on a view without dates. */
  onIcs?: () => void
  /** The address with the view and its conditions, composed at the click. */
  link: () => string
  onCopied: () => void
  /** For an administrator only. */
  publish?: Publish
}

type Step = { step: 'ask' } | { step: 'busy' } | { step: 'done'; address: string } | { step: 'refused'; message: string }

const publicAddress = (token: string) => `${window.location.origin}/api/public/views/${token}`

const refusal = (error: unknown): string => {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  return code === 'not_query' ? t('publishQueryOnly') : message || t('publishFailed')
}

/** Exporteren / delen: Excel, a calendar, the link to this view, and its public address. */
export function Share({ onExcel, excelBlocked, onIcs, link, onCopied, publish }: Props) {
  const [dialog, setDialog] = useState<Step | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closing = useRef(false)
  const close = () => {
    closing.current = true
    setDialog(null)
  }
  // The menu item that opened the dialog is gone, so focus goes back to the menu's button.
  useEffect(() => {
    if (dialog || !closing.current) return
    closing.current = false
    trigger.current?.focus()
  }, [dialog])
  const copy = (text: string) => navigator.clipboard.writeText(text).then(onCopied, () => undefined)
  const go = () => {
    if (!publish) return
    setDialog({ step: 'busy' })
    publish.run().then(
      (token) => setDialog({ step: 'done', address: publicAddress(token) }),
      (error) => setDialog({ step: 'refused', message: refusal(error) }),
    )
  }
  const actions: Action[] = [
    { label: t('excel'), run: () => onExcel?.(), blocked: excelBlocked },
    ...(onIcs ? [{ label: t('calendar'), run: onIcs }] : []),
    { label: t('copyLink'), run: () => void copy(link()) },
    ...(publish ? [{ label: t('publish'), run: () => (publish.isPublic ? setDialog({ step: 'ask' }) : go()) }] : []),
  ]
  return (
    <>
      <MoreMenu actions={actions} icon={Share2} label={t('shareMenu')} menu={t('shareMenu')} trigger={trigger} />
      {dialog && (
        <ModalOverlay className="nv-share-over" isOpen onOpenChange={(open) => !open && close()}>
          <Modal>
            <Dialog className="nv-share" aria-label={t('publish')}>
              <button type="button" className="nv-share__close" aria-label={t('close')} title={t('close')} onClick={close}>
                <X size={14} aria-hidden="true" />
              </button>
              {dialog.step === 'ask' && (
                <>
                  <p>{t('publishAgain')}</p>
                  <div className="nv-share__actions">
                    <Button className="nv-button nv-button--ghost nv-button--sm" onPress={close}>{t('cancel')}</Button>
                    <Button className="nv-button nv-button--primary nv-button--sm" onPress={go}>{t('publishNew')}</Button>
                  </div>
                </>
              )}
              {dialog.step === 'busy' && <p>{t('publishing')}</p>}
              {dialog.step === 'refused' && <p role="alert">{dialog.message}</p>}
              {dialog.step === 'done' && (
                <>
                  <p>{t('publishedOnce')}</p>
                  <div className="nv-share__address">
                    <textarea readOnly rows={2} aria-label={t('publicAddress')} value={dialog.address} onFocus={(event) => event.target.select()} />
                    <Button className="nv-button nv-button--secondary nv-button--sm" onPress={() => void copy(dialog.address)}>{t('copy')}</Button>
                  </div>
                </>
              )}
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  )
}
