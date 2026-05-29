import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'

function Log({ session }) {
  const [food, setFood] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [entries, setEntries] = useState([])
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [servingSize, setServingSize] = useState('100')
  const [baseNutrients, setBaseNutrients] = useState(null)
  const [servingUnit, setServingUnit] = useState('g')

  useEffect(() => {
  fetchEntries()
}, [])

useEffect(() => {
  if (!baseNutrients) return
  const grams = (parseInt(servingSize) || 100) * (unitConversions[servingUnit] || 1)
  const multiplier = grams / 100
  setCalories(Math.round(baseNutrients.calories * multiplier).toString())
  setProtein(Math.round(baseNutrients.protein * multiplier).toString())
  setCarbs(Math.round(baseNutrients.carbs * multiplier).toString())
  setFat(Math.round(baseNutrients.fat * multiplier).toString())
}, [servingSize, servingUnit, baseNutrients])

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching:', error)
    else setEntries(data)
  }

  async function handleSubmit() {
  if (!food || !calories) return

  const { data: { session: currentSession } } = await supabase.auth.getSession()

  const { error } = await supabase
    .from('nutrition_log')
    .insert([{
      food,
      calories: parseInt(calories),
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
      serving_size: parseInt(servingSize) || 100,
      user_id: currentSession.user.id,
      serving_size: parseInt(servingSize) || 100,
serving_unit: servingUnit,
      
    }])

  if (error) console.error('Error saving:', error)
  else {
    setFood(''); setCalories(''); setProtein('')
    setCarbs(''); setFat(''); setServingSize('100')
    setBaseNutrients(null)
    fetchEntries()
    setServingUnit('g')
  }
}

  async function getAIFeedback() {
  setLoading(true)
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(
    'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nutrition-coach',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ entries }),
    }
  )
  const data = await response.json()
  setFeedback(data.message)
  setLoading(false)
}
  async function deleteEntry(id) {
  const { error } = await supabase
    .from('nutrition_log')
    .delete()
    .eq('id', id)

  if (error) console.error('Error deleting:', error)
  else {
    setFeedback('')
    fetchEntries()
  }
}
async function lookupBarcode(barcode) {
  setLookupError('')
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    )
    const data = await response.json()

    if (data.status === 0) {
      setLookupError('Product not found. Try entering macros manually.')
      return
    }

    const product = data.product
    const nutrients = product.nutriments

    const base = {
      calories: Math.round(nutrients['energy-kcal_100g'] || 0),
      protein: Math.round(nutrients['proteins_100g'] || 0),
      carbs: Math.round(nutrients['carbohydrates_100g'] || 0),
      fat: Math.round(nutrients['fat_100g'] || 0),
    }

    setBaseNutrients(base)
    setFood(product.product_name || '')
    setServingSize('100')
    setCalories(base.calories.toString())
    setProtein(base.protein.toString())
    setCarbs(base.carbs.toString())
    setFat(base.fat.toString())
    setShowBarcodeInput(false)
    setBarcodeInput('')
  } catch {
    setLookupError('Lookup failed. Check your connection.')
  }
}


    const unitConversions = {
    g: 1,
    oz: 28.35,
    ml: 1,
    cup: 240,
    tbsp: 15,
    tsp: 5
    }
  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: '1rem'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Log</h1>

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <input type="text" placeholder="Food name" value={food}
          onChange={(e) => setFood(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: '8px' }}>
  <button
    type="button"
    onClick={() => setShowScanner(true)}
    style={{
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '8px 14px',
      cursor: 'pointer',
      fontSize: '0.875rem'
    }}
  >
    📷 Scan barcode
  </button>
  <button
    type="button"
    onClick={() => setShowBarcodeInput(!showBarcodeInput)}
    style={{
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '8px 14px',
      cursor: 'pointer',
      fontSize: '0.875rem'
    }}
  >
    # Enter barcode
  </button>
</div>
{showScanner && (
  <BarcodeScanner
    onDetected={(barcode) => {
      setShowScanner(false)
      lookupBarcode(barcode)
    }}
    onClose={() => setShowScanner(false)}
  />
)}

{showBarcodeInput && (
  <div style={{ display: 'flex', gap: '8px' }}>
    <input
      type="text"
      placeholder="Enter barcode number"
      value={barcodeInput}
      onChange={(e) => setBarcodeInput(e.target.value)}
      style={{ ...inputStyle, flex: 1 }}
    />
    <button
      type="button"
      onClick={() => lookupBarcode(barcodeInput)}
      style={{
        backgroundColor: 'var(--color-primary)',
        color: '#fff',
        border: 'none',
        borderRadius: 'var(--radius)',
        padding: '10px 16px',
        cursor: 'pointer',
        fontWeight: 600
      }}
    >
      Lookup
    </button>
  </div>
)}

{lookupError && (
  <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lookupError}</p>
)}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
  <input type="number" placeholder="Calories" value={calories}
    onChange={(e) => setCalories(e.target.value)} style={inputStyle} />
  <input type="number" placeholder="Protein (g)" value={protein}
    onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
  <input type="number" placeholder="Carbs (g)" value={carbs}
    onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
  <input type="number" placeholder="Fat (g)" value={fat}
    onChange={(e) => setFat(e.target.value)} style={inputStyle} />
<div style={{ display: 'flex', gap: '8px', gridColumn: '1 / -1' }}>  <input
    type="number"
    placeholder="Serving size"
    value={servingSize}
    onChange={(e) => setServingSize(e.target.value)}
    style={{ ...inputStyle, flex: 1 }}
  />
  <select
    value={servingUnit}
    onChange={(e) => setServingUnit(e.target.value)}
    style={{
      ...inputStyle,
      width: '80px',
      cursor: 'pointer'
    }}
  >
    <option value="g">g</option>
    <option value="oz">oz</option>
    <option value="ml">ml</option>
    <option value="cup">cup</option>
    <option value="tbsp">tbsp</option>
    <option value="tsp">tsp</option>
  </select>
</div>
</div>

        <button onClick={handleSubmit} style={{
          backgroundColor: 'var(--color-primary)',
          color: '#fff', border: 'none',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer', fontWeight: 600
        }}>
          Add entry
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  {entries.map((entry) => (
    <div key={entry.id} style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '14px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span>{entry.food}</span>
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{entry.calories} cal</span>
        <span style={{ color: 'var(--color-muted)' }}>P: {entry.protein}g</span>
        <span style={{ color: 'var(--color-muted)' }}>C: {entry.carbs}g</span>
        <span style={{ color: 'var(--color-muted)' }}>F: {entry.fat}g</span>
        <span style={{ color: 'var(--color-muted)' }}>{entry.serving_size}{entry.serving_unit}</span>        
        <button
          onClick={() => deleteEntry(entry.id)}
          style={{
            backgroundColor: 'transparent',
            color: '#f87171',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            padding: '2px 8px'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  ))}
</div>

      <button onClick={getAIFeedback} disabled={loading} style={{
  backgroundColor: '#1a1a1a',
  color: 'var(--color-primary)',
  border: '1px solid var(--color-primary)',
  borderRadius: 'var(--radius)',
  padding: '10px 20px',
  cursor: loading ? 'not-allowed' : 'pointer',
  fontWeight: 600,
  width: 'fit-content',
  opacity: loading ? 0.7 : 1,
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}}>
  {loading && (
    <span style={{
      width: '14px', height: '14px',
      border: '2px solid var(--color-primary)',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite'
    }} />
  )}
  {loading ? 'Analyzing...' : 'Get AI feedback'}
</button>

      {feedback && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          lineHeight: '1.6',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
          <button
            onClick={() => setFeedback('')}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              width: 'fit-content'
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

export default Log