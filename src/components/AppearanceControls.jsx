import ThemeToggle from './ThemeToggle'
import { useMotionPref } from '../utils/motion'
import { useTextScalePref } from '../utils/textScale'
import Pill from './ui/Pill'
import SettingRow from './ui/SettingRow'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <SettingRow label="Theme" description="Auto follows your device's day/night setting." stacked>
        <ThemeToggle />
      </SettingRow>

      <Choice
        label="Text size"
        // Says what it actually does, because "Large" alone invites the
        // reasonable assumption that it zooms the whole interface. It scales
        // type only; buttons and spacing stay put.
        hintText="Scales the text across the app. If you have already set a larger font size in your browser, this multiplies it rather than replacing it."
        options={TEXT_OPTIONS}
        value={textScale}
        onChange={setTextScale}
      />

      <Choice
        label="Motion"
        hintText="System follows your device's reduce-motion setting. Reduced turns off animations here even if your device allows them; Full keeps them even if it doesn't."
        options={MOTION_OPTIONS}
        value={motion}
        onChange={setMotion}
      />
    </div>
  )
}
