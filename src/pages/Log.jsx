import { useState, useEffect, useRef } from 'react'
import { DndContext, pointerWithin, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Button from '../components/Button'
import SoloUpgrade from '../components/SoloUpgrade'
import { toLocalDateString, parseLocalDateString } from '../utils/dateHelpers'
import { cardStyle } from '../utils/styles'
import { refreshNotifications } from '../utils/notifyRefresh'
import { MEALS, mealForHour, groupEntriesByMeal, groupLoggedMeals } from '../utils/meals'
import { itemsFromEntries, entriesFromItems, mealTotals } from '../utils/savedMeals'

const unitConversions = {
  g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5
}

const EXERCISE_TYPES = [
  'Running', 'Cycling', 'Elliptical', 'Swimming',
  'Rowing', 'Jump Rope', 'Stair Climber', 'Walking',
  'HIIT', 'Other'
]

// A diary item (food row or meal container) draggable by its grip handle into
// another meal section. Render-prop so the existing row markup stays in Log:
// the wrapper supplies the node ref, a drag transform style, and the handle
// props (spread onto the ⠿ grip). Stable module-scope component → no remounts.
function DraggableItem({ id, item, children }) {
  const { listeners, attributes, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id, data: { item } })
  const dragStyle = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  }
  const handleProps = { ref: setActivatorNodeRef, ...listeners, ...attributes }
  return children({ setNodeRef, dragStyle, handleProps })
}

// A meal section that accepts dropped items; highlights while hovered.
function DroppableMeal({ slot, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot}`, data: { slot } })
  return (
    <div ref={setNodeRef} style={{
      borderRadius: 'var(--radius)',
      outline: isOver ? '2px dashed var(--color-primary)' : '2px dashed transparent',
      outlineOffset: 2,
      background: isOver ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      transition: 'outline-color 120ms, background 120ms',
    }}>
      {children}
    </div>
  )
}

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
  const [meal, setMeal] = useState(mealForHour(new Date().getHours()))
  const [baseNutrients, setBaseNutrients] = useState(null)
  const [baseServingSize, setBaseServingSize] = useState(null)
  const [baseServingLabel, setBaseServingLabel] = useState('')
  const [frequentFoods, setFrequentFoods] = useState([])
  const [quickAddKey, setQuickAddKey] = useState(null)
  const [dayComplete, setDayComplete] = useState(false)
  const [dayCompleteSaving, setDayCompleteSaving] = useState(false)
  const [savedMeals, setSavedMeals] = useState([])
  const [showSaveMeal, setShowSaveMeal] = useState(false)
  const [saveMealName, setSaveMealName] = useState('')
  const [savingMeal, setSavingMeal] = useState(false)
  const [loggingMealId, setLoggingMealId] = useState(null)
  const [logPickId, setLogPickId] = useState(null)        // saved meal showing its meal-slot picker
  const [editingSavedMealId, setEditingSavedMealId] = useState(null)
  const [savedMealDraft, setSavedMealDraft] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [moveMenu, setMoveMenu] = useState(false)
  const [groupMenu, setGroupMenu] = useState(false)
  const [moveItemId, setMoveItemId] = useState(null) // id of the row/meal whose per-item "move to" menu is open
  // Mouse drags after a few px; touch needs a short hold so a tap still opens
  // the menu and a scroll-drag never gets hijacked.
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )
  const [expandedMeals, setExpandedMeals] = useState(new Set())
  const [addingToMeal, setAddingToMeal] = useState(null) // { id, name, meal } when adding a food into a logged meal
  const [foodResults, setFoodResults] = useState([])
  const [foodSearching, setFoodSearching] = useState(false)
  const [showFoodResults, setShowFoodResults] = useState(false)
  const searchTimer = useRef(null)
  const searchSeq = useRef(0)
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
    fetchFrequentFoods()
    fetchSavedMeals()
    fetchDayComplete()
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

  // Most-frequently-logged distinct foods, each carrying the macros from its
  // most recent entry — powers the one-tap "Quick add" row. Derived purely from
  // the user's own nutrition_log, so no new schema.
  async function fetchFrequentFoods() {
    if (!session?.user?.id) return
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('food, calories, protein, carbs, fat, serving_size, serving_unit')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) { console.error('Error fetching frequent foods:', error); return }

    const byFood = new Map()
    for (const e of data || []) {
      const key = (e.food || '').trim().toLowerCase()
      if (!key) continue
      // First sighting wins (rows are newest-first), so we keep the latest macros.
      if (!byFood.has(key)) byFood.set(key, { ...e, count: 1 })
      else byFood.get(key).count += 1
    }
    const ranked = [...byFood.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
    setFrequentFoods(ranked)
  }

  async function quickAddFood(item, key) {
    setQuickAddKey(key)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { error } = await supabase.from('nutrition_log').insert([{
      food: item.food,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      serving_size: item.serving_size,
      serving_unit: item.serving_unit,
      meal: mealForHour(new Date().getHours()),
      logged_date: selectedDate,
      user_id: currentSession.user.id,
    }])
    if (error) console.error('Error quick-adding food:', error)
    else { fetchEntries(); fetchFrequentFoods(); refreshNotifications() }
    setQuickAddKey(null)
  }

  async function fetchSavedMeals() {
    if (!session?.user?.id) return
    const { data, error } = await supabase
      .from('saved_meals')
      .select('id, name, saved_meal_items(food, calories, protein, carbs, fat, serving_size, serving_unit)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    if (error) { console.error('Error fetching saved meals:', error); return }
    setSavedMeals((data || []).map(m => ({ id: m.id, name: m.name, items: m.saved_meal_items || [] })))
  }

  // Snapshot the current day's logged foods into a reusable saved meal.
  function toggleSelect(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAllInDay() {
    setSelectedIds(prev => prev.size === entries.length ? new Set() : new Set(entries.map(e => e.id)))
  }
  function exitSelect() {
    setSelectMode(false); setSelectedIds(new Set()); setShowSaveMeal(false); setMoveMenu(false); setGroupMenu(false); setSaveMealName(''); setMoveItemId(null)
  }

  // Save the SELECTED entries as a reusable meal.
  async function saveSelectedAsMeal() {
    const name = saveMealName.trim()
    const chosen = entries.filter(e => selectedIds.has(e.id))
    if (!name || chosen.length === 0) return
    setSavingMeal(true)
    const { data: { session: cs } } = await supabase.auth.getSession()
    const { data: created, error } = await supabase
      .from('saved_meals').insert({ user_id: cs.user.id, name }).select('id').single()
    if (error) { console.error('Error saving meal:', error); setSavingMeal(false); return }
    const { error: itemsErr } = await supabase
      .from('saved_meal_items').insert(itemsFromEntries(chosen, { savedMealId: created.id, userId: cs.user.id }))
    if (itemsErr) console.error('Error saving meal items:', itemsErr)
    setSavingMeal(false); exitSelect(); fetchSavedMeals()
  }

  // Bulk re-categorize the selected entries to a meal slot ('other' clears the tag).
  async function moveSelectedToMeal(mealKey) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).in('id', ids)
    if (error) console.error('Error moving entries:', error)
    else { fetchEntries(); refreshNotifications() }
    exitSelect()
  }

  // Move one already-logged food row to another meal slot (in place).
  async function moveEntryToMeal(entryId, mealKey) {
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).eq('id', entryId)
    if (error) console.error('Error moving entry:', error)
    else { fetchEntries(); refreshNotifications() }
    setMoveItemId(null)
  }

  // Move a whole logged-meal container (all its rows) to another meal slot.
  async function moveLoggedMealToMeal(item, mealKey) {
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).in('id', item.entries.map(e => e.id))
    if (error) console.error('Error moving meal:', error)
    else { fetchEntries(); refreshNotifications() }
    setMoveItemId(null)
  }

  // Drop a dragged diary item onto a meal section → move it to that slot.
  function handleDiaryDragEnd({ active, over }) {
    setMoveItemId(null)
    if (!over) return
    const targetSlot = over.data.current?.slot
    const item = active.data.current?.item
    if (!targetSlot || !item) return
    const currentSlot = item.type === 'meal' ? (item.entries[0]?.meal || 'other') : (item.entry.meal || 'other')
    if (targetSlot === currentSlot) return
    if (item.type === 'meal') moveLoggedMealToMeal(item, targetSlot)
    else moveEntryToMeal(item.entry.id, targetSlot)
  }

  // How many distinct existing meal containers the selection spans (null ids =
  // loose foods, ignored). >1 means the user picked items already belonging to
  // different meals — grouping those would tear two meals apart, so we block it.
  function selectedContainerIds(excludeId = null) {
    const selected = entries.filter(e => selectedIds.has(e.id))
    return new Set(selected.map(e => e.logged_meal_id).filter(id => id && id !== excludeId))
  }

  // Group the selected (already-logged) entries into a NEW container in place —
  // no re-log. They cohere in one slot (the first selected item's).
  async function groupSelectedAsMeal() {
    const name = saveMealName.trim()
    const ids = [...selectedIds]
    if (!name || ids.length === 0) return
    if (selectedContainerIds().size > 1) {
      alert('These items already belong to different meals. Group items from a single meal (or loose items) at a time.')
      return
    }
    setSavingMeal(true)
    const first = entries.find(e => selectedIds.has(e.id))
    const { error } = await supabase.from('nutrition_log')
      .update({ logged_meal_id: crypto.randomUUID(), logged_meal_name: name, meal: first?.meal ?? null })
      .in('id', ids)
    if (error) console.error('Error grouping meal:', error)
    else { fetchEntries(); refreshNotifications() }
    setSavingMeal(false); exitSelect()
  }

  // Add the selected entries into an EXISTING logged meal container.
  async function groupSelectedIntoMeal(container) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (selectedContainerIds(container.id).size > 0) {
      alert('Some selected items already belong to a different meal. Move those out first, or group within one meal.')
      return
    }
    const { error } = await supabase.from('nutrition_log')
      .update({ logged_meal_id: container.id, logged_meal_name: container.name, meal: container.entries[0]?.meal ?? null })
      .in('id', ids)
    if (error) console.error('Error adding to meal:', error)
    else { fetchEntries(); refreshNotifications() }
    exitSelect()
  }

  async function deleteSelected() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const { error } = await supabase.from('nutrition_log').delete().in('id', ids)
    if (error) console.error('Error deleting entries:', error)
    else { fetchEntries(); fetchFrequentFoods(); refreshNotifications() }
    exitSelect()
  }

  // One-tap log: drop a saved meal's foods into the selected day + meal slot as
  // one expandable container (a logged meal).
  async function logSavedMeal(m, mealKey) {
    setLoggingMealId(m.id)
    const { data: { session: cs } } = await supabase.auth.getSession()
    const { error } = await supabase.from('nutrition_log').insert(
      entriesFromItems(m.items, {
        userId: cs.user.id, date: selectedDate, meal: mealKey === 'other' ? null : (mealKey || meal),
        loggedMealId: crypto.randomUUID(), loggedMealName: m.name,
      }),
    )
    if (error) console.error('Error logging saved meal:', error)
    else { fetchEntries(); fetchFrequentFoods(); refreshNotifications() }
    setLoggingMealId(null); setLogPickId(null)
  }

  // --- Logged meal containers (a meal logged into the diary as one item) ---
  function toggleMealExpand(id) {
    setExpandedMeals(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Repeat: re-log a container's current foods as a fresh instance today.
  async function repeatLoggedMeal(item) {
    const { data: { session: cs } } = await supabase.auth.getSession()
    const newId = crypto.randomUUID()
    const rows = item.entries.map(e => ({
      food: e.food, calories: e.calories, protein: e.protein || 0, carbs: e.carbs || 0, fat: e.fat || 0,
      serving_size: e.serving_size, serving_unit: e.serving_unit, meal: e.meal,
      logged_date: selectedDate, user_id: cs.user.id,
      logged_meal_id: newId, logged_meal_name: item.name,
    }))
    const { error } = await supabase.from('nutrition_log').insert(rows)
    if (error) console.error('Error repeating meal:', error)
    else { fetchEntries(); refreshNotifications() }
  }

  async function deleteLoggedMeal(id) {
    const { error } = await supabase.from('nutrition_log').delete().eq('logged_meal_id', id)
    if (error) console.error('Error deleting logged meal:', error)
    else { fetchEntries(); fetchFrequentFoods(); refreshNotifications() }
  }

  // Open the add-food form to add a new food into an existing logged meal.
  function addToMeal(item) {
    clearNutritionForm()
    setEditingEntry(null)
    setAddingToMeal({ id: item.id, name: item.name, meal: item.entries[0]?.meal ?? null })
    setMeal(item.entries[0]?.meal || mealForHour(new Date().getHours()))
    setNutritionExpanded(true)
  }

  async function deleteSavedMeal(id) {
    const { error } = await supabase.from('saved_meals').delete().eq('id', id)
    if (error) console.error('Error deleting saved meal:', error)
    else fetchSavedMeals()
  }

  async function renameSavedMeal(id, name) {
    const trimmed = name.trim()
    setEditingSavedMealId(null)
    if (!trimmed) return
    const { error } = await supabase.from('saved_meals').update({ name: trimmed }).eq('id', id)
    if (error) console.error('Error renaming saved meal:', error)
    else fetchSavedMeals()
  }

  async function fetchDayComplete() {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from('day_complete').select('logged_date')
      .eq('user_id', session.user.id).eq('logged_date', selectedDate).maybeSingle()
    setDayComplete(Boolean(data))
  }

  // Toggle the "I'm done logging today" mark for the selected date.
  async function toggleDayComplete() {
    setDayCompleteSaving(true)
    const { data: { session: cs } } = await supabase.auth.getSession()
    if (dayComplete) {
      const { error } = await supabase.from('day_complete')
        .delete().eq('user_id', cs.user.id).eq('logged_date', selectedDate)
      if (error) console.error('Error clearing day-complete:', error)
      else setDayComplete(false)
    } else {
      const { error } = await supabase.from('day_complete')
        .upsert({ user_id: cs.user.id, logged_date: selectedDate }, { onConflict: 'user_id,logged_date' })
      if (error) console.error('Error marking day complete:', error)
      else { setDayComplete(true); refreshNotifications() }
    }
    setDayCompleteSaving(false)
  }

  // Food name search (USDA FDC via the food-search edge fn), debounced. Selecting
  // a result prefills the form through the same per-100g path barcode uses.
  function handleFoodInput(value) {
    setFood(value)
    setNutritionErrors(p => ({ ...p, food: '' }))
    // Typing a name = manual entry; drop any prefill-scaling base.
    setBaseNutrients(null); setBaseServingSize(null); setBaseServingLabel('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = value.trim()
    if (q.length < 2) { setFoodResults([]); setShowFoodResults(false); setFoodSearching(false); return }
    setShowFoodResults(true); setFoodSearching(true)
    searchTimer.current = setTimeout(() => searchFoods(q), 350)
  }

  async function searchFoods(q) {
    const seq = ++searchSeq.current
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ q }),
      })
      const data = await res.json()
      if (seq !== searchSeq.current) return // a newer keystroke superseded this
      setFoodResults(Array.isArray(data.foods) ? data.foods : [])
    } catch {
      if (seq === searchSeq.current) setFoodResults([])
    } finally {
      if (seq === searchSeq.current) setFoodSearching(false)
    }
  }

  function selectFoodResult(r) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setBaseNutrients({ calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat })
    setBaseServingSize(null)
    setBaseServingLabel('')
    setServingSize('100')
    setServingUnit('g')
    setFood(r.name)
    setCalories(r.calories.toString())
    setProtein(r.protein.toString())
    setCarbs(r.carbs.toString())
    setFat(r.fat.toString())
    setShowFoodResults(false)
    setFoodResults([])
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
        meal: e.meal,
        logged_date: selectedDate,
        user_id: currentSession.user.id
      }))

    const { error } = await supabase.from('nutrition_log').insert(inserts)
    if (error) console.error('Error copying entries:', error)
    else {
      fetchEntries()
      refreshNotifications()
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
        serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit, meal
      }).eq('id', editingEntry.id)
      if (error) console.error('Error updating:', error)
      else { setEditingEntry(null); clearNutritionForm(); setNutritionExpanded(false); fetchEntries(); refreshNotifications() }
    } else {
      const { error } = await supabase.from('nutrition_log').insert([{
        food, calories: parseInt(calories), protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
        serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit, meal,
        logged_date: selectedDate, user_id: currentSession.user.id,
        ...(addingToMeal ? { logged_meal_id: addingToMeal.id, logged_meal_name: addingToMeal.name } : {}),
      }])
      if (error) console.error('Error saving:', error)
      else { clearNutritionForm(); setNutritionExpanded(false); fetchEntries(); refreshNotifications() }
    }
  }

  function clearNutritionForm() {
    setFood(''); setCalories(''); setProtein('')
    setCarbs(''); setFat(''); setServingSize('')
    setServingUnit('g'); setBaseNutrients(null)
    setBaseServingSize(null); setBaseServingLabel('')
    setMeal(mealForHour(new Date().getHours()))
    setAddingToMeal(null)
    setNutritionErrors({})
    setShowFoodResults(false); setFoodResults([])
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
    setMeal(entry.meal || mealForHour(new Date().getHours()))
    setBaseNutrients(null)
    setBaseServingSize(null)
    setBaseServingLabel('')
    setNutritionExpanded(true)
  }

  async function deleteEntry(id) {
    const { error } = await supabase.from('nutrition_log').delete().eq('id', id)
    if (error) console.error('Error deleting:', error)
    else { setFeedback(''); fetchEntries(); refreshNotifications() }
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

  const selectLinkStyle = {
    background: 'transparent', border: 'none', color: 'var(--color-primary)',
    fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
  }
  const pillBtnStyle = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
    borderRadius: 'var(--radius)', padding: '4px 10px', fontSize: 'var(--text-xs)', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  }

  // Meal slots that already exist on this day (the only valid move targets — you
  // can't slide an item into a category that was never created).
  const presentMealSlots = groupEntriesByMeal(entries).map(g => g.key)
  const slotLabel = (k) => MEALS.find(m => m.key === k)?.label ?? 'Other'

  // A single food entry row — selectable in select mode, with re-log/edit/delete
  // otherwise. Reused for loose foods and for the children inside a meal.
  // inMeal: a child of a logged-meal container — no per-row move (the whole
  // container moves together).
  function renderFoodEntry(entry, inMeal = false, drag = null) {
    const checked = selectedIds.has(entry.id)
    const currentSlot = entry.meal || 'other'
    const moveTargets = inMeal ? [] : presentMealSlots.filter(k => k !== currentSlot)
    const moveOpen = moveItemId === entry.id
    return (
      <div key={entry.id} ref={drag?.setNodeRef} style={{ borderBottom: '1px solid var(--color-border)', ...drag?.dragStyle }}>
       <div
        onClick={selectMode ? () => toggleSelect(entry.id) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: selectMode ? 'pointer' : 'default' }}
      >
        {selectMode && (
          <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`, background: checked ? 'var(--color-primary)' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>{checked ? '✓' : ''}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>{entry.food}</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>
            {entry.serving_size}{entry.serving_unit}
            {!hideCalories && ` · ${entry.calories} kcal`}
            {` · ${entry.protein || 0}g P · ${entry.carbs || 0}g C · ${entry.fat || 0}g F`}
          </p>
        </div>
        {!selectMode && (
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <button
              onClick={() => {
                setFood(entry.food); setCalories(entry.calories.toString())
                setProtein(entry.protein.toString()); setCarbs(entry.carbs.toString()); setFat(entry.fat.toString())
                setServingSize(entry.serving_size.toString()); setServingUnit(entry.serving_unit || 'g')
                setMeal(entry.meal || mealForHour(new Date().getHours()))
                setBaseNutrients({ calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat })
                setBaseServingSize(null); setBaseServingLabel(''); setEditingEntry(null); setNutritionExpanded(true)
              }}
              style={{ ...iconBtnStyle, fontSize: '1rem' }}
              title="Re-log"
            >↻</button>
            {moveTargets.length > 0 && (
              <button {...drag?.handleProps} onClick={() => setMoveItemId(moveOpen ? null : entry.id)} style={{ ...iconBtnStyle, fontSize: '1rem', letterSpacing: '-2px', touchAction: 'none', cursor: 'grab', color: moveOpen ? 'var(--color-primary)' : 'var(--color-muted)' }} title="Drag to a meal, or tap for options">⠿</button>
            )}
            <button onClick={() => startEdit(entry)} style={iconBtnStyle}>✎</button>
            <button onClick={() => deleteEntry(entry.id)} style={{ ...iconBtnStyle, color: '#f87171' }}>✕</button>
          </div>
        )}
       </div>
        {!selectMode && moveOpen && moveTargets.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', padding: '0 0 10px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Move to:</span>
            {moveTargets.map(k => (
              <button key={k} onClick={() => moveEntryToMeal(entry.id, k)} style={pillBtnStyle}>{slotLabel(k)}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // A logged meal rendered as one collapsible container item.
  function renderLoggedMeal(item, drag = null) {
    const open = expandedMeals.has(item.id)
    const currentSlot = item.entries[0]?.meal || 'other'
    const moveTargets = presentMealSlots.filter(k => k !== currentSlot)
    const moveOpen = moveItemId === item.id
    return (
      <div key={item.id} ref={drag?.setNodeRef} style={{ borderBottom: '1px solid var(--color-border)', ...drag?.dragStyle }}>
        <div onClick={() => toggleMealExpand(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer' }}>
          <span style={{ flexShrink: 0, color: 'var(--color-muted)', fontSize: '0.75rem', width: 12 }}>{open ? '▾' : '▸'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.9rem' }}>🍽 {item.name}</p>
            <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px', color: 'var(--color-muted)' }}>
              {item.entries.length} item{item.entries.length === 1 ? '' : 's'}{!hideCalories ? ` · ${item.calories} kcal` : ''}
              {(() => {
                const p = item.entries.reduce((s, e) => s + (e.protein || 0), 0)
                const c = item.entries.reduce((s, e) => s + (e.carbs || 0), 0)
                const f = item.entries.reduce((s, e) => s + (e.fat || 0), 0)
                return ` · ${p}g P · ${c}g C · ${f}g F`
              })()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => repeatLoggedMeal(item)} style={{ ...iconBtnStyle, fontSize: '1rem' }} title="Repeat meal">↻</button>
            {moveTargets.length > 0 && (
              <button {...drag?.handleProps} onClick={() => setMoveItemId(moveOpen ? null : item.id)} style={{ ...iconBtnStyle, fontSize: '1rem', letterSpacing: '-2px', touchAction: 'none', cursor: 'grab', color: moveOpen ? 'var(--color-primary)' : 'var(--color-muted)' }} title="Drag to a meal, or tap for options">⠿</button>
            )}
            <button onClick={() => deleteLoggedMeal(item.id)} style={{ ...iconBtnStyle, color: '#f87171' }} title="Delete meal">✕</button>
          </div>
        </div>
        {moveOpen && moveTargets.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', padding: '0 0 10px 22px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Move to:</span>
            {moveTargets.map(k => (
              <button key={k} onClick={() => moveLoggedMealToMeal(item, k)} style={pillBtnStyle}>{slotLabel(k)}</button>
            ))}
          </div>
        )}
        {open && (
          <div style={{ paddingLeft: '22px' }}>
            {item.entries.map(e => renderFoodEntry(e, true))}
            <button onClick={() => addToMeal(item)} style={{ ...selectLinkStyle, padding: '8px 0' }}>+ Add food to this meal</button>
          </div>
        )}
      </div>
    )
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
              onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* unsupported → native focus opens it */ } }}
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

        {/* Day complete — one-tap "I'm done logging today" (coach trust signal) */}
        <button
          onClick={toggleDayComplete}
          disabled={dayCompleteSaving}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '100%', padding: '8px', marginTop: '4px',
            borderRadius: 'var(--radius)',
            border: `1px solid ${dayComplete ? 'var(--color-primary)' : 'var(--color-border)'}`,
            background: dayComplete ? 'var(--color-primary)' : 'transparent',
            color: dayComplete ? '#fff' : 'var(--color-muted)',
            fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'inherit',
            cursor: dayCompleteSaving ? 'default' : 'pointer', opacity: dayCompleteSaving ? 0.6 : 1,
          }}
        >
          {dayComplete ? '✓ Day marked complete — tap to undo' : 'Mark day complete'}
        </button>

        {/* Food entries, grouped by meal (with multi-select) */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
            {!nutritionExpanded && !showCopyPanel && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 2px' }}>
                {selectMode ? (
                  <>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{selectedIds.size} selected</span>
                    <div style={{ display: 'flex', gap: '14px' }}>
                      <button onClick={selectAllInDay} style={selectLinkStyle}>{selectedIds.size === entries.length ? 'Clear' : 'Select all'}</button>
                      <button onClick={exitSelect} style={selectLinkStyle}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectMode(true)}
                    title="Select entries to group, move, or save as a meal"
                    style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px',
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      color: 'var(--color-muted)', borderRadius: '999px', padding: '4px 12px',
                      fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: '0.8rem', lineHeight: 1 }}>☑</span> Select
                  </button>
                )}
              </div>
            )}
            {selectMode ? (
              groupEntriesByMeal(entries).map(group => (
                <div key={group.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 2px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{group.label}</span>
                    {!hideCalories && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{group.calories} kcal</span>}
                  </div>
                  {group.entries.map(entry => renderFoodEntry(entry))}
                </div>
              ))
            ) : (
              <DndContext sensors={dndSensors} collisionDetection={pointerWithin} onDragEnd={handleDiaryDragEnd}>
                {groupEntriesByMeal(entries).map(group => (
                  <DroppableMeal key={group.key} slot={group.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{group.label}</span>
                      {!hideCalories && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{group.calories} kcal</span>}
                    </div>
                    {groupLoggedMeals(group.entries).map(item => item.type === 'meal'
                      ? <DraggableItem key={item.id} id={item.id} item={item}>{d => renderLoggedMeal(item, d)}</DraggableItem>
                      : <DraggableItem key={item.entry.id} id={item.entry.id} item={item}>{d => renderFoodEntry(item.entry, false, d)}</DraggableItem>
                    )}
                  </DroppableMeal>
                ))}
              </DndContext>
            )}

            {/* Bulk action bar */}
            {selectMode && selectedIds.size > 0 && (
              <div style={{ paddingTop: '10px' }}>
                {showSaveMeal ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Name this meal" value={saveMealName} onChange={e => setSaveMealName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '160px' }} />
                    <Button onClick={saveSelectedAsMeal} variant="primary" size="sm" loading={savingMeal} disabled={!saveMealName.trim()}>Save meal</Button>
                    <Button onClick={() => setShowSaveMeal(false)} variant="muted" size="sm">Back</Button>
                  </div>
                ) : moveMenu ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Move to:</span>
                    {[...MEALS, { key: 'other', label: 'Other' }].map(m => (
                      <button key={m.key} onClick={() => moveSelectedToMeal(m.key)} style={pillBtnStyle}>{m.label}</button>
                    ))}
                    <button onClick={() => setMoveMenu(false)} style={selectLinkStyle}>Back</button>
                  </div>
                ) : groupMenu ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedContainerIds().size > 1 ? (
                      <>
                        <p style={{ fontSize: 'var(--text-xs)', color: '#f87171', margin: 0 }}>
                          Selected items belong to different meals. Group items from a single meal (or loose items) at a time.
                        </p>
                        <div><Button onClick={() => setGroupMenu(false)} variant="muted" size="sm">Back</Button></div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <input type="text" placeholder="New meal name" value={saveMealName} onChange={e => setSaveMealName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '160px' }} />
                          <Button onClick={groupSelectedAsMeal} variant="primary" size="sm" loading={savingMeal} disabled={!saveMealName.trim()}>Group as new meal</Button>
                          <Button onClick={() => setGroupMenu(false)} variant="muted" size="sm">Back</Button>
                        </div>
                        {(() => {
                          const containers = groupLoggedMeals(entries).filter(i => i.type === 'meal')
                          return containers.length > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>or into:</span>
                              {containers.map(c => (
                                <button key={c.id} onClick={() => groupSelectedIntoMeal(c)} style={pillBtnStyle}>🍽 {c.name}</button>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button onClick={() => setGroupMenu(true)} variant="primary" size="sm">Group as meal</Button>
                    <Button onClick={() => setShowSaveMeal(true)} variant="muted" size="sm">Save as meal</Button>
                    <Button onClick={() => setMoveMenu(true)} variant="muted" size="sm">Move to…</Button>
                    {selectedIds.size === 1 && (
                      <Button onClick={() => { const e = entries.find(x => selectedIds.has(x.id)); exitSelect(); if (e) startEdit(e) }} variant="muted" size="sm">Edit</Button>
                    )}
                    <Button onClick={deleteSelected} variant="muted" size="sm">Delete</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Food Form */}
        {nutritionExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: entries.length > 0 ? '4px' : '0' }}>
            {addingToMeal && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                <span>Adding to <strong style={{ color: 'var(--color-text)' }}>🍽 {addingToMeal.name}</strong></span>
                <button onClick={() => { clearNutritionForm(); setNutritionExpanded(false) }} style={selectLinkStyle}>Cancel</button>
              </div>
            )}
            <div style={{ display: addingToMeal ? 'none' : 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {MEALS.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMeal(m.key)}
                  style={{
                    flex: '1 1 0', minWidth: 0,
                    background: meal === m.key ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: meal === m.key ? '#fff' : 'var(--color-muted)',
                    border: `1px solid ${meal === m.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius)', padding: '7px 4px',
                    fontSize: 'var(--text-xs)', fontWeight: meal === m.key ? 600 : 400, cursor: 'pointer',
                  }}
                >{m.label}</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search or enter a food"
              value={food}
              onChange={(e) => handleFoodInput(e.target.value)}
              style={{ ...inputStyle, borderColor: nutritionErrors.food ? '#f87171' : 'var(--color-border)' }}
            />
            {nutritionErrors.food && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-6px' }}>{nutritionErrors.food}</p>}

            {/* Food search results (USDA FDC) */}
            {showFoodResults && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--color-bg)', maxHeight: '244px', overflowY: 'auto', marginTop: '-4px' }}>
                {foodSearching && foodResults.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', padding: '10px 12px', margin: 0 }}>Searching…</p>
                )}
                {!foodSearching && foodResults.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', padding: '10px 12px', margin: 0 }}>No matches — enter it manually below.</p>
                )}
                {foodResults.map((r, i) => {
                  const macros = [
                    !hideCalories && `${r.calories} cal`,
                    r.protein > 0 && `${r.protein}g P`,
                    `${r.carbs}g C`,
                    `${r.fat}g F`,
                  ].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={r.fdcId ?? i}
                      onClick={() => selectFoodResult(r)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        borderBottom: i < foodResults.length - 1 ? '1px solid var(--color-border)' : 'none',
                        padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)', margin: 0 }}>{r.name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', margin: '2px 0 0' }}>
                        {macros} <span style={{ opacity: 0.7 }}>/ 100g</span>
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button onClick={() => setShowScanner(true)} variant="muted" size="sm">Scan barcode</Button>
              <Button onClick={() => setShowBarcodeInput((v) => !v)} variant="ghost" size="sm">
                {showBarcodeInput ? 'Hide barcode entry' : 'Enter barcode #'}
              </Button>
            </div>
            {showScanner && <BarcodeScanner onDetected={(barcode) => { setShowScanner(false); lookupBarcode(barcode) }} onClose={() => setShowScanner(false)} />}
            {showBarcodeInput && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  placeholder="Enter barcode number"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && barcodeInput) lookupBarcode(barcodeInput) }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <Button onClick={() => lookupBarcode(barcodeInput)} variant="primary" size="sm" disabled={!barcodeInput}>Lookup</Button>
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
                onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* unsupported */ } }}
                onChange={(e) => {
                  setCopyFromDate(e.target.value)
                  setCopyEntries([])
                  setSelectedCopyIds(new Set())
                  if (e.target.value) fetchCopyEntries(e.target.value)
                }}
                style={{ ...inputStyle, flex: 1 }}
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

        {/* Quick add — one-tap re-log of frequently logged foods */}
        {!nutritionExpanded && !showCopyPanel && frequentFoods.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Quick add</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {frequentFoods.map(item => {
                const key = item.food.trim().toLowerCase()
                const pending = quickAddKey === key
                const macroLine = [
                  !hideCalories && `${item.calories} cal`,
                  item.protein > 0 && `${item.protein}g P`,
                ].filter(Boolean).join(' · ')
                return (
                  <button
                    key={key}
                    onClick={() => quickAddFood(item, key)}
                    disabled={pending}
                    title={`Add ${item.food}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius)',
                      padding: '7px 10px',
                      cursor: pending ? 'default' : 'pointer',
                      opacity: pending ? 0.5 : 1,
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food}</p>
                      {macroLine && <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', margin: '1px 0 0' }}>{macroLine}</p>}
                    </div>
                    <span style={{
                      flexShrink: 0,
                      width: '18px', height: '18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary-dim)',
                      color: 'var(--color-primary)',
                      fontSize: '0.85rem', fontWeight: 700, lineHeight: 1,
                    }}>+</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Saved meals — one-tap log of a saved combo (create via Select → Save as meal) */}
        {!nutritionExpanded && !showCopyPanel && savedMeals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saved meals</p>
            {savedMeals.map(m => {
              const t = mealTotals(m.items)
              const pending = loggingMealId === m.id
              const editing = editingSavedMealId === m.id
              const picking = logPickId === m.id
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editing ? (
                        <input
                          autoFocus
                          value={savedMealDraft}
                          onChange={e => setSavedMealDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameSavedMeal(m.id, savedMealDraft); if (e.key === 'Escape') setEditingSavedMealId(null) }}
                          onBlur={() => renameSavedMeal(m.id, savedMealDraft)}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '4px 8px' }}
                        />
                      ) : (
                        <p style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                      )}
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', margin: '1px 0 0' }}>
                        {m.items.length} item{m.items.length === 1 ? '' : 's'}{!hideCalories ? ` · ${t.calories} cal` : ''} · {t.protein}g P · {t.carbs}g C · {t.fat}g F
                      </p>
                    </div>
                    {!editing && (
                      <button onClick={() => { setEditingSavedMealId(m.id); setSavedMealDraft(m.name) }} style={iconBtnStyle} title="Rename saved meal">✎</button>
                    )}
                    <button onClick={() => setLogPickId(picking ? null : m.id)} disabled={pending} title={`Log ${m.name}`} style={{ flexShrink: 0, background: picking ? 'var(--color-surface)' : 'var(--color-primary)', color: picking ? 'var(--color-text)' : '#fff', border: picking ? '1px solid var(--color-border)' : 'none', borderRadius: 'var(--radius)', padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.5 : 1, fontFamily: 'inherit' }}>{picking ? 'Cancel' : '+ Log'}</button>
                    <button onClick={() => deleteSavedMeal(m.id)} style={{ ...iconBtnStyle, color: '#f87171' }} title="Delete saved meal">✕</button>
                  </div>
                  {picking && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '2px' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>Log to:</span>
                      {[...MEALS, { key: 'other', label: 'Other' }].map(s => (
                        <button key={s.key} onClick={() => logSavedMeal(m, s.key)} style={{ ...pillBtnStyle, padding: '3px 9px', fontSize: '0.7rem' }}>{s.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
              onClick={() => {
                const opening = !showCopyPanel
                setShowCopyPanel(opening)
                setCopyEntries([])
                setSelectedCopyIds(new Set())
                if (opening) {
                  // Default to yesterday (the usual "copy yesterday's meals")
                  // so the field isn't blank and its entries load immediately.
                  const y = toLocalDateString(new Date(Date.now() - 86400000))
                  setCopyFromDate(y)
                  fetchCopyEntries(y)
                } else {
                  setCopyFromDate('')
                }
              }}
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
