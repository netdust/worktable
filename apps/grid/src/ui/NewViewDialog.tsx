import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { Grid3x3, Table as TableIcon, UserRound, Users } from 'lucide-react'
import { useId, useState } from 'react'
import { errorText, t } from '../i18n'
import type { ApiError, ViewType } from '../types'

interface Props {
  /** The source's label. */
  source: string
  type: ViewType
  /** The selected space record's title, when the new view's rows are scoped to it. */
  scope: string | null
  /** Rejects with the server's refusal, said in the dialog. */
  onSubmit: (name: string, shared: boolean) => Promise<unknown>
  onClose: () => void
}

const kindOf = (type: ViewType) => (type === 'matrix' ? t('matrix') : t('kindGrid'))

/** A new view of one kind on one source: its name, and whether the team may change it. */
export function NewViewDialog({ source, type, scope, onSubmit, onClose }: Props) {
  const [name, setName] = useState(kindOf(type))
  const [shared, setShared] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const title = useId()
  const field = useId()
  const ready = name.trim() !== '' && !busy
  const Icon = type === 'matrix' ? Grid3x3 : TableIcon

  const submit = () => {
    if (!ready) return
    setBusy(true)
    setRefusal(null)
    onSubmit(name.trim(), shared).then(onClose, (error: ApiError) => {
      setRefusal(errorText(error.code, error.message))
      setBusy(false)
    })
  }

  return (
    <ModalOverlay className="nv-scrim" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <Modal className="nv-dialog">
        <Dialog className="nv-dialog__body" aria-labelledby={title}>
          <form className="nv-dialog__form"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}>
            <h2 id={title} className="nv-dialog__title"><Icon size={16} aria-hidden="true" />{t('newViewOf', { kind: kindOf(type).toLowerCase() })}</h2>
            <div className="nv-dialog__field">
              <label htmlFor={field}>{t('newViewName')}</label>
              <input id={field} className="nv-dialog__input" type="text" value={name} maxLength={80} autoFocus autoComplete="off"
                onFocus={(event) => event.target.select()} onChange={(event) => setName(event.target.value)} />
            </div>
            <fieldset className="nv-dialog__field">
              <legend>{t('whoEdits')}</legend>
              <div className="nv-dialog__choices">
                <label className="nv-dialog__choice">
                  <input type="radio" name="who" checked={shared} onChange={() => setShared(true)} />
                  <Users size={14} aria-hidden="true" />{t('team')}
                </label>
                <label className="nv-dialog__choice">
                  <input type="radio" name="who" checked={!shared} onChange={() => setShared(false)} />
                  <UserRound size={14} aria-hidden="true" />{t('onlyMe')}
                </label>
              </div>
              <p className="nv-dialog__hint">{t(shared ? 'teamHint' : 'onlyMeHint')}</p>
            </fieldset>
            <p className="nv-dialog__hint">
              {t('onSource', { source })}
              {scope !== null && ` · ${t('scopedTo', { scope })}`}
            </p>
            {refusal && <p className="nv-dialog__refusal" role="alert">{refusal}</p>}
            <div className="nv-dialog__actions">
              <Button className="nv-button nv-button--secondary nv-button--sm" type="button" onPress={onClose}>{t('cancel')}</Button>
              <Button className="nv-button nv-button--primary nv-button--sm" type="submit" isDisabled={!ready}>{t('createView')}</Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
