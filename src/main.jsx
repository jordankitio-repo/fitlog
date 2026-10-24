import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Sentry } from './sentry'
import App from './App.jsx'
import { initThemeWatcher } from './utils/theme'
import { initMotion } from './utils/motion'
import { initTextScale } from './utils/textScale'
import { initIosInputZoomGuard } from './utils/iosInputZoom'
import { isNativeApp } from './utils/platform'

// The native shell scrolls differently from a browser: the body must not
// scroll or the fixed tab bar drifts with the content. See `.native-app` in
// index.css. Set before render so the shell is never painted scrollable.
if (isNativeApp()) document.documentElement.classList.add('native-app')

initThemeWatcher()
// The inline script in index.html has already applied all three before first
// paint. These re-apply from the same storage and, for theme and motion,
// subscribe to the OS setting so a change there lands without a reload.
initMotion()
initTextScale()
initIosInputZoomGuard()

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
