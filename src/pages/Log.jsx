import { useState, useEffect, useRef, useContext } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DndContext, DragOverlay, pointerWithin, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { supabase } from '../supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Button from '../components/Button'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'
import Modal from '../components/Modal'
import SoloUpgrade from '../components/SoloUpgrade'
import { toLocalDateString } from '../utils/dateHelpers'
import { measurementStatus } from '../utils/measurementCadence'
import { cardStyle } from '../utils/styles'
import { refreshNotifications } from '../utils/notifyRefresh'
import { MEALS, mealForHour, groupEntriesByMeal, groupLoggedMeals, formatServing } from '../utils/meals'
import { itemsFromEntries, entriesFromItems, mealTotals, mealSignature } from '../utils/savedMeals'
import { controlStyle, Icon } from '../components/ui'
import ActionSheet from '../components/ActionSheet'
import { useLongPress } from '../hooks/useLongPress'
import { useTabReturn, TabActiveContext } from '../hooks/useTabReturn'
import { revealWhenReady } from '../utils/quickActions'
import { formatMinutes, stepsGoalSub, cardioGoalSub, convertLengthValue } from '../utils/metricRows'
import { convertGoalValue } from '../utils/weightTarget'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  DEVICE_SYNC_EVENT, dismissDeviceRows, removeWeighInFromHealth, rewriteWeighInInHealth,
  syncAppleHealth, undismissDeviceRows, writeWeighInToHealth,
} from '../utils/healthSync'
import PullToRefresh from '../components/PullToRefresh'
import DayStepper from '../components/DayStepper'

const unitConversions = {
  g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5
}

// Where a day's weight or step count came from, named on its row. Mirrors the
// source check constraint, which is the same list on weight_log and steps_log.
const METRIC_SOURCES = {
  manual: 'Logged by hand',
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  withings: 'Withings',
  whoop: 'WHOOP',
  google_health: 'Google Health',
}

const EXERCISE_TYPES = [
  'Running', 'Cycling', 'Elliptical', 'Swimming',
  'Rowing', 'Jump Rope', 'Stair Climber', 'Walking',
  'HIIT', 'Martial Arts', 'Strength Training', 'Yoga', 'Other'
]
// Typed-in workouts that do not count toward the cardio target, matching how
// an imported one is classified (HealthPlugin.swift's workoutTypes): an hour of
// strength or yoga is real training, but it is not an hour of cardio.
const NON_CARDIO_TYPES = new Set(['Strength Training', 'Yoga'])

// Tape-measurement sites (body composition). Order = display order.
const MEASUREMENT_SITES = [
  { key: 'neck', label: 'Neck' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'arm', label: 'Arm' },
  { key: 'thigh', label: 'Thigh' },
]

// A diary item (food row or meal container) that can be dragged into another
// meal section. Render-prop so the row markup stays in Log; the wrapper hands
// back the node ref, a style, and two ways in:
//   handleProps -- the desktop's grip. A mouse drags from the handle only, so
//                  text on the row stays selectable.
//   rowProps    -- touch, on the WHOLE row. Hold, then move: the iOS lift.
//                  There is no grip on a phone; the row is the handle.
// The row is not moved in place any more. It stays as a faded placeholder
// while a DragOverlay copy follows the finger (see Log), which is what lets
// the moving copy look lifted rather than half-transparent.
// Stable module-scope component → no remounts.
function DraggableItem({ id, item, lifted, children }) {
  const { listeners, attributes, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, data: { item } })
  // Faded only once the item has actually been LIFTED (moved), not merely
  // held: a hold that opens the menu must not also look like a drag.
  const dragStyle = { opacity: isDragging && lifted ? 0.35 : 1, transition: 'opacity 150ms ease' }
  const handleProps = { ref: setActivatorNodeRef, ...listeners, ...attributes }
  const rowProps = { onTouchStart: listeners?.onTouchStart }
  return children({ setNodeRef, dragStyle, handleProps, rowProps })
}

// A meal section that accepts dropped items; tinted while a drag is over it.
// A uniform tint, no outline: it was a 2px dashed green border, and state is
// never a coloured border (design-system B2). The box-shadow spread carries
// the tint past the section's text the way a held row's does, without layout.
// `target` is false for the dragged item's own section and before anything
// has moved, so a still hold never flashes its own meal green.
function DroppableMeal({ slot, target, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot}`, data: { slot } })
  const tint = isOver && target ? 'var(--color-primary-dim)' : 'transparent'
  return (
    <div ref={setNodeRef} style={{
      borderRadius: 'var(--radius)',
      background: tint,
      boxShadow: `0 0 0 var(--space-8) ${tint}`,
      transition: 'background-color 120ms, box-shadow 120ms',
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
  const [dialog, setDialog] = useState(null) // branded confirm/notice modal config, or null
  const [toast, setToast] = useState(null)   // transient error/success toast, or null
  // Surface a failed write so a save never fails silently (trust on the core loop).
  function showToast(message, type = 'success', action = null) { setToast({ message, type, action }) }

  // Deleting a logged row is one tap on a small ✕ and used to be silent and
  // irreversible. Re-inserting the captured row verbatim (same id, same
  // created_at) restores it in its original position.
  //
  // A row that came from Apple Health also leaves a tombstone, or the next sync
  // would put it straight back. The tombstone failing is not worth unwinding
  // the delete over: the row is gone, and the worst case is that it returns.
  async function deleteWithUndo({ table, match, rows, label, refresh }) {
    const { error } = await supabase.from(table).delete().match(match)
    if (error) {
      console.error(`Error deleting from ${table}:`, error)
      showToast('Couldn\'t delete that. Try again.', 'error')
      return
    }
    dismissDeviceRows(table, rows).catch(err => console.error('Error dismissing device row:', err))
    // A typed weigh-in Gardnr wrote to Apple Health leaves Health with it.
    if (table === 'weight_log') {
      for (const r of rows) removeWeighInFromHealth(r).catch(err => console.error('Error removing weigh-in from Health:', err))
    }
    refresh()
    showToast(`${label} deleted.`, 'success', {
      label: 'Undo',
      onClick: async () => {
        // Lift the tombstone BEFORE restoring, or the restored row would sit
        // under a tombstone that the next sync honours by skipping its updates.
        await undismissDeviceRows(table, rows).catch(err => console.error('Error undismissing device row:', err))
        const { error: restoreErr } = await supabase.from(table).insert(rows)
        if (restoreErr) {
          console.error(`Error restoring ${table}:`, restoreErr)
          showToast('Couldn\'t undo that.', 'error')
        } else {
          // Its Health sample was deleted with it, so the restored row is
          // written again and takes the new sample's id.
          if (table === 'weight_log') {
            for (const r of rows) {
              writeWeighInToHealth({ ...r, health_sample_id: null }).catch(err => console.error('Error rewriting weigh-in to Health:', err))
            }
          }
          refresh()
        }
      },
    })
  }
  const [showSavedMeals, setShowSavedMeals] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [moveMenu, setMoveMenu] = useState(false)
  const [groupMenu, setGroupMenu] = useState(false)
  const [moveItemId, setMoveItemId] = useState(null) // id of the row/meal whose per-item "move to" menu is open
  // Long press on a logged row opens its actions as a named list, instead of
  // making the reader decode four icons at the right edge. The icons STAY: a
  // hold cannot be performed with a keyboard or a screen reader, so this is a
  // second route to the same actions, never the only one.
  const [sheet, setSheet] = useState(null) // { title, actions } | null
  const bindLongPress = useLongPress()
  // Same breakpoint the bottom tab bar uses (components/NavBar.jsx).
  const isMobile = useMediaQuery('(max-width: 600px)')
  // Mouse drags from the grip after a few px. Touch lifts a row after the SAME
  // hold the menu uses, and a finger that travels 10px first is a scroll: the
  // sensor cancels without preventing anything, so the list scrolls as usual.
  // Once lifted the sensor blocks scrolling itself, so the row needs no
  // touch-action of its own (F4's trap was a row that could not scroll).
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 10 } }),
  )
  // Quick add can be folded away by someone who never uses it. Remembered per
  // device, like ClientView's collapsed sections; storage can throw (private
  // mode), so it falls back to open.
  const [quickAddOpen, setQuickAddOpen] = useState(() => {
    try { return localStorage.getItem('gardnr-log-quickadd') !== 'closed' } catch { return true }
  })
  function toggleQuickAdd() {
    setQuickAddOpen(open => {
      try { localStorage.setItem('gardnr-log-quickadd', open ? 'closed' : 'open') } catch { /* ignore */ }
      return !open
    })
  }
  const [dragItem, setDragItem] = useState(null) // the lifted diary item, for the overlay
  // A hold that ends where it began opens the sheet on release; the click the
  // browser synthesises from that same touch must not also toggle the row.
  const suppressClickUntil = useRef(0)
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
  const [savingEntry, setSavingEntry] = useState(false)
  const submittingEntryRef = useRef(false) // synchronous double-submit guard (state updates are async)
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
  // The daily targets the Body and activity rows are read against -- the same
  // targets row My Progress reads. The Log compares a day with its GOALS only;
  // comparisons with earlier days are My Progress's job, not this page's.
  const [targets, setTargets] = useState(null)

  // Body-measurement state (one row per date; sites in MEASUREMENT_SITES)
  const [meas, setMeas] = useState({ unit: 'in', neck: '', chest: '', waist: '', hips: '', arm: '', thigh: '' })
  const [savedMeas, setSavedMeas] = useState(null)
  const [measExpanded, setMeasExpanded] = useState(false)
  // Most recent measurement across ALL days (for the "time to re-measure" nudge).
  // The client's reminder uses the steadier ~monthly cadence so it never nags;
  // the coach's ClientView read is the phase-precise one.
  const [lastMeasuredIso, setLastMeasuredIso] = useState(null)

  // The day's records load behind placeholder boxes, as My Progress does.
  // Rendering before they land showed "Not logged" and "Nothing logged yet
  // today" for a beat on every visit: an empty day and an unloaded one looked
  // identical. Only the reads that decide what the cards SAY are awaited; the
  // quick-add tiles, saved meals and the re-measure date fill in on their own.
  // `loadSeq` drops a slow load for a day the reader has already stepped past,
  // so it cannot lift the placeholders over the day now loading.
  const [pageLoading, setPageLoading] = useState(true)
  // The day whose records are on screen, set when its load lands: a home
  // screen Quick Action waits on it (below), so it never acts on a form that
  // is about to be replaced by the day it asked for.
  const [loadedDate, setLoadedDate] = useState(null)
  const loadSeq = useRef(0)
  useEffect(() => {
    async function loadDay() {
      const seq = ++loadSeq.current
      setPageLoading(true)
      // Every day opens with its editors closed; an empty day shows "Not
      // logged" rows with their own Log buttons. This lives on the DAY
      // change, not in fetchWeight/fetchSteps, because those also run on a
      // quiet refresh -- and closing there shut a form the reader (or a
      // Quick Action) had just opened.
      setWeightExpanded(false)
      setStepsExpanded(false)
      await Promise.allSettled([
        fetchEntries(), fetchDayComplete(), fetchWeight(),
        fetchCardioEntries(), fetchSteps(), fetchMeasurements(),
      ])
      if (seq === loadSeq.current) { setPageLoading(false); setLoadedDate(selectedDate) }
    }
    loadDay()
    fetchFrequentFoods()
    fetchSavedMeals()
    fetchLastMeasured()
    setFeedback('')
  }, [selectedDate])

  // Back on this tab (kept alive): refresh in place, no placeholders. The day
  // shown is the day the reader left on, and something may have changed it
  // meanwhile (a coach, a device sync, another device).
  useTabReturn(() => {
    fetchEntries(); fetchDayComplete(); fetchWeight(); fetchCardioEntries()
    fetchSteps(); fetchMeasurements(); fetchFrequentFoods(); fetchSavedMeals(); fetchLastMeasured()
  })

  // Pull to refresh: Apple Health first, so what was just logged in Health or
  // Fitness is in the database before the page re-reads it. A failed sync
  // still refreshes the page -- the pull asked for the latest, and the rest of
  // the day is worth having even when Health is not.
  async function pullRefresh() {
    try {
      await syncAppleHealth(session?.user?.id, { force: true })
    } catch (err) {
      console.error('Apple Health sync failed:', err)
      showToast('Couldn\'t sync with Apple Health. Try again.', 'error')
    }
    await Promise.allSettled([
      fetchEntries(), fetchDayComplete(), fetchWeight(), fetchCardioEntries(),
      fetchSteps(), fetchMeasurements(), fetchFrequentFoods(), fetchSavedMeals(), fetchLastMeasured(),
    ])
  }

  // Apple Health just wrote something. Re-read the three metrics it writes,
  // except one whose editor is open: fetchWeight/fetchSteps reset the field,
  // and a sync landing mid-keystroke must not take a number out from under the
  // reader. The open editor's save pins its value anyway.
  useEffect(() => {
    function onSynced() {
      fetchCardioEntries()
      if (!weightExpanded) fetchWeight()
      if (!stepsExpanded) fetchSteps()
    }
    window.addEventListener(DEVICE_SYNC_EVENT, onSynced)
    return () => window.removeEventListener(DEVICE_SYNC_EVENT, onSynced)
  }, [selectedDate, weightExpanded, stepsExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Home screen Quick Actions arrive as /log?action=… (utils/quickActions).
  // Logging happens NOW, so each one moves the page to today; the action is
  // taken from the URL at once (so a reload cannot repeat it) and carried out
  // once today's records are on screen. Only while this is the tab on screen:
  // the Log is kept alive, and a hidden one must not act on another page's URL.
  const tabActive = useContext(TabActiveContext)
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingAction, setPendingAction] = useState(null)
  const foodInputRef = useRef(null)
  const weightInputRef = useRef(null)
  useEffect(() => {
    function takeAction() {
      const action = searchParams.get('action')
      if (!tabActive || !action) return
      const sp = new URLSearchParams(searchParams)
      sp.delete('action')
      setSearchParams(sp, { replace: true })
      setPendingAction(action)
      setSelectedDate(toLocalDateString(new Date()))
    }
    takeAction()
  }, [tabActive, searchParams, setSearchParams])
  useEffect(() => {
    function carryOut() {
      if (!pendingAction || pageLoading || loadedDate !== toLocalDateString(new Date())) return
      const action = pendingAction
      setPendingAction(null)
      if (action === 'add-food') { setShowCopyPanel(false); setNutritionExpanded(true) }
      if (action === 'scan') { setShowCopyPanel(false); setNutritionExpanded(true); setShowScanner(true) }
      if (action === 'log-weight') setWeightExpanded(true)
      // Bring the field into view and give it the cursor once it has rendered.
      // (iOS raises the keyboard only for a focus that comes from a tap, so on
      // the phone this places the reader at the field; one tap types.)
      // Once the page is on screen and the field exists (revealWhenReady): a
      // shortcut from the background is handled while the app is still hidden.
      const target = action === 'add-food' ? foodInputRef : action === 'log-weight' ? weightInputRef : null
      if (target) revealWhenReady(() => target.current)
    }
    carryOut()
  }, [pendingAction, pageLoading, loadedDate])

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from('targets').select('steps, cardio_minutes').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => { if (error) console.error(error); else setTargets(data) })
  }, [session?.user?.id])

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

  // True when a saved meal with this exact name AND content already exists, so
  // we don't pile up identical "Pre workout × N" entries. Returns the existing
  // match (for messaging) or null.
  function findDuplicateSavedMeal(name, items) {
    const sig = mealSignature(name, items)
    return savedMeals.find(m => mealSignature(m.name, m.items) === sig) || null
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
    if (findDuplicateSavedMeal(name, chosen)) {
      showToast(`"${name}" is already in your saved meals.`, 'error'); exitSelect(); return
    }
    setSavingMeal(true)
    const { data: { session: cs } } = await supabase.auth.getSession()
    const { data: created, error } = await supabase
      .from('saved_meals').insert({ user_id: cs.user.id, name }).select('id').single()
    if (error) { console.error('Error saving meal:', error); showToast('Couldn\'t save the meal. Try again.', 'error'); setSavingMeal(false); return }
    const { error: itemsErr } = await supabase
      .from('saved_meal_items').insert(itemsFromEntries(chosen, { savedMealId: created.id, userId: cs.user.id }))
    if (itemsErr) { console.error('Error saving meal items:', itemsErr); showToast('Couldn\'t save the meal. Try again.', 'error') }
    setSavingMeal(false); exitSelect(); fetchSavedMeals()
  }

  // Bulk re-categorize the selected entries to a meal slot ('other' clears the tag).
  async function moveSelectedToMeal(mealKey) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).in('id', ids)
    if (error) { console.error('Error moving entries:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
    exitSelect()
  }

  // Move one already-logged food row to another meal slot (in place).
  async function moveEntryToMeal(entryId, mealKey) {
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).eq('id', entryId)
    if (error) { console.error('Error moving entry:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
    setMoveItemId(null)
  }

  // Move a whole logged-meal container (all its rows) to another meal slot.
  async function moveLoggedMealToMeal(item, mealKey) {
    const { error } = await supabase.from('nutrition_log')
      .update({ meal: mealKey === 'other' ? null : mealKey }).in('id', item.entries.map(e => e.id))
    if (error) { console.error('Error moving meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
    setMoveItemId(null)
  }

  // A lifted item was let go. Two outcomes from one gesture, the way iOS does
  // it: a touch that never travelled was a long press, so the row's sheet
  // opens; one that ended over another meal section moves the item there.
  // ONE GESTURE, the way iOS does it: a touch held still for the hold time
  // opens the row's menu right then, finger still down (handleDiaryDragStart);
  // moving the finger after that dismisses the menu and LIFTS the row
  // (handleDiaryDragMove), and only from then is anything drawn as a drag --
  // the floating copy, the faded original, the target tint. Before, the drag
  // visuals appeared at the hold whether or not the finger moved, and the
  // menu snapped up only on release.
  const LIFT_PX = 8
  const [dragLifted, setDragLifted] = useState(false)
  function itemSlot(item) {
    return item.type === 'meal' ? (item.entries[0]?.meal || 'other') : (item.entry.meal || 'other')
  }
  function handleDiaryDragStart({ active, activatorEvent }) {
    const item = active.data.current?.item ?? null
    setDragItem(item)
    setDragLifted(false)
    if (activatorEvent?.type === 'touchstart' && item) {
      // The press tint is the hold's progress bar; the menu replaces it.
      document.querySelectorAll('[data-pressing]').forEach(el => { delete el.dataset.pressing })
      setSheet(item.type === 'meal' ? mealSheet(item) : foodSheet(item.entry))
    }
  }
  function handleDiaryDragMove({ delta }) {
    if (dragLifted || Math.hypot(delta.x, delta.y) < LIFT_PX) return
    setDragLifted(true)
    setSheet(null)
  }
  function handleDiaryDragEnd({ active, over, activatorEvent }) {
    const lifted = dragLifted
    setDragItem(null)
    setDragLifted(false)
    setMoveItemId(null)
    suppressClickUntil.current = Date.now() + 400
    // A touch that never lifted was the menu, already open: nothing to drop.
    if (activatorEvent?.type === 'touchstart' && !lifted) return
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
  // The DB write for "group as new meal", run after any needed confirmation.
  async function performGroupAsMeal(name, ids) {
    setSavingMeal(true)
    const first = entries.find(e => selectedIds.has(e.id))
    const { error } = await supabase.from('nutrition_log')
      .update({ logged_meal_id: crypto.randomUUID(), logged_meal_name: name, meal: first?.meal ?? null })
      .in('id', ids)
    if (error) { console.error('Error grouping meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
    setSavingMeal(false); exitSelect()
  }

  async function groupSelectedAsMeal() {
    const name = saveMealName.trim()
    const ids = [...selectedIds]
    if (!name || ids.length === 0) return
    const containers = selectedContainerIds()
    if (containers.size > 1) {
      setDialog({ title: 'Items are in different meals', message: 'Group items from a single meal (or loose items) at a time.', confirmLabel: 'Got it' })
      return
    }
    // Grouping into a NEW meal pulls any already-grouped item out of its meal —
    // confirm first (naming it) so we never silently take an existing meal apart.
    if (containers.size === 1) {
      const fromName = entries.find(e => selectedIds.has(e.id) && e.logged_meal_id)?.logged_meal_name || 'another meal'
      setDialog({
        title: 'Move items out of a meal?',
        message: `This moves the selected item(s) out of "${fromName}" into the new meal.`,
        confirmLabel: 'Move', cancelLabel: 'Cancel',
        onConfirm: () => performGroupAsMeal(name, ids),
      })
      return
    }
    performGroupAsMeal(name, ids)
  }

  // Add the selected entries into an EXISTING logged meal container.
  async function groupSelectedIntoMeal(container) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (selectedContainerIds(container.id).size > 0) {
      setDialog({ title: 'Items are in another meal', message: 'Some selected items already belong to a different meal. Move those out first, or group within one meal.', confirmLabel: 'Got it' })
      return
    }
    const { error } = await supabase.from('nutrition_log')
      .update({ logged_meal_id: container.id, logged_meal_name: container.name, meal: container.entries[0]?.meal ?? null })
      .in('id', ids)
    if (error) { console.error('Error adding to meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
    exitSelect()
  }

  async function deleteSelected() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const { error } = await supabase.from('nutrition_log').delete().in('id', ids)
    if (error) { console.error('Error deleting entries:', error); showToast('Something went wrong. Try again.', 'error') }
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
    if (error) { console.error('Error logging saved meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); fetchFrequentFoods(); refreshNotifications(); setShowSavedMeals(false) }
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
    if (error) { console.error('Error repeating meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else { fetchEntries(); refreshNotifications() }
  }

  async function deleteLoggedMeal(id) {
    const rows = entries.filter(e => e.logged_meal_id === id)
    if (!rows.length) return
    await deleteWithUndo({
      table: 'nutrition_log', match: { logged_meal_id: id }, rows,
      label: rows.length === 1 ? 'Meal' : `Meal (${rows.length} items)`,
      refresh: () => { fetchEntries(); fetchFrequentFoods(); refreshNotifications() },
    })
  }

  // Save a logged-meal container's foods as a reusable saved meal (named from
  // the container; rename later in the Saved meals modal).
  async function saveContainerAsMeal(item) {
    if (findDuplicateSavedMeal(item.name, item.entries)) {
      setDialog({ title: 'Already saved', message: `"${item.name}" is already in your saved meals.`, confirmLabel: 'OK' })
      return
    }
    const { data: { session: cs } } = await supabase.auth.getSession()
    const { data: created, error } = await supabase
      .from('saved_meals').insert({ user_id: cs.user.id, name: item.name }).select('id').single()
    if (error) { console.error('Error saving meal:', error); showToast('Couldn\'t save the meal. Try again.', 'error'); return }
    const { error: itemsErr } = await supabase
      .from('saved_meal_items').insert(itemsFromEntries(item.entries, { savedMealId: created.id, userId: cs.user.id }))
    if (itemsErr) console.error('Error saving meal items:', itemsErr)
    else fetchSavedMeals()
    setDialog({ title: 'Saved', message: `"${item.name}" was added to your saved meals.`, confirmLabel: 'OK' })
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
    if (error) { console.error('Error deleting saved meal:', error); showToast('Something went wrong. Try again.', 'error') }
    else fetchSavedMeals()
  }

  async function renameSavedMeal(id, name) {
    const trimmed = name.trim()
    setEditingSavedMealId(null)
    if (!trimmed) return
    const { error } = await supabase.from('saved_meals').update({ name: trimmed }).eq('id', id)
    if (error) { console.error('Error renaming saved meal:', error); showToast('Something went wrong. Try again.', 'error') }
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
      if (error) { console.error('Error clearing day-complete:', error); showToast('Something went wrong. Try again.', 'error') }
      else setDayComplete(false)
    } else {
      const { error } = await supabase.from('day_complete')
        .upsert({ user_id: cs.user.id, logged_date: selectedDate }, { onConflict: 'user_id,logged_date' })
      if (error) { console.error('Error marking day complete:', error); showToast('Something went wrong. Try again.', 'error') }
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
    if (error) { console.error('Error copying entries:', error); showToast('Something went wrong. Try again.', 'error') }
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
    // Prevent a rapid double-click / double-tap from inserting the food twice.
    if (submittingEntryRef.current) return
    submittingEntryRef.current = true
    setSavingEntry(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (editingEntry) {
        const { error } = await supabase.from('nutrition_log').update({
          food, calories: parseInt(calories), protein: parseInt(protein) || 0,
          carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
          serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit, meal
        }).eq('id', editingEntry.id)
        if (error) { console.error('Error updating:', error); showToast('Couldn\'t save that food. Try again.', 'error') }
        else { setEditingEntry(null); clearNutritionForm(); setNutritionExpanded(false); fetchEntries(); refreshNotifications() }
      } else {
        const { error } = await supabase.from('nutrition_log').insert([{
          food, calories: parseInt(calories), protein: parseInt(protein) || 0,
          carbs: parseInt(carbs) || 0, fat: parseInt(fat) || 0,
          serving_size: parseFloat(servingSize) || 100, serving_unit: servingUnit, meal,
          logged_date: selectedDate, user_id: currentSession.user.id,
          ...(addingToMeal ? { logged_meal_id: addingToMeal.id, logged_meal_name: addingToMeal.name } : {}),
        }])
        if (error) { console.error('Error saving:', error); showToast('Couldn\'t save that food. Try again.', 'error') }
        else { clearNutritionForm(); setNutritionExpanded(false); fetchEntries(); refreshNotifications() }
      }
    } finally {
      submittingEntryRef.current = false
      setSavingEntry(false)
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

  // Load a logged row back into the add-food form, ready to log again.
  // Named and lifted out of the Re-log button because the long-press sheet
  // offers the same action: two copies of eight setState calls would drift the
  // first time a field was added to the form.
  function prefillFromEntry(entry) {
    setFood(entry.food); setCalories(entry.calories.toString())
    setProtein(entry.protein.toString()); setCarbs(entry.carbs.toString()); setFat(entry.fat.toString())
    setServingSize(entry.serving_size.toString()); setServingUnit(entry.serving_unit || 'g')
    setMeal(entry.meal || mealForHour(new Date().getHours()))
    // The row's macros are totals for its own serving, but the scaling effect
    // reads the base as per-100g (or per-serving), so convert first. Handing it
    // the totals as-is re-logged "1 serving · 402 kcal" as 4 kcal.
    // Size is parsed the same way the effect parses it, so the round trip is exact.
    const measured = (entry.serving_unit || 'g') in unitConversions
    const perUnit = measured
      ? 100 / ((parseInt(entry.serving_size) || 100) * unitConversions[entry.serving_unit || 'g'])
      : 1 / (parseFloat(entry.serving_size) || 1)
    setBaseNutrients({
      calories: entry.calories * perUnit, protein: entry.protein * perUnit,
      carbs: entry.carbs * perUnit, fat: entry.fat * perUnit,
    })
    setBaseServingSize(measured ? null : 1)
    setBaseServingLabel(''); setEditingEntry(null); setNutritionExpanded(true)
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
    const row = entries.find(e => e.id === id)
    if (!row) return
    setFeedback('')
    await deleteWithUndo({
      table: 'nutrition_log', match: { id }, rows: [row], label: row.food_name || 'Entry',
      refresh: () => { fetchEntries(); refreshNotifications() },
    })
  }

  async function getAIFeedback() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nutrition-coach`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ entries }) }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error) {
        showToast(data.error || 'Something went wrong. Please try again.', 'error')
        return
      }
      setFeedback(data.message)
    } catch (error) {
      console.error('AI feedback error:', error)
      showToast('Something went wrong. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // What a lookup fills in, emptied when a lookup fails. Otherwise a scan
  // that found a product followed by one that found nothing left the FIRST
  // product's calories and macros beside an empty name, one tap from being
  // logged as something else. The meal choice is left alone.
  function clearLookupFill() {
    setFood(''); setCalories(''); setProtein(''); setCarbs(''); setFat('')
    setServingSize(''); setServingUnit('g')
    setBaseNutrients(null); setBaseServingSize(null); setBaseServingLabel('')
  }

  async function lookupBarcode(barcode) {
    setLookupError('')
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await response.json()
      if (data.status === 0) { clearLookupFill(); setLookupError('Product not found.'); return }

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
    } catch { clearLookupFill(); setLookupError('Lookup failed.') }
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
      // source: 'manual' pins this value — a later device sync will not
      // overwrite it (enforced in apply_device_metrics, not here). external_id
      // is deliberately LEFT ALONE: it is the dedupe key, so clearing it would
      // make the next sync find no match and insert a duplicate of the row the
      // client just corrected.
      const { data: updated, error } = await supabase
        .from('weight_log')
        .update({ weight: parseFloat(weight), unit: weightUnit, weighed_at, source: 'manual' })
        .eq('id', savedWeight.id)
        .select()
        .single()
      if (error) { console.error(error); showToast('Couldn\'t save your weight. Try again.', 'error') } else {
        // Health follows the edit for a weigh-in typed here; a scale's reading
        // stays as the scale recorded it (isTypedWeighIn).
        rewriteWeighInInHealth(savedWeight, updated).catch(err => console.error('Error updating weigh-in in Health:', err)).finally(fetchWeight)
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('weight_log')
        .insert([{
          weight: parseFloat(weight),
          unit: weightUnit,
          logged_date: selectedDate,
          user_id: currentSession.user.id,
          weighed_at,
        }])
        .select()
        .single()
      if (error) { console.error(error); showToast('Couldn\'t save your weight. Try again.', 'error') } else {
        writeWeighInToHealth(inserted).catch(err => console.error('Error writing weigh-in to Health:', err)).finally(fetchWeight)
      }
    }
  }

  async function deleteWeight() {
    if (!savedWeight) return
    await deleteWithUndo({
      table: 'weight_log', match: { id: savedWeight.id }, rows: [savedWeight], label: 'Weight',
      refresh: fetchWeight,
    })
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
        // An unchanged name keeps the row's own classification: an imported
        // "Martial Arts" knows it is cardio, and the picker's short list
        // should not get a say in that.
        counts_as_cardio: exerciseType === editingCardio.exercise_type
          ? editingCardio.counts_as_cardio !== false
          : !NON_CARDIO_TYPES.has(exerciseType),
        duration: parseInt(duration),
        calories_burned: parseInt(caloriesBurned) || null,
        avg_heart_rate: parseInt(avgHeartRate) || null,
        source: 'manual', // pins the edit against later syncs; see saveWeight
      }).eq('id', editingCardio.id)
      if (error) { console.error(error); showToast('Couldn\'t save your workout. Try again.', 'error') }
      else { setEditingCardio(null); setDuration(''); setCaloriesBurned(''); setAvgHeartRate(''); fetchCardioEntries() }
    } else {
      const { error } = await supabase.from('cardio_log').insert([{
        exercise_type: exerciseType, duration: parseInt(duration),
        counts_as_cardio: !NON_CARDIO_TYPES.has(exerciseType),
        calories_burned: parseInt(caloriesBurned) || null,
        avg_heart_rate: parseInt(avgHeartRate) || null,
        logged_date: selectedDate, user_id: currentSession.user.id
      }])
      if (error) { console.error(error); showToast('Couldn\'t save your workout. Try again.', 'error') }
      else { setDuration(''); setCaloriesBurned(''); setAvgHeartRate(''); fetchCardioEntries() }
    }
  }

  async function deleteCardio(id) {
    const row = cardioEntries.find(e => e.id === id)
    if (!row) return
    await deleteWithUndo({
      table: 'cardio_log', match: { id }, rows: [row], label: row.exercise_type || 'Workout',
      refresh: fetchCardioEntries,
    })
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
          // Typing a step count claims the day: this upsert deliberately
          // overwrites a device-synced value, and marking it manual stops any
          // later sync from taking it back. See saveWeight.
          source: 'manual',
        },
        { onConflict: 'user_id,logged_date' }
      )

    if (error) {
      console.error(error)
      showToast('Couldn\'t save your steps. Try again.', 'error')
      return
    }
    fetchSteps()
  }

  async function deleteSteps() {
    if (!savedSteps) return
    await deleteWithUndo({
      table: 'steps_log', match: { id: savedSteps.id }, rows: [savedSteps], label: 'Steps',
      refresh: fetchSteps,
    })
  }


  async function fetchLastMeasured() {
    if (!session?.user?.id) return
    const { data } = await supabase.from('body_measurements').select('logged_date')
      .eq('user_id', session.user.id).order('logged_date', { ascending: false }).limit(1).maybeSingle()
    setLastMeasuredIso(data?.logged_date ?? null)
  }

  async function fetchMeasurements() {
    if (!session?.user?.id) return
    const { data, error } = await supabase.from('body_measurements').select('*')
      .eq('user_id', session.user.id).eq('logged_date', selectedDate).maybeSingle()
    if (error) { console.error(error); return }
    if (data) {
      setSavedMeas(data)
      setMeas({
        unit: data.unit || 'in',
        neck: data.neck?.toString() || '', chest: data.chest?.toString() || '',
        waist: data.waist?.toString() || '', hips: data.hips?.toString() || '',
        arm: data.arm?.toString() || '', thigh: data.thigh?.toString() || '',
      })
      setMeasExpanded(false)
    } else {
      setSavedMeas(null)
      setMeas({ unit: meas.unit, neck: '', chest: '', waist: '', hips: '', arm: '', thigh: '' })
      setMeasExpanded(false)
    }
  }

  async function saveMeasurements() {
    const sites = MEASUREMENT_SITES.map(s => s.key)
    if (!sites.some(k => meas[k] !== '')) return // nothing entered
    const { data: { session: cs } } = await supabase.auth.getSession()
    const row = { user_id: cs.user.id, logged_date: selectedDate, unit: meas.unit }
    sites.forEach(k => { row[k] = meas[k] === '' ? null : parseFloat(meas[k]) })
    const { error } = await supabase.from('body_measurements').upsert(row, { onConflict: 'user_id,logged_date' })
    if (error) { console.error(error); showToast('Couldn\'t save measurements. Try again.', 'error'); return }
    setMeasExpanded(false)
    fetchMeasurements()
    fetchLastMeasured()
  }

  async function deleteMeasurements() {
    if (!savedMeas) return
    await deleteWithUndo({
      table: 'body_measurements', match: { id: savedMeas.id }, rows: [savedMeas], label: 'Measurements',
      refresh: () => { fetchMeasurements(); fetchLastMeasured() },
    })
  }


  const totalCalories = entries.reduce((s, e) => s + (e.calories || 0), 0)
  const totalProtein = entries.reduce((s, e) => s + (e.protein || 0), 0)
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs || 0), 0)
  const totalFat = entries.reduce((s, e) => s + (e.fat || 0), 0)

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle

  const sectionStyle = {
    ...cardStyle,
    display: 'flex', flexDirection: 'column', gap: 'var(--space-md)'
  }

  const iconBtnStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 6px', fontSize: 'var(--text-base)', color: 'var(--color-muted)'
  }
  // The phone's one row control. The glyph is the same size as before, but
  // the press area is 44x44 (Apple's floor; it was ~28x24, and four of them
  // stacked in a column took aim). Negative margins give the extra area back,
  // so the row's height and the glyph's position do not move.
  const moreBtnStyle = {
    ...iconBtnStyle, width: 44, height: 44, padding: 0, margin: '-8px -8px -8px -8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  // How far a row's value sits from the row's right edge on a phone: the more
  // button's footprint (44 less its two -8 margins) plus the row's 10px gap.
  // A group total on the right lines up with the values only if it is inset
  // by the same amount.
  const ACTION_COL_PX = 44 - 16 + 10
  // Where a Body and activity row's TEXT starts: the 28px mark plus the row's
  // 10px gap. Rules, the WORKOUTS label and "+ Log workout" all start here.
  const MARK_INSET_PX = 28 + 10

  // A form field with its name ABOVE it. These forms named their fields only
  // by placeholder, which vanishes the moment there is a value: a filled-in
  // food read "97 / 1 / 23 / 0 / 100" with nothing to say which was protein.
  // Same small muted label the Measurements form uses; a real <label>, so
  // tapping it focuses the field and a screen reader reads it.
  const fieldLabel = (text, input, style) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, ...style }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{text}</span>
      {input}
    </label>
  )

  // The number at the right of a cardio or steps row: .trend-value at its
  // phone size, so a session reads the way a Trends row on My Progress does.
  const rowValueStyle = {
    fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0,
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

  // One row of the Body and activity card: a name left, the number right,
  // then the actions -- the Trends row's shape. `logged: false` is the empty
  // state, which says so (F3) and carries a Log button where the number goes.
  // `first` drops the top rule: rules separate records, not card from heading.
  // One row of the Body and activity card, on a fixed grid so every row lines
  // up with every other:
  //
  //   [mark] Title  note                 value  [more]
  //   [mark] sub-line
  //
  // The value sits on the TITLE's baseline, not centred between the two lines
  // where it lined up with nothing. The rule above a row starts at the text
  // column (MARK_INSET_PX), as iOS insets separators past a row's icon, so the
  // icon reads as part of its row; the WORKOUTS label and "+ Log workout" start
  // on that same column. `logged: false` is the empty state: "Not logged"
  // (F3) and a Log button where the value goes. `first` drops the rule.
  function renderMetricRow({ key, title, sub, value, mark, logged = true, first = false, onLog, onEdit, onDelete }) {
    // The metric's hue as a FILL (a 16% disc behind its glyph), the mark the
    // Trends rows on My Progress open with. Never on the text: metric tokens
    // fail contrast as type on a light card (design-system B2).
    const markEl = (
      <span className="trend-mark" style={{ color: `var(--color-${mark.metric})`, gridColumn: 1, gridRow: '1 / span 2', alignSelf: 'center' }} aria-hidden="true">
        <Icon name={mark.glyph} size={16} />
      </span>
    )
    const rule = !first && (
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: MARK_INSET_PX, right: 0, borderTop: '1px solid var(--color-border)' }} />
    )
    const grid = {
      position: 'relative', display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto auto',
      columnGap: '10px', rowGap: '2px', alignItems: 'baseline', padding: '10px 0',
    }
    const titleEl = (
      <p style={{ gridColumn: 2, gridRow: 1, fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)', minWidth: 0 }}>
        {title}
      </p>
    )
    const subEl = (text) => (
      <p style={{ gridColumn: '2 / span 3', gridRow: 2, fontSize: 'var(--text-sm)', minWidth: 0 }}>{text}</p>
    )
    if (!logged) {
      return (
        <div key={key} style={grid}>
          {rule}{markEl}{titleEl}{subEl('Not logged')}
          <div style={{ gridColumn: '3 / span 2', gridRow: '1 / span 2', alignSelf: 'center' }}>
            <Button onClick={onLog} variant="muted" size="sm">Log</Button>
          </div>
        </div>
      )
    }
    const openSheet = () => setSheet({
      title,
      actions: [
        { label: 'Edit', icon: 'pencil', onSelect: onEdit },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: onDelete },
      ],
    })
    return (
      <div key={key} {...bindLongPress(openSheet)} className="long-pressable" style={grid}>
        {rule}{markEl}{titleEl}
        <span className="tnum" style={{ ...rowValueStyle, gridColumn: 3, gridRow: 1 }}>{value}</span>
        {/* Same split as a food row: the phone gets one button that opens the
            sheet the long press opens; the desktop keeps the named icons. */}
        <div data-no-longpress style={{ gridColumn: 4, gridRow: 1, alignSelf: 'center', display: 'flex', gap: '2px' }}>
          {isMobile ? (
            // Vertical margins wide enough that the 44pt press area takes no
            // height in the grid: otherwise it sets the title line's height
            // and pushes the sub-line away from its title.
            <button onClick={openSheet} style={{ ...moreBtnStyle, margin: '-22px -8px' }} aria-label={`Actions for ${title}`} title="Actions"><Icon name="more" /></button>
          ) : (
            <>
              <button onClick={onEdit} style={iconBtnStyle} aria-label={`Edit ${title}`} title="Edit"><Icon name="pencil" /></button>
              <button onClick={onDelete} style={{ ...iconBtnStyle, color: 'var(--color-error)' }} aria-label={`Delete ${title}`} title="Delete"><Icon name="trash" /></button>
            </>
          )}
        </div>
        {subEl(sub)}
      </div>
    )
  }

  // A synced value names its device; a hand-logged one says nothing, because
  // "Logged by hand" on every row of every client without a device is noise.
  const sourceOf = (row) => (row?.source && row.source !== 'manual' ? METRIC_SOURCES[row.source] : null)

  // The sheets, built in one place because two gestures open each: the row's
  // `more` button, and a hold released without moving (handleDiaryDragEnd).
  // No "Move to another meal": on a phone the row itself moves (hold, then
  // drag), and a food can also change meal in Edit, which is the route for
  // anyone who cannot drag (VoiceOver, switch control).
  function foodSheet(entry) {
    return {
      title: entry.food,
      actions: [
        { label: 'Re-log', icon: 'repeat', onSelect: () => prefillFromEntry(entry) },
        { label: 'Edit', icon: 'pencil', onSelect: () => startEdit(entry) },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: () => deleteEntry(entry.id) },
      ],
    }
  }
  function mealSheet(item) {
    return {
      title: item.name,
      actions: [
        { label: 'Repeat meal', icon: 'repeat', onSelect: () => repeatLoggedMeal(item) },
        { label: 'Save as a reusable meal', icon: 'utensils', onSelect: () => saveContainerAsMeal(item) },
        { label: 'Delete meal', icon: 'trash', destructive: true, onSelect: () => deleteLoggedMeal(item.id) },
      ],
    }
  }

  function measSheet() {
    return {
      title: 'Measurements',
      actions: [
        { label: 'Edit', icon: 'pencil', onSelect: () => setMeasExpanded(true) },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: deleteMeasurements },
      ],
    }
  }

  // A single food entry row — selectable in select mode, with re-log/edit/delete
  // otherwise. Reused for loose foods and for the children inside a meal.
  // inMeal: a child of a logged-meal container — no per-row move (the whole
  // container moves together).
  function renderFoodEntry(entry, inMeal = false, drag = null) {
    const checked = selectedIds.has(entry.id)
    const currentSlot = entry.meal || 'other'
    const moveTargets = inMeal ? [] : presentMealSlots.filter(k => k !== currentSlot)
    const moveOpen = moveItemId === entry.id
    // A draggable row lifts on touch instead of opening the menu at 500ms;
    // the drag decides on release (handleDiaryDragEnd). A row inside a meal
    // is not draggable and keeps the plain hold-for-menu.
    const entryPress = selectMode ? {} : bindLongPress(() => setSheet(foodSheet(entry)), drag ? { touch: 'lift' } : undefined)
    return (
      <div key={entry.id} ref={drag?.setNodeRef} style={{ borderBottom: '1px solid var(--color-border)', ...drag?.dragStyle }}>
       <div
        {...entryPress}
        {...(selectMode ? {} : drag?.rowProps)}
        className="long-pressable"
        onClick={(e) => {
          // The hook's onClick swallows the click the browser synthesises after
          // a hold, so the row's own tap does not fire behind the open sheet.
          entryPress.onClick(e)
          if (!e.defaultPrevented && selectMode) toggleSelect(entry.id)
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: selectMode ? 'pointer' : 'default' }}
      >
        {selectMode && (
          <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`, background: checked ? 'var(--color-primary)' : 'transparent', color: 'var(--color-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)' }}>{checked ? <Icon name="check" size={12} strokeWidth={3} /> : ''}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)' }}>{entry.food}</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>
            {formatServing(entry.serving_size, entry.serving_unit)}
            {!hideCalories && ` · ${entry.calories} kcal`}
            {` · ${entry.protein || 0}g P · ${entry.carbs || 0}g C · ${entry.fat || 0}g F`}
          </p>
        </div>
        {/* A PHONE GETS ONE CONTROL, NOT FOUR.
            Four buttons were ~118px of a ~370px row -- a third of its width --
            which is what pushed the macro line into wrapping and orphaned
            "12g F" onto a line of its own. Shrinking them recovers ~16px and
            the line still wraps; the count was the problem, not the size.
            They all have a home now: this opens the SAME sheet the long press
            does. So the gesture is a shortcut rather than the only way in, and
            a VoiceOver user still has a real button to land on.
            A desktop keeps all four -- it has the room, a mouse is precise
            enough for them, and hover reveals their titles. */}
        {!selectMode && isMobile && (
          <div data-no-longpress style={{ flexShrink: 0 }}>
            <button
              onClick={() => setSheet(foodSheet(entry))}
              style={moreBtnStyle}
              aria-label={`Actions for ${entry.food}`}
              title="Actions"
            ><Icon name="more" /></button>
          </div>
        )}
        {!selectMode && !isMobile && (
          <div data-no-longpress style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <button
              onClick={() => prefillFromEntry(entry)}
              style={{ ...iconBtnStyle, fontSize: 'var(--text-body)' }}
              title="Re-log"
            ><Icon name="repeat" /></button>
            {moveTargets.length > 0 && (
              <button {...drag?.handleProps} onClick={() => setMoveItemId(moveOpen ? null : entry.id)} style={{ ...iconBtnStyle, fontSize: 'var(--text-body)', letterSpacing: '-2px', touchAction: 'none', cursor: 'grab', color: moveOpen ? 'var(--color-primary)' : 'var(--color-muted)' }} aria-label="Move to another meal" title="Drag to a meal, or tap for options"><Icon name="grip" /></button>
            )}
            <button onClick={() => startEdit(entry)} style={iconBtnStyle} aria-label="Edit entry" title="Edit"><Icon name="pencil" /></button>
            <button onClick={() => deleteEntry(entry.id)} style={{ ...iconBtnStyle, color: 'var(--color-error)' }} aria-label="Delete entry" title="Delete"><Icon name="trash" /></button>
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

  // What follows the finger: the row's name and its one key number, on a
  // raised surface. Deliberately not the whole row -- no actions, no macro
  // line -- because nothing on it can be pressed mid-drag.
  function renderDragPreview(item) {
    const isMeal = item.type === 'meal'
    const title = isMeal ? item.name : item.entry.food
    const sub = isMeal
      ? `${item.entries.length} item${item.entries.length === 1 ? '' : 's'}${hideCalories ? '' : ` · ${item.calories} kcal`}`
      : `${formatServing(item.entry.serving_size, item.entry.serving_unit)}${hideCalories ? '' : ` · ${item.entry.calories} kcal`}`
    return (
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-dropdown)',
        padding: 'var(--space-10) var(--space-12)', transform: 'scale(1.03)', cursor: 'grabbing',
      }}>
        <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)' }}>{title}</p>
        <p style={{ fontSize: 'var(--text-sm)', marginTop: '2px' }}>{sub}</p>
      </div>
    )
  }

  // A logged meal rendered as one collapsible container item.
  function renderLoggedMeal(item, drag = null) {
    const open = expandedMeals.has(item.id)
    const currentSlot = item.entries[0]?.meal || 'other'
    const moveTargets = presentMealSlots.filter(k => k !== currentSlot)
    const moveOpen = moveItemId === item.id
    const mealPress = bindLongPress(() => setSheet(mealSheet(item)), drag ? { touch: 'lift' } : undefined)
    return (
      <div key={item.id} ref={drag?.setNodeRef} style={{ borderBottom: '1px solid var(--color-border)', ...drag?.dragStyle }}>
        <div {...mealPress} {...drag?.rowProps} className="long-pressable" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
          <button
            type="button"
            onClick={() => toggleMealExpand(item.id)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${item.name}`}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)', width: 12 }}>{open ? '▾' : '▸'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="utensils" style={{ color: 'var(--color-muted)' }} /> {item.name}</p>
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
          </button>
          {/* The phone gets the food rows' one button, not four: the same sheet
              a hold opens. This row had been missed when the food rows
              collapsed, and kept its grip by accident. */}
          {isMobile ? (
            <div data-no-longpress style={{ flexShrink: 0 }}>
              <button onClick={() => setSheet(mealSheet(item))} style={moreBtnStyle} aria-label={`Actions for ${item.name}`} title="Actions"><Icon name="more" /></button>
            </div>
          ) : (
            <div data-no-longpress style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button onClick={() => repeatLoggedMeal(item)} style={{ ...iconBtnStyle, fontSize: 'var(--text-body)' }} title="Repeat meal" aria-label="Repeat meal"><Icon name="repeat" /></button>
              <button onClick={() => saveContainerAsMeal(item)} style={{ ...iconBtnStyle, display: 'inline-flex', alignItems: 'center' }} title="Save as a reusable meal" aria-label="Save as a reusable meal">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </button>
              {moveTargets.length > 0 && (
                <button {...drag?.handleProps} onClick={() => setMoveItemId(moveOpen ? null : item.id)} style={{ ...iconBtnStyle, fontSize: 'var(--text-body)', letterSpacing: '-2px', touchAction: 'none', cursor: 'grab', color: moveOpen ? 'var(--color-primary)' : 'var(--color-muted)' }} aria-label="Move to another meal" title="Drag to a meal, or tap for options"><Icon name="grip" /></button>
              )}
              <button onClick={() => deleteLoggedMeal(item.id)} style={{ ...iconBtnStyle, color: 'var(--color-error)' }} aria-label="Delete meal" title="Delete meal"><Icon name="trash" /></button>
            </div>
          )}
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
    <PullToRefresh onRefresh={pullRefresh}>
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      {/* One header at every width: the title, and ONE date control at the
          right -- `‹ Today ›`. The middle names the day ("Today" until it
          moves, then "Oct 22") and opens the calendar. There is no separate
          "Today" button any more: beside the stepper it did not fit a phone
          (the title wrapped), and on a row of its own it left a lone pill
          under the title. The calendar, or `›`, is the way back. Shared with
          My Progress and the client record: components/DayStepper. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-12)' }}>
        <h1 style={{ whiteSpace: 'nowrap' }}>Daily Log</h1>
        <DayStepper value={selectedDate} onChange={setSelectedDate} />
      </div>

      {pageLoading ? (
        // The shapes of the cards to come: Body and activity, then Nutrition's
        // totals and a few rows, then Measurements.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
          <Skeleton height="230px" />
          <Skeleton height="96px" />
          {[...Array(3)].map((_, i) => <Skeleton key={i} height="56px" />)}
          <Skeleton height="120px" />
        </div>
      ) : (<>
      {/* Body and activity: weight, steps and cardio in ONE card. They were
          three cards, two of them a heading and padding around a single row,
          and F2 already names them as one group ("three single readings").
          Steps sits above cardio because cardio is the open-ended list and
          its "+ Log workout" belongs at the foot of the card. */}
      <div style={sectionStyle}>
        <h2>Body and activity</h2>

        <div>
          {savedWeight && !weightExpanded
            ? renderMetricRow({
                key: 'weight', title: 'Weight', first: true, mark: { metric: 'weight', glyph: 'weight' },
                // When it was weighed (and the device, once synced). No change
                // since yesterday: a weigh-in has no daily goal, and how it
                // moves over time is My Progress's question, not the Log's.
                sub: [savedWeight.weighed_at && formatTime(savedWeight.weighed_at), sourceOf(savedWeight)].filter(Boolean).join(' · ') || 'No time recorded',
                value: `${savedWeight.weight} ${savedWeight.unit}`,
                onEdit: () => setWeightExpanded(true), onDelete: deleteWeight,
              })
            : !weightExpanded && renderMetricRow({ key: 'weight', title: 'Weight', first: true, mark: { metric: 'weight', glyph: 'weight' }, logged: false, onLog: () => setWeightExpanded(true) })}
          {weightExpanded && (
            <div style={{ padding: '10px 0', marginLeft: MARK_INSET_PX }}>
              <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)', marginBottom: '8px' }}>Weight</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  {fieldLabel('Weight', <input ref={weightInputRef} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} style={inputStyle} />, { flex: 1 })}
                  <select value={weightUnit} onChange={(e) => { setWeight(convertGoalValue(weight, weightUnit, e.target.value)); setWeightUnit(e.target.value) }} style={{ ...inputStyle, width: '80px', cursor: 'pointer' }}>
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button onClick={() => setWeightExpanded(false)} variant="ghost" size="sm">Cancel</Button>
                  <Button onClick={() => { saveWeight(); setWeightExpanded(false) }} variant="primary" size="sm">{savedWeight ? 'Update' : 'Log Weight'}</Button>
                </div>
              </div>
            </div>
          )}

          {savedSteps && !stepsExpanded
            ? renderMetricRow({
                key: 'steps', title: 'Steps', mark: { metric: 'steps', glyph: 'footprints' },
                sub: [stepsGoalSub(savedSteps.steps, targets?.steps), savedSteps.distance && `${savedSteps.distance} mi`, sourceOf(savedSteps)].filter(Boolean).join(' · ') || 'No step goal set',
                value: savedSteps.steps.toLocaleString(),
                onEdit: () => setStepsExpanded(true), onDelete: deleteSteps,
              })
            : !stepsExpanded && renderMetricRow({ key: 'steps', title: 'Steps', mark: { metric: 'steps', glyph: 'footprints' }, logged: false, onLog: () => setStepsExpanded(true) })}
          {stepsExpanded && (
            <div style={{ padding: '10px 0', marginLeft: MARK_INSET_PX, borderTop: '1px solid var(--color-border)' }}>
              <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)', marginBottom: '8px' }}>Steps</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {fieldLabel('Steps', <input type="number" value={steps} onChange={(e) => setSteps(e.target.value)} style={inputStyle} />, { flex: 2 })}
                  {fieldLabel('Distance (mi)', <input type="number" value={distance} onChange={(e) => setDistance(e.target.value)} style={inputStyle} />, { flex: 1 })}
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button onClick={() => setStepsExpanded(false)} variant="ghost" size="sm">Cancel</Button>
                  <Button onClick={() => { saveSteps(); setStepsExpanded(false) }} variant="primary" size="sm">{savedSteps ? 'Update' : 'Log Steps'}</Button>
                </div>
              </div>
            </div>
          )}

          {/* Sessions are things DONE, weight and steps are things MEASURED, and
              as one undivided list the two kinds read as a jumble once there
              were two sessions. The label is the meal groups' (Nutrition, just
              below), total and all. Not drawn over the empty row, which would
              say "Workouts" twice.
              WORKOUTS, not cardio: every kind is listed, because the Watch
              records judo and strength sessions too and a log that hides them
              misrepresents the day. Only the cardio ones add up against the
              target, so the total says "cardio" whenever something here is not. */}
          {cardioEntries.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 2px', marginLeft: MARK_INSET_PX, paddingRight: isMobile ? ACTION_COL_PX : 0, borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>Workouts</span>
              <span className="tnum" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{(() => {
                // The day's total against the target, like Steps' "98% of
                // 9,000". Not against yesterday: cardio resets each morning.
                const cardio = cardioEntries.filter(e => e.counts_as_cardio !== false)
                const total = cardio.reduce((sum, e) => sum + (e.duration || 0), 0)
                const mixed = cardio.length < cardioEntries.length
                return [`${formatMinutes(total)}${mixed ? ' cardio' : ''}`, cardioGoalSub(total, targets?.cardio_minutes)].filter(Boolean).join(' · ')
              })()}</span>
            </div>
          )}
          {cardioEntries.map((e, i) => renderMetricRow({
            key: e.id, title: e.exercise_type, first: i === 0, mark: { metric: 'cardio', glyph: 'heart' },
            // What recorded it ("Apple Watch") says more than where it came
            // through ("Apple Health"), so it wins when the device named one.
            sub: [
              e.calories_burned && `${e.calories_burned} kcal`,
              e.avg_heart_rate && (e.max_heart_rate
                ? `${e.avg_heart_rate} avg · ${e.max_heart_rate} max bpm`
                : `${e.avg_heart_rate} bpm avg`),
              e.distance && `${Number(e.distance)} mi`,
              e.counts_as_cardio === false && 'Not cardio',
              e.recorded_by || sourceOf(e),
            ].filter(Boolean).join(' · ') || 'No calories or heart rate',
            value: formatMinutes(e.duration),
            onEdit: () => startEditCardio(e), onDelete: () => deleteCardio(e.id),
          }))}
          {cardioEntries.length === 0 && !cardioExpanded &&
            renderMetricRow({ key: 'cardio', title: 'Workouts', mark: { metric: 'cardio', glyph: 'heart' }, logged: false, onLog: () => setCardioExpanded(true) })}
          {cardioExpanded && (
            <div style={{ padding: '10px 0', marginLeft: MARK_INSET_PX, borderTop: '1px solid var(--color-border)' }}>
              <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)', marginBottom: '8px' }}>{editingCardio ? editingCardio.exercise_type : 'Workout'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {fieldLabel('Activity', <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {/* An imported name the short list lacks ("Pickleball") stays
                      selectable, or editing the row would quietly rename it to
                      the first option. */}
                  {(editingCardio && !EXERCISE_TYPES.includes(editingCardio.exercise_type)
                    ? [editingCardio.exercise_type, ...EXERCISE_TYPES]
                    : EXERCISE_TYPES
                  ).map(t => <option key={t} value={t}>{t}</option>)}
                </select>)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  {fieldLabel('Duration (min)', <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />)}
                  {fieldLabel('Calories burned', <input type="number" value={caloriesBurned} onChange={(e) => setCaloriesBurned(e.target.value)} style={inputStyle} />)}
                  {fieldLabel('Avg heart rate (bpm)', <input type="number" value={avgHeartRate} onChange={(e) => setAvgHeartRate(e.target.value)} style={inputStyle} />)}
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
            </div>
          )}
        </div>

        {cardioEntries.length > 0 && !cardioExpanded && (
          <Button onClick={() => setCardioExpanded(true)} variant="muted" size="sm" style={{ alignSelf: 'flex-start', marginLeft: MARK_INSET_PX }}>+ Log workout</Button>
        )}
      </div>

      {/* Nutrition */}
      <div style={sectionStyle}>
        <h2>Nutrition</h2>

        {/* Macro totals. The numerals are NEUTRAL, not metric-coloured.
            Metric tokens are FILL colours — dark-first data hues that the light
            theme carries over unchanged — so as text on a light card they
            measured 2.22:1 (calories), 2.69:1 (protein) and 2.20:1 (fat)
            against a 4.5:1 floor. Only carbs had ever been given a light
            override. This is the same call StatCard already made: the label
            underneath names the metric, so the colour was carrying nothing the
            reader needed, and it was costing legibility to do it. The metric
            hue still does its real job two panels over, filling Dashboard's
            progress bars, where a shape has no contrast requirement. */}
        <div className="tnum" style={{ display: 'grid', gridTemplateColumns: `repeat(${hideCalories ? 3 : 4}, 1fr)`, gap: '8px' }}>
          {!hideCalories && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{totalCalories}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Calories</div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{totalProtein}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Protein</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{totalCarbs}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Carbs</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text)' }}>{totalFat}g</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>Fat</div>
          </div>
        </div>

        {/* Day complete — one-tap "I'm done logging today" (coach trust signal).
            Hidden on an empty day: there's nothing to mark complete yet. */}
        {entries.length > 0 && (
          /* A Button, not a hand-rolled one. It was `background: transparent`
             with a 1px border — D1's "dead" look exactly, and the one control
             on this panel with no hover, no pressed state and no raised
             surface. `muted` at rest because the panel's one filled green is
             already "+ Add Food"; the accent fill is kept for the COMPLETE
             state, where it reports what you did rather than inviting a press. */
          <Button
            onClick={toggleDayComplete}
            variant={dayComplete ? 'primary' : 'muted'}
            size="sm"
            fullWidth
            loading={dayCompleteSaving}
            style={{ marginTop: 'var(--space-4)' }}
          >
            {dayComplete ? <><Icon name="check" /> Day marked complete. Tap to undo</> : 'Mark day complete'}
          </Button>
        )}

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
                    <Icon name="check" /> Select
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
              <div onClickCapture={(e) => { if (Date.now() < suppressClickUntil.current) { e.preventDefault(); e.stopPropagation() } }}>
              <DndContext
                sensors={dndSensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDiaryDragStart}
                onDragMove={handleDiaryDragMove}
                onDragCancel={() => { setDragItem(null); setDragLifted(false) }}
                onDragEnd={handleDiaryDragEnd}
              >
                {groupEntriesByMeal(entries).map(group => (
                  <DroppableMeal key={group.key} slot={group.key} target={dragLifted && !!dragItem && itemSlot(dragItem) !== group.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{group.label}</span>
                      {!hideCalories && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{group.calories} kcal</span>}
                    </div>
                    {groupLoggedMeals(group.entries).map(item => item.type === 'meal'
                      ? <DraggableItem key={item.id} id={item.id} item={item} lifted={dragLifted}>{d => renderLoggedMeal(item, d)}</DraggableItem>
                      : <DraggableItem key={item.entry.id} id={item.entry.id} item={item} lifted={dragLifted}>{d => renderFoodEntry(item.entry, false, d)}</DraggableItem>
                    )}
                  </DroppableMeal>
                ))}
                {/* The lifted copy that follows the finger. Not the row itself,
                    so it can look picked up -- surface, the dropdown shadow, a
                    hair larger -- while the original holds its place, faded. */}
                <DragOverlay>
                  {dragItem && dragLifted && renderDragPreview(dragItem)}
                </DragOverlay>
              </DndContext>
              </div>
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
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', margin: 0 }}>
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
                                <button key={c.id} onClick={() => groupSelectedIntoMeal(c)} style={pillBtnStyle}><Icon name="utensils" /> {c.name}</button>
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

        {/* Empty diary — an inviting prompt instead of a blank gap. The action
            lives in the toolbar just below (+ Add Food). */}
        {entries.length === 0 && !nutritionExpanded && !showCopyPanel && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            gap: '8px', padding: '28px 16px 24px',
            border: '1px dashed var(--color-border)', borderRadius: 'var(--radius)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)' }}>Nothing logged yet today</p>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)', maxWidth: '36ch', lineHeight: 1.5 }}>
              Search a food or scan a barcode.
            </p>
          </div>
        )}

        {/* Add Food Form */}
        {nutritionExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: entries.length > 0 ? '4px' : '0' }}>
            {addingToMeal && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                <span>Adding to <strong style={{ color: 'var(--color-text)' }}>{addingToMeal.name}</strong></span>
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
                    color: meal === m.key ? 'var(--color-on-accent)' : 'var(--color-muted)',
                    border: `1px solid ${meal === m.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius)', padding: '7px 4px',
                    fontSize: 'var(--text-xs)', fontWeight: meal === m.key ? 600 : 400, cursor: 'pointer',
                  }}
                >{m.label}</button>
              ))}
            </div>
            <input
              ref={foodInputRef}
              type="text"
              placeholder="Search or enter a food"
              value={food}
              onChange={(e) => handleFoodInput(e.target.value)}
              style={{ ...inputStyle, borderColor: nutritionErrors.food ? 'var(--color-error)' : 'var(--color-border)' }}
            />
            {nutritionErrors.food && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginTop: '-6px' }}>{nutritionErrors.food}</p>}

            {/* Food search results (USDA FDC) */}
            {showFoodResults && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--color-bg)', maxHeight: '244px', overflowY: 'auto', marginTop: '-4px' }}>
                {foodSearching && foodResults.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', padding: '10px 12px', margin: 0 }}>Searching…</p>
                )}
                {!foodSearching && foodResults.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', padding: '10px 12px', margin: 0 }}>No matches. Enter it manually below.</p>
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
                      <p style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>{r.name}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '2px 0 0' }}>
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
            {lookupError && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-base)' }}>{lookupError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {fieldLabel('Calories (kcal)', <input type="number" value={calories} onChange={(e) => { setCalories(e.target.value); setNutritionErrors(p => ({ ...p, calories: '' })) }} style={{ ...inputStyle, borderColor: nutritionErrors.calories ? 'var(--color-error)' : 'var(--color-border)', minWidth: 0 }} />)}
              {fieldLabel('Protein (g)', <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />)}
              {fieldLabel('Carbs (g)', <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />)}
              {fieldLabel('Fat (g)', <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />)}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              {fieldLabel(baseServingSize != null ? 'Servings' : 'Amount', <input
                type="number"
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                style={inputStyle}
              />, { flex: 1 })}
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
            {baseServingLabel && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>1 serving = {baseServingLabel}</p>}
            {nutritionErrors.calories && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{nutritionErrors.calories}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setNutritionExpanded(false); setEditingEntry(null); clearNutritionForm() }} variant="ghost" size="sm">Cancel</Button>
              <Button onClick={handleSubmit} variant="primary" size="sm" loading={savingEntry} disabled={savingEntry}>{editingEntry ? 'Update entry' : 'Add entry'}</Button>
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
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>No entries for this day.</p>
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
                  <p style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{e.food}</p>
                  <p style={{ fontSize: 'var(--text-sm)' }}>
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
            {/* The label is the toggle: the shared disclosure control, its
                chevron rotating open, dressed as the group label it was. */}
            <button
              type="button"
              className="ds-disclosure ds-control"
              aria-expanded={quickAddOpen}
              aria-controls="quick-add-tiles"
              onClick={toggleQuickAdd}
              style={{ width: 'auto', alignSelf: 'flex-start', padding: 0, gap: 'var(--space-4)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Quick add
              <Icon name="right" size={12} className="ds-chev" />
            </button>
            {quickAddOpen && (
            <div id="quick-add-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
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
                      <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food}</p>
                      {macroLine && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '1px 0 0' }}>{macroLine}</p>}
                    </div>
                    <span style={{
                      flexShrink: 0,
                      width: '18px', height: '18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary-dim)',
                      color: 'var(--color-primary)',
                      fontSize: 'var(--text-base)', fontWeight: 700, lineHeight: 1,
                    }}>+</span>
                  </button>
                )
              })}
            </div>
            )}
          </div>
        )}

        {/* Saved meals — opens a modal so a long list never stretches the page */}
        {!nutritionExpanded && !showCopyPanel && savedMeals.length > 0 && (
          <button onClick={() => setShowSavedMeals(true)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name="utensils" /> Saved meals <span style={{ color: 'var(--color-muted)' }}>({savedMeals.length})</span>
          </button>
        )}
        <Modal open={showSavedMeals} title="Saved meals" onClose={() => { setShowSavedMeals(false); setLogPickId(null); setEditingSavedMealId(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedMeals.length === 0 ? (
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>No saved meals yet. Save one from any logged meal.</p>
            ) : savedMeals.map(m => {
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
                          style={{ ...inputStyle, fontSize: 'var(--text-sm)', padding: '4px 8px' }}
                        />
                      ) : (
                        <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                      )}
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '1px 0 0' }}>
                        {m.items.length} item{m.items.length === 1 ? '' : 's'}{!hideCalories ? ` · ${t.calories} cal` : ''} · {t.protein}g P · {t.carbs}g C · {t.fat}g F
                      </p>
                    </div>
                    {!editing && (
                      <button onClick={() => { setEditingSavedMealId(m.id); setSavedMealDraft(m.name) }} style={iconBtnStyle} title="Rename saved meal" aria-label="Rename saved meal"><Icon name="pencil" /></button>
                    )}
                    <button onClick={() => setLogPickId(picking ? null : m.id)} disabled={pending} title={`Log ${m.name}`} style={{ flexShrink: 0, background: picking ? 'var(--color-surface)' : 'var(--color-primary)', color: picking ? 'var(--color-text)' : 'var(--color-on-accent)', border: picking ? '1px solid var(--color-border)' : 'none', borderRadius: 'var(--radius)', padding: '5px 10px', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.5 : 1, fontFamily: 'inherit' }}>{picking ? 'Cancel' : '+ Log'}</button>
                    <button onClick={() => deleteSavedMeal(m.id)} style={{ ...iconBtnStyle, color: 'var(--color-error)' }} aria-label="Delete saved meal" title="Delete saved meal"><Icon name="trash" /></button>
                  </div>
                  {picking && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '2px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Log to:</span>
                      {[...MEALS, { key: 'other', label: 'Other' }].map(s => (
                        <button key={s.key} onClick={() => logSavedMeal(m, s.key)} style={{ ...pillBtnStyle, padding: '3px 9px', fontSize: 'var(--text-xs)' }}>{s.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Modal>

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

      {/* Body measurements */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
          <h2 style={{ flex: 1 }}>Measurements</h2>
          {/* A day without measurements -- most days, for a monthly habit --
              is the heading and a Log button, nothing else. Not "Not logged"
              (on 27 days of 28 that reads as a miss), and not "Last taken
              Oct 13": when that date matters the re-measure reminder below
              already says it. */}
          {!savedMeas && !measExpanded && (
            <Button onClick={() => setMeasExpanded(true)} variant="muted" size="sm">Log</Button>
          )}
          {savedMeas && !measExpanded && (isMobile ? (
            <button onClick={() => setSheet(measSheet())} style={moreBtnStyle} aria-label="Actions for measurements" title="Actions"><Icon name="more" /></button>
          ) : (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button onClick={() => setMeasExpanded(true)} style={iconBtnStyle} aria-label="Edit measurements" title="Edit"><Icon name="pencil" /></button>
              <button onClick={deleteMeasurements} style={{ ...iconBtnStyle, color: 'var(--color-error)' }} aria-label="Delete measurements" title="Delete"><Icon name="trash" /></button>
            </div>
          ))}
        </div>

        {/* Gentle re-measure reminder once the latest is past ~monthly (steady
            cadence — deliberately not nagging; the coach view is phase-precise). */}
        {(() => {
          const r = measurementStatus({ lastMeasuredIso, cadenceDays: 28 })
          if (!r.due || measExpanded) return null
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--color-primary-dim)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                It's been {r.daysSince} days since your last measurements. A good time to update them.
              </span>
            </div>
          )
        })()}

        {/* A 2 x 3 grid, the body read top to bottom: neck and chest, then
            waist and hips side by side (the pair a coach compares), then arm
            and thigh. It was a wrapping strip that put four on one line and
            stranded two under it, a grid with a hole (F2), its columns
            misaligned. Every cell holds its place: a skipped site says "--"
            rather than collapsing the grid. Values only: change since the
            last measurement is a trend, and trends live on My Progress.
            Edit and Delete live behind the header's `more`, as on every other
            record on this page. */}
        {savedMeas && !measExpanded && (() => {
          return (
            <div
              {...bindLongPress(() => setSheet(measSheet()))}
              className="long-pressable"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 'var(--space-16)', rowGap: 'var(--space-12)' }}
            >
              {MEASUREMENT_SITES.map(m => (
                <div key={m.key} style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{m.label}</p>
                  <p style={{ marginTop: '2px', whiteSpace: 'nowrap' }}>
                    {savedMeas[m.key] != null ? (
                      <span className="tnum" style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                        {Number(savedMeas[m.key]).toFixed(1)}<span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)', marginLeft: '3px' }}>{savedMeas.unit}</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 'var(--text-md)', color: 'var(--color-muted)' }}>&ndash;</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )
        })()}

        {measExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginRight: '2px' }}>Unit:</span>
              {['in', 'cm'].map(u => (
                <button key={u} type="button" onClick={() => setMeas(Object.fromEntries(Object.entries(meas).map(([k, v]) => [k, k === 'unit' ? u : convertLengthValue(v, meas.unit, u)])))} style={{ ...pillBtnStyle, ...(meas.unit === u ? { backgroundColor: 'var(--color-primary-fill)', borderColor: 'var(--color-primary-fill)', color: 'var(--color-on-primary-fill)' } : {}) }}>{u}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {MEASUREMENT_SITES.map(s => (
                <div key={s.key}>
                  <p style={{ fontSize: 'var(--text-sm)', marginBottom: '4px' }}>{s.label} ({meas.unit})</p>
                  <input type="number" value={meas[s.key]} onChange={e => setMeas({ ...meas, [s.key]: e.target.value })} placeholder="—" style={inputStyle} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setMeasExpanded(false); fetchMeasurements() }} variant="ghost" size="sm">Cancel</Button>
              <Button onClick={saveMeasurements} variant="primary" size="sm">{savedMeas ? 'Update' : 'Log measurements'}</Button>
            </div>
          </div>
        )}

      </div>
      </>)}

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        danger={dialog?.danger}
        onConfirm={() => { const fn = dialog?.onConfirm; setDialog(null); fn?.() }}
        onCancel={() => setDialog(null)}
      />
      {/* The long-press menu for a logged row. One instance for the page: only
          one press can be in flight, so a sheet per row would be 40 portals
          waiting to render nothing. */}
      <ActionSheet
        open={Boolean(sheet)}
        title={sheet?.title}
        actions={sheet?.actions || []}
        onClose={() => setSheet(null)}
      />

      <Toast message={toast?.message} type={toast?.type} action={toast?.action} onClose={() => setToast(null)} />
    </div>
    </PullToRefresh>
  )
}

export default Log
