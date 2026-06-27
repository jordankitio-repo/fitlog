import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

// Frontend error monitoring. Safe to ship before a DSN exists: it only initializes
// in real deployments (not local dev) AND only when VITE_SENTRY_DSN is set —
// otherwise it's a no-op (the ErrorBoundary below still shows a fallback).
//
// Tuned for a health app — minimal data leaves the browser:
//   • errors only — no performance tracing, no session replay
//   • sendDefaultPii: false — no IP / cookies attached
//   • network breadcrumbs have their query strings stripped, so Supabase URLs
//     like ?user_id=eq.<uuid> aren't logged. (Sentry never captures request
//     bodies, so logged health data never leaves the page.)
if (dsn && import.meta.env.PROD) {
  Sentry.init({
    dsn,
    environment:
      typeof window !== 'undefined' && window.location.hostname === 'www.gardnr.fit'
        ? 'production'
        : 'preview',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      if (
        (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') &&
        breadcrumb.data?.url
      ) {
        breadcrumb.data.url = String(breadcrumb.data.url).split('?')[0]
      }
      return breadcrumb
    },
  })
}

export { Sentry }
