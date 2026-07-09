import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Build/tooling config runs in Node, not the browser — give it Node globals
  // so process.env (gates the Sentry source-map upload) lints clean.
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  // Design-system guardrail: on pages migrated onto the token layer, a raw hex
  // as a `color:` value is a regression — use a --color-* token. (`color:` is
  // never a chart.js dataset prop, so this never false-positives on charts;
  // genuine literal exceptions — decorative palettes — carry an inline disable
  // with a reason.) Extend `files` as more screens are migrated.
  {
    files: [
      'src/pages/Log.jsx',
      'src/pages/CoachDashboard.jsx',
      'src/pages/Dashboard.jsx',
      'src/pages/ClientView.jsx',
      'src/pages/Profile.jsx',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Property[key.name='color'] Literal[value=/#[0-9a-fA-F]{3,8}/]",
        message: 'Use a --color-* design token, not a raw hex. (Chart colors live in chartTheme.js; a genuine decorative exception needs an eslint-disable with a reason.)',
      }],
    },
  },
])
