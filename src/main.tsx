import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import HelpPage from './components/HelpPage'
import { acceptHandoff } from './lib/legacy'
import './styles.css'

// Data forwarded from the old address arrives in the link; store it before the app reads it.
acceptHandoff()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* /help is public (shareable); everything else is the app, behind sign-in. */}
    {location.pathname.replace(/\/$/, '') === '/help' ? <HelpPage /> : <App />}
  </StrictMode>,
)
