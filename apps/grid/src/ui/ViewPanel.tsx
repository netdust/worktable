import { Button } from '@sakaniui/react'
import { useId, useState } from 'react'
import { errorText, t } from '../i18n'
import type { ApiError, ViewType } from '../types'
import { SidePanel } from './SidePanel'

interface Props {
  label: string
  /** The view's type, kept by the new one. */
  type: ViewType
  /** Rejects with the server's refusal, said in the panel. */
  onSubmit: (name: string, type: ViewType) => Promise<unknown>
  onClose: () => void
}

/** A view saved as a new one: its name. Opens beside the sheet, never as a popover (V21). */
export function ViewPanel({ label, type, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const field = useId()
  const ready = name.trim() !== '' && !busy

  const submit = () => {
    if (!ready) return
    setBusy(true)
    setRefusal(null)
    onSubmit(name.trim(), type).catch((error: ApiError) => {
      setRefusal(errorText(error.code, error.message))
      setBusy(false)
    })
  }

  return (
    <SidePanel label={label} onClose={onClose} focusOnOpen={false}>
      <form className="nv-panel nv-viewpanel" onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}>
        <label className="nv-viewpanel__field" htmlFor={field}>{t('viewName')}</label>
        <input id={field} className="nv-viewpanel__name" type="text" value={name} maxLength={80} autoFocus autoComplete="off"
          onChange={(event) => setName(event.target.value)} />
        {refusal && <p className="nv-viewpanel__refusal" role="alert">{refusal}</p>}
        <div className="nv-viewpanel__actions">
          <Button type="submit" variant="primary" size="sm" disabled={!ready}>{t('save')}</Button>
        </div>
      </form>
    </SidePanel>
  )
}
