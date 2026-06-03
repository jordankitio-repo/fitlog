import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { toLocalDateString } from '../utils/dateHelpers'

const unitConversions = {
  g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5
}

const EXERCISE_TYPES = [
  '🏃 Running', '🚴 Cycling', '🏋️ Elliptical', '🏊 Swimming',
  '🚣 Rowing', '⛹️ Jump Rope', '🪜 Stair Climber', '🚶 Walking',
  '⚡ HIIT', '🔥 Other'
]

function Log({ session, profile }) {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))

  function formatTime(timeStr) {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${minutes} ${ampm}`
  }

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
  const [nutritionErrors, setNutritionErrors] = useState({})
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [servingSize, setServingSize] = useState('100')
  const [servingUnit, setServingUnit] = useState('g')
  const [baseNutrients, setBaseNutrients] = useState(null)
  const [baseServingSize, setBaseServingSize] = useState(null)
  const [baseServingLabel, setBaseServingLabel] = useState('')
  const [showCopyPanel, setShowCopyPanel] = useState(false)
  const [copyFromDate, setCopyFromDate] = useState('')
  const [copyEntries, setCopyEntries] = useState([])
  const [selectedCopyIds, setSelectedCopyIds] = useState(new Set())
  const [copyLoading, setCopyLoading] = useState(false)
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
    if (baseServingSize != null) {
      // Mode A: serving-based — multiplier is number of servings
      const multiplier = parseFloat(servingSize) || 1
      setCalories(Math.round(baseNutrients.calories * multiplier).toString())
      setProtein(Math.round(baseNutrients.protein * multiplier).toString())
      setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
      setFat(Math.round(baseNutrients.fat * multiplier).toString())
    } else {
      // Mode B: 100g-based — same as before
      const grams = (parseInt(servingSize) || 100) * (unitConversions[servingUnit] || 1)
      const multiplier = grams / 100
      setCalories(Math.round(baseNutrients.calories * multiplier).toString())
      setProtein(Math.round(baseNutrients.protein * multiplier).toString())
      setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
      setFat(Math.round(baseNutrients.fat * multiplier).toString())
    }
  }, [servingSize, servingUnit, baseNutrients, baseServingSize])

  // Nutrition functions
  async function fetchEntries() {
    const { data, error } = await supabase
      .from('nutrition_log').select('*')
      .eq('logged_date', selectedDate).order('created_at', { ascending: true })
    if (error) console.error('Error fetching:', error)
    else setEntries(data)
  }

  async function fetchCopyEntries(date) {
    if (!date) return
    const { data, error } = await supabase
      .from('nutrition_log').select('*')
      .eq('logged_date', date)
      .order('created_at', { ascending: true })

    if (error) console.error('Error fetching copy entries:', error)
    else setCopyEntries(data || [])
  }

  async function copySelectedToToday() {
    if (selectedCopyIds.size === 0) return

    setCopyLoading(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const inserts = copyEntries
      .filter(e => selectedCopyIds.has(e.id))
      .map(e => ({
        food: e.food,
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        serving_size: e.serving_size,
        serving_unit: e.serving_unit,
        logged_date: selectedDate,
        user_id: currentSession.user.id
      }))

    const { error } = await supabase.from('nutrition_log').insert(inserts)
    if (error) console.error('Error copying entries:', error)
    else {
      fetchEntries()
      setShowCopyPanel(false)
      setSelectedCopyIds(new Set())
      setCopyEntries([])
      setCopyFromDate('')
    }
    setCopyLoading(false)
  }

  async function handleSubmit() {
    const newErrors = {}
    if (!food.trim()) newErrors.food = 'Food name is required.'
    if (!calories) newErrors.calories = 'Calories is required.'
    else if (parseInt(calories) < 0) newErrors.calories = 'Calories must be a positive number.'

    if (Object.keys(newErrors).length > 0) {
      setNutritionErrors(newErrors)
      return
    }
    setNutritionErrors({})
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (editingEntry) {
      const { error } = await supabase.from('nutrition_log').update({
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit
      }).eq('id', editingEntry.id)
      if (error) console.error('Error updating:', error)
      else { setEditingEntry(null); clearNutritionForm(); fetchEntries() }
    } else {
      const { error } = await supabase.from('nutrition_log').insert([{
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit,
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
    setBaseServingSize(null); setBaseServingLabel('')
    setNutritionErrors({})
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
    setBaseServingSize(null)
    setBaseServingLabel('')
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
      const hasServingData = nutrients['energy-kcal_serving'] != null

      let base
      if (hasServingData) {
        base = {
          calories: Math.round(nutrients['energy-kcal_serving'] || 0),
          protein: Math.round(nutrients['proteins_serving'] || 0),
          carbs: Math.round(nutrients['carbohydrates_serving'] || 0),
          fat: Math.round(nutrients['fat_serving'] || 0),
        }
        setBaseServingSize(1)
        setBaseServingLabel(data.product.serving_size || '1 serving')
        setServingSize('1')
        setServingUnit('serving')
      } else {
        base = {
          calories: Math.round(nutrients['energy-kcal_100g'] || 0),
          protein: Math.round(nutrients['proteins_100g'] || 0),
          carbs: Math.round(nutrients['carbohydrates_100g'] || 0),
          fat: Math.round(nutrients['fat_100g'] || 0),
        }
        setBaseServingSize(null)
        setBaseServingLabel('')
        setServingSize('100')
        setServingUnit('g')
      }

      setBaseNutrients(base)
      setFood(data.product.product_name || '')
      setCalories(base.calories.toString())
      setProtein(base.protein.toString())
      setCarbs(base.carbs.toString())
      setFat(base.fat.toString())
      setShowBarcodeInput(false)
      setBarcodeInput('')
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
      const { error } = await supabase.from('weight_log').update({
        weight: parseFloat(weight),
        unit: weightUnit,
        weighed_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      }).eq('id', savedWeight.id)
      if (error) console.error(error); else fetchWeight()
    } else {
      const { error } = await supabase.from('weight_log').insert([{ weight: parseFloat(weight), unit: weightUnit, logged_date: selectedDate, user_id: currentSession.user.id, weighed_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) }])
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
    color: 'var(--color-text)', fontSize: '1rem', minWidth: 0
  }

  const sectionStyle = {
    backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '20px',
    display: 'flex', flexDirection: 'column', gap: '12px'
  }

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1>Log</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button onClick={goToPrevDay} variant="muted" size="sm">←</Button>
          <input type="date" value={selectedDate} max={toLocalDateString(new Date())} onChange={(e) => setSelectedDate(e.target.value)} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 12px', color: 'var(--color-text)', fontSize: '1rem', colorScheme: 'dark' }} />
          <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm">→</Button>
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
          
          {!isToday && <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="outline" size="sm">Today</Button>}
        </div>
      </div>

      {/* Weight */}
      <div style={sectionStyle}>
        <h2>Weight</h2>
        {savedWeight && (
  <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
    Logged: {savedWeight.weight} {savedWeight.unit}{savedWeight.weighed_at ? ` · ${formatTime(savedWeight.weighed_at)}` : ''}
  </p>
)}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input type="number" placeholder={`Weight (${weightUnit})`} value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
          <Button onClick={saveWeight} variant="primary">
            {savedWeight ? 'Update' : 'Log'}
          </Button>
        </div>
      </div>

      {/* Cardio */}
      <div style={sectionStyle}>
        <h2>Cardio</h2>
        <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {EXERCISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
          <input type="number" placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Calories burned" value={caloriesBurned} onChange={(e) => setCaloriesBurned(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Avg heart rate" value={avgHeartRate} onChange={(e) => setAvgHeartRate(e.target.value)} style={inputStyle} />
        </div>
        <Button onClick={logCardio} variant="primary">
          {editingCardio ? 'Update session' : 'Log session'}
        </Button>
        {editingCardio && (
          <Button onClick={() => { setEditingCardio(null); setDuration(''); setCaloriesBurned(''); setAvgHeartRate('') }} variant="ghost">
            Cancel
          </Button>
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input type="number" placeholder="Steps" value={steps} onChange={(e) => setSteps(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
          <input type="number" placeholder="Miles" value={distance} onChange={(e) => setDistance(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <Button onClick={saveSteps} variant="primary">
            {savedSteps ? 'Update' : 'Log'}
          </Button>
        </div>
      </div>

      {/* Nutrition */}
      <div style={sectionStyle}>
        <h2>Nutrition</h2>
        <input
          type="text"
          placeholder="Food name"
          value={food}
          onChange={(e) => { setFood(e.target.value); setNutritionErrors(p => ({ ...p, food: '' })) }}
          style={{ ...inputStyle, borderColor: nutritionErrors.food ? '#f87171' : 'var(--color-border)' }}
        />
        {nutritionErrors.food && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-4px' }}>{nutritionErrors.food}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button onClick={() => setShowScanner(true)} variant="muted" size="sm">📷 Scan barcode</Button>
          <Button onClick={() => setShowBarcodeInput(!showBarcodeInput)} variant="muted" size="sm"># Enter barcode</Button>
        </div>
        {showScanner && <BarcodeScanner onDetected={(barcode) => { setShowScanner(false); lookupBarcode(barcode) }} onClose={() => setShowScanner(false)} />}
        {showBarcodeInput && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="Enter barcode number" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <Button onClick={() => lookupBarcode(barcodeInput)} variant="primary">Lookup</Button>
          </div>
        )}
        {lookupError && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lookupError}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <input
            type="number"
            placeholder="Calories"
            value={calories}
            onChange={(e) => { setCalories(e.target.value); setNutritionErrors(p => ({ ...p, calories: '' })) }}
            style={{ ...inputStyle, borderColor: nutritionErrors.calories ? '#f87171' : 'var(--color-border)', minWidth: 0 }}
          />
          {nutritionErrors.calories && <p style={{ color: '#f87171', fontSize: '0.75rem' }}>{nutritionErrors.calories}</p>}
          <input type="number" placeholder="Protein (g)" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Carbs (g)" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Fat (g)" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: '8px', gridColumn: '1 / -1', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder={baseServingSize != null ? 'Servings' : 'Serving size'}
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              {baseServingSize == null && (
                <select
                  value={servingUnit}
                  onChange={(e) => setServingUnit(e.target.value)}
                  style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}
                >
                  <option value="g">g</option>
                  <option value="oz">oz</option>
                  <option value="ml">ml</option>
                  <option value="cup">cup</option>
                  <option value="tbsp">tbsp</option>
                  <option value="tsp">tsp</option>
                </select>
              )}
            </div>
            {baseServingLabel && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0 }}>
                1 serving = {baseServingLabel}
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => { setShowCopyPanel(!showCopyPanel); setCopyEntries([]); setSelectedCopyIds(new Set()) }} variant="ghost" size="sm">
          {showCopyPanel ? 'Cancel' : '↩ Copy from another day'}
        </Button>
        {showCopyPanel && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={copyFromDate}
                max={toLocalDateString(new Date())}
                onChange={(e) => {
                  setCopyFromDate(e.target.value)
                  setCopyEntries([])
                  setSelectedCopyIds(new Set())
                  if (e.target.value) fetchCopyEntries(e.target.value)
                }}
                style={{ ...inputStyle, colorScheme: 'dark', flex: 1 }}
              />
              {copyEntries.length > 0 && (
                <Button
                  onClick={() => setSelectedCopyIds(selectedCopyIds.size === copyEntries.length ? new Set() : new Set(copyEntries.map(e => e.id)))}
                  variant="ghost"
                  size="sm"
                >
                  {selectedCopyIds.size === copyEntries.length ? 'Deselect all' : 'Select all'}
                </Button>
              )}
            </div>

            {copyFromDate && copyEntries.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>No entries for this day.</p>
            )}

            {copyEntries.map(e => (
              <div
                key={e.id}
                onClick={() => {
                  const next = new Set(selectedCopyIds)
                  next.has(e.id) ? next.delete(e.id) : next.add(e.id)
                  setSelectedCopyIds(next)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: selectedCopyIds.has(e.id) ? 'rgba(79,142,247,0.1)' : 'var(--color-bg)',
                  border: `1px solid ${selectedCopyIds.has(e.id) ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius)'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedCopyIds.has(e.id)}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{e.food}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    {e.calories} cal · P: {e.protein}g · C: {e.carbs}g · F: {e.fat}g
                  </p>
                </div>
              </div>
            ))}

            {selectedCopyIds.size > 0 && (
              <Button onClick={copySelectedToToday} variant="primary" loading={copyLoading}>
                Add {selectedCopyIds.size} {selectedCopyIds.size === 1 ? 'item' : 'items'} to {selectedDate === toLocalDateString(new Date()) ? 'today' : selectedDate}
              </Button>
            )}
          </div>
        )}
        <Button onClick={handleSubmit} variant="primary">
          {editingEntry ? 'Update entry' : 'Add entry'}
        </Button>
        {editingEntry && (
          <Button onClick={() => { setEditingEntry(null); clearNutritionForm() }} variant="ghost">
            Cancel
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.length === 0 && (
          <EmptyState
            icon="🍽️"
            title="Nothing logged yet"
            description="Add your first meal above to start tracking today's nutrition."
          />
        )}
        {entries.map((entry) => (
          <div key={entry.id} style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, flex: 1, marginRight: '8px', fontSize: '0.875rem' }}>{entry.food}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.875rem' }}>{entry.calories} cal</span>
                <button onClick={() => startEdit(entry)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: '2px 6px' }}>✎</button>
                <button onClick={() => deleteEntry(entry.id)} style={{ backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: '2px 6px' }}>✕</button>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              P: {entry.protein}g · C: {entry.carbs}g · F: {entry.fat}g · {entry.serving_size}{entry.serving_unit}
            </p>
          </div>
        ))}
      </div>

      {entries.length > 0 && profile?.role !== 'client' && (
        <Button onClick={getAIFeedback} variant="ai" loading={loading}>
          {loading ? 'Analyzing...' : 'Get AI feedback'}
        </Button>
      )}

      {feedback && profile?.role !== 'client' && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
          <Button onClick={() => setFeedback('')} variant="ghost" size="sm">Clear</Button>
        </div>
      )}
    </div>
  )
}

export default Log
