import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'

const unitConversions = {
  g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5
}

const EXERCISE_TYPES = [
  '🏃 Running', '🚴 Cycling', '🏋️ Elliptical', '🏊 Swimming',
  '🚣 Rowing', '⛹️ Jump Rope', '🪜 Stair Climber', '🚶 Walking',
  '⚡ HIIT', '🔥 Other'
]

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function Log({ session, profile }) {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))

  // Nutrition state
  const [food, setFood] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [entries, setEntries] = useState([])
  const [editingEntry, setEditingEntry] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [servingSize, setServingSize] = useState('100')
  const [servingUnit, setServingUnit] = useState('g')
  const [baseNutrients, setBaseNutrients] = useState(null)
  const [editingCardio, setEditingCardio] = useState(null)

  // Weight state
  const [weight, setWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('lbs')
  const [savedWeight, setSavedWeight] = useState(null)

  // Cardio state
  const [exerciseType, setExerciseType] = useState(EXERCISE_TYPES[0])
  const [duration, setDuration] = useState('')
  const [caloriesBurned, setCaloriesBurned] = useState('')
  const [avgHeartRate, setAvgHeartRate] = useState('')
  const [cardioEntries, setCardioEntries] = useState([])

  // Steps state
  const [steps, setSteps] = useState('')
  const [distance, setDistance] = useState('')
  const [savedSteps, setSavedSteps] = useState(null)

  useEffect(() => {
    fetchEntries()
    fetchWeight()
    fetchCardioEntries()
    fetchSteps()
    setFeedback('')
  }, [selectedDate])

  useEffect(() => {
    if (!baseNutrients) return
    const grams = (parseInt(servingSize) || 100) * (unitConversions[servingUnit] || 1)
    const multiplier = grams / 100
    setCalories(Math.round(baseNutrients.calories * multiplier).toString())
    setProtein(Math.round(baseNutrients.protein * multiplier).toString())
    setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
    setFat(Math.round(baseNutrients.fat * multiplier).toString())
  }, [servingSize, servingUnit, baseNutrients])

  // Nutrition functions
  async function fetchEntries() {
    const { data, error } = await supabase
      .from('nutrition_log').select('*')
      .eq('logged_date', selectedDate).order('created_at', { ascending: true })
    if (error) console.error('Error fetching:', error)
    else setEntries(data)
  }

  async function handleSubmit() {
    if (!food || !calories) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (editingEntry) {
      const { error } = await supabase.from('nutrition_log').update({
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseInt(servingSize) || 100, serving_unit: servingUnit
      }).eq('id', editingEntry.id)
      if (error) console.error('Error updating:', error)
      else { setEditingEntry(null); clearNutritionForm(); fetchEntries() }
    } else {
      const { error } = await supabase.from('nutrition_log').insert([{
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseInt(servingSize) || 100, serving_unit: servingUnit,
        logged_date: selectedDate, user_id: currentSession.user.id
      }])
      if (error) console.error('Error saving:', error)
      else { clearNutritionForm(); fetchEntries() }
    }
  }

  function clearNutritionForm() {
    setFood(''); setCalories(''); setProtein('')
    setCarbs(''); setFat(''); setServingSize('100')
    setServingUnit('g'); setBaseNutrients(null)
  }

  function startEdit(entry) {
    setEditingEntry(entry)
    setFood(entry.food)
    setCalories(entry.calories.toString())
    setProtein(entry.protein.toString())
    setCarbs(entry.carbs.toString())
    setFat(entry.fat.toString())
    setServingSize(entry.serving_size.toString())
    setServingUnit(entry.serving_unit || 'g')
    setBaseNutrients(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteEntry(id) {
    const { error } = await supabase.from('nutrition_log').delete().eq('id', id)
    if (error) console.error('Error deleting:', error)
    else { setFeedback(''); fetchEntries() }
  }

  async function getAIFeedback() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nutrition-coach',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ entries }) }
    )
    const data = await response.json()
    setFeedback(data.message)
    setLoading(false)
  }

  async function lookupBarcode(barcode) {
    setLookupError('')
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await response.json()
      if (data.status === 0) { setLookupError('Product not found.'); return }
      const nutrients = data.product.nutriments
      const base = {
        calories: Math.round(nutrients['energy-kcal_100g'] || 0),
        protein: Math.round(nutrients['proteins_100g'] || 0),
        carbs: Math.round(nutrients['carbohydrates_100g'] || 0),
        fat: Math.round(nutrients['fat_100g'] || 0),
      }
      setBaseNutrients(base)
      setFood(data.product.product_name || '')
      setServingSize('100'); setServingUnit('g')
      setCalories(base.calories.toString()); setProtein(base.protein.toString())
      setCarbs(base.carbs.toString()); setFat(base.fat.toString())
      setShowBarcodeInput(false); setBarcodeInput('')
    } catch { setLookupError('Lookup failed.') }
  }

  // Weight functions
  async function fetchWeight() {
    const { data, error } = await supabase.from('weight_log').select('*')
      .eq('logged_date', selectedDate).maybeSingle()
    if (error) { console.error(error); return }
    if (data) { setSavedWeight(data); setWeight(data.weight.toString()); setWeightUnit(data.unit) }
    else { setSavedWeight(null); setWeight(''); setWeightUnit('lbs') }
  }

  async function saveWeight() {
    if (!weight) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (savedWeight) {
      const { error } = await supabase.from('weight_log').update({ weight: parseFloat(weight), unit: weightUnit }).eq('id', savedWeight.id)
      if (error) console.error(error); else fetchWeight()
    } else {
      const { error } = await supabase.from('weight_log').insert([{ weight: parseFloat(weight), unit: weightUnit, logged_date: selectedDate, user_id: currentSession.user.id }])
      if (error) console.error(error); else fetchWeight()
    }
  }

  // Cardio functions
  async function fetchCardioEntries() {
    const { data, error } = await supabase.from('cardio_log').select('*')
      .eq('logged_date', selectedDate).order('created_at', { ascending: true })
    if (error) console.error(error)
    else setCardioEntries(data)
  }

  async function logCardio() {
  if (!duration) return
  const { data: { session: currentSession } } = await supabase.auth.getSession()

  if (editingCardio) {
    const { error } = await supabase.from('cardio_log').update({
      exercise_type: exerciseType,
      duration: parseInt(duration),
      calories_burned: parseInt(caloriesBurned) || null,
      avg_heart_rate: parseInt(avgHeartRate) || null
    }).eq('id', editingCardio.id)
    if (error) console.error(error)
    else { setEditingCardio(null); setDuration(''); setCaloriesBurned(''); setAvgHeartRate(''); fetchCardioEntries() }
  } else {
    const { error } = await supabase.from('cardio_log').insert([{
      exercise_type: exerciseType, duration: parseInt(duration),
      calories_burned: parseInt(caloriesBurned) || null,
      avg_heart_rate: parseInt(avgHeartRate) || null,
      logged_date: selectedDate, user_id: currentSession.user.id
    }])
    if (error) console.error(error)
    else { setDuration(''); setCaloriesBurned(''); setAvgHeartRate(''); fetchCardioEntries() }
  }
}

  async function deleteCardio(id) {
    const { error } = await supabase.from('cardio_log').delete().eq('id', id)
    if (error) console.error(error); else fetchCardioEntries()
  }
function startEditCardio(entry) {
  setEditingCardio(entry)
  setExerciseType(entry.exercise_type)
  setDuration(entry.duration.toString())
  setCaloriesBurned(entry.calories_burned?.toString() || '')
  setAvgHeartRate(entry.avg_heart_rate?.toString() || '')
}

  // Steps functions
  async function fetchSteps() {
    const { data, error } = await supabase.from('steps_log').select('*')
      .eq('logged_date', selectedDate).maybeSingle()
    if (error) { console.error(error); return }
    if (data) { setSavedSteps(data); setSteps(data.steps.toString()); setDistance(data.distance?.toString() || '') }
    else { setSavedSteps(null); setSteps(''); setDistance('') }
  }

  async function saveSteps() {
    if (!steps) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (savedSteps) {
      const { error } = await supabase.from('steps_log').update({ steps: parseInt(steps), distance: parseFloat(distance) || null }).eq('id', savedSteps.id)
      if (error) console.error(error); else fetchSteps()
    } else {
      const { error } = await supabase.from('steps_log').insert([{ steps: parseInt(steps), distance: parseFloat(distance) || null, logged_date: selectedDate, user_id: currentSession.user.id }])
      if (error) console.error(error); else fetchSteps()
    }
  }

  // Nav functions
  function goToPrevDay() { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDateString(d)) }
  function goToNextDay() { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toLocalDateString(d)) }
  const isToday = selectedDate === toLocalDateString(new Date())

  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '10px 14px',
    color: 'var(--color-text)', fontSize: '1rem'
  }

  const sectionStyle = {
    backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '20px',
    display: 'flex', flexDirection: 'column', gap: '12px'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1>Log</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={goToPrevDay} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <input type="date" value={selectedDate} max={toLocalDateString(new Date())} onChange={(e) => setSelectedDate(e.target.value)} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 12px', color: 'var(--color-text)', fontSize: '1rem', colorScheme: 'dark' }} />
          <button onClick={goToNextDay} disabled={isToday} style={{ backgroundColor: 'var(--color-surface)', color: isToday ? 'var(--color-muted)' : 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: isToday ? 'not-allowed' : 'pointer', fontSize: '1rem', opacity: isToday ? 0.5 : 1 }}>→</button>
          {isToday && (
            <span style={{
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '999px',
              letterSpacing: '0.05em'
            }}>
              TODAY
            </span>
          )}
          
          {!isToday && <button onClick={() => setSelectedDate(toLocalDateString(new Date()))} style={{ backgroundColor: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontSize: '0.875rem' }}>Today</button>}
        </div>
      </div>

      {/* Weight */}
      <div style={sectionStyle}>
        <h2>Weight</h2>
        {savedWeight && <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Logged: {savedWeight.weight} {savedWeight.unit}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="number" placeholder={`Weight (${weightUnit})`} value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
          <button type="button" onClick={saveWeight} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}>{savedWeight ? 'Update' : 'Log'}</button>
        </div>
      </div>

      {/* Cardio */}
      <div style={sectionStyle}>
        <h2>Cardio</h2>
        <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {EXERCISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <input type="number" placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Calories burned" value={caloriesBurned} onChange={(e) => setCaloriesBurned(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Avg heart rate" value={avgHeartRate} onChange={(e) => setAvgHeartRate(e.target.value)} style={inputStyle} />
        </div>
        <button type="button" onClick={logCardio} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer', fontWeight: 600, width: 'fit-content' }}>
  {editingCardio ? 'Update session' : 'Log session'}
</button>
{editingCardio && (
  <button type="button" onClick={() => { setEditingCardio(null); setDuration(''); setCaloriesBurned(''); setAvgHeartRate('') }} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer' }}>
    Cancel
  </button>
)}
        {cardioEntries.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--color-border)' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{e.exercise_type}</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                {e.duration} min{e.calories_burned ? ` · ${e.calories_burned} cal` : ''}{e.avg_heart_rate ? ` · ${e.avg_heart_rate} bpm` : ''}
              </p>
            </div>
            <button onClick={() => deleteCardio(e.id)} style={{ backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>✕</button>
            <button onClick={() => startEditCardio(e)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>✎</button>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div style={sectionStyle}>
        <h2>Steps</h2>
        {savedSteps && <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Logged: {savedSteps.steps.toLocaleString()} steps{savedSteps.distance ? ` · ${savedSteps.distance} mi` : ''}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="number" placeholder="Steps" value={steps} onChange={(e) => setSteps(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
          <input type="number" placeholder="Distance (mi)" value={distance} onChange={(e) => setDistance(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={saveSteps} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}>{savedSteps ? 'Update' : 'Log'}</button>
        </div>
      </div>

      {/* Nutrition */}
      <div style={sectionStyle}>
        <h2>Nutrition</h2>
        <input type="text" placeholder="Food name" value={food} onChange={(e) => setFood(e.target.value)} style={inputStyle} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setShowScanner(true)} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '8px 14px', cursor: 'pointer', fontSize: '0.875rem' }}>📷 Scan barcode</button>
          <button type="button" onClick={() => setShowBarcodeInput(!showBarcodeInput)} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '8px 14px', cursor: 'pointer', fontSize: '0.875rem' }}># Enter barcode</button>
        </div>
        {showScanner && <BarcodeScanner onDetected={(barcode) => { setShowScanner(false); lookupBarcode(barcode) }} onClose={() => setShowScanner(false)} />}
        {showBarcodeInput && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="Enter barcode number" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={() => lookupBarcode(barcodeInput)} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}>Lookup</button>
          </div>
        )}
        {lookupError && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lookupError}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <input type="number" placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Protein (g)" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Carbs (g)" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Fat (g)" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: '8px', gridColumn: '1 / -1' }}>
            <input type="number" placeholder="Serving size" value={servingSize} onChange={(e) => setServingSize(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <select value={servingUnit} onChange={(e) => setServingUnit(e.target.value)} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
              <option value="g">g</option><option value="oz">oz</option><option value="ml">ml</option>
              <option value="cup">cup</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={handleSubmit} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>{editingEntry ? 'Update entry' : 'Add entry'}</button>
        {editingEntry && (
          <button type="button" onClick={() => { setEditingEntry(null); clearNutritionForm() }} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No nutrition entries for this day yet.</p>}
        {entries.map((entry) => (
          <div key={entry.id} style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{entry.food}</span>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{entry.calories} cal</span>
              <span style={{ color: 'var(--color-muted)' }}>P: {entry.protein}g</span>
              <span style={{ color: 'var(--color-muted)' }}>C: {entry.carbs}g</span>
              <span style={{ color: 'var(--color-muted)' }}>F: {entry.fat}g</span>
              <span style={{ color: 'var(--color-muted)' }}>{entry.serving_size}{entry.serving_unit}</span>
              <button onClick={() => startEdit(entry)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: '2px 8px' }}>✎</button>
              <button onClick={() => deleteEntry(entry.id)} style={{ backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: '2px 8px' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {entries.length > 0 && profile?.role !== 'client' && (
        <button onClick={getAIFeedback} disabled={loading} style={{ backgroundColor: '#1a1a1a', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, width: 'fit-content', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading && <span style={{ width: '14px', height: '14px', border: '2px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Analyzing...' : 'Get AI feedback'}
        </button>
      )}

      {feedback && profile?.role !== 'client' && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
          <button onClick={() => setFeedback('')} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.875rem', width: 'fit-content' }}>Clear</button>
        </div>
      )}
    </div>
  )
}

export default Log
