import { useState, useMemo } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import { estimateTargets, ACTIVITY_LEVELS } from '../utils/targetEstimate'
import { ageFromBirthDate, ftInToCm, todayStr } from '../utils/biometrics'

// First-run setup for brand-new tracked users (solo + clients who weren't
// already solo). Collects the stable biometrics the target math needs — stored
// on the profile so they survive a solo→client change and a coach can read them
// — then auto-suggests starting macros (saved to `targets`) and seeds today's
// weigh-in. Skippable: "Skip for now" just stamps onboarded_at so we don't nag.
//
// The gate that mounts this lives in App (role ∈ {solo,client} && !onboarded_at).
// Coaches never see it (they aren't tracked).

const GOALS = [
  { key: 'lose', label: 'Lose fat' },
  { key: 'gain', label: 'Build muscle' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'recomp', label: 'Recomp' },
]

// A sensible default pace per goal (the assessment derives direction from
// current vs goal weight; pace only sets the rate).
const PACE_FOR_GOAL = { lose: 'moderate', gain: 'gentle', maintain: 'moderate', recomp: 'gentle' }

export default function Onboarding({ session, profile, onComplete }) {
  const isClient = profile?.role === 'client'
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const metric = units === 'metric'
  const wUnit = metric ? 'kg' : 'lbs'

  // Canonical height in cm from whichever unit the user is entering.
  const heightInCm = metric ? (Number(heightCm) || 0) : ftInToCm(heightFt, heightIn)

  // Live starting-targets preview — recomputed as the essentials come in.
  const preview = useMemo(() => {
    const age = ageFromBirthDate(birthDate)
    if (!sex || !age || !heightInCm || !weight) return null
    return estimateTargets({
      sex, age, weight, goalWeight,
      weightUnit: wUnit,
      height: heightInCm, heightUnit: 'cm',
      activity, pace: PACE_FOR_GOAL[goal] || 'moderate',
    })
  }, [sex, birthDate, heightInCm, weight, goalWeight, wUnit, activity, goal])

  async function finish() {
    setError('')
    setSaving(true)
    const uid = session.user.id

    const profilePatch = {
      onboarded_at: new Date().toISOString(),
      unit_preference: units,
      sex: sex || null,
      birth_date: birthDate || null,
      height_cm: heightInCm > 0 ? Math.round(heightInCm * 10) / 10 : null,
      activity_level: activity,
      primary_goal: goal || null,
    }
    const { error: pErr } = await supabase.from('profiles').update(profilePatch).eq('id', uid)
    if (pErr) { console.error('onboarding profile save:', pErr); setError('Something went wrong — try again.'); setSaving(false); return }

    // Auto-apply the suggested macros (+ goal weight) as starting targets. The
    // coach can override these freely later (ClientView upserts the same row).
    if (preview) {
      await supabase.from('targets').upsert({
        user_id: uid,
        calories: preview.calories,
        protein: preview.protein,
        carbs: preview.carbs,
        fat: preview.fat,
        weight_goal: Number(goalWeight) || null,
        weight_goal_unit: wUnit,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    } else if (goalWeight) {
      await supabase.from('targets').upsert({
        user_id: uid, weight_goal: Number(goalWeight) || null, weight_goal_unit: wUnit,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    }

    // Seed today's weigh-in so the weight chart isn't empty on day one.
    if (Number(weight) > 0) {
      const now = new Date()
      const weighed_at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      await supabase.from('weight_log').insert([{
        weight: Number(weight), unit: wUnit, logged_date: todayStr(), user_id: uid, weighed_at,
      }])
    }

    setSaving(false)
    onComplete()
  }

  async function skip() {
    setSaving(true)
    const { error: e } = await supabase.from('profiles')
      .update({ onboarded_at: new Date().toISOString(), unit_preference: units })
      .eq('id', session.user.id)
    if (e) { console.error('onboarding skip:', e); setError('Something went wrong — try again.'); setSaving(false); return }
    setSaving(false)
    onComplete()
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '10px 12px', color: 'var(--color-text)',
    fontSize: 'var(--text-base)', width: '100%', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '6px', display: 'block' }

  const pill = (active) => ({
    flex: 1, padding: '10px', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 'var(--text-sm)', fontWeight: active ? 600 : 500,
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary-dim)' : 'var(--color-surface)',
    color: active ? 'var(--color-primary)' : 'var(--color-muted)',
  })

  const macro = (label, value, unit, color) => (
    <div style={{ flex: 1, minWidth: 64, textAlign: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 6px' }}>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color }}>{value}{unit}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="page-fade-in" style={{ maxWidth: '460px', margin: '0 auto', padding: '40px 16px 64px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <Logo size={40} />
        <h1 style={{ marginTop: '16px', marginBottom: '6px' }}>Let's set up your tracking</h1>
        <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 'var(--text-base)', lineHeight: 1.5 }}>
          A few details so we can suggest your starting targets.{isClient ? ' Your coach can fine-tune them later.' : ' You can adjust everything later.'}
        </p>
      </div>

      {/* Units */}
      <div>
        <label style={labelStyle}>Units</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[['imperial', 'lb / ft·in'], ['metric', 'kg / cm']].map(([u, lbl]) => (
            <button key={u} type="button" onClick={() => setUnits(u)} style={pill(units === u)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Sex + DOB */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Sex <span style={{ color: 'var(--color-faint)' }}>· for metabolism</span></label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['male', 'Male'], ['female', 'Female']].map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setSex(v)} style={pill(sex === v)}>{lbl}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Date of birth</label>
          <input type="date" value={birthDate} max={todayStr()} onChange={(e) => setBirthDate(e.target.value)} style={{ ...pill(false), color: 'var(--color-text)', width: '100%', textAlign: 'center' }} />
        </div>
      </div>

      {/* Height */}
      <div>
        <label style={labelStyle}>Height</label>
        {metric ? (
          <input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" style={inputStyle} />
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" inputMode="numeric" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" style={inputStyle} />
            <input type="number" inputMode="numeric" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" style={inputStyle} />
          </div>
        )}
      </div>

      {/* Weights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Current weight ({wUnit})</label>
          <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={metric ? 'e.g. 80' : 'e.g. 176'} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Goal weight ({wUnit}) <span style={{ color: 'var(--color-faint)' }}>· optional</span></label>
          <input type="number" inputMode="decimal" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="optional" style={inputStyle} />
        </div>
      </div>

      {/* Goal */}
      <div>
        <label style={labelStyle}>Primary goal</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {GOALS.map((g) => (
            <button key={g.key} type="button" onClick={() => setGoal(g.key)} style={pill(goal === g.key)}>{g.label}</button>
          ))}
        </div>
      </div>

      {/* Activity */}
      <div>
        <label style={labelStyle}>Activity level</label>
        <select value={activity} onChange={(e) => setActivity(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {ACTIVITY_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </div>

      {/* Starting targets preview */}
      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--color-primary-dim)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-md)' }}>Your starting targets</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {macro('Calories', preview.calories, '', 'var(--color-calories)')}
            {macro('Protein', preview.protein, 'g', 'var(--color-protein)')}
            {macro('Carbs', preview.carbs, 'g', 'var(--color-carbs)')}
            {macro('Fat', preview.fat, 'g', 'var(--color-fat)')}
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Maintenance ≈ {preview.maintenanceCalories} cal. A starting point you{isClient ? ' and your coach' : ''} can adjust anytime.
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Button onClick={finish} variant="primary" fullWidth loading={saving}>
          {preview ? 'Save & get started' : 'Get started'}
        </Button>
        <button type="button" onClick={skip} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit', padding: '4px' }}>
          Skip for now
        </button>
      </div>
    </div>
  )
}
