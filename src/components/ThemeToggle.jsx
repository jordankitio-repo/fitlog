import { useThemePref } from '../utils/theme'

const OPTIONS = [
  { value: 'auto', label: 'Auto', icon: '◐' },
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
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
            <span aria-hidden="true" style={{ fontSize: '0.9rem' }}>{opt.icon}</span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
