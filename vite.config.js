import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { meta } from './src/pages/landingContent.js'

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function landingMetadata() {
  const name = meta.title.split(' — ')[0]
  const softwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description: meta.description,
    applicationCategory: 'HealthApplication',
    offers: { '@type': 'Offer', price: '19', priceCurrency: 'USD' },
  }

  return {
    name: 'landing-metadata',
    transformIndexHtml(html) {
      return html
        .replaceAll('__LANDING_TITLE__', escapeHtml(meta.title))
        .replaceAll('__LANDING_DESCRIPTION__', escapeHtml(meta.description))
        .replaceAll('__LANDING_OG_DESCRIPTION__', escapeHtml(meta.ogDescription))
        .replace('__SOFTWARE_APPLICATION_JSON__', JSON.stringify(softwareApplication))
    },
  }
}

// Stamped into the bundle so the running app can show which build it is — lets
// us tell "stale PWA cache" apart from "real bug" at a glance.
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

// Source maps are uploaded to Sentry only when SENTRY_AUTH_TOKEN is present
// (set in Vercel's build env). Without it — local builds, or if the secret is
// ever unset — the plugin is skipped and NO source maps are emitted, so nothing
// changes and no maps are ever served to users. The upload uses debug IDs, so
// it matches errors to source regardless of release.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(buildTime) },
  // 'hidden' emits .map files but omits the //# sourceMappingURL comment, so the
  // served JS never points browsers at them; the Sentry plugin uploads then
  // deletes them (filesToDeleteAfterUpload) so they're never on the CDN.
  build: {
    sourcemap: sentryAuthToken ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
          if (id.includes('/node_modules/chart.js/') || id.includes('/node_modules/react-chartjs-2/')) return 'charts'
        },
      },
    },
  },
  plugins: [
    landingMetadata(),
    react(),
    // Installable PWA: precaches the hashed app shell so the home-screen icon
    // opens straight into the (already-logged-in) app, fast and offline-tolerant.
    // autoUpdate ships new builds to installed users on their next visit.
    VitePWA({
      // 'prompt' so we can show an in-app "new version available" button
      // (PWAUpdatePrompt) instead of silently reloading mid-use. The React
      // hook (virtual:pwa-register/react) owns registration, so disable the
      // auto-injected register script to avoid double registration.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'favicon.ico', 'favicon.svg', 'favicon-32.png',
        'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
      ],
      manifest: {
        name: 'Gardnr',
        short_name: 'Gardnr',
        description: 'Nutrition coaching software that creates the conditions for growth.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#062120',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Never emit source maps for the generated service worker: they'd be
        // served publicly (workbox runs after the Sentry plugin, so they escape
        // its upload+delete). Sentry monitors the app, not the SW glue.
        sourcemap: false,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Google Fonts (Inter) — keep the app styled when offline.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    // Uploads source maps to Sentry so prod stack traces map to real source
    // (they're minified otherwise). Only active when the build-time secret is
    // set; a failed upload logs a warning but never fails the deploy.
    sentryAuthToken &&
      sentryVitePlugin({
        org: 'digigarden-llc',
        project: 'gardnr-frontend',
        authToken: sentryAuthToken,
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        errorHandler: (err) => {
          console.warn(
            '[sentry-vite-plugin] source-map upload failed (build continues):',
            err.message,
          )
        },
      }),
    process.env.ANALYZE &&
      visualizer({
        filename: 'dist/bundle-stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // RLS integration tests run against a live local Supabase stack via their
    // own config (npm run test:rls); keep them out of the fast unit run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/rls/**'],
  },
})
