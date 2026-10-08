import { useEffect, useState } from 'react'
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components'
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

/** One choice of a few, shown side by side. */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <ToggleButtonGroup className="nv-theme" aria-label={label} selectionMode="single" disallowEmptySelection
      selectedKeys={[value]} onSelectionChange={([key]) => key !== undefined && onChange(key as T)}>
      {options.map((option) => (
        <ToggleButton key={option.value} id={option.value} className="nv-theme__option">{option.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

/** One viewer's choice, kept in this browser; `auto` follows the system. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    const root = document.getElementById('root')
    if (theme === 'auto') root?.removeAttribute('data-theme')
    else root?.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(KEY, theme)
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  }, [theme])

  return (
    <Segmented label={t('theme')} value={theme} onChange={setTheme}
      options={THEMES.map((value) => ({ value, label: t(WORD[value]) }))} />
  )
}
