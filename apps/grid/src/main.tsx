import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './ui/theme.css'
import './ui/app.css'
import { locale } from './i18n'
import { App } from './ui/App'
import { Providers } from './ui/Providers'

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <Providers locale={locale()}>
        <App />
      </Providers>
    </StrictMode>,
  )
}
