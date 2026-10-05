import { Button } from '@sakaniui/react'
import { useId, useState } from 'react'
import { errorText, t } from '../i18n'
import type { ApiError, ViewType } from '../types'
import { SidePanel } from './SidePanel'

interface Props {
  label: string
  /** The types the table carries, to choose from; null when the type is already decided. */
  types: ViewType[] | null
  /** The type chosen first, or the one decided. */
  type?: ViewType
  /** Rejects with the server's refusal, said in the panel. */
  onSubmit: (name: string, type: ViewType) => Promise<unknown>
  onClose: () => void
}

const typeWord = (type: ViewType) => (type === 'matrix' ? t('matrix') : t('table'))

/** A new view: its name and, from "+ View", its type. Opens beside the sheet, never as a popover (V21). */
export function ViewPanel({ label, types, type: given, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ViewType>(given ?? types?.[0] ?? 'grid')
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
        {types && (
          <div className="nv-viewpanel__types" role="radiogroup" aria-label={t('viewType')}>
            {types.map((option) => (
              <label key={option} className="nv-viewpanel__type">
                <input type="radio" name="type" value={option} checked={type === option} onChange={() => setType(option)} />
                {typeWord(option)}
              </label>
            ))}
            <label className="nv-viewpanel__type nv-viewpanel__type--soon">
              <input type="radio" name="type" value="calendar" disabled />
              {t('calendar')}<span className="nv-viewpanel__soon">{t('soon')}</span>
            </label>
          </div>
        )}
        {refusal && <p className="nv-viewpanel__refusal" role="alert">{refusal}</p>}
        <div className="nv-viewpanel__actions">
          <Button type="submit" variant="primary" size="sm" disabled={!ready}>{t('save')}</Button>
        </div>
      </form>
    </SidePanel>
  )
}
