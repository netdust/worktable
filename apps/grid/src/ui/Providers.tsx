import type { ReactNode } from 'react'
import { UNSAFE_PortalProvider } from 'react-aria'
import { I18nProvider } from 'react-aria-components'

// The dark theme lives on #root, so popovers portal there rather than into body.
const root = () => document.getElementById('root')

export function Providers({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <I18nProvider locale={locale}>
      <UNSAFE_PortalProvider getContainer={root}>{children}</UNSAFE_PortalProvider>
    </I18nProvider>
  )
}
