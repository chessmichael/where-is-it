import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { acceptHandoff } from './lib/legacy'
import './styles.css'

// Data forwarded from the old address arrives in the link; store it before the app reads it.
acceptHandoff()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
