import { useThemePref } from '../utils/theme'
import Pill from './ui/Pill'

// Monochrome feather-style glyphs (stroke = currentColor, so they follow the
// button text color). System = contrast half-circle, Light = sun (matches the
// Profile rail's Appearance icon), Dark = crescent moon.
const svg = (children) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{children}</svg>
)
const OPTIONS = [
  // Stored as 'auto' (theme.js and the pre-paint script read that value);
  // SAID as "System", the word Motion uses and the one iOS, Android and most
  // apps use for "follow the device".
  { value: 'auto', label: 'System', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>) },
  { value: 'light', label: 'Light', icon: svg(<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>) },
  { value: 'dark', label: 'Dark', icon: svg(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />) },
]

// Day/night preference. 'System' (stored 'auto') follows the OS.
//
// These are ui/Pill, not a bespoke segmented control. The hand-rolled version
// painted its selected chip --color-primary with --color-on-accent text and no
// elevation, while every other selectable chip in the app is Button `primary`:
// --color-primary-fill, white label, --control-sheen over --control-shadow-accent.
// Side by side the two greens plainly disagreed, and the toggle looked flat
// next to the roster's lens chips. Nothing here needed its own control — it
// needed the one that already existed.
//
// The old surface-2 track went with it: a row of pills IS the segmented
// control, the same way the roster's lens bar is, and a track around pills
// that already carry their own surface is a second container saying nothing.
export default function ThemeToggle() {
  const [pref, setPref] = useThemePref()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value
        return (
          <Pill
            key={opt.value}
            active={active}
            role="radio"
            aria-checked={active}
            onClick={() => setPref(opt.value)}
          >
            {opt.icon}
            {opt.label}
          </Pill>
        )
      })}
    </div>
  )
}
