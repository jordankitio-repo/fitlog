import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Button from '../components/Button'
import SoloUpgrade from '../components/SoloUpgrade'
import { toLocalDateString, parseLocalDateString } from '../utils/dateHelpers'
import { cardStyle } from '../utils/styles'

const unitConversions = {
  g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5
}

const EXERCISE_TYPES = [
  'Running', 'Cycling', 'Elliptical', 'Swimming',
  'Rowing', 'Jump Rope', 'Stair Climber', 'Walking',
  'HIIT', 'Other'
]

function Log({ session, profile, hasSoloPremium = true }) {
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
  const [servingSize, setServingSize] = useState('')
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
  const [hideCalories, setHideCalories] = useState(false)
  const [weightExpanded, setWeightExpanded] = useState(false)
  const [nutritionExpanded, setNutritionExpanded] = useState(false)
  const [cardioExpanded, setCardioExpanded] = useState(false)
  const [stepsExpanded, setStepsExpanded] = useState(false)

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
    async function loadHideCalories() {
      if (profile?.role !== 'client' || !session?.user?.id) {
        setHideCalories(false)
        return
      }

      const { data, error } = await supabase
        .from('coach_clients')
        .select('hide_calories')
        .eq('client_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (error) console.error('Error fetching calorie visibility:', error)
      else setHideCalories(Boolean(data?.hide_calories))
    }

    loadHideCalories()
  }, [session?.user?.id, profile?.role])

  useEffect(() => {
    if (!baseNutrients) return
    if (baseServingSize != null) {
      const multiplier = parseFloat(servingSize) || 1
      setCalories(Math.round(baseNutrients.calories * multiplier).toString())
      setProtein(Math.round(baseNutrients.protein * multiplier).toString())
      setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
      setFat(Math.round(baseNutrients.fat * multiplier).toString())
    } else {
      const grams = (parseInt(servingSize) || 100) * (unitConversions[servingUnit] || 1)
      const multiplier = grams / 100
      setCalories(Math.round(baseNutrients.calories * multiplier).toString())
      setProtein(Math.round(baseNutrients.protein * multiplier).toString())
      setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
      setFat(Math.round(baseNutrients.fat * multiplier).toString())
    }
  }, [servingSize, servingUnit, baseNutrients, baseServingSize])

  useEffect(() => {
    if (!savedWeight) setWeightExpanded(true)
  }, [savedWeight])

  useEffect(() => {
    if (!savedSteps) setStepsExpanded(true)
  }, [savedSteps])

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
      else { setEditingEntry(null); clearNutritionForm(); setNutritionExpanded(false); fetchEntries() }
    } else {
      const { error } = await supabase.from('nutrition_log').insert([{
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit,
        logged_date: selectedDate, user_id: currentSession.user.id
      }])
      if (error) console.error('Error saving:', error)
      else { clearNutritionForm(); setNutritionExpanded(false); fetchEntries() }
    }
  }

  function clearNutritionForm() {
    setFood(''); setCalories(''); setProtein('')
    setCarbs(''); setFat(''); setServingSize('')
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
    setNutritionExpanded(true)
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
    const { data, error } = await supabase
      .from('weight_log')
      .select('*')
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) { console.error(error); return }
    const row = data?.[0] ?? null
    if (row) { setSavedWeight(row); setWeight(row.weight.toString()); setWeightUnit(row.unit) }
    else { setSavedWeight(null); setWeight(''); setWeightUnit('lbs') }
  }

  async function saveWeight() {
    if (!weight) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()

    const now = new Date()
    const weighed_at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    if (savedWeight) {
      const { error } = await supabase
        .from('weight_log')
        .update({ weight: parseFloat(weight), unit: weightUnit, weighed_at })
        .eq('id', savedWeight.id)
      if (error) console.error(error); else fetchWeight()
    } else {
      const { error } = await supabase
        .from('weight_log')
        .insert([{
          weight: parseFloat(weight),
          unit: weightUnit,
          logged_date: selectedDate,
          user_id: currentSession.user.id,
          weighed_at,
        }])
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
    setCardioExpanded(true)
  }

  // Steps functions
  async function fetchSteps() {
    if (!session?.user?.id) return

    const { data, error } = await supabase.from('steps_log').select('*')
      .eq('user_id', session.user.id)
      .eq('logged_date', selectedDate)
      .maybeSingle()
    if (error) { console.error(error); return }
    if (data) { setSavedSteps(data); setSteps(data.steps.toString()); setDistance(data.distance?.toString() || '') }
    else { setSavedSteps(null); setSteps(''); setDistance('') }
  }

  async function saveSteps() {
    if (!steps) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()

    const { error } = await supabase
      .from('steps_log')
      .upsert(
        {
          ...(savedSteps ? { id: savedSteps.id } : {}),
          user_id: currentSession.user.id,
          logged_date: selectedDate,
          steps: parseInt(steps),
          distance: parseFloat(distance) || null,
        },
        { onConflict: 'user_id,logged_date' }
      )

    if (error) {
      console.error(error)
      return
    }
    fetchSteps()
  }

  // Nav functions
  function goToPrevDay() { const d = parseLocalDateString(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDateString(d)) }
  function goToNextDay() { const d = parseLocalDateString(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toLocalDateString(d)) }
  const isToday = selectedDate === toLocalDateString(new Date())

  const displayDate = parseLocalDateString(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  const totalCalories = entries.reduce((s, e) => s + (e.calories || 0), 0)
  const totalProtein = entries.reduce((s, e) => s + (e.protein || 0), 0)
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs || 0), 0)
  const totalFat = entries.reduce((s, e) => s + (e.fat || 0), 0)

  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '10px 14px',
    color: 'var(--color-text)', fontSize: '1rem', minWidth: 0
  }

  const sectionStyle = {
    ...cardStyle,
    display: 'flex', flexDirection: 'column', gap: 'var(--space-md)'
  }

  const iconBtnStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 6px', fontSize: '0.875rem', color: 'var(--color-muted)'
  }

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <h1>Daily Log</h1>
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '999px' }}>
          <button onClick={goToPrevDay} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '7px 14px', fontSize: '1rem', lineHeight: 1 }}>←</button>
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', padding: '0 2px' }}>{displayDate}</span>
            <input
              type="date"
              value={selectedDate}
              max={toLocalDateString(new Date())}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
            />
          </label>
          <button onClick={goToNextDay} disabled={isToday} style={{ background: 'none', border: 'none', color: isToday ? 'var(--color-border)' : 'var(--color-muted)', cursor: isToday ? 'default' : 'pointer', padding: '7px 14px', fontSize: '1rem', lineHeight: 1 }}>→</button>
        </div>
      </div>

      {/* Weight */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ borderLeft: '3px solid var(--color-weight)', paddingLeft: '10px' }}>Weight</h2>
          {savedWeight && !weightExpanded && (
            <button onClick={() => setWeightExpanded(true)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}>Edit</button>
          )}
        </div>

        {savedWeight && !weightExpanded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)' }}>{savedWeight.weight}</span>
              <span style={{ fontSize: '1rem', color: 'var(--color-muted)', marginLeft: '6px' }}>{savedWeight.unit}</span>
            </div>
            {savedWeight.weighed_at && <p style={{ fontSize: 'var(--text-sm)' }}>{formatTime(savedWeight.weighed_at)}</p>}
            <Button onClick={() => setWeightExpanded(true)} variant="outline" size="sm" style={{ alignSelf: 'flex-start', marginTop: '4px' }}>+ Log Weight</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="number" placeholder={`Weight (${weightUnit})`} value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {savedWeight && <Button onClick={() => setWeightExpanded(false)} variant="ghost" size="sm">Cancel</Button>}
              <Button onClick={() => { saveWeight(); setWeightExpanded(false) }} variant="primary" size="sm">{savedWeight ? 'Update' : 'Log Weight'}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Nutrition */}
      <div style={sectionStyle}>
        <h2 style={{ borderLeft: '3px solid var(--color-calories)', paddingLeft: '10px' }}>Nutrition</h2>

        {/* Macro totals */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hideCalories ? 3 : 4}, 1fr)`, gap: '8px' }}>
          {!hideCalories && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-calories)' }}>{totalCalories}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Calories</div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-protein)' }}>{totalProtein}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Protein</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-carbs)' }}>{totalCarbs}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Carbs</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-fat)' }}>{totalFat}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Fat</div>
          </div>
        </div>

        {/* Food entries */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
            {entries.map(entry => (
              <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                  <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>{entry.food}</p>
                  <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                    {entry.serving_size}{entry.serving_unit}
                    {!hideCalories && ` · ${entry.calories} kcal`}
                    {entry.protein > 0 && ` · ${entry.protein}g protein`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setFood(entry.food)
                      setCalories(entry.calories.toString())
                      setProtein(entry.protein.toString())
                      setCarbs(entry.carbs.toString())
                      setFat(entry.fat.toString())
                      setServingSize(entry.serving_size.toString())
                      setServingUnit(entry.serving_unit || 'g')
                      setBaseNutrients({ calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat })
                      setBaseServingSize(null)
                      setBaseServingLabel('')
                      setEditingEntry(null)
                      setNutritionExpanded(true)
                    }}
                    style={{ ...iconBtnStyle, fontSize: '1rem' }}
                    title="Re-log"
                  >↻</button>
                  <button onClick={() => startEdit(entry)} style={iconBtnStyle}>✎</button>
                  <button onClick={() => deleteEntry(entry.id)} style={{ ...iconBtnStyle, color: '#f87171' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Food Form */}
        {nutritionExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: entries.length > 0 ? '4px' : '0' }}>
            <input
              type="text"
              placeholder="Food name"
              value={food}
              onChange={(e) => { setFood(e.target.value); setNutritionErrors(p => ({ ...p, food: '' })) }}
              style={{ ...inputStyle, borderColor: nutritionErrors.food ? '#f87171' : 'var(--color-border)' }}
            />
            {nutritionErrors.food && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-6px' }}>{nutritionErrors.food}</p>}
            {showScanner && <BarcodeScanner onDetected={(barcode) => { setShowScanner(false); lookupBarcode(barcode) }} onClose={() => setShowScanner(false)} />}
            {showBarcodeInput && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" placeholder="Enter barcode number" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <Button onClick={() => lookupBarcode(barcodeInput)} variant="primary" size="sm">Lookup</Button>
              </div>
            )}
            {lookupError && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lookupError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <input type="number" placeholder="Calories" value={calories} onChange={(e) => { setCalories(e.target.value); setNutritionErrors(p => ({ ...p, calories: '' })) }} style={{ ...inputStyle, borderColor: nutritionErrors.calories ? '#f87171' : 'var(--color-border)', minWidth: 0 }} />
              <input type="number" placeholder="Protein (g)" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Carbs (g)" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Fat (g)" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder={baseServingSize != null ? 'Servings' : 'Serving size'}
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              {baseServingSize == null && (
                <select value={servingUnit} onChange={(e) => setServingUnit(e.target.value)} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
                  <option value="g">g</option>
                  <option value="oz">oz</option>
                  <option value="ml">ml</option>
                  <option value="cup">cup</option>
                  <option value="tbsp">tbsp</option>
                  <option value="tsp">tsp</option>
                </select>
              )}
            </div>
            {baseServingLabel && <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>1 serving = {baseServingLabel}</p>}
            {nutritionErrors.calories && <p style={{ color: '#f87171', fontSize: '0.75rem' }}>{nutritionErrors.calories}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setNutritionExpanded(false); setEditingEntry(null); clearNutritionForm() }} variant="ghost" size="sm">Cancel</Button>
              <Button onClick={handleSubmit} variant="primary" size="sm">{editingEntry ? 'Update entry' : 'Add entry'}</Button>
            </div>
          </div>
        )}

        {/* Copy panel */}
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
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer',
                  backgroundColor: selectedCopyIds.has(e.id) ? 'var(--color-primary-dim)' : 'var(--color-bg)',
                  border: `1px solid ${selectedCopyIds.has(e.id) ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius)'
                }}
              >
                <input type="checkbox" checked={selectedCopyIds.has(e.id)} onChange={() => {}} style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{e.food}</p>
                  <p style={{ fontSize: '0.75rem' }}>
                    {!hideCalories && <>{e.calories} cal · </>}P: {e.protein}g · C: {e.carbs}g · F: {e.fat}g
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

        {/* Action buttons */}
        {!nutritionExpanded && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              onClick={() => { setNutritionExpanded(true); setShowCopyPanel(false) }}
              variant="primary"
              size="sm"
            >+ Add Food</Button>
            <Button onClick={() => { setShowScanner(true); setNutritionExpanded(true) }} variant="muted" size="sm">Scan Barcode</Button>
            <Button
              onClick={() => { setShowCopyPanel(!showCopyPanel); setCopyEntries([]); setSelectedCopyIds(new Set()) }}
              variant="muted"
              size="sm"
            >{showCopyPanel ? 'Cancel' : 'Copy Day'}</Button>
          </div>
        )}

        {/* AI feedback */}
        {entries.length > 0 && profile?.role !== 'client' && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            {hasSoloPremium ? (
              <Button onClick={getAIFeedback} variant="ai" loading={loading} size="sm">
                {loading ? 'Analyzing...' : 'Get AI feedback'}
              </Button>
            ) : (
              <SoloUpgrade feature="AI nutrition feedback" compact />
            )}
          </div>
        )}

        {feedback && profile?.role !== 'client' && (
          <div style={{ ...cardStyle, lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
            <Button onClick={() => setFeedback('')} variant="ghost" size="sm">Clear</Button>
          </div>
        )}
      </div>

      {/* Cardio */}
      <div style={sectionStyle}>
        <h2 style={{ borderLeft: '3px solid var(--color-cardio)', paddingLeft: '10px' }}>Cardio</h2>

        {cardioEntries.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>{e.exercise_type}</p>
              <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>
                {e.duration} min{e.calories_burned ? ` · ${e.calories_burned} kcal` : ''}{e.avg_heart_rate ? ` · ${e.avg_heart_rate} bpm avg` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button onClick={() => startEditCardio(e)} style={iconBtnStyle}>✎</button>
              <button onClick={() => deleteCardio(e.id)} style={{ ...iconBtnStyle, color: '#f87171' }}>✕</button>
            </div>
          </div>
        ))}

        {cardioExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {EXERCISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
              <input type="number" placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Calories burned" value={caloriesBurned} onChange={(e) => setCaloriesBurned(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Avg heart rate" value={avgHeartRate} onChange={(e) => setAvgHeartRate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => { setCardioExpanded(false); if (editingCardio) { setEditingCardio(null); setDuration(''); setCaloriesBurned(''); setAvgHeartRate('') } }}
                variant="ghost"
                size="sm"
              >Cancel</Button>
              <Button onClick={() => { logCardio(); setCardioExpanded(false) }} variant="primary" size="sm">
                {editingCardio ? 'Update session' : 'Log session'}
              </Button>
            </div>
          </div>
        )}

        {!cardioExpanded && (
          <Button
            onClick={() => setCardioExpanded(true)}
            variant="outline"
            size="sm"
            style={{ alignSelf: 'flex-start', borderColor: 'var(--color-cardio)', color: 'var(--color-cardio)' }}
          >+ Log Cardio</Button>
        )}
      </div>

      {/* Steps */}
      <div style={sectionStyle}>
        <h2 style={{ borderLeft: '3px solid var(--color-steps)', paddingLeft: '10px' }}>Steps</h2>

        {savedSteps && !stepsExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)' }}>{savedSteps.steps.toLocaleString()}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginLeft: '8px' }}>
                steps{savedSteps.distance ? ` · ${savedSteps.distance} mi` : ''}
              </span>
            </div>
          </div>
        )}

        {stepsExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="number" placeholder="Steps" value={steps} onChange={(e) => setSteps(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
              <input type="number" placeholder="Miles" value={distance} onChange={(e) => setDistance(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {savedSteps && <Button onClick={() => setStepsExpanded(false)} variant="ghost" size="sm">Cancel</Button>}
              <Button onClick={() => { saveSteps(); setStepsExpanded(false) }} variant="primary" size="sm">{savedSteps ? 'Update' : 'Log Steps'}</Button>
            </div>
          </div>
        )}

        {!stepsExpanded && (
          <Button
            onClick={() => setStepsExpanded(true)}
            variant="outline"
            size="sm"
            style={{ alignSelf: 'flex-start', borderColor: 'var(--color-steps)', color: 'var(--color-steps)' }}
          >+ Log Steps</Button>
        )}
      </div>

    </div>
  )
}

export default Log
