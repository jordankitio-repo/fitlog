import { summarizeCompliance } from '../utils/complianceSummary'

// Quantified totals that pair with the 90-day ComplianceHeatmap: the grid shows
// the shape, these show the magnitude. Descriptive only.
//
// variant === 'coach' → compliance/assessment lens (on-target / partial / under
//   / avg of target) — the adherence read a coach evaluates.
// variant === 'solo'  → consistency/mirror lens (days logged + on-track days) —
//   self-motivation, never a performance verdict. Keeps the coach/solo wall.
const tileStyle = {
  backgroundColor: 'var(--color-bg)',
  borderRadius: 'var(--radius)',
  padding: '14px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
}

const numStyle = { fontWeight: 700, fontSize: '1.35rem', margin: 0, lineHeight: 1 }
const labelStyle = { fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: 4 }

export default function ComplianceSummary({ logsByDate, calorieTarget, variant = 'solo' }) {
  const s = summarizeCompliance(logsByDate, calorieTarget)
  if (s.logged === 0) return null

  // `wide` tiles span both grid columns. Coach: a full-width "days logged" header
  // over a 2x2 of the compliance buckets. Solo: two stacked full-width tiles.
  const tiles = variant === 'coach'
    ? [
        { num: `${s.logged}/${s.elapsed}`, label: 'Days logged', color: 'var(--color-text)', wide: true },
        ...(s.hasTarget ? [
          { num: s.onTarget, label: 'On-target', color: '#34d399' },
          { num: s.partial, label: 'Partial', color: '#fbbf24' },
          { num: s.under, label: 'Under', color: '#f87171' },
          { num: `${s.avgOfTarget}%`, label: 'Avg of target', color: 'var(--color-text)' },
        ] : []),
      ]
    : [
        { num: `${s.logged}/${s.elapsed}`, label: `Days logged (${s.coverage}%)`, color: '#34d399', wide: true },
        ...(s.hasTarget ? [
          { num: s.onTarget, label: 'On-track days', color: '#34d399', wide: true },
        ] : []),
      ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, height: '100%' }}>
      {tiles.map(t => (
        <div key={t.label} style={{ ...tileStyle, gridColumn: t.wide ? '1 / -1' : 'auto' }}>
          <p style={{ ...numStyle, color: t.color }}>{t.num}</p>
          <p style={labelStyle}>{t.label}</p>
        </div>
      ))}
    </div>
  )
}
