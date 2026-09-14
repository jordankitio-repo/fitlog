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
  // ---------------------------------------------------------------------------
  // Design-system guardrails — the machine half of the design system. The human
  // half is .claude/skills/gardnr-design/SKILL.md; these two rules are what stop
  // it being advisory. They cover ALL of src/: the hex rule used to name five
  // pages explicitly, which meant every new file was born outside the system.
  //
  // Both rules have a deliberate escape hatch: eslint-disable-next-line WITH a
  // reason. A literal with a stated reason is a decision; one without is a
  // regression. Current exemptions: the always-dark Toast surface, the camera
  // scrim in BarcodeScanner, the streak-card gradient palette, the decorative
  // check-in badge in ClientView, and the 9px "i" glyph (iconography, not text).
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          // A raw hex as a `color:` value. `color:` is never a chart.js dataset
          // prop, so this never false-positives on charts — those live in
          // chartTheme.js and genuinely cannot resolve a CSS var.
          selector: "Property[key.name='color'] Literal[value=/#[0-9a-fA-F]{3,8}/]",
          message: 'Use a --color-* design token, not a raw hex. Chart colors belong in chartTheme.js. A genuine exception needs an eslint-disable-next-line with a reason.',
        },
        {
          // A raw font size. The ramp in src/index.css is the only allowed set.
          selector: "Property[key.name='fontSize'] Literal[value=/^[0-9.]+(rem|px|em)$/]",
          message: 'Use a --text-* token from the type ramp (src/index.css), not a raw size. Ten steps, --text-xs (11px, the floor) to --text-display (32px). If none fits, extend the ramp rather than one-off it.',
        },
      ],
    },
  },
])
