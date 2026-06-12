import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
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
  ],
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
