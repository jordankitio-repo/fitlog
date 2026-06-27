import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Sentry } from './sentry'
import App from './App.jsx'
import { initThemeWatcher } from './utils/theme'

initThemeWatcher()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <p style={{ padding: 24, textAlign: 'center', color: 'var(--color-muted)' }}>
          Something went wrong. Please refresh the page.
        </p>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
