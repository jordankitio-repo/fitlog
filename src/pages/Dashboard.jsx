import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
)

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function SectionHeader({ title, collapsed, onToggle, badge }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {badge && (
          <span style={{
            backgroundColor: 'var(--color-primary)', color: '#fff',
            fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px',
            borderRadius: '999px'
          }}>{badge}</span>
        )}
      </div>
      <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
        {collapsed ? '▶' : '▼'}
      </span>
    </div>
  )
}

function Dashboard({ profile }) {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [reports, setReports] = useState([])
  const [weightHistory, setWeightHistory] = useState([])
  const [calorieHistory, setCalorieHistory] = useState([])
  const [targets, setTargets] = useState(null)
  const [cardioToday, setCardioToday] = useState({ minutes: 0, sessions: 0 })
  const [stepsToday, setStepsToday] = useState(null)
  const [cardioHistory, setCardioHistory] = useState([])
  const [stepsHistory, setStepsHistory] = useState([])
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [checkIn, setCheckIn] = useState({ adherence_rating: 5, energy_level: 5, obstacles: '', notes: '' })
  const [checkInSaved, setCheckInSaved] = useState(false)
  const [existingCheckIn, setExistingCheckIn] = useState(null)
  const [streak, setStreak] = useState(0)
  const [loggedToday, setLoggedToday] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Section collapse state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    reports: false,
    checkin: false,
    stats: false,
    targets: false,
    weightChart: false,
    calorieChart: false,
    cardioChart: false,
    stepsChart: false,
  })
  const [collapsedWeeks, setCollapsedWeeks] = useState({})

  function toggleSection(key) {
    setSectionsCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    fetchTotals()
    fetchWeight()
    fetchReports()
    fetchWeightHistory()
    fetchCalorieHistory()
    fetchTargets()
    fetchCardioToday()
    fetchStepsToday()
    fetchCardioHistory()
    fetchStepsHistory()
    fetchStreak()
    if (profile?.role === 'client') fetchCheckIn()
  }, [selectedDate])

  async function fetchTotals() {
    const { data, error } = await supabase
      .from('nutrition_log').select('calories, protein, carbs, fat')
      .eq('logged_date', selectedDate)
    if (error) { console.error(error); return }
    const totals = data.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
    setTotals(totals)
  }

  async function fetchWeight() {
    const { data, error } = await supabase
      .from('weight_log').select('*').eq('logged_date', selectedDate).maybeSingle()
    if (error) { console.error(error); return }
    setWeightEntry(data)
  }

  async function fetchReports() {
    const { data, error } = await supabase
      .from('reports').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    else {
      setReports(data)
      // Auto-expand weeks with unread reports
      const grouped = {}
      data.filter(r => !r.archived).forEach(r => {
        if (!grouped[r.week_of]) grouped[r.week_of] = []
        grouped[r.week_of].push(r)
      })
      const newCollapsed = {}
      Object.entries(grouped).forEach(([week, weekReports]) => {
        const hasUnread = weekReports.some(r => !r.read_at)
        newCollapsed[week] = !hasUnread // expand if unread, collapse if all read
      })
      setCollapsedWeeks(newCollapsed)
    }
  }

  async function markAsRead(reportIds) {
    await supabase
      .from('reports')
      .update({ read_at: new Date().toISOString() })
      .in('id', reportIds)
      .is('read_at', null)
    fetchReports()
  }

  async function archiveReport(reportId) {
    await supabase.from('reports').update({ archived: true }).eq('id', reportId)
    fetchReports()
  }

  async function unarchiveReport(reportId) {
    await supabase.from('reports').update({ archived: false }).eq('id', reportId)
    fetchReports()
  }

  async function fetchWeightHistory() {
    const { data, error } = await supabase
      .from('weight_log').select('logged_date, weight, unit')
      .order('logged_date', { ascending: true }).limit(30)
    if (error) console.error(error)
    else setWeightHistory(data.map(d => ({ date: d.logged_date.slice(5), weight: parseFloat(d.weight) })))
  }

  async function fetchCalorieHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 13)
    const { data, error } = await supabase
      .from('nutrition_log').select('logged_date, calories')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.calories })
      setCalorieHistory(Object.entries(grouped).map(([date, calories]) => ({
        date: date.slice(5), calories
      })).sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  async function fetchTargets() {
    const { data, error } = await supabase
      .from('targets').select('*')
      .eq('user_id', (await supabase.auth.getSession()).data.session.user.id)
      .maybeSingle()
    if (error) console.error(error)
    else setTargets(data)
  }

  async function fetchCardioToday() {
    const { data, error } = await supabase
      .from('cardio_log').select('duration').eq('logged_date', selectedDate)
    if (error) console.error(error)
    else setCardioToday({
      minutes: data.reduce((sum, e) => sum + (e.duration || 0), 0),
      sessions: data.length
    })
  }

  async function fetchStepsToday() {
    const { data, error } = await supabase
      .from('steps_log').select('*').eq('logged_date', selectedDate).maybeSingle()
    if (error) console.error(error)
    else setStepsToday(data)
  }

  async function fetchCardioHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 13)
    const { data, error } = await supabase
      .from('cardio_log').select('logged_date, duration')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.duration })
      setCardioHistory(Object.entries(grouped).map(([date, minutes]) => ({
        date: date.slice(5), minutes
      })).sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  async function fetchStepsHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 13)
    const { data, error } = await supabase
      .from('steps_log').select('logged_date, steps')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else setStepsHistory(data.map(d => ({
      date: d.logged_date.slice(5), steps: d.steps
    })).sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function fetchStreak() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('logged_date')
      .eq('user_id', currentSession.user.id)
      .gte('logged_date', toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 60))))
      .order('logged_date', { ascending: false })
    if (error) { console.error(error); return }
    const loggedDates = [...new Set(data.map(e => e.logged_date))]
    const today = new Date()
    const startOffset = loggedDates.includes(toLocalDateString(today)) ? 0 : 1
    let count = 0
    for (let i = startOffset; i < 60; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (loggedDates.includes(toLocalDateString(d))) count++
      else break
    }
    setLoggedToday(loggedDates.includes(toLocalDateString(today)))
    setStreak(count)
  }

  async function fetchCheckIn() {
    const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
    const { data, error } = await supabase
      .from('check_ins').select('*')
      .eq('client_id', (await supabase.auth.getSession()).data.session.user.id)
      .eq('week_of', weekOf).maybeSingle()
    if (error) console.error(error)
    else if (data) {
      setExistingCheckIn(data)
      setCheckIn({
        adherence_rating: data.adherence_rating || 5,
        energy_level: data.energy_level || 5,
        obstacles: data.obstacles || '',
        notes: data.notes || ''
      })
    }
  }

  async function saveCheckIn() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
    const { error } = await supabase.from('check_ins').upsert({
      client_id: currentSession.user.id, week_of: weekOf,
      adherence_rating: checkIn.adherence_rating, energy_level: checkIn.energy_level,
      obstacles: checkIn.obstacles, notes: checkIn.notes
    }, { onConflict: 'client_id,week_of' })
    if (error) console.error(error)
    else { setCheckInSaved(true); setShowCheckIn(false); fetchCheckIn(); setTimeout(() => setCheckInSaved(false), 3000) }
  }

  const isToday = selectedDate === toLocalDateString(new Date())
  function goToPrevDay() { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDateString(d)) }
  function goToNextDay() { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toLocalDateString(d)) }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '6px 12px',
    color: 'var(--color-text)', fontSize: '1rem'
  }
  const chartOptions = {
    responsive: true, plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } },
      y: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
    }
  }
  const cardStyle = {
    backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '20px',
    display: 'flex', flexDirection: 'column', gap: '12px'
  }
  const navBtnStyle = {
    backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
    padding: '6px 12px', cursor: 'pointer', fontSize: '1rem'
  }

  const activeReports = reports.filter(r => !r.archived)
  const archivedReports = reports.filter(r => r.archived)
  const unreadCount = activeReports.filter(r => !r.read_at).length

  const groupByWeek = (list) => {
    const grouped = {}
    list.forEach(r => {
      if (!grouped[r.week_of]) grouped[r.week_of] = []
      grouped[r.week_of].push(r)
    })
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1>{profile?.role === 'client' ? 'My Progress' : 'Dashboard'}</h1>

        {streak > 0 && (
          <div style={{
            background: streak >= 7 ? 'linear-gradient(135deg, #065f46, #064e3b)' : 'linear-gradient(135deg, #1e3a5f, #1e3f6f)',
            border: `1px solid ${streak >= 7 ? '#34d399' : 'var(--color-primary)'}`,
            borderRadius: 'var(--radius)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: streak >= 7 ? '#6ee7b7' : '#93c5fd', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Logging streak</p>
              <p style={{ fontWeight: 800, fontSize: '2rem', color: streak >= 7 ? '#34d399' : 'var(--color-primary)', lineHeight: 1 }}>
                {streak} <span style={{ fontSize: '1rem', fontWeight: 400 }}>{streak === 1 ? 'day' : 'days'}</span>
              </p>
              {streak >= 7 && loggedToday && <p style={{ fontSize: '0.75rem', color: '#6ee7b7', marginTop: '4px' }}>Keep it going — you're on a roll!</p>}
              {!loggedToday && <p style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px' }}>Log today to keep your streak!</p>}
            </div>
            <span style={{ fontSize: streak >= 7 ? '2.5rem' : '2rem' }}>
              {streak >= 30 ? '🏆' : streak >= 14 ? '🔥' : streak >= 7 ? '⭐' : '💪'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={goToPrevDay} style={navBtnStyle}>←</button>
          <input type="date" value={selectedDate} max={toLocalDateString(new Date())} onChange={(e) => setSelectedDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          <button onClick={goToNextDay} disabled={isToday} style={{ ...navBtnStyle, color: isToday ? 'var(--color-muted)' : 'var(--color-text)', cursor: isToday ? 'not-allowed' : 'pointer', opacity: isToday ? 0.5 : 1 }}>→</button>
          {isToday && <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', letterSpacing: '0.05em' }}>TODAY</span>}
          {!isToday && <button onClick={() => setSelectedDate(toLocalDateString(new Date()))} style={{ backgroundColor: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontSize: '0.875rem' }}>Today</button>}
        </div>
      </div>

      {/* Coach reports */}
      {activeReports.length > 0 && (
        <div style={cardStyle}>
          <SectionHeader
            title="Reports from your coach"
            collapsed={sectionsCollapsed.reports}
            onToggle={() => toggleSection('reports')}
            badge={unreadCount > 0 ? `${unreadCount} new` : null}
          />
          {!sectionsCollapsed.reports && groupByWeek(activeReports).map(([week, weekReports]) => {
            const isWeekCollapsed = collapsedWeeks[week]
            const weekUnread = weekReports.filter(r => !r.read_at).length
            return (
              <div key={week} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div
                  onClick={() => {
                    if (collapsedWeeks[week]) {
                      const unreadIds = weekReports.filter(r => !r.read_at).map(r => r.id)
                      if (unreadIds.length > 0) markAsRead(unreadIds)
                    }
                    setCollapsedWeeks(prev => ({ ...prev, [week]: !prev[week] }))
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', backgroundColor: 'var(--color-bg)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Week of {week}</span>
                    <span style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-muted)', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                      {weekReports.length} {weekReports.length === 1 ? 'message' : 'messages'}
                    </span>
                    {weekUnread > 0 && (
                      <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                        {weekUnread} unread
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{isWeekCollapsed ? '▶' : '▼'}</span>
                </div>
                {!isWeekCollapsed && weekReports.map((r, i) => (
                  <div key={r.id} style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Message {i + 1}</p>
                        {!r.read_at && <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: '999px' }}>NEW</span>}
                      </div>
                      {r.read_at && (
                        <button onClick={() => archiveReport(r.id)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '2px 10px', cursor: 'pointer', fontSize: '0.7rem' }}>
                          Archive
                        </button>
                      )}
                    </div>
                    <p style={{ color: 'var(--color-text)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{r.content}</p>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Archived section */}
          {archivedReports.length > 0 && !sectionsCollapsed.reports && (
            <div>
              <button onClick={() => setShowArchived(!showArchived)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 0' }}>
                {showArchived ? '▼' : '▶'} Archived ({archivedReports.length})
              </button>
              {showArchived && groupByWeek(archivedReports).map(([week, weekReports]) => (
                <div key={week} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginTop: '8px', opacity: 0.7 }}>
                  <div style={{ padding: '10px 16px', backgroundColor: 'var(--color-bg)' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-muted)' }}>Week of {week}</span>
                  </div>
                  {weekReports.map((r, i) => (
                    <div key={r.id} style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Message {i + 1}</p>
                        <button onClick={() => unarchiveReport(r.id)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '2px 10px', cursor: 'pointer', fontSize: '0.7rem' }}>
                          Unarchive
                        </button>
                      </div>
                      <p style={{ color: 'var(--color-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{r.content}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weekly check-in */}
      {profile?.role === 'client' && (
        <div style={cardStyle}>
          <SectionHeader title="Weekly check-in" collapsed={sectionsCollapsed.checkin} onToggle={() => toggleSection('checkin')} />
          {!sectionsCollapsed.checkin && (
            <>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '-4px' }}>
                {existingCheckIn ? '✓ Submitted this week' : 'Let your coach know how your week went.'}
              </p>
              <button onClick={() => setShowCheckIn(!showCheckIn)} style={{ backgroundColor: existingCheckIn ? 'transparent' : 'var(--color-primary)', color: existingCheckIn ? 'var(--color-muted)' : '#fff', border: existingCheckIn ? '1px solid var(--color-border)' : 'none', borderRadius: 'var(--radius)', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', width: 'fit-content' }}>
                {existingCheckIn ? 'Edit' : 'Fill out'}
              </button>
              {showCheckIn && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Adherence — how well did you follow the plan? <strong>{checkIn.adherence_rating}/10</strong></p>
                    <input type="range" min="1" max="10" value={checkIn.adherence_rating} onChange={(e) => setCheckIn({ ...checkIn, adherence_rating: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Energy levels this week <strong>{checkIn.energy_level}/10</strong></p>
                    <input type="range" min="1" max="10" value={checkIn.energy_level} onChange={(e) => setCheckIn({ ...checkIn, energy_level: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Any obstacles or challenges?</p>
                    <textarea value={checkIn.obstacles} onChange={(e) => setCheckIn({ ...checkIn, obstacles: e.target.value })} placeholder="Stress, travel, injury, time constraints..." rows={3} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Notes for your coach</p>
                    <textarea value={checkIn.notes} onChange={(e) => setCheckIn({ ...checkIn, notes: e.target.value })} placeholder="Anything else you want your coach to know..." rows={3} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <button onClick={saveCheckIn} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer', fontWeight: 600, width: 'fit-content' }}>Submit check-in</button>
                </div>
              )}
              {checkInSaved && <p style={{ color: '#34d399', fontSize: '0.875rem' }}>✓ Check-in submitted successfully.</p>}
            </>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div style={cardStyle}>
        <SectionHeader title="Today's stats" collapsed={sectionsCollapsed.stats} onToggle={() => toggleSection('stats')} />
        {!sectionsCollapsed.stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <StatCard label="Calories" value={totals.calories} />
            <StatCard label="Protein" value={`${totals.protein}g`} />
            <StatCard label="Carbs" value={`${totals.carbs}g`} />
            <StatCard label="Fat" value={`${totals.fat}g`} />
            <StatCard label="Weight" value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'} />
            <StatCard label="Cardio" value={cardioToday.minutes > 0 ? `${cardioToday.minutes} min` : '—'} />
            <StatCard label="Steps" value={stepsToday ? stepsToday.steps.toLocaleString() : '—'} />
          </div>
        )}
      </div>

      {/* Today vs target */}
      {targets && (
        <div style={cardStyle}>
          <SectionHeader title="Today vs target" collapsed={sectionsCollapsed.targets} onToggle={() => toggleSection('targets')} />
          {!sectionsCollapsed.targets && (
            <>
              {[
                { label: 'Calories', actual: totals.calories, target: targets.calories, unit: 'cal' },
                { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g' },
                { label: 'Carbs', actual: totals.carbs, target: targets.carbs, unit: 'g' },
                { label: 'Fat', actual: totals.fat, target: targets.fat, unit: 'g' },
                { label: 'Cardio', actual: cardioToday.minutes, target: targets.cardio_minutes, unit: ' min' },
                { label: 'Steps', actual: stepsToday?.steps || 0, target: targets.steps, unit: '' },
              ].filter(m => m.target).map(m => {
                const pct = Math.min(Math.round((m.actual / m.target) * 100), 100)
                return (
                  <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span>{m.label}</span>
                      <span style={{ color: 'var(--color-muted)' }}>{m.actual} / {m.target}{m.unit} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 100 ? '#34d399' : 'var(--color-primary)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )
              })}
              {targets.weight_goal && weightEntry && (
                <div style={{ fontSize: '0.875rem', color: 'var(--color-muted)', paddingTop: '4px' }}>
                  Weight goal: {targets.weight_goal} {targets.weight_goal_unit} · Current: {weightEntry.weight} {weightEntry.unit} ·{' '}
                  <span style={{ color: Math.abs(weightEntry.weight - targets.weight_goal) < 1 ? '#34d399' : 'var(--color-primary)' }}>
                    {weightEntry.weight > targets.weight_goal ? `${(weightEntry.weight - targets.weight_goal).toFixed(1)} to go` : weightEntry.weight < targets.weight_goal ? `${(targets.weight_goal - weightEntry.weight).toFixed(1)} below goal` : 'Goal reached! 🎉'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Weight trend */}
      {weightHistory.length > 1 && (
        <div style={cardStyle}>
          <SectionHeader title="Weight trend" collapsed={sectionsCollapsed.weightChart} onToggle={() => toggleSection('weightChart')} />
          {!sectionsCollapsed.weightChart && (
            <Line data={{ labels: weightHistory.map(d => d.date), datasets: [{ label: 'Weight', data: weightHistory.map(d => d.weight), borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)', pointBackgroundColor: '#4f8ef7', tension: 0.3, fill: true }] }} options={chartOptions} />
          )}
        </div>
      )}

      {/* Calories chart */}
      {calorieHistory.length > 0 && (
        <div style={cardStyle}>
          <SectionHeader title="Calories — last 14 days" collapsed={sectionsCollapsed.calorieChart} onToggle={() => toggleSection('calorieChart')} />
          {!sectionsCollapsed.calorieChart && (
            <Bar data={{ labels: calorieHistory.map(d => d.date), datasets: [{ label: 'Calories', data: calorieHistory.map(d => d.calories), backgroundColor: '#4f8ef7', borderRadius: 4 }] }} options={chartOptions} />
          )}
        </div>
      )}

      {/* Cardio chart */}
      {cardioHistory.length > 0 && (
        <div style={cardStyle}>
          <SectionHeader title="Cardio — last 14 days" collapsed={sectionsCollapsed.cardioChart} onToggle={() => toggleSection('cardioChart')} />
          {!sectionsCollapsed.cardioChart && (
            <Bar data={{ labels: cardioHistory.map(d => d.date), datasets: [{ label: 'Minutes', data: cardioHistory.map(d => d.minutes), backgroundColor: '#a78bfa', borderRadius: 4 }] }} options={chartOptions} />
          )}
        </div>
      )}

      {/* Steps chart */}
      {stepsHistory.length > 0 && (
        <div style={cardStyle}>
          <SectionHeader title="Steps — last 14 days" collapsed={sectionsCollapsed.stepsChart} onToggle={() => toggleSection('stepsChart')} />
          {!sectionsCollapsed.stepsChart && (
            <Bar data={{ labels: stepsHistory.map(d => d.date), datasets: [{ label: 'Steps', data: stepsHistory.map(d => d.steps), backgroundColor: '#34d399', borderRadius: 4 }] }} options={chartOptions} />
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard
