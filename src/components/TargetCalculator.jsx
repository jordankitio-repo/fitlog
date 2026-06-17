import { useState } from 'react'
import Button from './Button'
import { estimateTargets, ACTIVITY_LEVELS, PACES } from '../utils/targetEstimate'

// A compact onboarding assessment → suggested daily macros. Collects sex/age/
// height/current+goal weight/activity/pace, computes starting targets (the same
// flow a coach uses by hand — see utils/targetEstimate.js), and hands the macros
// to onApply for the parent to drop into its target inputs (coach on ClientView,
// solo on Profile). The numbers are a starting point to review, not a precision
// prescription.
export default function TargetCalculator({ defaultWeightUnit = 'lbs', onApply }) {
  const [sex, setSex] = useState('male')
  const [age, setAge] = useState('')
  const [units, setUnits] = useState(defaultWeightUnit === 'kg' ? 'metric' : 'imperial')
  const [weight, setWeight] = useState('')
  const [goalWeight, setGoalWeight] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [activity, setActivity] = useState('moderate')
  const [pace, setPace] = useState('moderate')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const metric = units === 'metric'
  const wUnit = metric ? 'kg' : 'lb'
  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '9px 12px', color: 'var(--color-text)',
    fontSize: 'var(--text-base)', width: '100%', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginBottom: '4px', display: 'block' }

  function compute() {
    const height = metric ? Number(heightCm) : (Number(heightFt) * 12 + Number(heightIn || 0))
    const r = estimateTargets({
      sex, age, weight, goalWeight,
      weightUnit: metric ? 'kg' : 'lbs',
      height, heightUnit: metric ? 'cm' : 'in',
      activity, pace,
    })
    if (!r) { setError('Enter age, height, and current weight.'); setResult(null); return }
    setError(''); setResult(r)
  }

  const macro = (label, value, unit, color) => (
    <div style={{ flex: 1, minWidth: 64, textAlign: 'center', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 6px' }}>
      <div style={{ fontWeight: 700, fontSize: '1.05rem', color }}>{value}{unit}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Sex</label>
          <select value={sex} onChange={(e) => setSex(e.target.value)} style={inputStyle}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Age</label>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="years" style={inputStyle} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Units</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['imperial', 'metric'].map((u) => (
            <button key={u} type="button" onClick={() => setUnits(u)} style={{
              flex: 1, padding: '7px', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 'var(--text-sm)', fontWeight: 600,
              border: `1px solid ${units === u ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: units === u ? 'var(--color-primary)' : 'var(--color-surface)',
              color: units === u ? 'var(--color-on-accent)' : 'var(--color-muted)',
            }}>{u === 'imperial' ? 'lb / ft·in' : 'kg / cm'}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Current weight ({wUnit})</label>
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={metric ? 'e.g. 80' : 'e.g. 176'} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Goal weight ({wUnit})</label>
          <input type="number" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="optional" style={inputStyle} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Height</label>
        {metric ? (
          <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" style={inputStyle} />
        ) : (
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="number" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" style={inputStyle} />
            <input type="number" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" style={inputStyle} />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Activity</label>
          <select value={activity} onChange={(e) => setActivity(e.target.value)} style={inputStyle}>
            {ACTIVITY_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Pace</label>
          <select value={pace} onChange={(e) => setPace(e.target.value)} style={inputStyle}>
            {PACES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', margin: 0 }}>{error}</p>}

      <Button onClick={compute} variant="outline" size="sm">Calculate</Button>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {macro('Calories', result.calories, '', 'var(--color-calories)')}
            {macro('Protein', result.protein, 'g', 'var(--color-protein)')}
            {macro('Carbs', result.carbs, 'g', 'var(--color-carbs)')}
            {macro('Fat', result.fat, 'g', 'var(--color-fat)')}
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
            Maintenance ≈ <strong style={{ color: 'var(--color-text)' }}>{result.maintenanceCalories}</strong> cal.{' '}
            {result.direction === 'maintain'
              ? 'Set to maintain / recomp.'
              : `${result.direction === 'lose' ? 'Lose' : 'Gain'} ~${result.weeklyChange} ${wUnit}/wk` +
                (result.weeksToGoal ? ` · about ${result.weeksToGoal} weeks to goal.` : '.')}
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-faint)', margin: 0, lineHeight: 1.5 }}>
            A starting point from the stats — review and adjust as needed.
          </p>
          <Button onClick={() => onApply(result)} variant="primary" size="sm">Use these targets</Button>
        </div>
      )}
    </div>
  )
}
