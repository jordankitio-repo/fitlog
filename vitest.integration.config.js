import { defineConfig } from 'vitest/config'

// Integration config for the RLS harness. Separate from the unit tests because
// these talk to a real local Supabase stack over HTTP and must run serially
// (they share one database).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rls/**/*.test.js'],
    globalSetup: ['tests/rls/globalSetup.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
