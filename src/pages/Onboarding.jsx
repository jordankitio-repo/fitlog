import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import ConsumerHealthData from './ConsumerHealthData'
import { Checkbox, Icon, controlStyle } from '../components/ui'
import { estimateTargets, ACTIVITY_LEVELS } from '../utils/targetEstimate'
import { ageFromBirthDate, cmToFtIn, convertWeight, ftInToCm, todayStr } from '../utils/biometrics'
import { GOALS } from '../utils/goals'
import {
  CONSENT_TEXT, appleHealthAvailable, connectAppleHealth, readHealthProfile, syncAppleHealth,
} from '../utils/healthSync'
import appleHealthIcon from '../assets/apple-health-icon.png'

// First run for a new tracked user (a client, or someone tracking alone).
//
// ONE QUESTION A SCREEN. It was a single form of nine fields, which is the
// version people abandon; MacroFactor, MyFitnessPal and iOS's own setup ask
// one thing at a time, with a way back and a way out on every screen.
//
// The order:
//   1. Welcome. A client meets their coach by name and face: they were invited
//      by a person, not by an app.
//   2. Apple Health, in the iPhone app. Connecting brings in their history at
//      once and fills in most of what follows, so the next screens become a
//      check rather than a form. The two consents are the Settings screen's,
//      same sentences, same rule: separate, unticked, both required.
//   3. About you: sex, date of birth, height (what the energy estimate needs).
//   4. Weight: now, and a goal.
//   5. Goal.  6. Activity.
//   7. Starting targets. A coach's targets, when the coach has already set
//      them, are never replaced: the client is shown those instead.
//
// "Set up later" on any screen stamps onboarded_at and lets them in; nothing
// typed is required. The gate that mounts this lives in App.
const PACE_FOR_GOAL = { lose: 'moderate', gain: 'gentle', maintain: 'moderate', recomp: 'gentle' }

export default function Onboarding({ session, profile, onComplete }) {
  const isClient = profile?.role === 'client'
  const uid = session.user.id

  const [coach, setCoach] = useState(null)
  // Targets that already exist, i.e. ones the coach set while this screen was
  // waiting to be filled in. The estimate must not overwrite them.
  const [existingTargets, setExistingTargets] = useState(null)
  const [healthOffered, setHealthOffered] = useState(false)
  // Held until the coach and the Health check are in, so the first screen
  // does not say "Welcome to Gardnr" and then swap to the coach's name.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    async function load() {
      const [{ data: t }, available] = await Promise.all([
        supabase.from('targets').select('calories, protein, carbs, fat, weight_goal').eq('user_id', uid).maybeSingle(),
        appleHealthAvailable(),
      ])
      if (!live) return
      setExistingTargets(t?.calories ? t : null)
      setHealthOffered(available)
      if (isClient) {
        const { data: rel } = await supabase.from('coach_clients').select('coach_id')
          .eq('client_id', uid).eq('status', 'active').maybeSingle()
        if (rel?.coach_id) {
          const { data: c } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', rel.coach_id).maybeSingle()
          if (live && c) setCoach(c)
        }
      }
      if (live) setReady(true)
    }
    load()
    return () => { live = false }
  }, [uid, isClient])

  const [units, setUnits] = useState('imperial')
  const [sex, setSex] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weight, setWeight] = useState('')
  const [goalWeight, setGoalWeight] = useState('')
  const [activity, setActivity] = useState('moderate')
  const [goal, setGoal] = useState('')
  // Which fields Apple Health filled in, to say so beside them, and the
  // weight it filled, so an untouched one is not logged a second time (the
  // first sync imports it).
  const [fromHealth, setFromHealth] = useState({})
  const [healthWeight, setHealthWeight] = useState(null)
  const [healthWeightDate, setHealthWeightDate] = useState(null)

  const metric = units === 'metric'
  const wUnit = metric ? 'kg' : 'lb'
  const storedUnit = metric ? 'kg' : 'lbs'

  // Switching units CONVERTS what is typed: a toggle that only relabelled the
  // boxes left 180 lb reading as 180 kg, and targets computed for someone
  // twice their weight.
  function changeUnits(next) {
    if (next === units) return
    setWeight((w) => convertWeight(w, units, next))
    setGoalWeight((g) => convertWeight(g, units, next))
    setHealthWeight((h) => (h == null ? h : convertWeight(h, units, next)))
    if (next === 'metric') {
      const cm = ftInToCm(heightFt, heightIn)
      setHeightCm(cm ? String(cm) : '')
    } else {
      const { ft, in: inches } = cmToFtIn(heightCm)
      setHeightFt(ft)
      setHeightIn(inches)
    }
    setUnits(next)
  }

  const heightInCm = metric ? (Number(heightCm) || 0) : ftInToCm(heightFt, heightIn)

  const preview = useMemo(() => {
    const age = ageFromBirthDate(birthDate)
    if (!sex || !age || !heightInCm || !weight) return null
    return estimateTargets({
      sex, age, weight, goalWeight,
      weightUnit: storedUnit,
      height: heightInCm, heightUnit: 'cm',
      activity, pace: PACE_FOR_GOAL[goal] || 'moderate',
    })
  }, [sex, birthDate, heightInCm, weight, goalWeight, storedUnit, activity, goal])

  // ── Steps ──────────────────────────────────────────────────────────────
  const steps = ['welcome', ...(healthOffered ? ['health'] : []), 'about', 'weight', 'goal', 'activity', 'targets']
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState('forward')
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const go = (delta) => {
    setDirection(delta > 0 ? 'forward' : 'back')
    setStepIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)))
  }
  // The page scrolls to the top of each new question.
  useEffect(() => { window.scrollTo(0, 0); document.getElementById('root')?.scrollTo?.(0, 0) }, [stepIndex])

  // ── Apple Health ───────────────────────────────────────────────────────
  const [consentCollect, setConsentCollect] = useState(false)
  const [consentShare, setConsentShare] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [healthError, setHealthError] = useState('')
  const [connected, setConnected] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)

  async function connectHealth() {
    setConnecting(true)
    setHealthError('')
    try {
      await connectAppleHealth()
      setConnected(true)
      const h = await readHealthProfile()
      const filled = {}
      if (h.sex === 'male' || h.sex === 'female') { setSex(h.sex); filled.sex = true }
      if (h.birthDate) { setBirthDate(h.birthDate); filled.birthDate = true }
      if (h.heightCm) {
        filled.height = true
        setHeightCm(String(h.heightCm))
        const { ft, in: inches } = cmToFtIn(h.heightCm)
        setHeightFt(ft)
        setHeightIn(inches)
      }
      if (h.weightKg) {
        filled.weight = true
        const w = metric ? String(h.weightKg) : convertWeight(String(h.weightKg), 'metric', 'imperial')
        setWeight(w)
        setHealthWeight(w)
        setHealthWeightDate(h.weightDate || null)
      }
      setFromHealth(filled)
      // The first sync is the history import; it runs while they carry on.
      syncAppleHealth(uid, { force: true }).catch((err) => console.error('Apple Health first sync failed:', err))
      go(1)
    } catch (err) {
      console.error('Apple Health connect failed:', err)
      setHealthError("Couldn't connect to Apple Health. Try again, or connect later in Profile.")
    } finally {
      setConnecting(false)
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function finish() {
    setError('')
    setSaving(true)
    try {
      const { error: pErr } = await supabase.from('profiles').update({
        onboarded_at: new Date().toISOString(),
        unit_preference: units,
        sex: sex || null,
        birth_date: birthDate || null,
        height_cm: heightInCm > 0 ? Math.round(heightInCm * 10) / 10 : null,
        activity_level: activity,
        primary_goal: goal || null,
      }).eq('id', uid)
      if (pErr) throw pErr

      const goalW = Number(goalWeight) || null
      if (existingTargets) {
        // The coach's targets stand. A goal weight is added only where the
        // coach has not set one.
        if (goalW && !existingTargets.weight_goal) {
          const { error: tErr } = await supabase.from('targets')
            .update({ weight_goal: goalW, weight_goal_unit: storedUnit, updated_at: new Date().toISOString() })
            .eq('user_id', uid)
          if (tErr) throw tErr
        }
      } else if (preview || goalW) {
        const { error: tErr } = await supabase.from('targets').upsert({
          user_id: uid,
          ...(preview ? { calories: preview.calories, protein: preview.protein, carbs: preview.carbs, fat: preview.fat } : {}),
          weight_goal: goalW,
          weight_goal_unit: storedUnit,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (tErr) throw tErr
      }

      // Today's weigh-in, so Today and the weight chart are not empty on day
      // one. Not when it is Health's own reading from TODAY, untouched: the
      // first sync brings that. An older Health reading the client confirmed
      // as their current weight is today's.
      const healthHasToday = weight === healthWeight && healthWeightDate === todayStr()
      if (Number(weight) > 0 && !healthHasToday) {
        const now = new Date()
        const weighed_at = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
        const { error: wErr } = await supabase.from('weight_log').insert([{
          weight: Number(weight), unit: storedUnit, logged_date: todayStr(), user_id: uid, weighed_at,
        }])
        if (wErr) throw wErr
      }
      onComplete()
    } catch (err) {
      console.error('onboarding save:', err)
      setError("Couldn't save. Check your connection and try again.")
      setSaving(false)
    }
  }

  async function later() {
    setSaving(true)
    const { error: e } = await supabase.from('profiles')
      .update({ onboarded_at: new Date().toISOString(), unit_preference: units })
      .eq('id', uid)
    if (e) { console.error('onboarding skip:', e); setError("Couldn't save. Try again."); setSaving(false); return }
    onComplete()
  }

  // ── Pieces ─────────────────────────────────────────────────────────────
  const coachFirst = coach?.full_name?.split(' ')[0]
  const field = (id, label, input, note) => (
    <div className="onb-field">
      <label htmlFor={id} className="onb-label">{label}</label>
      {input}
      {note && <p className="onb-note">{note}</p>}
    </div>
  )
  const healthNote = (key) => (fromHealth[key] ? 'From Apple Health' : null)
  const choiceRows = (name, options, value, onPick) => (
    <div className="onb-choices" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          className={`onb-choice ds-control${value === o.key ? ' is-on' : ''}`}
          onClick={() => onPick(o.key)}
        >
          <span>{o.label}</span>
          {value === o.key && <Icon name="check" size={18} strokeWidth={2.5} />}
        </button>
      ))}
    </div>
  )
  // iOS's segmented control: the choices side by side, full width, 44pt
  // tall. The app's Pill is a 30px filter chip, under the touch minimum for a
  // screen whose whole job is being tapped through.
  const segmented = (labelledBy, options, value, onPick) => (
    <div className="onb-seg" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(([v, lbl]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v}
          className={`onb-seg-opt ds-control${value === v ? ' is-on' : ''}`} onClick={() => onPick(v)}>
          {lbl}
        </button>
      ))}
    </div>
  )
  const unitSwitch = (
    <div className="onb-field">
      <span className="onb-label" id="onb-units">Units</span>
      {segmented('onb-units', [['imperial', 'lb, ft'], ['metric', 'kg, cm']], units, changeUnits)}
    </div>
  )
  const num = (n) => Number(n).toLocaleString()

  // Each screen: a title, one line under it, and its question.
  const screens = {
    welcome: {
      art: coach
        ? <Avatar url={coach.avatar_url} name={coach.full_name} size={72} />
        : <Logo size={56} />,
      title: coach ? `${coachFirst} invited you to Gardnr` : 'Welcome to Gardnr',
      sub: coach
        ? `Log your meals, weight and workouts. ${coachFirst} sees how it is going and sends you a weekly report.`
        : 'Log your meals, weight and workouts against targets made for you.',
      body: null,
      cta: 'Get started',
    },
    health: {
      art: (
        <span className="onb-health-icon">
          <img src={appleHealthIcon} alt="" width={64} height={64} />
        </span>
      ),
      title: 'Connect Apple Health',
      sub: 'Bring in your steps, weigh-ins and workouts, and fill in the next few questions for you.',
      body: (
        <>
          <div>
            <Checkbox checked={consentCollect} onChange={setConsentCollect}>{CONSENT_TEXT.collect}</Checkbox>
            <Checkbox checked={consentShare} onChange={setConsentShare}>{CONSENT_TEXT.shareCoach}</Checkbox>
          </div>
          <p className="onb-note">
            Disconnect at any time in Profile. How we handle health data:{' '}
            {/* A sheet, not a link: this screen renders before the app's
                router exists, and a page swapped in for it would leave a new
                client nowhere to come back to. */}
            <button type="button" className="onb-inline-link" onClick={() => setPolicyOpen(true)}>Consumer Health Data Policy</button>.
          </p>
          {healthError && <p className="onb-error" role="alert">{healthError}</p>}
        </>
      ),
      cta: connected ? 'Continue' : 'Connect',
      ctaDisabled: !connected && !(consentCollect && consentShare),
      onCta: connected ? () => go(1) : connectHealth,
      ctaLoading: connecting,
      secondary: connected ? null : { label: 'Not now', onClick: () => go(1) },
    },
    about: {
      title: 'About you',
      sub: 'Used to estimate how much energy you burn.',
      body: (
        <>
          {unitSwitch}
          <div className="onb-field">
            <span className="onb-label" id="onb-sex">Sex</span>
            {segmented('onb-sex', [['female', 'Female'], ['male', 'Male']], sex, (v) => { setSex(v); setFromHealth(f => ({ ...f, sex: false })) })}
            {healthNote('sex') && <p className="onb-note">{healthNote('sex')}</p>}
          </div>
          {field('onb-dob', 'Date of birth',
            // iOS's WebView draws an EMPTY date input as a blank box, so the
            // field shows a placeholder of its own until a date is picked.
            <span className="onb-date">
              <input id="onb-dob" type="date" value={birthDate} max={todayStr()} onChange={(e) => { setBirthDate(e.target.value); setFromHealth(f => ({ ...f, birthDate: false })) }} style={controlStyle} />
              {!birthDate && <span className="onb-date-ph" aria-hidden="true">Select date</span>}
            </span>,
            healthNote('birthDate'))}
          {metric
            ? field('onb-hcm', 'Height (cm)',
              <input id="onb-hcm" type="number" inputMode="decimal" value={heightCm} onChange={(e) => { setHeightCm(e.target.value); setFromHealth(f => ({ ...f, height: false })) }} style={controlStyle} />,
              healthNote('height'))
            : (
              <div className="onb-field">
                <span className="onb-label" id="onb-height">Height</span>
                <div className="onb-pair" role="group" aria-labelledby="onb-height">
                  <label className="onb-unitfield">
                    <input type="number" inputMode="numeric" aria-label="Feet" value={heightFt} onChange={(e) => { setHeightFt(e.target.value); setFromHealth(f => ({ ...f, height: false })) }} style={controlStyle} />
                    <span aria-hidden="true">ft</span>
                  </label>
                  <label className="onb-unitfield">
                    <input type="number" inputMode="numeric" aria-label="Inches" value={heightIn} onChange={(e) => { setHeightIn(e.target.value); setFromHealth(f => ({ ...f, height: false })) }} style={controlStyle} />
                    <span aria-hidden="true">in</span>
                  </label>
                </div>
                {healthNote('height') && <p className="onb-note">{healthNote('height')}</p>}
              </div>
            )}
        </>
      ),
    },
    weight: {
      title: 'Your weight',
      sub: isClient && coachFirst ? `Only you and ${coachFirst} see this.` : 'Only you see this.',
      body: (
        <>
          {field('onb-w', `Current weight (${wUnit})`,
            <input id="onb-w" type="number" inputMode="decimal" value={weight} onChange={(e) => { setWeight(e.target.value); setFromHealth(f => ({ ...f, weight: false })) }} style={controlStyle} />,
            healthNote('weight'))}
          {field('onb-gw', `Goal weight (${wUnit})`,
            <input id="onb-gw" type="number" inputMode="decimal" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} style={controlStyle} />,
            'Optional')}
        </>
      ),
    },
    goal: {
      title: 'Your goal',
      sub: 'Sets the direction of your targets.',
      body: choiceRows('Goal', GOALS, goal, setGoal),
    },
    activity: {
      title: 'How active are you?',
      sub: 'Exercise in a typical week.',
      body: choiceRows('Activity level', ACTIVITY_LEVELS, activity, setActivity),
    },
    targets: existingTargets
      ? {
        title: coachFirst ? `${coachFirst} set your targets` : 'Your targets',
        sub: coachFirst ? `${coachFirst} can change them as you go.` : 'You can change them in Profile.',
        body: <TargetsGrid t={existingTargets} num={num} />,
        cta: 'Start tracking',
        onCta: finish,
      }
      : preview
        ? {
          title: 'Your starting targets',
          sub: isClient && coachFirst
            ? `A daily starting point. ${coachFirst} can adjust it.`
            : `A daily starting point. Maintenance is about ${num(preview.maintenanceCalories)} calories.`,
          body: <TargetsGrid t={preview} num={num} />,
          cta: 'Start tracking',
          onCta: finish,
        }
        : {
          title: "You're set",
          sub: isClient && coachFirst
            ? `${coachFirst} will set your targets.`
            : 'Set your targets any time in Profile, under Daily targets.',
          body: null,
          cta: 'Start tracking',
          onCta: finish,
        },
  }
  if (!ready) return <div className="onb" />
  const screen = screens[step]
  const progress = (stepIndex + 1) / steps.length

  return (
    <div className="onb">
      <div className="onb-top">
        {stepIndex > 0
          ? <button type="button" className="onb-back ds-control" onClick={() => go(-1)} aria-label="Back"><Icon name="left" size={22} strokeWidth={2.25} /></button>
          : <span className="onb-back" aria-hidden="true" />}
        <div className="onb-progress" role="progressbar" aria-label="Setup" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}>
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <button type="button" className="onb-later ds-control" onClick={later} disabled={saving}>Set up later</button>
      </div>

      <div key={step} className={`onb-step onb-go-${direction}`}>
        {screen.art && <div className="onb-art">{screen.art}</div>}
        <h1 className="onb-title">{screen.title}</h1>
        <p className="onb-sub">{screen.sub}</p>
        {screen.body && <div className="onb-body">{screen.body}</div>}
      </div>

      <div className="onb-actions">
        {error && <p className="onb-error" role="alert">{error}</p>}
        <Button
          variant="primary"
          fullWidth
          onClick={screen.onCta || (() => go(1))}
          disabled={screen.ctaDisabled}
          loading={screen.ctaLoading || (saving && step === 'targets')}
        >
          {screen.cta || 'Continue'}
        </Button>
        {screen.secondary && (
          <button type="button" className="onb-secondary ds-control" onClick={screen.secondary.onClick}>{screen.secondary.label}</button>
        )}
      </div>
      <Modal open={policyOpen} title="Consumer Health Data Policy" onClose={() => setPolicyOpen(false)} maxWidth={720} sheet>
        <ConsumerHealthData embedded />
      </Modal>
    </div>
  )
}

// The day's four numbers, neutral type (B2: a metric hue is a fill, never
// text) with the hue as a bar's colour, as the Today panel shows them.
function TargetsGrid({ t, num }) {
  const cells = [
    ['Calories', num(t.calories), '', 'var(--color-calories)'],
    ['Protein', num(t.protein), 'g', 'var(--color-protein)'],
    ['Carbs', num(t.carbs), 'g', 'var(--color-carbs)'],
    ['Fat', num(t.fat), 'g', 'var(--color-fat)'],
  ]
  return (
    <div className="onb-targets">
      {cells.map(([label, value, unit, color]) => (
        <div key={label} className="onb-target">
          <span className="onb-target-mark" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="onb-target-label">{label}</span>
          <span className="onb-target-value tnum">{value}{unit}</span>
        </div>
      ))}
    </div>
  )
}
