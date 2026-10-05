import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@sakaniui/react/tokens.css'
import '@sakaniui/react/style.css'
import './ui/theme.css'
import './ui/app.css'
import { App } from './ui/App'

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
