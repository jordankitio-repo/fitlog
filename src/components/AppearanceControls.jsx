import ThemeToggle from './ThemeToggle'
import { useMotionPref } from '../utils/motion'
import { useTextScalePref } from '../utils/textScale'
import Pill from './ui/Pill'
import SettingRow from './ui/SettingRow'
import { isNativeApp } from '../utils/platform'

// The three reader settings, as one block: theme, motion, text size.
//
// They share a shape — a label, a sentence, a row of Pills — because they
// answer the same kind of question and a reader scanning for "where do I make
// this bigger" should not have to learn three layouts. ThemeToggle keeps its
// own file because the account menu renders it on its own.
const MOTION_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
]

const TEXT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'largest', label: 'Largest' },
]

// `stacked`, because three Pills do not fit to the right of a label and a
// sentence — forcing them there either squeezes the text or wraps the chips
// into a ragged column. The header treatment is what SettingRow standardises;
// where a control sits is a width question.
function Choice({ label, hintText, options, value, onChange }) {
  return (
    <SettingRow label={label} description={hintText} stacked>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <Pill
              key={opt.value}
              active={active}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </Pill>
          )
        })}
      </div>
    </SettingRow>
  )
}

export default function AppearanceControls() {
  const [motion, setMotion] = useMotionPref()
  const [textScale, setTextScale] = useTextScalePref()
  // Each line names the thing the reader would actually change: their iPhone
  // in the app, their device on the web. One sentence each; what the three
  // options do is what the three options say.
  const device = isNativeApp() ? 'iPhone' : 'device'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <SettingRow label="Theme" description={`System matches your ${device}'s light or dark setting.`} stacked>
        <ThemeToggle />
      </SettingRow>

      <Choice
        label="Text size"
        // In the app the default IS the iPhone's text size (textScale.js
        // initSystemTextScale), so the line says so; Large and Largest go on
        // top of it. On the web the browser's own size plays that part.
        hintText={isNativeApp()
          ? "Follows your iPhone's text size. Large and Largest make it bigger still."
          : 'Large and Largest make text bigger across Gardnr.'}
        options={TEXT_OPTIONS}
        value={textScale}
        onChange={setTextScale}
      />

      <Choice
        label="Motion"
        hintText={`System follows your ${device}'s Reduce Motion setting.`}
        options={MOTION_OPTIONS}
        value={motion}
        onChange={setMotion}
      />
    </div>
  )
}
