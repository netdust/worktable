import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { t } from '../i18n'
import { Segmented, themeOptions, useTheme } from './Theme'

export interface Signed {
  email: string
  onSignOut: () => void
}

/** A look one viewer chooses, kept in this browser and set on the root for the stylesheet. */
function useLook<T extends string>(key: string, attribute: string, allowed: readonly T[], fallback: NoInfer<T>): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return allowed.includes(stored as T) ? (stored as T) : fallback
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    document.getElementById('root')?.setAttribute(attribute, value)
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  }, [value])
  return [value, setValue]
}

function Row<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="nv-looks__row">
      <span className="nv-looks__name" aria-hidden="true">{name}</span>
      <Segmented label={name} value={value} onChange={onChange} options={options} />
    </div>
  )
}

const pairs = <const T extends string>(...values: [T, string][]) => values.map(([value, label]) => ({ value, label }))

const OPEN_KEY = 'ntdst-views/looks-open'

function storedOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Bijstellen: how the sheet looks to this viewer, folded by default; then who is signed in. */
export function RailFoot({ signed }: { signed?: Signed }) {
  // Held here, not in the folded rows, so the choices apply while the card is closed.
  const [density, setDensity] = useLook('ntdst-views/density', 'data-density', ['compact', 'normal', 'roomy'] as const, 'normal')
  const [groups, setGroups] = useLook('ntdst-views/groups', 'data-groups', ['band', 'line'] as const, 'band')
  const [lines, setLines] = useLook('ntdst-views/lines', 'data-lines', ['off', 'on'] as const, 'off')
  const [zebra, setZebra] = useLook('ntdst-views/zebra', 'data-zebra', ['off', 'on'] as const, 'off')
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(storedOpen)
  const body = useId()
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Blocked storage: it stays as chosen for this visit.
    }
  }
  return (
    <footer className="nv-rail__foot">
      <section className={open ? 'nv-looks' : 'nv-looks nv-looks--folded'}>
        <button type="button" className="nv-looks__head" aria-expanded={open} aria-controls={body} onClick={toggle}>
          {t('looks')}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div className="nv-looks__body" id={body}>
            <Row name={t('density')} value={density} onChange={setDensity} options={pairs(['compact', t('densityCompact')], ['normal', t('densityNormal')], ['roomy', t('densityRoomy')])} />
            <Row name={t('dayHead')} value={groups} onChange={setGroups} options={pairs(['band', t('dayHeadBand')], ['line', t('dayHeadLine')])} />
            <Row name={t('gridLines')} value={lines} onChange={setLines} options={pairs(['off', t('off')], ['on', t('on')])} />
            <Row name={t('zebra')} value={zebra} onChange={setZebra} options={pairs(['off', t('off')], ['on', t('on')])} />
            <Row name={t('theme')} value={theme} onChange={setTheme} options={themeOptions()} />
          </div>
        )}
      </section>
      {signed && (
        <span className="nv-rail__account">
          <span className="nv-avatar" aria-hidden="true">{signed.email.slice(0, 2).toUpperCase()}</span>
          <span className="nv-rail__email">{signed.email}</span>
          <button type="button" className="nv-rail__signout" onClick={signed.onSignOut}>{t('signOut')}</button>
        </span>
      )}
    </footer>
  )
}
