import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

export interface AlertAction {
  label: string
  run: () => void
}

/** A band under the drawer's title: the icon and its title on one line, its sentence, its actions as words; `dismiss` hides it in this drawer and stores nothing. */
export function Alert({ title, text, warn = false, actions = [], dismiss }: { title: string; text: string; warn?: boolean; actions?: AlertAction[]; dismiss?: string }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <div className={warn ? 'nv-dw-alert nv-dw-alert--warn' : 'nv-dw-alert'} role="alert">
      <p className="nv-dw-alert__head"><AlertTriangle size={15} aria-hidden="true" />{title}</p>
      <p className="nv-dw-alert__text">{text}</p>
      {(actions.length > 0 || dismiss) && (
        <span className="nv-dw-alert__acts">
          {actions.map((action) => <button key={action.label} type="button" onClick={action.run}>{action.label}</button>)}
          {dismiss && <button type="button" onClick={() => setGone(true)}>{dismiss}</button>}
        </span>
      )}
    </div>
  )
}
