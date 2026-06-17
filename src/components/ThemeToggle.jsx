import { useThemePref } from '../utils/theme'

// Monochrome feather-style glyphs (stroke = currentColor, so they follow the
// button text color). Auto = contrast half-circle, Light = sun (matches the
// Profile rail's Appearance icon), Dark = crescent moon.
const svg = (children) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{children}</svg>
)
const OPTIONS = [
  { value: 'auto', label: 'Auto', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>) },
  { value: 'light', label: 'Light', icon: svg(<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>) },
  { value: 'dark', label: 'Dark', icon: svg(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />) },
]

// Segmented control for the day/night preference. 'Auto' follows the OS.
export default function ThemeToggle() {
  const [pref, setPref] = useThemePref()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: 'var(--radius)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        alignSelf: 'flex-start',
      }}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPref(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: active ? 600 : 500,
              background: active ? 'var(--color-primary)' : 'transparent',
              color: active ? '#fff' : 'var(--color-muted)',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
