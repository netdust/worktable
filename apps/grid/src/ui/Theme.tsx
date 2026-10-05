import { SegmentedControl } from '@sakaniui/react'
import { useEffect, useState } from 'react'
import { t } from '../i18n'

type Theme = 'auto' | 'light' | 'dark'

const KEY = 'ntdst-views/theme'
const WORD = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' } as const
const THEMES: Theme[] = ['auto', 'light', 'dark']

function stored(): Theme {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/** One viewer's choice, kept in this browser; `auto` follows the system. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    const root = document.getElementById('ntdst-views-root')
    if (theme === 'auto') root?.removeAttribute('data-theme')
    else root?.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(KEY, theme)
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  }, [theme])

  return (
    <div className="nv-theme" role="group" aria-label={t('theme')}>
      <SegmentedControl
        options={THEMES.map((value) => ({ value, label: t(WORD[value]) }))}
        value={theme}
        onChange={(value) => setTheme(value as Theme)}
      />
    </div>
  )
}
