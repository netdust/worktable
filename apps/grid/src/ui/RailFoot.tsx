import { Kbd, SegmentedControl } from '@sakaniui/react'
import { Fragment, useEffect, useState } from 'react'
import { t } from '../i18n'
import { ThemeToggle } from './Theme'

export interface Signed {
  email: string
  onSignOut: () => void
}

type Density = 'compact' | 'normal' | 'roomy'

const DENSITY_KEY = 'ntdst-views/density'
const DENSITY_WORD = { compact: 'densityCompact', normal: 'densityNormal', roomy: 'densityRoomy' } as const
const DENSITIES: Density[] = ['compact', 'normal', 'roomy']

function storedDensity(): Density {
  try {
    const value = window.localStorage.getItem(DENSITY_KEY)
    return value === 'compact' || value === 'roomy' ? value : 'normal'
  } catch {
    return 'normal'
  }
}

/** The grid's row height, one viewer's choice kept in this browser. */
function DensityToggle() {
  const [density, setDensity] = useState<Density>(storedDensity)

  useEffect(() => {
    document.getElementById('root')?.setAttribute('data-density', density)
    try {
      window.localStorage.setItem(DENSITY_KEY, density)
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  }, [density])

  return (
    <div className="nv-theme" role="group" aria-label={t('density')}>
      <SegmentedControl
        options={DENSITIES.map((value) => ({ value, label: t(DENSITY_WORD[value]) }))}
        value={density}
        onChange={(value) => setDensity(value as Density)}
      />
    </div>
  )
}

const KEYS = [['↑↓←→', 'hintMove'], ['↵', 'hintEdit'], ['Esc', 'hintCancel'], ['⌘Z', 'undo'], ['⌘K', 'hintSearch']] as const

/** The keys the sheet answers to, folded into one item; the viewer's theme and density on one row; who is signed in. */
export function RailFoot({ signed }: { signed?: Signed }) {
  return (
    <footer className="nv-rail__foot">
      <details className="nv-keys">
        <summary>{t('shortcuts')}</summary>
        <dl className="nv-keys__list">
          {KEYS.map(([key, word]) => (
            <Fragment key={key}>
              <dt><Kbd>{key}</Kbd></dt>
              <dd>{t(word)}</dd>
            </Fragment>
          ))}
        </dl>
      </details>
      <div className="nv-rail__looks">
        <ThemeToggle />
        <DensityToggle />
      </div>
      {signed && (
        <span className="nv-rail__account">
          <span className="nv-rail__email">{signed.email}</span>
          <button type="button" className="nv-rail__signout" onClick={signed.onSignOut}>{t('signOut')}</button>
        </span>
      )}
    </footer>
  )
}
