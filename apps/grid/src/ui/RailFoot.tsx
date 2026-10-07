import { Kbd, SegmentedControl } from '@sakaniui/react'
import { useEffect, useState } from 'react'
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

/** The keys the sheet answers to, the viewer's theme and density, and who is signed in. */
export function RailFoot({ signed }: { signed?: Signed }) {
  return (
    <footer className="nv-rail__foot">
      <span><Kbd>↑↓←→</Kbd> <span>{t('hintMove')}</span></span>
      <span><Kbd>↵</Kbd> <span>{t('hintEdit')}</span> · <Kbd>Esc</Kbd> <span>{t('hintCancel')}</span></span>
      <span><Kbd>⌘Z</Kbd> <span>{t('undo')}</span></span>
      <span><Kbd>⌘K</Kbd> <span>{t('hintSearch')}</span></span>
      <ThemeToggle />
      <DensityToggle />
      {signed && (
        <span className="nv-rail__account">
          <span className="nv-rail__email">{signed.email}</span>
          <button type="button" className="nv-rail__signout" onClick={signed.onSignOut}>{t('signOut')}</button>
        </span>
      )}
    </footer>
  )
}
